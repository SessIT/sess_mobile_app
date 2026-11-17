const express = require('express');
const prisma = require('../lib/prisma');
const { requireAuth } = require('../middleware/auth');
const { teamIdsOf, directReportIds, requireManager } = require('../lib/team');
const { KINDS, withManagerStage, managerDecide } = require('../lib/approvals');
const { managerDecided } = require('../lib/requestEvents');
const router = express.Router();

router.use(requireAuth);

const USER_SEL = { select: { id: true, fullName: true, username: true, employeeId: true, designation: true } };
const ymd = (d) => new Date(d).toISOString().slice(0, 10);
const hmIST = (d) => (d
  ? new Date(new Date(d).getTime() + 5.5 * 3600000).toISOString().slice(11, 16)
  : '—');

// One shape for every request kind so a single inbox screen can render them.
function toItem(kind, r) {
  const base = {
    kind, kindLabel: KINDS[kind].label, id: r.id, userId: r.userId, user: r.user,
    status: r.status, reason: r.reason || null, reviewNote: r.reviewNote || null,
    createdAt: r.appliedAt || r.createdAt, managerStage: r.managerStage, attachments: [],
  };
  switch (kind) {
    case 'leave':
      return {
        ...base,
        title: `${r.leaveType?.name || 'Leave'} · ${r.days} day${r.days === 1 ? '' : 's'}`,
        subtitle: ymd(r.startDate) === ymd(r.endDate)
          ? `${ymd(r.startDate)}${r.halfDay ? ' (half day)' : ''}`
          : `${ymd(r.startDate)} → ${ymd(r.endDate)}`,
        date: ymd(r.startDate),
      };
    case 'ot':
      return {
        ...base,
        title: `Overtime · ${r.hours} h`,
        subtitle: `${ymd(r.date)} · ${hmIST(r.startTime)}–${hmIST(r.endTime)}`,
        date: ymd(r.date),
      };
    case 'compoff':
      return { ...base, title: 'Comp-off credit', subtitle: `Worked on ${ymd(r.workDate)}`, date: ymd(r.workDate) };
    case 'expense':
      return {
        ...base,
        title: `${r.type} expense`,
        subtitle: r.details,
        reason: null,
        date: ymd(r.createdAt),
        attachments: [r.billPath, ...(r.extraBills || [])].filter(Boolean),
      };
    case 'correction':
      return {
        ...base,
        title: 'Attendance correction',
        subtitle: `${ymd(r.date)} · in ${hmIST(r.requestedIn)} / out ${hmIST(r.requestedOut)}`,
        date: ymd(r.date),
      };
    default:
      return base;
  }
}

const INCLUDE = {
  leave: { user: USER_SEL, leaveType: { select: { code: true, name: true } } },
  ot: { user: USER_SEL },
  compoff: { user: USER_SEL },
  expense: { user: USER_SEL },
  correction: { user: USER_SEL },
};

async function fetchKind(kind, where, take = 200) {
  const rows = await prisma[KINDS[kind].model].findMany({
    where, include: INCLUDE[kind], orderBy: { id: 'desc' }, take,
  });
  return (await withManagerStage(kind, rows)).map((r) => toItem(kind, r));
}

// Pending requests of my DIRECT reports that still need my first decision.
async function pendingFor(managerId) {
  const direct = await directReportIds(managerId);
  if (direct.length === 0) return [];
  const lists = await Promise.all(Object.keys(KINDS).map((kind) =>
    fetchKind(kind, { userId: { in: direct }, status: 'pending' })));
  return lists.flat()
    .filter((i) => i.managerStage?.state === 'awaiting')
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)); // oldest first
}

// GET /api/team/summary — cheap probe the apps use to show / hide manager menus.
router.get('/summary', async (req, res) => {
  try {
    const [team, direct] = await Promise.all([teamIdsOf(req.user.sub), directReportIds(req.user.sub)]);
    const pending = direct.length ? (await pendingFor(req.user.sub)).length : 0;
    res.json({ isManager: team.length > 0, teamSize: team.length, directCount: direct.length, pendingApprovals: pending });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// GET /api/team/members — everyone below me (direct + indirect), for pickers.
router.get('/members', requireManager, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: { id: { in: req.teamIds } },
      orderBy: { fullName: 'asc' },
      select: {
        id: true, username: true, fullName: true, employeeId: true, designation: true,
        department: true, isActive: true, reportingManagerId: true,
        role: { select: { name: true } },
      },
    });
    res.json(users.map(({ role, ...u }) => ({
      ...u, roles: role ? [role.name] : [], direct: u.reportingManagerId === req.user.sub,
    })));
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// GET /api/team/approvals?view=pending|done
//   pending — what waits for my first approval (direct reports only)
//   done    — my last 100 decisions, with each request's current status
router.get('/approvals', requireManager, async (req, res) => {
  try {
    if (req.query.view === 'done') {
      const mine = await prisma.requestApproval.findMany({
        where: { actorId: req.user.sub, stage: 'manager' },
        orderBy: { createdAt: 'desc' }, take: 100,
      });
      const byKind = {};
      for (const a of mine) (byKind[a.kind] = byKind[a.kind] || []).push(a.requestId);
      const lists = await Promise.all(Object.entries(byKind)
        .filter(([kind]) => KINDS[kind])
        .map(([kind, ids]) => fetchKind(kind, { id: { in: ids } })));
      const order = new Map(mine.map((a, i) => [`${a.kind}:${a.requestId}`, i]));
      const items = lists.flat().sort((a, b) => order.get(`${a.kind}:${a.id}`) - order.get(`${b.kind}:${b.id}`));
      return res.json({ items });
    }
    res.json({ items: await pendingFor(req.user.sub) });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// POST /api/team/approvals/:kind/:id — { decision:'approved'|'rejected', note }
router.post('/approvals/:kind/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(404).json({ message: 'Request not found' });
    const out = await managerDecide({
      kind: req.params.kind, requestId: id, actorId: req.user.sub,
      decision: req.body?.decision, note: req.body?.note,
    });
    if (!out.ok) return res.status(out.status).json({ message: out.message });
    managerDecided(req.params.kind, id, req.body.decision, req.user.sub, String(req.body?.note || '').trim());
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

module.exports = router;
