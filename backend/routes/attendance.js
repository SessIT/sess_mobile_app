const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const prisma = require('../lib/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');
const {
  shiftForUser, loadShiftResolver, isEmployedOn,
  weekdayOf, isWeekOff, lateLevelOf, isLateLevel, dayFlags,
} = require('../lib/shifts');
const { MONTH, currentMonthIST, assertUnlocked, monthLabel } = require('../lib/attendanceLock');
const { requireManager } = require('../lib/team');
const { withManagerStage } = require('../lib/approvals');
const { holidaysByBranch, holidayMapFor, branchOfUser } = require('../lib/holidays');
const { requestCreated, finalDecided } = require('../lib/requestEvents');
const router = express.Router();
const ADMIN = 'Admin';

// Lateness, week-offs and required hours per day all come from the employee's
// shift (lib/shifts.js) — nothing here assumes 09:30, Sunday or 8 h any more.

router.use(requireAuth);

const dir = path.join(__dirname, '..', 'uploads', 'attendance');
fs.mkdirSync(dir, { recursive: true });

function savePhoto(userId, base64) {
  if (!base64) return null;
  const filename = 'u' + userId + '_' + Date.now() + '.jpg';
  fs.writeFileSync(path.join(dir, filename), Buffer.from(base64, 'base64'));
  return 'uploads/attendance/' + filename;
}

// Selfies arrive as a multipart `photo` part so the global JSON body limit can
// stay small. Memory storage on purpose: the buffer is only written to disk
// AFTER the open-session and geofence checks pass, so a rejected punch leaves
// no orphan file. Non-multipart requests (older app builds still sending
// photoBase64 JSON) pass through multer untouched and hit the legacy path.
const punchUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\//.test(String(file.mimetype || '')) && file.mimetype !== 'image/svg+xml')
      return cb(null, true);
    cb(new Error('Punch photo must be an image'));
  },
}).single('photo');

const punchPhotoMiddleware = (req, res, next) =>
  punchUpload(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE'
        ? 'Punch photo is too large (max 10 MB)'
        : err.message || 'Photo upload failed';
      return res.status(400).json({ message: msg });
    }
    next();
  });

// Store the selfie from whichever channel it came in on; null when the punch
// carried no photo at all.
function storePunchPhoto(req) {
  if (req.file?.buffer) {
    const filename = 'u' + req.user.sub + '_' + Date.now() + '.jpg';
    fs.writeFileSync(path.join(dir, filename), req.file.buffer);
    return 'uploads/attendance/' + filename;
  }
  return savePhoto(req.user.sub, req.body?.photoBase64);
}

function todayWindowIST() {
  const now = new Date();
  const istNow = new Date(now.getTime() + 5.5 * 3600 * 1000);
  const y = istNow.getUTCFullYear(), m = istNow.getUTCMonth(), d = istNow.getUTCDate();
  const start = new Date(Date.UTC(y, m, d, -5, -30));
  const end = new Date(start.getTime() + 24 * 3600 * 1000);
  return { start, end };
}

/* Arrival policy (IST, FIRST punch-in of the day, per the employee's shift):
 *   <= start + grace  -> 'ontime'
 *   later             -> 'late'
 * lateLevelOf() derives this from a stored punchInTime, so it stays correct for
 * historical rows. The default "General Shift" (09:30 + 10 min) reproduces the
 * rule that was hardcoded here before shifts existed. */

const num = (v) => (v !== undefined && v !== null && v !== '' ? parseFloat(v) : null);
const finiteOr = (v, fb = null) => (Number.isFinite(v) ? v : fb);
// Punch coords must be real, in-range numbers (NaN from parseFloat('abc') must not slip through).
const validPunchCoords = (lat, lng) =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
// Client-supplied free text: coerce to a bounded string (reject non-strings).
const cleanSiteName = (v) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 60) : 'SESS');
const cleanAddress = (v) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 200) : null);

/* ==================== GEOFENCE (authorized customer sites) ====================
 * Punch in/out is only allowed within an active site's fence:
 *   effective boundary = site radius + the phone's reported GPS accuracy,
 * with the accuracy buffer capped so a huge (or spoofed) accuracy value can't
 * open the fence everywhere. If NO sites are configured yet, the gate is off —
 * this keeps punching working until the admin registers sites.
 * Admin manual sessions (/admin/session) intentionally bypass the gate. */
const ACC_BUFFER_CAP_M = 200;

const haversineM = (lat1, lng1, lat2, lng2) => {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
};

const fmtDistance = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);

// -> { ok:true, site }             inside a fence
// -> { ok:true, site:null }        no sites configured (gate off)
// -> { ok:false, nearest, distanceM }  outside every fence
async function checkGeofence(lat, lng, acc) {
  let sites;
  try {
    sites = await prisma.site.findMany({ where: { isActive: true } });
  } catch (e) {
    // Fail-open if the sites table doesn't exist yet (migration not run) so
    // attendance keeps working; the gate arms itself once the table is live.
    console.warn('Geofence check skipped:', e.message);
    return { ok: true, site: null };
  }
  if (sites.length === 0) return { ok: true, site: null };
  // NaN-safe: a malformed accuracy must not poison the fence math (NaN buffer
  // would make every `d <= radius + buffer` false and 403 people standing on-site).
  const accN = num(acc);
  const buffer = Number.isFinite(accN) ? Math.min(Math.max(accN, 0), ACC_BUFFER_CAP_M) : 0;
  let best = null, bestDist = Infinity, nearest = null, nearestDist = Infinity;
  for (const s of sites) {
    const d = haversineM(lat, lng, s.lat, s.lng);
    if (d < nearestDist) { nearest = s; nearestDist = d; }
    if (d <= s.radiusM + buffer && d < bestDist) { best = s; bestDist = d; }
  }
  if (best) return { ok: true, site: best };
  return { ok: false, nearest, distanceM: Math.round(nearestDist) };
}

