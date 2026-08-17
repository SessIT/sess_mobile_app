const express = require('express');
const prisma = require('../lib/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');
const router = express.Router();
const ADMIN = 'Technical Director / Admin';

router.use(requireAuth);

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const dateOnly = (ymd) => new Date(ymd + 'T00:00:00.000Z');
const ymdIST = (d) => new Date(new Date(d).getTime() + 5.5 * 3600000).toISOString().slice(0, 10);
const intYear = (v) => (/^\d{4}$/.test(String(v || '')) ? Number(v) : Number(ymdIST(new Date()).slice(0, 4)));
const yearRange = (year) => ({ gte: dateOnly(`${year}-01-01`), lt: dateOnly(`${year + 1}-01-01`) });
// Optional list filters. Anything unparseable returns null and is ignored — a
// stray query string must never break an approval list.
const intOrNull = (v) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };
const monthOrNull = (v) => (/^\d{4}-(0[1-9]|1[0-2])$/.test(String(v || '')) ? String(v) : null);
const monthRange = (month) => {
  const [y, m] = month.split('-').map(Number);
  return {
    gte: dateOnly(`${month}-01`),
    lt: dateOnly(`${m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`}-01`),
  };
};

// A full comp-off day is 9:30 → 18:30 IST on the worked week-off/holiday.
const REQ_IN = '09:30';
const REQ_OUT = '18:30';

// Punch record of a user's day (IST window). Drives the admin alert:
//   punched=false          → they never punched in/out that day
//   punched, fullDay=false → punches exist but don't cover 9:30–18:30
async function punchSummary(userId, ymd) {
  const start = new Date(`${ymd}T00:00:00+05:30`);
  const end = new Date(start.getTime() + 24 * 3600000);
  const sessions = await prisma.attendanceSession.findMany({
    where: { userId, punchInTime: { gte: start, lt: end } },
    orderBy: { punchInTime: 'asc' },
  });
  if (sessions.length === 0)
    return { punched: false, firstIn: null, lastOut: null, hours: 0, fullDay: false };
  const firstIn = sessions[0].punchInTime;
  const outs = sessions.filter((s) => s.punchOutTime);
  const lastOut = outs.length ? outs[outs.length - 1].punchOutTime : null;
  const hours = Math.round(sessions.reduce((sum, s) => sum + (s.workingHours || 0), 0) * 100) / 100;
  const requiredIn = new Date(`${ymd}T${REQ_IN}:00+05:30`);
  const requiredOut = new Date(`${ymd}T${REQ_OUT}:00+05:30`);
  const fullDay = !!lastOut && firstIn <= requiredIn && lastOut >= requiredOut;
  return { punched: true, firstIn, lastOut, hours, fullDay };
}

// The worked day must be a Sunday (week-off) or a company holiday.
async function isWeekoffOrHoliday(ymd) {
  // Zone-immune weekday: parsed at UTC midnight and read back in UTC, matching
  // leaves.js. A '+05:30' parse plus getDay() would resolve the weekday in the
  // server's timezone, so a non-IST host would credit comp-off for the wrong day.
  const wd = new Date(ymd + 'T00:00:00.000Z').getUTCDay();
  if (wd === 0) return { ok: true, kind: 'weekoff' };
  const holiday = await prisma.holiday.findUnique({ where: { date: dateOnly(ymd) } });
  if (holiday) return { ok: true, kind: 'holiday', name: holiday.name };
  return { ok: false };
}

// Attach the worked-day punch record to each request row.
async function withPunch(rows) {
  const out = [];
  for (const r of rows) {
    const ymd = new Date(r.workDate).toISOString().slice(0, 10);
    out.push({ ...r, punch: await punchSummary(r.userId, ymd) });
  }
  return out;
}

const includeUser = {
  user: { select: { id: true, username: true, fullName: true } },
  reviewedBy: { select: { fullName: true, username: true } },
};

// Earned/used/available comp-off balance. Earned = approved credits (1 day
// each); used = CO leave-request days (pending ones also hold the balance).
async function compBalance(userId, year) {
  const range = yearRange(year);
  const [earned, coType] = await Promise.all([
    prisma.compOffRequest.count({ where: { userId, status: 'approved', workDate: range } }),
    prisma.leaveType.findUnique({ where: { code: 'CO' } }),
  ]);
  let used = 0, pending = 0;
  if (coType) {
    const reqs = await prisma.leaveRequest.findMany({
      where: { userId, leaveTypeId: coType.id, status: { in: ['approved', 'pending'] }, startDate: range },
      select: { status: true, days: true },
    });
    for (const r of reqs) {
      if (r.status === 'approved') used += r.days;
      else pending += r.days;
    }
  }
  return { earned, used, pending, available: Math.max(Math.round((earned - used - pending) * 100) / 100, 0) };
}

/* ==================== EMPLOYEE (SELF) ==================== */

// GET /api/compoff/my?year=YYYY — my credits + balance (each with punch record)
router.get('/my', async (req, res) => {
  try {
    const year = intYear(req.query.year);
    const rows = await prisma.compOffRequest.findMany({
      where: { userId: req.user.sub, workDate: yearRange(year) },
      orderBy: [{ workDate: 'desc' }, { id: 'desc' }],
      include: { reviewedBy: { select: { fullName: true, username: true } } },
    });
    const [requests, balance] = await Promise.all([withPunch(rows), compBalance(req.user.sub, year)]);
    res.json({ year, balance, requests });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// POST /api/compoff/requests — request a comp-off credit for a worked week-off/holiday
// { workDate:'YYYY-MM-DD', reason }
router.post('/requests', async (req, res) => {
  try {
    const { workDate, reason } = req.body || {};
    if (!YMD.test(workDate || ''))
      return res.status(400).json({ message: 'workDate (YYYY-MM-DD) is required' });
    if (workDate > ymdIST(new Date()))
      return res.status(400).json({ message: 'You can request comp-off only after working that day' });

    const day = await isWeekoffOrHoliday(workDate);
    if (!day.ok)
      return res.status(400).json({ message: 'Comp-off applies only to a week-off (Sunday) or a company holiday you worked on' });

    // They must actually have punched that day — no punch, no request.
    const punch = await punchSummary(req.user.sub, workDate);
    if (!punch.punched)
      return res.status(400).json({ message: `No punch in/out found on ${workDate}. Comp-off needs an attendance record for that day.` });

    const dup = await prisma.compOffRequest.findFirst({
      where: { userId: req.user.sub, workDate: dateOnly(workDate), status: { in: ['pending', 'approved'] } },
    });
    if (dup) return res.status(409).json({ message: 'You already have a comp-off request for this date' });

    const created = await prisma.compOffRequest.create({
      data: {
        userId: req.user.sub,
        workDate: dateOnly(workDate),
        reason: String(reason || '').trim().slice(0, 500) || null,
        status: 'pending',
      },
    });
    res.status(201).json({ ...created, punch, dayKind: day.kind });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// DELETE /api/compoff/requests/:id — cancel own pending request
router.delete('/requests/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const row = await prisma.compOffRequest.findUnique({ where: { id } });
    if (!row || row.userId !== req.user.sub)
      return res.status(404).json({ message: 'Request not found' });
    if (row.status !== 'pending')
      return res.status(400).json({ message: 'Only pending requests can be cancelled' });
    await prisma.compOffRequest.update({ where: { id }, data: { status: 'cancelled' } });
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

/* ==================== ADMIN ==================== */

// GET /api/compoff/requests?status=&year=&userId=&month=YYYY-MM (admin) — all
// requests with punch records. A month narrows to that month's worked days and
// stands in for the year window (it already carries its own year).
router.get('/requests', requireRole(ADMIN), async (req, res) => {
  try {
    const year = intYear(req.query.year);
    const month = monthOrNull(req.query.month);
    const where = { workDate: month ? monthRange(month) : yearRange(year) };
    if (['pending', 'approved', 'rejected', 'cancelled', 'revoked'].includes(req.query.status))
      where.status = req.query.status;
    const userId = intOrNull(req.query.userId);
    if (userId) where.userId = userId;
    const rows = await prisma.compOffRequest.findMany({
      where,
      orderBy: [{ status: 'asc' }, { workDate: 'desc' }],
      include: includeUser,
    });
    res.json({ year, requests: await withPunch(rows), requiredIn: REQ_IN, requiredOut: REQ_OUT });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// PATCH /api/compoff/requests/:id/decision (admin) — { status:'approved'|'rejected', reviewNote }
router.patch('/requests/:id/decision', requireRole(ADMIN), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { status, reviewNote } = req.body || {};
    if (!['approved', 'rejected'].includes(status))
      return res.status(400).json({ message: "status must be 'approved' or 'rejected'" });

    const row = await prisma.compOffRequest.findUnique({ where: { id } });
    if (!row) return res.status(404).json({ message: 'Request not found' });
    if (row.status !== 'pending')
      return res.status(400).json({ message: `Request is already ${row.status}` });

    const updated = await prisma.compOffRequest.update({
      where: { id },
      data: {
        status,
        reviewedById: req.user.sub,
        reviewedAt: new Date(),
        reviewNote: (reviewNote || '').trim().slice(0, 500) || null,
      },
      include: includeUser,
    });
    const ymd = new Date(updated.workDate).toISOString().slice(0, 10);
    res.json({ ...updated, punch: await punchSummary(updated.userId, ymd) });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// PATCH /api/compoff/admin/:id/revoke (admin) — remove an approved credit.
// Used when the punch record shows the employee did not actually work the
// full 9:30–18:30 day (or didn't punch at all).
router.patch('/admin/:id/revoke', requireRole(ADMIN), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const row = await prisma.compOffRequest.findUnique({ where: { id } });
    if (!row) return res.status(404).json({ message: 'Request not found' });
    if (row.status !== 'approved')
      return res.status(400).json({ message: 'Only approved credits can be revoked' });

    const updated = await prisma.compOffRequest.update({
      where: { id },
      data: {
        status: 'revoked',
        reviewedById: req.user.sub,
        reviewedAt: new Date(),
        reviewNote: (req.body?.reviewNote || '').trim().slice(0, 500) || 'Revoked — punch record did not meet the full-day requirement',
      },
      include: includeUser,
    });
    res.json(updated);
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

module.exports = router;
