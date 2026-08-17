const express = require('express');
const prisma = require('../lib/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');
const router = express.Router();
const ADMIN = 'Technical Director / Admin';

router.use(requireAuth);

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const dateOnly = (ymd) => new Date(ymd + 'T00:00:00.000Z');
const ymdIST = (d) => new Date(new Date(d).getTime() + 5.5 * 3600000).toISOString().slice(0, 10);
const monthOf = (v) => (/^\d{4}-\d{2}$/.test(String(v || '')) ? v : ymdIST(new Date()).slice(0, 7));
// Optional list filters. Anything unparseable returns null and is ignored — a
// stray query string must never break an approval list.
const intOrNull = (v) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };
// Hard ceiling on an admin list page — see GET /requests.
const LIST_MAX = 500;
// Shape alone is not enough: new Date('2026-02-30T00:00:00Z') is not Invalid,
// it rolls forward to 03-02 and would silently shift the window. Round-trip the
// date and reject anything that does not come back as the string we were given.
const ymdOrNull = (v) => {
  const s = String(v || '');
  if (!YMD.test(s)) return null;
  const d = dateOnly(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10) === s ? s : null;
};

// "YYYY-MM-DD" + "HH:MM" (IST) -> instant. End times at/before the start roll
// over to the next day, so late-night OT like 22:00 → 01:00 works.
function otWindow(ymd, startHHMM, endHHMM) {
  const start = new Date(`${ymd}T${startHHMM}:00+05:30`);
  let end = new Date(`${ymd}T${endHHMM}:00+05:30`);
  if (end <= start) end = new Date(end.getTime() + 24 * 3600000);
  const hours = Math.round(((end - start) / 3600000) * 100) / 100;
  return { start, end, hours };
}

