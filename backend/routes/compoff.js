const express = require('express');
const prisma = require('../lib/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');
const { reclaimedLeaveDays } = require('../lib/leaveWorked');
const { shiftForUser, loadShiftResolver, isWeekOff, shiftWindow } = require('../lib/shifts');
const { assertUnlocked } = require('../lib/attendanceLock');
const { holidayOn, branchOfUser } = require('../lib/holidays');
const { withManagerStage } = require('../lib/approvals');
const { requestCreated, finalDecided } = require('../lib/requestEvents');
const router = express.Router();
const ADMIN = 'Admin';

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

// A full comp-off day covers the employee's shift (start → end, IST) on the
// worked week-off/holiday.

// Punch record of a user's day (IST window). Drives the admin alert:
//   punched=false          → they never punched in/out that day
//   punched, fullDay=false → punches exist but don't cover the shift
async function punchSummary(userId, ymd, shift) {
  const start = new Date(`${ymd}T00:00:00+05:30`);
  const end = new Date(start.getTime() + 24 * 3600000);
  const sessions = await prisma.attendanceSession.findMany({
    where: { userId, punchInTime: { gte: start, lt: end } },
    orderBy: { punchInTime: 'asc' },
  });
  const requiredIn = shift.startTime, requiredOut = shift.endTime;
  if (sessions.length === 0)
    return { punched: false, firstIn: null, lastOut: null, hours: 0, fullDay: false, requiredIn, requiredOut };
  const firstIn = sessions[0].punchInTime;
  const outs = sessions.filter((s) => s.punchOutTime);
  const lastOut = outs.length ? outs[outs.length - 1].punchOutTime : null;
  const hours = Math.round(sessions.reduce((sum, s) => sum + (s.workingHours || 0), 0) * 100) / 100;
  const win = shiftWindow(shift, ymd);
  const fullDay = !!lastOut && firstIn <= win.start && lastOut >= win.end;
  return { punched: true, firstIn, lastOut, hours, fullDay, requiredIn, requiredOut };
}

// The worked day must be one of the employee's shift week-offs or a company holiday.
async function isWeekoffOrHoliday(ymd, shift, branchId = null) {
  if (isWeekOff(shift, ymd)) return { ok: true, kind: 'weekoff' };
  const holiday = await holidayOn(ymd, branchId); // company-wide or the employee's branch
  if (holiday) return { ok: true, kind: 'holiday', name: holiday.name };
  return { ok: false };
}

// Attach the worked-day punch record to each request row.
async function withPunch(rows) {
  const resolver = await loadShiftResolver([...new Set(rows.map((r) => r.userId))]);
  const out = [];
  for (const r of rows) {
    const ymd = new Date(r.workDate).toISOString().slice(0, 10);
    out.push({ ...r, punch: await punchSummary(r.userId, ymd, resolver.forUser(r.userId)) });
  }
  return { rows: await withManagerStage('compoff', out), def: resolver.def };
}

const includeUser = {
  user: { select: { id: true, username: true, fullName: true } },
  reviewedBy: { select: { fullName: true, username: true } },
};

// Earned/used/available comp-off balance. Earned = approved credits (1 day
// each); used = CO leave-request days (pending ones also hold the balance).
// A CO day that was approved but then worked is given back — same rule as
// every other leave type (see lib/leaveWorked.js).
async function compBalance(userId, year) {
  const range = yearRange(year);
  const [earned, coType, reclaimed] = await Promise.all([
    prisma.compOffRequest.count({ where: { userId, status: 'approved', workDate: range } }),
    prisma.leaveType.findUnique({ where: { code: 'CO' } }),
    reclaimedLeaveDays(userId, year),
  ]);
  let used = 0, pending = 0, back = 0;
  if (coType) {
    const reqs = await prisma.leaveRequest.findMany({
      where: { userId, leaveTypeId: coType.id, status: { in: ['approved', 'pending'] }, startDate: range },
      select: { status: true, days: true },
    });
    for (const r of reqs) {
      if (r.status === 'approved') used += r.days;
      else pending += r.days;
    }
    back = reclaimed.byType.get(coType.id) || 0;
    used = Math.max(Math.round((used - back) * 100) / 100, 0);
  }
  return {
    earned, used, pending, reclaimed: back,
    available: Math.max(Math.round((earned - used - pending) * 100) / 100, 0),
  };
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
    const [withP, balance] = await Promise.all([withPunch(rows), compBalance(req.user.sub, year)]);
    res.json({ year, balance, requests: withP.rows });
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

    const shift = await shiftForUser(req.user.sub);
    const day = await isWeekoffOrHoliday(workDate, shift, await branchOfUser(req.user.sub));
    if (!day.ok)
      return res.status(400).json({ message: 'Comp-off applies only to a week-off or a company holiday you worked on' });
    if (!(await assertUnlocked(res, workDate))) return;

    // They must actually have punched that day — no punch, no request.
    const punch = await punchSummary(req.user.sub, workDate, shift);
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
    requestCreated('compoff', created);
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
    // requiredIn/Out at the top level follow the default shift (older clients
    // read these); each row's punch carries its own employee's shift times.
    const { rows: requests, def } = await withPunch(rows);
    res.json({ year, requests, requiredIn: def.startTime, requiredOut: def.endTime });
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
    const workYmd = new Date(row.workDate).toISOString().slice(0, 10);
    if (status === 'approved' && !(await assertUnlocked(res, workYmd))) return;

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
    finalDecided('compoff', updated, updated.status);
    res.json({ ...updated, punch: await punchSummary(updated.userId, workYmd, await shiftForUser(updated.userId)) });
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
    if (!(await assertUnlocked(res, new Date(row.workDate).toISOString().slice(0, 10)))) return;

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
    finalDecided('compoff', updated, 'revoked');
    res.json(updated);
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

module.exports = router;
