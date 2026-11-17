const express = require('express');
const prisma = require('../lib/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');
const { notify, adminIds } = require('../lib/notify');
const router = express.Router();
const ADMIN = 'Admin';

router.use(requireAuth);

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const todayIST = () => new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
const OPEN = ['requested', 'accepted'];
const EXIT_TYPES = ['Resigned', 'Termination', 'Abscond'];
const CHECKLIST = [
  ['assets', 'All company assets returned'],
  ['handover', 'Work and documents handed over'],
  ['access', 'Email / system access revoked'],
  ['idcard', 'ID / access card returned'],
  ['settlement', 'Full & final settlement paid'],
  ['interview', 'Exit interview done'],
];
const newChecklist = () => CHECKLIST.map(([key, label]) => ({ key, label, done: false }));
const USER_SEL = { select: { id: true, fullName: true, username: true, employeeId: true, designation: true, dateOfJoining: true, reportingManagerId: true } };

const heldAssets = (userId) => prisma.asset.findMany({
  where: { assignedToId: userId }, select: { id: true, tag: true, name: true },
});

/* ==================== EMPLOYEE ==================== */

// GET /api/exits/my — my current (or last) exit case + assets I still hold.
router.get('/my', async (req, res) => {
  try {
    const c = await prisma.exitCase.findFirst({
      where: { userId: req.user.sub, status: { not: 'withdrawn' } }, orderBy: { id: 'desc' },
    });
    res.json({ case: c, assets: await heldAssets(req.user.sub) });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// POST /api/exits/resign — { reason, requestedLastDay }
router.post('/resign', async (req, res) => {
  try {
    const reason = String(req.body?.reason || '').trim().slice(0, 1000);
    const day = String(req.body?.requestedLastDay || '');
    if (!reason) return res.status(400).json({ message: 'Please give a reason' });
    if (!YMD.test(day) || day < todayIST()) return res.status(400).json({ message: 'Pick a last working day from today onwards' });
    if (await prisma.exitCase.findFirst({ where: { userId: req.user.sub, status: { in: OPEN } } }))
      return res.status(409).json({ message: 'You already have a resignation in progress' });
    const c = await prisma.exitCase.create({
      data: { userId: req.user.sub, reason, requestedLastDay: day, checklist: newChecklist() },
    });
    const me = await prisma.user.findUnique({ where: { id: req.user.sub }, ...USER_SEL });
    const to = new Set(await adminIds('exits'));
    if (me?.reportingManagerId) to.add(me.reportingManagerId);
    to.delete(req.user.sub);
    notify([...to], {
      kind: 'exit', title: `Resignation: ${me?.fullName || me?.username}`,
      body: `Requested last working day ${day}`, data: { screen: 'Exits' },
    });
    res.status(201).json(c);
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// POST /api/exits/my/withdraw — take the resignation back (before completion).
router.post('/my/withdraw', async (req, res) => {
  try {
    const c = await prisma.exitCase.findFirst({ where: { userId: req.user.sub, status: { in: OPEN } } });
    if (!c) return res.status(404).json({ message: 'No resignation in progress' });
    await prisma.exitCase.update({ where: { id: c.id }, data: { status: 'withdrawn' } });
    notify((await adminIds('exits')).filter((id) => id !== req.user.sub), {
      kind: 'exit', title: 'Resignation withdrawn', body: `Case #${c.id}`, data: { screen: 'Exits' },
    });
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

/* ==================== ADMIN ==================== */

router.use(requireRole(ADMIN));

// GET /api/exits?status= — cases with the employee and assets still held.
router.get('/', async (req, res) => {
  try {
    const where = ['requested', 'accepted', 'completed', 'withdrawn', 'rejected'].includes(req.query.status)
      ? { status: req.query.status } : {};
    const cases = await prisma.exitCase.findMany({ where, orderBy: [{ status: 'asc' }, { id: 'desc' }], take: 200 });
    const users = await prisma.user.findMany({ where: { id: { in: [...new Set(cases.map((c) => c.userId))] } }, ...USER_SEL });
    const held = await prisma.asset.groupBy({ by: ['assignedToId'], where: { assignedToId: { in: users.map((u) => u.id) } }, _count: true });
    const um = new Map(users.map((u) => [u.id, u]));
    const hm = new Map(held.map((h) => [h.assignedToId, h._count]));
    res.json({ cases: cases.map((c) => ({ ...c, user: um.get(c.userId) || null, assetsHeld: hm.get(c.userId) || 0 })) });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// POST /api/exits — admin-initiated exit (termination / absconding):
// { userId, exitType, reason, lastWorkingDay } — starts as accepted.
router.post('/', async (req, res) => {
  try {
    const userId = Number(req.body?.userId);
    const lwd = String(req.body?.lastWorkingDay || '');
    const exitType = EXIT_TYPES.includes(req.body?.exitType) ? req.body.exitType : 'Termination';
    if (!userId || !(await prisma.user.findUnique({ where: { id: userId } }))) return res.status(400).json({ message: 'Pick an employee' });
    if (!YMD.test(lwd)) return res.status(400).json({ message: 'Last working day is required' });
    if (await prisma.exitCase.findFirst({ where: { userId, status: { in: OPEN } } }))
      return res.status(409).json({ message: 'This employee already has an exit in progress' });
    const c = await prisma.exitCase.create({
      data: {
        userId, exitType, reason: String(req.body?.reason || '').trim().slice(0, 1000) || exitType,
        requestedLastDay: lwd, lastWorkingDay: lwd, status: 'accepted', decidedById: req.user.sub, checklist: newChecklist(),
      },
    });
    res.status(201).json(c);
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// PATCH /api/exits/:id — { action: accept | reject | update | complete, ... }
router.patch('/:id', async (req, res) => {
  try {
    const c = await prisma.exitCase.findUnique({ where: { id: Number(req.params.id) } });
    if (!c) return res.status(404).json({ message: 'Exit case not found' });
    const b = req.body || {};
    const note = b.adminNote !== undefined ? String(b.adminNote || '').trim().slice(0, 500) || null : undefined;

    if (b.action === 'accept') {
      if (c.status !== 'requested') return res.status(409).json({ message: `Case is ${c.status}` });
      if (!YMD.test(String(b.lastWorkingDay || ''))) return res.status(400).json({ message: 'Set the last working day' });
      await prisma.exitCase.update({
        where: { id: c.id },
        data: { status: 'accepted', lastWorkingDay: b.lastWorkingDay, decidedById: req.user.sub, ...(note !== undefined ? { adminNote: note } : {}) },
      });
      notify(c.userId, {
        kind: 'exit', title: 'Your resignation was accepted',
        body: `Last working day: ${b.lastWorkingDay}${note ? ` — ${note}` : ''}`, data: { screen: 'Resignation' },
      });
      return res.json({ ok: true });
    }

    if (b.action === 'reject') {
      if (c.status !== 'requested') return res.status(409).json({ message: `Case is ${c.status}` });
      await prisma.exitCase.update({ where: { id: c.id }, data: { status: 'rejected', decidedById: req.user.sub, adminNote: note ?? null } });
      notify(c.userId, { kind: 'exit', title: 'Your resignation was not accepted', body: note || 'Please speak to HR.', data: { screen: 'Resignation' } });
      return res.json({ ok: true });
    }

    if (b.action === 'update') {
      if (!OPEN.includes(c.status)) return res.status(409).json({ message: `Case is ${c.status}` });
      const data = {};
      if (Array.isArray(b.checklist)) {
        const done = new Map(b.checklist.map((i) => [i.key, !!i.done]));
        data.checklist = (c.checklist || newChecklist()).map((i) => (done.has(i.key) ? { ...i, done: done.get(i.key) } : i));
      }
      if (b.lastWorkingDay !== undefined && c.status === 'accepted') {
        if (!YMD.test(String(b.lastWorkingDay))) return res.status(400).json({ message: 'Invalid last working day' });
        data.lastWorkingDay = b.lastWorkingDay;
      }
      if (b.settlementAmount !== undefined) {
        const n = b.settlementAmount === '' || b.settlementAmount == null ? null : Number(b.settlementAmount);
        if (n != null && !Number.isFinite(n)) return res.status(400).json({ message: 'Settlement must be a number' });
        data.settlementAmount = n;
      }
      if (b.settlementNote !== undefined) data.settlementNote = String(b.settlementNote || '').trim().slice(0, 1000) || null;
      if (note !== undefined) data.adminNote = note;
      return res.json(await prisma.exitCase.update({ where: { id: c.id }, data }));
    }

    if (b.action === 'complete') {
      if (c.status !== 'accepted') return res.status(409).json({ message: 'Accept the exit and set the last working day first' });
      // Completing deactivates the account, so not before the last working day.
      if (c.lastWorkingDay > todayIST())
        return res.status(409).json({ message: `The last working day is ${c.lastWorkingDay} — complete the exit on or after it` });
      const assets = await heldAssets(c.userId);
      if (assets.length)
        return res.status(409).json({ message: `Still holds ${assets.length} asset(s): ${assets.map((a) => a.tag).join(', ')}. Take them back in Assets first.` });
      const pending = (c.checklist || []).filter((i) => !i.done && i.key !== 'assets');
      if (pending.length && !b.force)
        return res.status(409).json({ message: `Checklist not finished: ${pending.map((i) => i.label).join('; ')}`, code: 'CHECKLIST_PENDING' });
      await prisma.$transaction([
        prisma.exitCase.update({
          where: { id: c.id },
          data: { status: 'completed', completedAt: new Date(), checklist: (c.checklist || []).map((i) => (i.key === 'assets' ? { ...i, done: true } : i)) },
        }),
        // The profile's exit fields drive payroll proration and the
        // experience / relieving letters; deactivation ends app access.
        prisma.user.update({
          where: { id: c.userId },
          data: {
            exitDate: new Date(`${c.lastWorkingDay}T00:00:00.000Z`), exitReason: c.exitType,
            exitFormalitiesDone: true, noticeServed: b.noticeServed !== undefined ? !!b.noticeServed : null, isActive: false,
          },
        }),
      ]);
      return res.json({ ok: true });
    }

    res.status(400).json({ message: 'Unknown action' });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

module.exports = router;