const geofenceError = (gate) => ({
  message: gate.nearest
    ? `You are in the wrong location. Nearest authorized site: ${gate.nearest.name} (${fmtDistance(gate.distanceM)} away). Please reach the proper customer site address.`
    : 'You are in the wrong location. Please reach an authorized customer site to punch in/out.',
  code: 'OUT_OF_RANGE',
  nearest: gate.nearest ? { id: gate.nearest.id, name: gate.nearest.name, distanceM: gate.distanceM } : null,
});

// GET /api/attendance/today — ALL today sessions
router.get('/today', async (req, res) => {
  try {
    const { start, end } = todayWindowIST();
    const sessions = await prisma.attendanceSession.findMany({
      where: { userId: req.user.sub, punchInTime: { gte: start, lt: end } },
      orderBy: { punchInTime: 'asc' },
    });
    res.json(sessions);
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

router.post('/punch-in', punchPhotoMiddleware, async (req, res) => {
  try {
    const { start, end } = todayWindowIST();
    // Multi-punch: open session irundha mattum block (out pannama in panna mudiyadhu)
    const openSession = await prisma.attendanceSession.findFirst({
      where: { userId: req.user.sub, punchInTime: { gte: start, lt: end }, punchOutTime: null },
    });
    if (openSession) return res.status(409).json({ message: 'Punch out first, then punch in again' });
    const sessionCount = await prisma.attendanceSession.count({
      where: { userId: req.user.sub, punchInTime: { gte: start, lt: end } },
    });

    const now = new Date();
    const { lat, lng, acc, address, siteName } = req.body || {};
    const pLat = num(lat), pLng = num(lng);
    if (!validPunchCoords(pLat, pLng))
      return res.status(400).json({ message: 'A valid location is required for punch in' });

    // Geofence: must be at an authorized customer site (when sites exist).
    const gate = await checkGeofence(pLat, pLng, acc);
    if (!gate.ok) return res.status(403).json(geofenceError(gate));

    const shift = await shiftForUser(req.user.sub);
    const session = await prisma.attendanceSession.create({
      data: {
        userId: req.user.sub,
        punchInTime: now,
        punchInLat: pLat, punchInLng: pLng, punchInAcc: finiteOr(num(acc)),
        punchInPhoto: storePunchPhoto(req),
        punchInAddress: cleanAddress(address),
        isLate: sessionCount === 0 && isLateLevel(lateLevelOf(now, shift)),
        // Matched site name is authoritative; free-text only while the gate is off.
        siteName: gate.site ? gate.site.name : cleanSiteName(siteName),
      },
    });
    res.status(201).json(session);
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

router.post('/punch-out', punchPhotoMiddleware, async (req, res) => {
  try {
    const { start, end } = todayWindowIST();
    const session = await prisma.attendanceSession.findFirst({
      where: { userId: req.user.sub, punchInTime: { gte: start, lt: end }, punchOutTime: null },
      orderBy: { punchInTime: 'desc' },
    });
    if (!session) return res.status(400).json({ message: 'No open session. Punch in first.' });

    const now = new Date();
    const { lat, lng, acc, address } = req.body || {};
    const pLat = num(lat), pLng = num(lng);
    if (!validPunchCoords(pLat, pLng))
      return res.status(400).json({ message: 'A valid location is required for punch out' });

    // Geofence: punch-out must also happen at an authorized site.
    const gate = await checkGeofence(pLat, pLng, acc);
    if (!gate.ok) return res.status(403).json(geofenceError(gate));

    const hours = (now - session.punchInTime) / 3600000;
    const updated = await prisma.attendanceSession.update({
      where: { id: session.id },
      data: {
        punchOutTime: now,
        punchOutLat: pLat, punchOutLng: pLng, punchOutAcc: finiteOr(num(acc)),
        punchOutPhoto: storePunchPhoto(req),
        punchOutAddress: cleanAddress(address),
        workingHours: Math.round(hours * 100) / 100,
      },
    });
    res.json(updated);
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// GET /api/attendance/my?days=30 — my history
router.get('/my', async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days) || 30, 90);
    const since = new Date(Date.now() - days * 24 * 3600 * 1000);
    const sessions = await prisma.attendanceSession.findMany({
      where: { userId: req.user.sub, punchInTime: { gte: since } },
      orderBy: { punchInTime: 'desc' },
    });
    res.json(sessions);
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

/* ==================== ADMIN ANALYTICS ==================== */
const ymdIST = (d) => new Date(new Date(d).getTime() + 5.5 * 3600000).toISOString().slice(0, 10);

function dayWindowIST(dateStr) {
  const start = new Date(dateStr + 'T00:00:00+05:30');
  return { start, end: new Date(start.getTime() + 24 * 3600 * 1000) };
}

const dateOnlyUTC = (ymd) => new Date(ymd + 'T00:00:00.000Z');
// Shape alone is not enough: new Date('2026-02-30T00:00:00Z') is not Invalid, it
// rolls forward to 03-02 and would silently shift the window. Round-trip it.
const ymdOrNull = (v) => {
  const str = String(v || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return null;
  const d = dateOnlyUTC(str);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10) === str ? str : null;
};

// Approved-leave day sets for a month: Map(userId -> Set('YYYY-MM-DD')) of the
// days each user is on approved leave (clipped to the month), skipping that
// user's own week-offs. Used to render leave days and adjust required hours.
async function approvedLeaveSets(month, userIds, resolver) {
  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const monthStart = `${month}-01`;
  const monthEnd = `${month}-${String(daysInMonth).padStart(2, '0')}`;
  const where = {
    status: 'approved',
    startDate: { lte: dateOnlyUTC(monthEnd) },
    endDate: { gte: dateOnlyUTC(monthStart) },
  };
  if (Array.isArray(userIds)) where.userId = { in: userIds };
  const leaves = await prisma.leaveRequest.findMany({
    where, select: { userId: true, startDate: true, endDate: true },
  });
  const ymdOf = (d) => new Date(d).toISOString().slice(0, 10);
  const sets = new Map();
  for (const lv of leaves) {
    let set = sets.get(lv.userId);
    if (!set) { set = new Set(); sets.set(lv.userId, set); }
    const ls = ymdOf(lv.startDate), le = ymdOf(lv.endDate);
    const from = ls < monthStart ? monthStart : ls;
    const to = le > monthEnd ? monthEnd : le;
    const shift = resolver.forUser(lv.userId);
    for (let t = Date.parse(from + 'T00:00:00Z'); t <= Date.parse(to + 'T00:00:00Z'); t += 86400000) {
      const ymd = new Date(t).toISOString().slice(0, 10);
      if (isWeekOff(shift, ymd)) continue; // a weekly off, not leave
      set.add(ymd);
    }
  }
  return sets;
}

/* ---------------- month building (shared by every month view) ---------------- */

function monthFrame(month) {
  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const start = new Date(`${month}-01T00:00:00+05:30`);
  const ymds = [];
  for (let d = 1; d <= daysInMonth; d++) ymds.push(`${month}-${String(d).padStart(2, '0')}`);
  return {
    y, m, ymds, start,
    end: new Date(start.getTime() + daysInMonth * 24 * 3600 * 1000),
    monthStart: ymds[0], monthEnd: ymds[ymds.length - 1],
    // OT dates are stored date-only (UTC midnight), so they bound by calendar month.
    otRange: {
      gte: new Date(`${month}-01T00:00:00.000Z`),
      lt: new Date(`${m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`}-01T00:00:00.000Z`),
    },
  };
}

// Sessions (asc) -> { userId: { ymd: { sessions, firstIn, lastOut, hours, sites, open } } }
function groupSessions(sessions) {
  const out = {};
  for (const s of sessions) {
    const byDay = out[s.userId] || (out[s.userId] = {});
    const ymd = ymdIST(s.punchInTime);
    const d = byDay[ymd] || (byDay[ymd] = { sessions: 0, firstIn: s.punchInTime, lastOut: null, hours: 0, sites: [], open: false });
    d.sessions++;
    if (s.punchOutTime) { d.lastOut = s.punchOutTime; d.hours += s.workingHours || 0; }
    else d.open = true;
    const site = (s.siteName || 'SESS').trim();
    if (!d.sites.includes(site)) d.sites.push(site);
  }
  return out;
}

/* One employee's month, day by day.
 * Status precedence: a real punch wins (working a holiday/week-off is
 * legitimate — that is what comp-off is for); days outside the employment
 * window are 'na' (never absent); then the shift's week-off; a company holiday
 * beats approved leave, matching leaves.js countLeaveDays(), which does not
 * charge a leave day for it; then leave (incl. upcoming), future, absent.
 * workingDays = employed, non-week-off, non-holiday days up to today — the
 * days on which an absence is possible. */
function buildUserDays({ ymds, todayStr, holidays, shift, employment, byDay = {}, leaveSet = new Set() }) {
  let workingDays = 0;
  const days = ymds.map((ymd) => {
    const weekoff = isWeekOff(shift, ymd);
    const isFuture = ymd > todayStr;
    const employed = isEmployedOn(employment, ymd);
    // The name is kept even when a higher-precedence status wins so the UI can
    // still label the day.
    const holidayName = holidays.get(ymd) || null;
    if (employed && !weekoff && !isFuture && !holidayName) workingDays++;
    const rec = byDay[ymd];
    const status = rec ? 'present'
      : !employed ? 'na'
      : weekoff ? 'weekoff'
      : holidayName ? 'holiday'
      : leaveSet.has(ymd) ? 'leave'
      : isFuture ? 'future'
      : 'absent';
    const lateLevel = rec ? lateLevelOf(rec.firstIn, shift) : null;
    const { earlyOut, halfDay } = dayFlags(shift, ymd, rec, ymd < todayStr);
    return {
      date: ymd, weekday: weekdayOf(ymd), status, holidayName,
      sessions: rec?.sessions || 0,
      firstIn: rec?.firstIn || null, lastOut: rec?.lastOut || null,
      hours: rec ? Math.round(rec.hours * 100) / 100 : 0,
      late: isLateLevel(lateLevel), lateLevel, earlyOut, halfDay,
      missedPunchOut: !!rec?.open && ymd < todayStr,
      sites: rec?.sites || [],
    };
  });
  return { days, workingDays };
}

// Counts behind every stat card. present + late + leave + absent ===
// workingDays + the days punched on a week-off or holiday: those are genuinely
// present but are not working days, so they lift the left side above it.
function dayStats(days, todayStr) {
  const leave = days.filter((d) => d.status === 'leave' && d.date <= todayStr).length;
  return {
    present: days.filter((d) => d.status === 'present' && !d.late).length,
    late: days.filter((d) => d.late).length,
    leave,
    absent: days.filter((d) => d.status === 'absent').length,
    weekoff: days.filter((d) => d.status === 'weekoff').length,
    holiday: days.filter((d) => d.status === 'holiday').length,
    earlyOut: days.filter((d) => d.earlyOut).length,
    halfDay: days.filter((d) => d.halfDay).length,
    missedPunchOut: days.filter((d) => d.missedPunchOut).length,
    hours: Math.round(days.reduce((s, d) => s + d.hours, 0) * 100) / 100,
  };
}

const shiftBrief = (s) => ({
  id: s.id, name: s.name, startTime: s.startTime, endTime: s.endTime,
  graceMinutes: s.graceMinutes, hoursPerDay: s.hoursPerDay, weekOffDays: s.weekOffDays,
});

// Register codes, the convention printed muster rolls use:
//   P present · LT late · HD half day · A absent · L leave · WO week-off ·
//   H holiday · '' future / not employed
function dayCode(d) {
  if (d.status === 'present') return d.halfDay ? 'HD' : d.late ? 'LT' : 'P';
  return { absent: 'A', leave: 'L', weekoff: 'WO', holiday: 'H' }[d.status] || '';
}

// Whole-team month summary — what /admin/month returns without a userId, and
// what a month lock freezes into its snapshot. `onlyIds` narrows it to a
// manager's team. `withCodes` adds a one-letter-ish status per day for the
// attendance register report (kept out of the lock snapshot — it isn't needed
// for payroll and would bloat it).
async function computeMonthSummary(month, onlyIds = null, { withCodes = false } = {}) {
  const f = monthFrame(month);
  const todayStr = ymdIST(new Date());
  const users = await prisma.user.findMany({
    where: { isActive: true, ...(onlyIds ? { id: { in: onlyIds } } : {}) },
    select: { id: true, username: true, fullName: true },
  });
  const ids = users.map((u) => u.id);
  const resolver = await loadShiftResolver(ids);
  const [sessions, holidayFor, leaveSets, otRows] = await Promise.all([
    prisma.attendanceSession.findMany({
      where: { punchInTime: { gte: f.start, lt: f.end }, userId: { in: ids } }, orderBy: { punchInTime: 'asc' },
    }),
    holidaysByBranch(f.monthStart, f.monthEnd),
    approvedLeaveSets(month, ids, resolver),
    prisma.otRequest.groupBy({
      by: ['userId'], where: { status: 'approved', date: f.otRange, userId: { in: ids } }, _sum: { hours: true },
    }),
  ]);
  const otByUser = new Map(otRows.map((r) => [r.userId, Math.round((r._sum.hours || 0) * 100) / 100]));
  const grouped = groupSessions(sessions);

  const summary = users.map((u) => {
    const shift = resolver.forUser(u.id);
    const { days, workingDays } = buildUserDays({
      ymds: f.ymds, todayStr, holidays: holidayFor(resolver.branchOf(u.id)), shift, employment: resolver.employment(u.id),
      byDay: grouped[u.id], leaveSet: leaveSets.get(u.id),
    });
    const st = dayStats(days, todayStr);
    return {
      userId: u.id, username: u.username, fullName: u.fullName,
      shiftName: shift.name,
      present: st.present, leave: st.leave, absent: st.absent, late: st.late,
      earlyOut: st.earlyOut, halfDay: st.halfDay, missedPunchOut: st.missedPunchOut,
      hours: st.hours,
      otHours: otByUser.get(u.id) || 0, // approved overtime this month
      workingDays,
      // hours expected to be physically worked (leave excluded)
      requiredHours: Math.max(workingDays - st.leave, 0) * shift.hoursPerDay,
      ...(withCodes ? { codes: days.map(dayCode) } : {}),
    };
  }).sort((a, b) => (a.fullName || a.username).localeCompare(b.fullName || b.username));

  // Header figures follow the default shift; each row carries its own.
  const ref = buildUserDays({ ymds: f.ymds, todayStr, holidays: holidayFor(null), shift: resolver.def, employment: {} });
  return {
    month,
    workingDaysSoFar: ref.workingDays,
    hoursPerDay: resolver.def.hoursPerDay,
    requiredHours: ref.workingDays * resolver.def.hoursPerDay, // gross target (before leave)
    summary,
  };
}

// One employee's month detail — /admin/month?userId and /my-month.
async function computeUserMonth(month, userId) {
  const f = monthFrame(month);
  const todayStr = ymdIST(new Date());
  const resolver = await loadShiftResolver([userId]);
  const shift = resolver.forUser(userId);
  const [sessions, holidays, leaveSets, otAgg] = await Promise.all([
    prisma.attendanceSession.findMany({
      where: { userId, punchInTime: { gte: f.start, lt: f.end } }, orderBy: { punchInTime: 'asc' },
    }),
    holidayMap(f.monthStart, f.monthEnd, resolver.branchOf(userId)),
    approvedLeaveSets(month, [userId], resolver),
    prisma.otRequest.aggregate({ where: { userId, status: 'approved', date: f.otRange }, _sum: { hours: true } }),
  ]);
  const { days, workingDays } = buildUserDays({
    ymds: f.ymds, todayStr, holidays, shift, employment: resolver.employment(userId),
    byDay: groupSessions(sessions)[userId], leaveSet: leaveSets.get(userId),
  });
  const stats = dayStats(days, todayStr);
  stats.otHours = Math.round((otAgg._sum.hours || 0) * 100) / 100;
  return {
    month, workingDaysSoFar: workingDays, hoursPerDay: shift.hoursPerDay,
    requiredHours: Math.max(workingDays - stats.leave, 0) * shift.hoursPerDay,
    grossRequiredHours: workingDays * shift.hoursPerDay,
    shift: shiftBrief(shift),
    stats, days,
  };
}

async function lockInfo(month) {
  const row = await prisma.attendanceLock.findUnique({ where: { month } });
  if (!row) return { locked: false };
  const by = row.lockedById
    ? await prisma.user.findUnique({ where: { id: row.lockedById }, select: { fullName: true, username: true } })
    : null;
  return { locked: true, lockedAt: row.lockedAt, lockedBy: by ? (by.fullName || by.username) : null, snapshot: row.snapshot };
}

// Company holidays in a date range (inclusive): Map('YYYY-MM-DD' -> name).
// Holidays are stored date-only at UTC midnight, so they are compared as plain
// 'YYYY-MM-DD' strings — exactly the way leaves.js countLeaveDays() does. Do NOT
// push them through the IST offset; that would shift them a day.
// One query per request: never call this inside a day loop.
// branchId: company-wide holidays plus that branch's own; null = company-wide only.
async function holidayMap(startYmd, endYmd = startYmd, branchId = null) {
  return holidayMapFor(startYmd, endYmd, branchId);
}

const dateParam = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : ymdIST(new Date()));

// GET /api/attendance/admin/day?date=YYYY-MM-DD — that day, ALL employees
router.get('/admin/day', requireRole(ADMIN), async (req, res) => {
  try {
    res.json(await computeDay(dateParam(req.query.date)));
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// One day across employees (all, or `onlyIds` for a manager's team).
async function computeDay(dateStr, onlyIds = null) {
  const { start, end } = dayWindowIST(dateStr);
  const scope = onlyIds ? { userId: { in: onlyIds } } : {};
  {
    const [sessions, allUsers, holidays, leaves] = await Promise.all([
      prisma.attendanceSession.findMany({
        where: { punchInTime: { gte: start, lt: end }, ...scope },
        orderBy: { punchInTime: 'asc' },
        include: { user: { select: { id: true, username: true, fullName: true } } },
      }),
      prisma.user.findMany({
        where: { isActive: true, ...(onlyIds ? { id: { in: onlyIds } } : {}) },
        select: { id: true, username: true, fullName: true },
      }),
      holidayMap(dateStr),
      prisma.leaveRequest.findMany({
        where: { status: 'approved', startDate: { lte: dateOnlyUTC(dateStr) }, endDate: { gte: dateOnlyUTC(dateStr) }, ...scope },
        select: { userId: true },
      }),
    ]);
    const resolver = await loadShiftResolver(allUsers.map((u) => u.id));
    const branchHolidays = await holidaysByBranch(dateStr);
    const dayIsOver = dateStr < ymdIST(new Date());
    const byUser = {};
    for (const s of sessions) {
      const u = byUser[s.userId] || (byUser[s.userId] = {
        userId: s.userId, username: s.user.username, fullName: s.user.fullName,
        sessions: 0, firstIn: s.punchInTime, lastOut: null, hours: 0, late: false, sites: [], open: false,
      });
      u.sessions += 1;
      if (s.punchOutTime) { u.lastOut = s.punchOutTime; u.hours += s.workingHours || 0; }
      else u.open = true;
      const site = (s.siteName || 'SESS').trim();
      if (!u.sites.includes(site)) u.sites.push(site);
    }
    const present = Object.values(byUser).map(u => {
      const shift = resolver.forUser(u.userId);
      const lateLevel = lateLevelOf(u.firstIn, shift);
      return {
        ...u, hours: Math.round(u.hours * 100) / 100, lateLevel, late: isLateLevel(lateLevel),
        ...dayFlags(shift, dateStr, u, dayIsOver), shiftName: shift.name,
      };
    });
    const ids = new Set(present.map(p => p.userId));
    const onLeave = new Set(leaves.map((l) => l.userId));
    // `absent` deliberately still lists everyone who did not punch — the CSV
    // export and the counts depend on that membership. `reason` tells the UI
    // which of them are not really absent: their shift's week-off, approved
    // leave, or outside their employment window. A company holiday is
    // day-level and comes back in `holiday`.
    const absent = allUsers.filter(u => !ids.has(u.id)).map((u) => {
      const shift = resolver.forUser(u.id);
      const reason = !isEmployedOn(resolver.employment(u.id), dateStr) ? 'na'
        : isWeekOff(shift, dateStr) ? 'weekoff'
        : branchHolidays(resolver.branchOf(u.id)).has(dateStr) ? 'holiday' // a holiday for their branch only
        : onLeave.has(u.id) ? 'leave'
        : null;
      return { ...u, reason, shiftName: shift.name };
    });
    const holidayName = holidays.get(dateStr) || null;
    return {
      date: dateStr, present, absent, totalUsers: allUsers.length,
      holiday: holidayName ? { date: dateStr, name: holidayName } : null,
    };
  }
}

async function daySessions(dateStr, userId, onlyIds = null) {
  const { start, end } = dayWindowIST(dateStr);
  const where = { punchInTime: { gte: start, lt: end } };
  if (onlyIds) where.userId = { in: onlyIds };
  if (userId) where.userId = userId;
  const sessions = await prisma.attendanceSession.findMany({
    where,
    orderBy: { punchInTime: 'asc' },
    include: { user: { select: { id: true, username: true, fullName: true } } },
  });
  return { date: dateStr, sessions };
}

/* ==================== MANAGER (MY TEAM) — read-only ====================
 * Same response shapes as the /admin views, limited to the caller's reporting
 * subtree (req.teamIds), so both apps reuse their Team Attendance screens. */
const inTeam = (req, uid) => req.teamIds.includes(uid);

router.get('/team/day', requireManager, async (req, res) => {
  try {
    res.json(await computeDay(dateParam(req.query.date), req.teamIds));
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

router.get('/team/day-sessions', requireManager, async (req, res) => {
  try {
    const userId = req.query.userId ? Number(req.query.userId) : null;
    if (userId && !inTeam(req, userId)) return res.status(403).json({ message: 'Not in your team' });
    res.json(await daySessions(dateParam(req.query.date), userId, req.teamIds));
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

router.get('/team/month', requireManager, async (req, res) => {
  try {
    const month = req.query.month;
    if (!MONTH.test(month || '')) return res.status(400).json({ message: 'month=YYYY-MM required' });
    const userId = req.query.userId ? Number(req.query.userId) : null;
    const lock = await lockInfo(month);
    const lockMeta = { locked: lock.locked, lockedAt: lock.lockedAt || null, lockedBy: lock.lockedBy || null };
    if (userId) {
      if (!inTeam(req, userId)) return res.status(403).json({ message: 'Not in your team' });
      return res.json({ ...(await computeUserMonth(month, userId)), ...lockMeta });
    }
    if (lock.locked && lock.snapshot) {
      const team = new Set(req.teamIds);
      return res.json({
        ...lock.snapshot, ...lockMeta,
        summary: (lock.snapshot.summary || []).filter((r) => team.has(r.userId)),
      });
    }
    res.json({ ...(await computeMonthSummary(month, req.teamIds)), ...lockMeta });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// GET /api/attendance/admin/register?month=YYYY-MM — muster roll: every
// employee × every day as a status code, plus the month totals.
router.get('/admin/register', requireRole(ADMIN), async (req, res) => {
  try {
    const month = req.query.month;
    if (!MONTH.test(month || '')) return res.status(400).json({ message: 'month=YYYY-MM required' });
    // Optional ?branchId= narrows the register to one branch's employees.
    const branchId = Number(req.query.branchId) || null;
    const onlyIds = branchId
      ? (await prisma.user.findMany({ where: { branchId, isActive: true }, select: { id: true } })).map((u) => u.id)
      : null;
    const data = await computeMonthSummary(month, onlyIds, { withCodes: true });
    const lock = await lockInfo(month);
    res.json({ ...data, days: monthFrame(month).ymds, locked: lock.locked });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// GET /api/attendance/admin/month?month=YYYY-MM[&userId=N]
router.get('/admin/month', requireRole(ADMIN), async (req, res) => {
  try {
    const month = req.query.month;
    if (!MONTH.test(month || ''))
      return res.status(400).json({ message: 'month=YYYY-MM required' });
    const userId = req.query.userId ? Number(req.query.userId) : null;
    const lock = await lockInfo(month);
    const lockMeta = { locked: lock.locked, lockedAt: lock.lockedAt || null, lockedBy: lock.lockedBy || null };

    if (!userId) {
      // A locked month serves the summary frozen at lock time, so later shift
      // edits or data fixes can never move numbers payroll already used.
      if (lock.locked && lock.snapshot) return res.json({ ...lock.snapshot, ...lockMeta });
      return res.json({ ...(await computeMonthSummary(month)), ...lockMeta });
    }
    res.json({ ...(await computeUserMonth(month, userId)), ...lockMeta });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

/* ==================== PAYROLL MONTH LOCK ==================== */

// GET /api/attendance/admin/locks — every locked month, newest first.
router.get('/admin/locks', requireRole(ADMIN), async (req, res) => {
  try {
    const rows = await prisma.attendanceLock.findMany({
      orderBy: { month: 'desc' }, select: { month: true, lockedAt: true, lockedById: true },
    });
    const ids = [...new Set(rows.map((r) => r.lockedById).filter(Boolean))];
    const users = ids.length
      ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true, username: true } })
      : [];
    const name = new Map(users.map((u) => [u.id, u.fullName || u.username]));
    res.json({ locks: rows.map((r) => ({ month: r.month, lockedAt: r.lockedAt, lockedBy: name.get(r.lockedById) || null })) });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// POST /api/attendance/admin/locks { month } — close a finished month for payroll.
// Only months that are fully over can be locked: the current month still has
// punches to come.
router.post('/admin/locks', requireRole(ADMIN), async (req, res) => {
  try {
    const month = String(req.body?.month || '');
    if (!MONTH.test(month)) return res.status(400).json({ message: 'month (YYYY-MM) is required' });
    if (month >= currentMonthIST())
      return res.status(400).json({ message: 'Only a month that has fully ended can be locked' });
    if (await prisma.attendanceLock.findUnique({ where: { month } }))
      return res.status(409).json({ message: `${monthLabel(month)} is already locked` });
    const snapshot = await computeMonthSummary(month);
    const row = await prisma.attendanceLock.create({ data: { month, lockedById: req.user.sub, snapshot } });
    res.status(201).json({ month: row.month, lockedAt: row.lockedAt });
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ message: 'This month is already locked' });
    console.error(e); res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/attendance/admin/locks/:month — reopen a month (the snapshot is
// discarded; numbers are computed live again until it is re-locked).
router.delete('/admin/locks/:month', requireRole(ADMIN), async (req, res) => {
  try {
    const month = String(req.params.month || '');
    if (!MONTH.test(month)) return res.status(400).json({ message: 'month must be YYYY-MM' });
    // Finalized payslips were computed from this snapshot — reopening the month
    // underneath them would let attendance and pay disagree.
    const run = await prisma.payrollRun.findUnique({ where: { month }, select: { status: true } });
    if (run?.status === 'finalized')
      return res.status(409).json({ message: `Payroll for ${monthLabel(month)} is finalized. Reopen the payroll before unlocking attendance.` });
    const { count } = await prisma.attendanceLock.deleteMany({ where: { month } });
    if (!count) return res.status(404).json({ message: `${monthLabel(month)} is not locked` });
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// GET /api/attendance/admin/day-sessions?date=YYYY-MM-DD[&userId=N]
// Full session records (photos, addresses, sites) for the selected date
router.get('/admin/day-sessions', requireRole(ADMIN), async (req, res) => {
  try {
    res.json(await daySessions(dateParam(req.query.date), req.query.userId ? Number(req.query.userId) : null));
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

/* ==================== SELF SERVICE (EMPLOYEE) ==================== */

// GET /api/attendance/my-month?month=YYYY-MM — monthly breakdown for the logged-in user
router.get('/my-month', async (req, res) => {
  try {
    const month = req.query.month;
    if (!MONTH.test(month || ''))
      return res.status(400).json({ message: 'month=YYYY-MM required' });
    const lock = await lockInfo(month);
    res.json({ ...(await computeUserMonth(month, req.user.sub)), locked: lock.locked });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// GET /api/attendance/my-day?date=YYYY-MM-DD — own full session records for a date
router.get('/my-day', async (req, res) => {
  try {
    const dateStr = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : ymdIST(new Date());
    const { start, end } = dayWindowIST(dateStr);
    const [sessions, holidays] = await Promise.all([
      prisma.attendanceSession.findMany({
        where: { userId: req.user.sub, punchInTime: { gte: start, lt: end } },
        orderBy: { punchInTime: 'asc' },
      }),
      branchOfUser(req.user.sub).then((b) => holidayMap(dateStr, dateStr, b)),
    ]);
    // No day status here (this is a raw session list), but the day card needs to
    // label a company holiday — same shape as /admin/day.
    const holidayName = holidays.get(dateStr) || null;
    res.json({
      date: dateStr, sessions,
      holiday: holidayName ? { date: dateStr, name: holidayName } : null,
    });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

/* ============== ADMIN ATTENDANCE EDITING ==============
 * Lets an admin fix attendance when an employee forgot to punch in/out:
 * create a session manually, edit its times, or delete a wrong one.
 * Times come in as ISO strings (the client builds them from an IST date+time). */

const roundHours = (ms) => Math.round((ms / 3600000) * 100) / 100;

// POST /api/attendance/admin/session — create a manual session for a user
router.post('/admin/session', requireRole(ADMIN), async (req, res) => {
  try {
    const { userId, punchInTime, punchOutTime, siteName, punchInAddress, punchOutAddress } = req.body || {};
    if (!userId) return res.status(400).json({ message: 'userId is required' });

    const pin = new Date(punchInTime);
    if (isNaN(pin)) return res.status(400).json({ message: 'A valid punch-in time is required' });

    let pout = null, workingHours = null;
    if (punchOutTime) {
      pout = new Date(punchOutTime);
      if (isNaN(pout)) return res.status(400).json({ message: 'Invalid punch-out time' });
      if (pout <= pin) return res.status(400).json({ message: 'Punch-out must be after punch-in' });
      workingHours = roundHours(pout - pin);
    }

    const user = await prisma.user.findUnique({ where: { id: Number(userId) } });
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (!(await assertUnlocked(res, ymdIST(pin), pout ? ymdIST(pout) : ymdIST(pin)))) return;

    const shift = await shiftForUser(user.id);
    const session = await prisma.attendanceSession.create({
      data: {
        userId: Number(userId),
        punchInTime: pin,
        punchOutTime: pout,
        workingHours,
        isLate: isLateLevel(lateLevelOf(pin, shift)),
        siteName: cleanSiteName(siteName),
        punchInAddress: cleanAddress(punchInAddress),
        punchOutAddress: cleanAddress(punchOutAddress),
      },
    });
    res.status(201).json(session);
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// PATCH /api/attendance/admin/session/:id — edit an existing session's times/site
router.patch('/admin/session/:id', requireRole(ADMIN), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = await prisma.attendanceSession.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ message: 'Session not found' });

    const { punchInTime, punchOutTime, siteName, punchInAddress, punchOutAddress } = req.body || {};
    const data = {};
    // Both the day the session is on now and any day it is being moved to must
    // be open.
    if (!(await assertUnlocked(res, ymdIST(existing.punchInTime)))) return;

    if (punchInTime !== undefined) {
      const pin = new Date(punchInTime);
      if (isNaN(pin)) return res.status(400).json({ message: 'Invalid punch-in time' });
      if (!(await assertUnlocked(res, ymdIST(pin)))) return;
      data.punchInTime = pin;
      data.isLate = isLateLevel(lateLevelOf(pin, await shiftForUser(existing.userId)));
    }
    if (siteName !== undefined) data.siteName = cleanSiteName(siteName);
    if (punchInAddress !== undefined) data.punchInAddress = cleanAddress(punchInAddress);
    if (punchOutAddress !== undefined) data.punchOutAddress = cleanAddress(punchOutAddress);

    const finalIn = data.punchInTime || existing.punchInTime;

    if (punchOutTime !== undefined) {
      if (punchOutTime === null || punchOutTime === '') {
        // Re-open the session (clear the punch-out).
        data.punchOutTime = null;
        data.workingHours = null;
      } else {
        const pout = new Date(punchOutTime);
        if (isNaN(pout)) return res.status(400).json({ message: 'Invalid punch-out time' });
        if (pout <= finalIn) return res.status(400).json({ message: 'Punch-out must be after punch-in' });
        data.punchOutTime = pout;
        data.workingHours = roundHours(pout - finalIn);
      }
    } else if (data.punchInTime && existing.punchOutTime) {
      // Punch-in moved but punch-out unchanged — recompute hours (and re-validate order).
      if (existing.punchOutTime <= finalIn)
        return res.status(400).json({ message: 'Punch-out must be after punch-in' });
      data.workingHours = roundHours(existing.punchOutTime - finalIn);
    }

    const updated = await prisma.attendanceSession.update({ where: { id }, data });
    res.json(updated);
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ message: 'Session not found' });
    console.error(e); res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/attendance/admin/session/:id — remove a wrong session
router.delete('/admin/session/:id', requireRole(ADMIN), async (req, res) => {
  try {
    const existing = await prisma.attendanceSession.findUnique({ where: { id: Number(req.params.id) } });
    if (!existing) return res.status(404).json({ message: 'Session not found' });
    if (!(await assertUnlocked(res, ymdIST(existing.punchInTime)))) return;
    await prisma.attendanceSession.delete({ where: { id: existing.id } });
    res.json({ ok: true });
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ message: 'Session not found' });
    console.error(e); res.status(500).json({ message: 'Server error' });
  }
});

/* ==================== ATTENDANCE CORRECTION REQUESTS ====================
 * Employee raises a correction for a missed punch (in/out); admin reviews.
 * On approval the correction is applied to the day's sessions automatically. */

const isoOrNull = (v) => {
  if (v === undefined || v === null || v === '') return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t) : undefined; // undefined = invalid
};

// POST /api/attendance/corrections — employee raises a request
router.post('/corrections', async (req, res) => {
  try {
    const { date, requestedIn, requestedOut, reason } = req.body || {};
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || ''))
      return res.status(400).json({ message: 'date (YYYY-MM-DD) is required' });
    if (date > ymdIST(new Date()))
      return res.status(400).json({ message: 'Cannot request a correction for a future date' });
    const reasonTrim = String(reason || '').trim();
    if (!reasonTrim)
      return res.status(400).json({ message: 'A reason is required' });

    const inT = isoOrNull(requestedIn);
    const outT = isoOrNull(requestedOut);
    if (inT === undefined || outT === undefined)
      return res.status(400).json({ message: 'Invalid punch time format' });
    if (!inT && !outT)
      return res.status(400).json({ message: 'Provide the correct punch-in and/or punch-out time' });
    if (inT && outT && outT <= inT)
      return res.status(400).json({ message: 'Punch-out must be after punch-in' });
    if (!(await assertUnlocked(res, date))) return;

    const dup = await prisma.attendanceCorrection.findFirst({
      where: { userId: req.user.sub, date: dateOnlyUTC(date), status: 'pending' },
    });
    if (dup) return res.status(409).json({ message: 'You already have a pending correction for this date' });

    const created = await prisma.attendanceCorrection.create({
      data: {
        userId: req.user.sub,
        date: dateOnlyUTC(date),
        requestedIn: inT,
        requestedOut: outT,
        reason: reasonTrim.slice(0, 500),
      },
    });
    requestCreated('correction', created);
    res.status(201).json(created);
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// GET /api/attendance/corrections/my — own requests (newest first)
router.get('/corrections/my', async (req, res) => {
  try {
    const requests = await prisma.attendanceCorrection.findMany({
      where: { userId: req.user.sub },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { reviewedBy: { select: { fullName: true, username: true } } },
    });
    res.json({ requests: await withManagerStage('correction', requests) });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// DELETE /api/attendance/corrections/:id — cancel own pending request
router.delete('/corrections/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const row = await prisma.attendanceCorrection.findUnique({ where: { id } });
    if (!row || row.userId !== req.user.sub)
      return res.status(404).json({ message: 'Request not found' });
    if (row.status !== 'pending')
      return res.status(400).json({ message: 'Only pending requests can be cancelled' });
    await prisma.attendanceCorrection.update({ where: { id }, data: { status: 'cancelled' } });
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// GET /api/attendance/admin/corrections?status= — review queue (admin)
router.get('/admin/corrections', requireRole(ADMIN), async (req, res) => {
  try {
    const where = {};
    if (['pending', 'approved', 'rejected', 'cancelled'].includes(req.query.status))
      where.status = req.query.status;
    // Optional from/to window on the day being corrected. Either bound may stand
    // alone; anything unparseable is ignored rather than 400ing, so a stray query
    // string can never break the review queue.
    let from = ymdOrNull(req.query.from);
    let to = ymdOrNull(req.query.to);
    if (from && to && from > to) { from = null; to = null; }
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = dateOnlyUTC(from);
      if (to) where.date.lte = dateOnlyUTC(to);
    }
    const requests = await prisma.attendanceCorrection.findMany({
      where,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 200,
      include: {
        user: { select: { id: true, username: true, fullName: true } },
        reviewedBy: { select: { fullName: true, username: true } },
      },
    });
    res.json({ requests: await withManagerStage('correction', requests) });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// PATCH /api/attendance/admin/corrections/:id — { status:'approved'|'rejected', reviewNote }
// Approval APPLIES the correction: creates the day's session if none exists,
// otherwise fixes the first session's punch-in / last session's punch-out.
router.patch('/admin/corrections/:id', requireRole(ADMIN), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { status, reviewNote } = req.body || {};
    if (!['approved', 'rejected'].includes(status))
      return res.status(400).json({ message: "status must be 'approved' or 'rejected'" });

    const row = await prisma.attendanceCorrection.findUnique({ where: { id } });
    if (!row) return res.status(404).json({ message: 'Request not found' });
    if (row.status !== 'pending')
      return res.status(400).json({ message: `Request is already ${row.status}` });

    // Rejecting changes nothing on the books, so only approval needs the month open.
    if (status === 'approved') {
      const ymd = new Date(row.date).toISOString().slice(0, 10);
      if (!(await assertUnlocked(res, ymd))) return;
      const shift = await shiftForUser(row.userId);
      const { start, end } = dayWindowIST(ymd);
      const sessions = await prisma.attendanceSession.findMany({
        where: { userId: row.userId, punchInTime: { gte: start, lt: end } },
        orderBy: { punchInTime: 'asc' },
      });

      if (sessions.length === 0) {
        if (!row.requestedIn)
          return res.status(400).json({ message: 'No punch session exists that day — approve needs a punch-in time. Ask the employee to re-raise with punch-in.' });
        const hours = row.requestedOut ? (row.requestedOut - row.requestedIn) / 3600000 : null;
        await prisma.attendanceSession.create({
          data: {
            userId: row.userId,
            punchInTime: row.requestedIn,
            punchOutTime: row.requestedOut,
            workingHours: hours != null ? Math.round(hours * 100) / 100 : null,
            isLate: isLateLevel(lateLevelOf(row.requestedIn, shift)),
            siteName: 'SESS',
            punchInAddress: 'Added via attendance correction',
          },
        });
      } else {
        // Punch-in fix -> first session; punch-out fix -> last session.
        const first = sessions[0];
        const last = sessions[sessions.length - 1];
        if (row.requestedIn) {
          const out = first.punchOutTime || (first.id === last.id ? row.requestedOut : null);
          if (out && out <= row.requestedIn)
            return res.status(400).json({ message: 'Requested punch-in is after the existing punch-out' });
          await prisma.attendanceSession.update({
            where: { id: first.id },
            data: {
              punchInTime: row.requestedIn,
              isLate: isLateLevel(lateLevelOf(row.requestedIn, shift)),
              workingHours: out ? Math.round(((out - row.requestedIn) / 3600000) * 100) / 100 : first.workingHours,
            },
          });
        }
        if (row.requestedOut) {
          const inT = (first.id === last.id && row.requestedIn) ? row.requestedIn : last.punchInTime;
          if (row.requestedOut <= inT)
            return res.status(400).json({ message: 'Requested punch-out is before that session\'s punch-in' });
          await prisma.attendanceSession.update({
            where: { id: last.id },
            data: {
              punchOutTime: row.requestedOut,
              workingHours: Math.round(((row.requestedOut - inT) / 3600000) * 100) / 100,
            },
          });
        }
      }
    }

    const updated = await prisma.attendanceCorrection.update({
      where: { id },
      data: {
        status,
        reviewedById: req.user.sub,
        reviewedAt: new Date(),
        reviewNote: String(reviewNote || '').trim().slice(0, 500) || null,
      },
      include: { user: { select: { id: true, username: true, fullName: true } } },
    });
    finalDecided('correction', updated, updated.status);
    res.json(updated);
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

module.exports = router;
