// Payroll month lock. Once a month is locked, nothing that would change its
// attendance may be written; every such write path calls assertUnlocked().
const prisma = require('./prisma');

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const currentMonthIST = () => new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 7);

// Every 'YYYY-MM' touched by an inclusive YMD range.
function monthsBetween(fromYmd, toYmd = fromYmd) {
  const out = [];
  let [y, m] = fromYmd.slice(0, 7).split('-').map(Number);
  const [ey, em] = toYmd.slice(0, 7).split('-').map(Number);
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    if (++m > 12) { m = 1; y++; }
    if (out.length > 24) break; // a leave never spans more than a year
  }
  return out;
}

// First locked month touched by the range, or null.
async function lockedMonth(fromYmd, toYmd = fromYmd) {
  const row = await prisma.attendanceLock.findFirst({
    where: { month: { in: monthsBetween(fromYmd, toYmd) } },
    orderBy: { month: 'asc' },
    select: { month: true },
  });
  return row?.month || null;
}

const monthLabel = (ym) =>
  new Date(`${ym}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });

// Sends 423 and returns false when the range touches a locked month.
async function assertUnlocked(res, fromYmd, toYmd = fromYmd) {
  const ym = await lockedMonth(fromYmd, toYmd);
  if (!ym) return true;
  res.status(423).json({
    message: `Attendance for ${monthLabel(ym)} is locked for payroll. An admin must unlock the month before it can change.`,
    code: 'MONTH_LOCKED',
    month: ym,
  });
  return false;
}

module.exports = { MONTH, currentMonthIST, monthsBetween, lockedMonth, assertUnlocked, monthLabel };