function monthRange(month) {
  const [y, m] = month.split('-').map(Number);
  const from = dateOnly(`${month}-01`);
  const to = dateOnly(`${m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`}-01`);
  return { from, to };
}

// One OT entry per employee per day — reject if a pending/approved row exists.
async function conflictFor(userId, ymd) {
  return prisma.otRequest.findFirst({
    where: { userId, date: dateOnly(ymd), status: { in: ['pending', 'approved'] } },
  });
}

const includeUser = {
  user: { select: { id: true, username: true, fullName: true } },
  reviewedBy: { select: { fullName: true, username: true } },
};

/* ==================== EMPLOYEE (SELF) ==================== */

// GET /api/ot/my?month=YYYY-MM — my OT requests + month totals + calendar map
router.get('/my', async (req, res) => {
  try {
    const month = monthOf(req.query.month);
    const { from, to } = monthRange(month);
    const requests = await prisma.otRequest.findMany({
      where: { userId: req.user.sub, date: { gte: from, lt: to } },
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      include: { reviewedBy: { select: { fullName: true, username: true } } },
    });
    let approvedHours = 0, pendingHours = 0;
    // Calendar map: date -> { status, hours } for the month view.
    const calendar = {};
    for (const r of requests) {
      const ymd = new Date(r.date).toISOString().slice(0, 10);
      if (r.status === 'approved') approvedHours += r.hours;
      if (r.status === 'pending') pendingHours += r.hours;
      if (['approved', 'pending'].includes(r.status)) calendar[ymd] = { status: r.status, hours: r.hours };
    }
    res.json({
      month,
      totals: {
        approvedHours: Math.round(approvedHours * 100) / 100,
        pendingHours: Math.round(pendingHours * 100) / 100,
      },
      calendar,
      requests,
    });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// POST /api/ot/requests — request OT before doing it
// { date:'YYYY-MM-DD', startTime:'HH:MM', endTime:'HH:MM', reason }
router.post('/requests', async (req, res) => {
  try {
    const { date, startTime, endTime, reason } = req.body || {};
    if (!YMD.test(date || ''))
      return res.status(400).json({ message: 'date (YYYY-MM-DD) is required' });
    if (!HHMM.test(startTime || '') || !HHMM.test(endTime || ''))
      return res.status(400).json({ message: 'startTime and endTime (HH:MM) are required' });
    const reasonTrim = String(reason || '').trim();
    if (!reasonTrim)
      return res.status(400).json({ message: 'Please describe the work you will do during OT' });
    if (date < ymdIST(new Date()))
      return res.status(400).json({ message: 'OT must be requested in advance — pick today or a future date' });

    const { start, end, hours } = otWindow(date, startTime, endTime);
    if (hours <= 0 || hours > 12)
      return res.status(400).json({ message: 'OT duration must be between 15 minutes and 12 hours' });

    if (await conflictFor(req.user.sub, date))
      return res.status(409).json({ message: 'You already have an OT entry for this date' });

    const created = await prisma.otRequest.create({
      data: {
        userId: req.user.sub,
        date: dateOnly(date),
        startTime: start,
        endTime: end,
        hours,
        reason: reasonTrim.slice(0, 500),
        status: 'pending',
        source: 'employee',
      },
    });
    res.status(201).json(created);
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// DELETE /api/ot/requests/:id — cancel own pending request
router.delete('/requests/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const row = await prisma.otRequest.findUnique({ where: { id } });
    if (!row || row.userId !== req.user.sub)
      return res.status(404).json({ message: 'Request not found' });
    if (row.status !== 'pending')
      return res.status(400).json({ message: 'Only pending requests can be cancelled' });
    await prisma.otRequest.update({ where: { id }, data: { status: 'cancelled' } });
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

/* ==================== ADMIN ==================== */

// GET /api/ot/requests?status=&month=YYYY-MM&userId=&from=&to= (admin) — all OT entries
router.get('/requests', requireRole(ADMIN), async (req, res) => {
  try {
    const month = monthOf(req.query.month);
    // An explicit from/to window stands in for the month; `month` is still
    // echoed back so callers that only know about it keep working.
    let fromYmd = ymdOrNull(req.query.from);
    let toYmd = ymdOrNull(req.query.to);
    if (fromYmd && toYmd && fromYmd > toYmd) { fromYmd = null; toYmd = null; } // nonsense range — ignore it
    const where = {};
    if (fromYmd || toYmd) {
      where.date = {};
      if (fromYmd) where.date.gte = dateOnly(fromYmd);
      if (toYmd) where.date.lte = dateOnly(toYmd);
    } else {
      const { from, to } = monthRange(month);
      where.date = { gte: from, lt: to };
    }
    if (['pending', 'approved', 'rejected', 'cancelled'].includes(req.query.status))
      where.status = req.query.status;
    const userId = intOrNull(req.query.userId);
    if (userId) where.userId = userId;
    // An open-ended from/to window has no month to bound it, so cap the page
    // explicitly — the admin list renders every row it is handed.
    const requests = await prisma.otRequest.findMany({
      where,
      orderBy: [{ status: 'asc' }, { date: 'desc' }, { id: 'desc' }],
      take: LIST_MAX,
      include: includeUser,
    });
    res.json({ month, requests, truncated: requests.length === LIST_MAX });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// PATCH /api/ot/requests/:id/decision (admin) — { status:'approved'|'rejected', reviewNote }
router.patch('/requests/:id/decision', requireRole(ADMIN), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { status, reviewNote } = req.body || {};
    if (!['approved', 'rejected'].includes(status))
      return res.status(400).json({ message: "status must be 'approved' or 'rejected'" });

    const row = await prisma.otRequest.findUnique({ where: { id } });
    if (!row) return res.status(404).json({ message: 'Request not found' });
    if (row.status !== 'pending')
      return res.status(400).json({ message: `Request is already ${row.status}` });

    const updated = await prisma.otRequest.update({
      where: { id },
      data: {
        status,
        reviewedById: req.user.sub,
        reviewedAt: new Date(),
        reviewNote: (reviewNote || '').trim().slice(0, 500) || null,
      },
      include: includeUser,
    });
    res.json(updated);
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// POST /api/ot/grant (admin) — add pre-approved OT for one or many employees
// { userIds:[..], date:'YYYY-MM-DD', startTime:'HH:MM', endTime:'HH:MM', reason }
router.post('/grant', requireRole(ADMIN), async (req, res) => {
  try {
    const { date, startTime, endTime, reason } = req.body || {};
    const userIds = [...new Set((Array.isArray(req.body?.userIds) ? req.body.userIds : []).map(Number).filter(Boolean))];
    if (userIds.length === 0)
      return res.status(400).json({ message: 'Select at least one employee' });
    if (!YMD.test(date || ''))
      return res.status(400).json({ message: 'date (YYYY-MM-DD) is required' });
    if (!HHMM.test(startTime || '') || !HHMM.test(endTime || ''))
      return res.status(400).json({ message: 'startTime and endTime (HH:MM) are required' });
    const reasonTrim = String(reason || '').trim();
    if (!reasonTrim)
      return res.status(400).json({ message: 'A reason (the OT work) is required' });

    const { start, end, hours } = otWindow(date, startTime, endTime);
    if (hours <= 0 || hours > 12)
      return res.status(400).json({ message: 'OT duration must be between 15 minutes and 12 hours' });

    const users = await prisma.user.findMany({
      where: { id: { in: userIds }, isActive: true },
      select: { id: true, username: true, fullName: true },
    });

    const created = [], skipped = [];
    for (const u of users) {
      if (await conflictFor(u.id, date)) {
        skipped.push({ userId: u.id, name: u.fullName || u.username, reason: 'already has OT on this date' });
        continue;
      }
      const row = await prisma.otRequest.create({
        data: {
          userId: u.id,
          date: dateOnly(date),
          startTime: start,
          endTime: end,
          hours,
          reason: reasonTrim.slice(0, 500),
          status: 'approved', // admin-added OT is approved on creation
          source: 'admin',
          reviewedById: req.user.sub,
          reviewedAt: new Date(),
        },
        include: includeUser,
      });
      created.push(row);
    }
    res.status(201).json({ created, skipped });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// DELETE /api/ot/admin/:id (admin) — remove any OT entry (wrong grant etc.)
router.delete('/admin/:id', requireRole(ADMIN), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const row = await prisma.otRequest.findUnique({ where: { id } });
    if (!row) return res.status(404).json({ message: 'Entry not found' });
    await prisma.otRequest.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

module.exports = router;
