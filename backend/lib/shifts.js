// Shift rules — the single source for lateness, early-out, half-day and
// week-offs. Every attendance / leave / comp-off calculation asks the
// employee's shift instead of assuming 09:30, 8 h and Sunday.
const prisma = require('./prisma');

// What the code hardcoded before shifts existed. The migration seeds the same
// row; this copy only matters if someone empties the table.
const DEFAULT_SHIFT = {
  name: 'General Shift', startTime: '09:30', endTime: '18:30',
  graceMinutes: 10, hoursPerDay: 8, halfDayHours: 4, weekOffDays: [0], isDefault: true,
};

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const toMin = (hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + m; };
const ymdOf = (d) => new Date(d).toISOString().slice(0, 10);

async function getDefaultShift() {
  const s = await prisma.shift.findFirst({ where: { isDefault: true }, orderBy: { id: 'asc' } });
  if (s) return s;
  try {
    return await prisma.shift.create({ data: DEFAULT_SHIFT });
  } catch {
    // Lost a creation race (unique name) — or the name exists but lost its
    // default flag. Either way, promote the oldest shift.
    const first = await prisma.shift.findFirst({ orderBy: { id: 'asc' } });
    return first ? prisma.shift.update({ where: { id: first.id }, data: { isDefault: true } }) : DEFAULT_SHIFT;
  }
}

// Effective shift of one employee.
async function shiftForUser(userId) {
  const u = await prisma.user.findUnique({ where: { id: Number(userId) }, select: { shift: true } });
  return u?.shift || getDefaultShift();
}

// Batch resolver for handlers that look at many employees — three queries total,
// never one per user. `employment(uid)` gives the joining/exit window as YMDs so
// days outside it are never counted as absent.
async function loadShiftResolver(userIds) {
  const [def, shifts, users] = await Promise.all([
    getDefaultShift(),
    prisma.shift.findMany(),
    prisma.user.findMany({
      where: Array.isArray(userIds) ? { id: { in: userIds } } : {},
      select: { id: true, shiftId: true, dateOfJoining: true, exitDate: true, branchId: true },
    }),
  ]);
  const byId = new Map(shifts.map((s) => [s.id, s]));
  const userMap = new Map(users.map((u) => [u.id, u]));
  return {
    def,
    forUser: (uid) => {
      const u = userMap.get(uid);
      return (u?.shiftId && byId.get(u.shiftId)) || def;
    },
    employment: (uid) => employmentOf(userMap.get(uid)),
    branchOf: (uid) => userMap.get(uid)?.branchId || null,
  };
}

const employmentOf = (u) => ({
  from: u?.dateOfJoining ? ymdOf(u.dateOfJoining) : null,
  to: u?.exitDate ? ymdOf(u.exitDate) : null,
});
const isEmployedOn = (emp, ymd) => (!emp.from || ymd >= emp.from) && (!emp.to || ymd <= emp.to);

// Zone-immune weekday of a calendar day (parsed and read back in UTC).
const weekdayOf = (ymd) => new Date(ymd + 'T00:00:00.000Z').getUTCDay();
const isWeekOff = (shift, ymd) => (shift?.weekOffDays || []).includes(weekdayOf(ymd));

const istMinutesOfDay = (d) => {
  const ist = new Date(new Date(d).getTime() + 5.5 * 3600 * 1000);
  return ist.getUTCHours() * 60 + ist.getUTCMinutes();
};

// 'ontime' up to start + grace (IST), 'late' after. `isLate` columns and every
// view derive from this, so it stays right for historical rows too.
function lateLevelOf(firstIn, shift) {
  if (!firstIn) return null;
  return istMinutesOfDay(firstIn) <= toMin(shift.startTime) + (shift.graceMinutes || 0) ? 'ontime' : 'late';
}
const isLateLevel = (lvl) => lvl === 'grace' || lvl === 'late';

// Shift start/end as instants for a calendar day; an end at/before the start
// belongs to the next morning (overnight shift).
function shiftWindow(shift, ymd) {
  const start = new Date(`${ymd}T${shift.startTime}:00+05:30`);
  let end = new Date(`${ymd}T${shift.endTime}:00+05:30`);
  if (end <= start) end = new Date(end.getTime() + 24 * 3600000);
  return { start, end };
}

// Day flags for a worked day: left before shift end, or too few hours. Only
// judged once the day is over and every session is closed — an open session is
// a missed punch-out (shown as such), not an early exit.
function dayFlags(shift, ymd, rec, dayIsOver) {
  if (!rec || !dayIsOver || rec.open) return { earlyOut: false, halfDay: false };
  const { end } = shiftWindow(shift, ymd);
  return {
    earlyOut: !!rec.lastOut && new Date(rec.lastOut) < end,
    halfDay: rec.hours > 0 && rec.hours < (shift.halfDayHours || 0),
  };
}

// Validate an admin-supplied shift body -> { ok, data } / { ok:false, message }.
function validateShift(body, partial = false) {
  const data = {};
  const fail = (message) => ({ ok: false, message });
  if (!partial || body.name !== undefined) {
    const name = String(body.name || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    if (!name) return fail('Enter a shift name');
    data.name = name;
  }
  for (const key of ['startTime', 'endTime']) {
    if (!partial || body[key] !== undefined) {
      if (!HHMM.test(String(body[key] || ''))) return fail(`${key === 'startTime' ? 'Start' : 'End'} time must be HH:MM`);
      data[key] = body[key];
    }
  }
  if (data.startTime && data.endTime && data.startTime === data.endTime)
    return fail('Start and end time cannot be the same');
  const numIn = (key, min, max, label, int = false) => {
    if (partial && body[key] === undefined) return null;
    const n = Number(body[key]);
    if (!Number.isFinite(n) || n < min || n > max || (int && !Number.isInteger(n)))
      return `${label} must be between ${min} and ${max}`;
    data[key] = n;
    return null;
  };
  const err = numIn('graceMinutes', 0, 120, 'Grace minutes', true)
    || numIn('hoursPerDay', 1, 16, 'Hours per day')
    || numIn('halfDayHours', 0, 16, 'Half-day hours');
  if (err) return fail(err);
  if (data.halfDayHours != null && data.hoursPerDay != null && data.halfDayHours > data.hoursPerDay)
    return fail('Half-day hours cannot exceed hours per day');
  if (!partial || body.weekOffDays !== undefined) {
    const days = Array.isArray(body.weekOffDays) ? [...new Set(body.weekOffDays.map(Number))] : null;
    if (!days || days.some((d) => !Number.isInteger(d) || d < 0 || d > 6))
      return fail('Week-off days must be weekday numbers 0 (Sun) to 6 (Sat)');
    if (days.length > 6) return fail('A shift needs at least one working day');
    data.weekOffDays = days.sort((a, b) => a - b);
  }
  return { ok: true, data };
}

module.exports = {
  getDefaultShift, shiftForUser, loadShiftResolver, employmentOf, isEmployedOn,
  weekdayOf, isWeekOff, lateLevelOf, isLateLevel, shiftWindow, dayFlags, validateShift,
};
