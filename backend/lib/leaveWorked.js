// Leave that was applied for and approved, but then actually worked.
//
// Attendance already treats a punch on a leave day as Present (routes/
// attendance.js), so the day must not stay charged against the leave balance
// either — the employee gets it back. This is computed on read rather than
// written back to the request row, so it self-corrects if a punch is added or
// removed later, and it needs no migration.
const prisma = require('./prisma');
const { shiftForUser, isWeekOff } = require('./shifts');
const { holidayMapFor, branchOfUser } = require('./holidays');

const dateOnly = (ymd) => new Date(ymd + 'T00:00:00.000Z');
const DAY_MS = 86400000;

// IST calendar day of an instant — punches are stored as real timestamps.
const ymdIST = (d) => new Date(new Date(d).getTime() + 5.5 * 3600000).toISOString().slice(0, 10);

// Days in [year] the user punched in on, as 'YYYY-MM-DD' (IST).
async function punchedDays(userId, year) {
  const sessions = await prisma.attendanceSession.findMany({
    where: {
      userId,
      punchInTime: {
        gte: new Date(`${year}-01-01T00:00:00+05:30`),
        lt: new Date(`${year + 1}-01-01T00:00:00+05:30`),
      },
    },
    select: { punchInTime: true },
  });
  return new Set(sessions.map((s) => ymdIST(s.punchInTime)));
}

// Reclaimed leave for a user in a year, as Map(leaveTypeId -> days).
//
// A day counts as reclaimed when it falls inside an APPROVED leave request, is
// a working day (the shift's week-offs and company holidays are never charged
// in the first place — see leaves.js countLeaveDays), and has a punch-in. The per-request
// total is capped at the days actually charged, so a half-day gives back 0.5.
async function reclaimedLeaveDays(userId, year) {
  const from = dateOnly(`${year}-01-01`);
  const to = dateOnly(`${year + 1}-01-01`);
  const [requests, branchId] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: { userId, status: 'approved', startDate: { gte: from, lt: to } },
      select: { id: true, leaveTypeId: true, startDate: true, endDate: true, days: true },
    }),
    branchOfUser(userId),
  ]);
  const byType = new Map(), byRequest = new Map();
  if (requests.length === 0) return { byType, byRequest };

  // Company-wide + the employee's branch holidays (leave never charges them).
  const holidays = await holidayMapFor(`${year}-01-01`, `${year}-12-31`, branchId);
  const [punched, shift] = await Promise.all([punchedDays(userId, year), shiftForUser(userId)]);

  for (const r of requests) {
    const s = new Date(r.startDate).getTime();
    const e = new Date(r.endDate).getTime();
    let worked = 0;
    for (let t = s; t <= e; t += DAY_MS) {
      const ymd = new Date(t).toISOString().slice(0, 10);
      if (isWeekOff(shift, ymd)) continue; // weekly off — never charged
      if (holidays.has(ymd)) continue; // holiday — never charged
      if (punched.has(ymd)) worked++;
    }
    // Never give back more than the request charged (half-days, mainly).
    const credit = Math.min(worked, r.days);
    if (credit > 0) {
      byRequest.set(r.id, credit);
      byType.set(r.leaveTypeId, Math.round(((byType.get(r.leaveTypeId) || 0) + credit) * 100) / 100);
    }
  }
  return { byType, byRequest };
}

module.exports = { reclaimedLeaveDays };
