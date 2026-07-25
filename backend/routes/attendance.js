const express = require('express');
const path = require('path');
const fs = require('fs');
const prisma = require('../lib/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');
const router = express.Router();
const ADMIN = 'Technical Director / Admin';

// Standard paid working day. Required hours for a period = working days × this.
// Single source of truth so web + mobile show the same target.
const HOURS_PER_DAY = 8;

router.use(requireAuth);

const dir = path.join(__dirname, '..', 'uploads', 'attendance');
fs.mkdirSync(dir, { recursive: true });

function savePhoto(userId, base64) {
  if (!base64) return null;
  const filename = 'u' + userId + '_' + Date.now() + '.jpg';
  fs.writeFileSync(path.join(dir, filename), Buffer.from(base64, 'base64'));
  return 'uploads/attendance/' + filename;
}

function todayWindowIST() {
  const now = new Date();
  const istNow = new Date(now.getTime() + 5.5 * 3600 * 1000);
  const y = istNow.getUTCFullYear(), m = istNow.getUTCMonth(), d = istNow.getUTCDate();
  const start = new Date(Date.UTC(y, m, d, -5, -30));
  const end = new Date(start.getTime() + 24 * 3600 * 1000);
  // On-time cutoff 09:30 IST = 04:00 UTC. After this the first punch is flagged late.
  const lateCutoff = new Date(Date.UTC(y, m, d, 4, 0));
  return { start, end, lateCutoff };
}

/* Arrival policy (IST, based on the FIRST punch-in of the day):
 *   <= 09:30            -> 'ontime' (present, green, no tag)
 *   09:31 .. 09:40      -> 'grace'  (present, green, LATE tag) — 10 min grace
 *   >= 09:41            -> 'late'   (late, amber, LATE tag)
 * lateLevelOf() derives this from a stored punchInTime, so it stays correct
 * for historical rows without a DB migration. */
const ON_TIME_MIN = 9 * 60 + 40;   // 09:30
const GRACE_END_MIN = 9 * 60 + 40; // 09:40
const istMinutesOfDay = (d) => {
  const ist = new Date(new Date(d).getTime() + 5.5 * 3600 * 1000);
  return ist.getUTCHours() * 60 + ist.getUTCMinutes();
};
const lateLevelOf = (firstIn) => {
  if (!firstIn) return null;
  const mins = istMinutesOfDay(firstIn);
  if (mins <= ON_TIME_MIN) return 'ontime';
  if (mins <= GRACE_END_MIN) return 'grace';
  return 'late';
};
const isLateLevel = (lvl) => lvl === 'grace' || lvl === 'late';

const num = (v) => (v !== undefined && v !== null && v !== '' ? parseFloat(v) : null);

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

router.post('/punch-in', async (req, res) => {
  try {
    const { start, end, lateCutoff } = todayWindowIST();
    // Multi-punch: open session irundha mattum block (out pannama in panna mudiyadhu)
    const openSession = await prisma.attendanceSession.findFirst({
      where: { userId: req.user.sub, punchInTime: { gte: start, lt: end }, punchOutTime: null },
    });
    if (openSession) return res.status(409).json({ message: 'Punch out first, then punch in again' });
    const sessionCount = await prisma.attendanceSession.count({
      where: { userId: req.user.sub, punchInTime: { gte: start, lt: end } },
    });

    const now = new Date();
    const { lat, lng, acc, photoBase64, address, siteName } = req.body || {};
    if (num(req.body?.lat) == null || num(req.body?.lng) == null)
      return res.status(400).json({ message: 'Location is required for punch In' });
    const session = await prisma.attendanceSession.create({
      data: {
        userId: req.user.sub,
        punchInTime: now,
        punchInLat: num(lat), punchInLng: num(lng), punchInAcc: num(acc),
        punchInPhoto: savePhoto(req.user.sub, photoBase64),
        punchInAddress: address || null,
        isLate: sessionCount === 0 && now > lateCutoff,
        siteName: (siteName || 'SESS').trim().slice(0, 60),
      },
    });
    res.status(201).json(session);
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

router.post('/punch-out', async (req, res) => {
  try {
    const { start, end } = todayWindowIST();
    const session = await prisma.attendanceSession.findFirst({
      where: { userId: req.user.sub, punchInTime: { gte: start, lt: end }, punchOutTime: null },
      orderBy: { punchInTime: 'desc' },
    });
    if (!session) return res.status(400).json({ message: 'No open session. Punch in first.' });

    const now = new Date();
    const { lat, lng, acc, photoBase64, address } = req.body || {};
    if (num(req.body?.lat) == null || num(req.body?.lng) == null)
      return res.status(400).json({ message: 'Location is required for punch out' });
    const hours = (now - session.punchInTime) / 3600000;
    const updated = await prisma.attendanceSession.update({
      where: { id: session.id },
      data: {
        punchOutTime: now,
        punchOutLat: num(lat), punchOutLng: num(lng), punchOutAcc: num(acc),
        punchOutPhoto: savePhoto(req.user.sub, photoBase64),
        punchOutAddress: address || null,
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

// Approved-leave day sets for a month: Map(userId -> Set('YYYY-MM-DD')) of the
// non-Sunday days each user is on approved leave (clipped to the month).
// Used to render leave days on the calendar and to adjust required hours.
async function approvedLeaveSets(month, userIds) {
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
    for (let t = Date.parse(from + 'T00:00:00Z'); t <= Date.parse(to + 'T00:00:00Z'); t += 86400000) {
      const dt = new Date(t);
      if (dt.getUTCDay() === 0) continue; // Sunday is a weekly off, not leave
      set.add(dt.toISOString().slice(0, 10));
    }
  }
  return sets;
}

// GET /api/attendance/admin/day?date=YYYY-MM-DD — that day, ALL employees
router.get('/admin/day', requireRole(ADMIN), async (req, res) => {
  try {
    const dateStr = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : ymdIST(new Date());
    const { start, end } = dayWindowIST(dateStr);
    const [sessions, allUsers] = await Promise.all([
      prisma.attendanceSession.findMany({
        where: { punchInTime: { gte: start, lt: end } },
        orderBy: { punchInTime: 'asc' },
        include: { user: { select: { id: true, username: true, fullName: true } } },
      }),
      prisma.user.findMany({ where: { isActive: true }, select: { id: true, username: true, fullName: true } }),
    ]);
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
      const lateLevel = lateLevelOf(u.firstIn);
      return { ...u, hours: Math.round(u.hours * 100) / 100, lateLevel, late: isLateLevel(lateLevel) };
    });
    const ids = new Set(present.map(p => p.userId));
    const absent = allUsers.filter(u => !ids.has(u.id));
    res.json({ date: dateStr, present, absent, totalUsers: allUsers.length });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// GET /api/attendance/admin/month?month=YYYY-MM[&userId=N]
router.get('/admin/month', requireRole(ADMIN), async (req, res) => {
  try {
    const month = req.query.month;
    if (!/^\d{4}-\d{2}$/.test(month || ''))
      return res.status(400).json({ message: 'month=YYYY-MM required' });
    const [y, m] = month.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const start = new Date(`${month}-01T00:00:00+05:30`);
    const end = new Date(start.getTime() + daysInMonth * 24 * 3600 * 1000);
    const userId = req.query.userId ? Number(req.query.userId) : null;
    const todayStr = ymdIST(new Date());

    const where = { punchInTime: { gte: start, lt: end } };
    if (userId) where.userId = userId;
    const sessions = await prisma.attendanceSession.findMany({ where, orderBy: { punchInTime: 'asc' } });

    let workingDaysSoFar = 0;
    const dayMeta = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const ymd = `${month}-${String(d).padStart(2, '0')}`;
      const wd = new Date(ymd + 'T00:00:00+05:30').getDay();
      const isWeekoff = wd === 0; // Sunday
      const isFuture = ymd > todayStr;
      if (!isWeekoff && !isFuture) workingDaysSoFar++;
      dayMeta.push({ ymd, weekday: wd, isWeekoff, isFuture });
    }

    if (!userId) {
      const users = await prisma.user.findMany({ where: { isActive: true }, select: { id: true, username: true, fullName: true } });
      const leaveSets = await approvedLeaveSets(month, users.map(u => u.id));
      const map = {};
      for (const u of users) map[u.id] = { userId: u.id, username: u.username, fullName: u.fullName, days: new Set(), late: 0, hours: 0 };
      for (const s of sessions) {
        const r = map[s.userId]; if (!r) continue;
        const ymd = ymdIST(s.punchInTime);
        // Sessions are asc, so the first one seen for a day is the day's first punch.
        if (!r.days.has(ymd)) {
          r.days.add(ymd);
          if (isLateLevel(lateLevelOf(s.punchInTime))) r.late++;
        }
        r.hours += s.workingHours || 0;
      }
      const summary = Object.values(map).map(r => {
        // Approved-leave days that fell on a working day up to today and weren't
        // actually worked (a punch on a leave day counts as present, not leave).
        let leave = 0;
        for (const ymd of (leaveSets.get(r.userId) || [])) {
          if (ymd <= todayStr && !r.days.has(ymd)) leave++;
        }
        // Present = on-time days; late is its own bucket; leave is paid time off.
        // present + late + leave + absent === workingDaysSoFar.
        const required = Math.max(workingDaysSoFar - leave, 0) * HOURS_PER_DAY;
        return {
          userId: r.userId, username: r.username, fullName: r.fullName,
          present: Math.max(r.days.size - r.late, 0),
          leave,
          absent: Math.max(workingDaysSoFar - r.days.size - leave, 0),
          late: r.late,
          hours: Math.round(r.hours * 100) / 100,
          requiredHours: required, // hours expected to be physically worked (leave excluded)
        };
      }).sort((a, b) => (a.fullName || a.username).localeCompare(b.fullName || b.username));
      return res.json({
        month, workingDaysSoFar, hoursPerDay: HOURS_PER_DAY,
        requiredHours: workingDaysSoFar * HOURS_PER_DAY, // gross target (before leave)
        summary,
      });
    }

    const byDay = {};
    for (const s of sessions) {
      const ymd = ymdIST(s.punchInTime);
      const d = byDay[ymd] || (byDay[ymd] = { sessions: 0, firstIn: s.punchInTime, lastOut: null, hours: 0, sites: [] });
      d.sessions++;
      if (s.punchOutTime) { d.lastOut = s.punchOutTime; d.hours += s.workingHours || 0; }
      const site = (s.siteName || 'SESS').trim();
      if (!d.sites.includes(site)) d.sites.push(site);
    }
    const leaveSet = (await approvedLeaveSets(month, [userId])).get(userId) || new Set();
    const days = dayMeta.map(dm => {
      const rec = byDay[dm.ymd];
      const isLeave = leaveSet.has(dm.ymd);
      // Precedence: a real punch wins; Sundays are week-off; otherwise approved
      // leave (incl. upcoming) shows as paid leave before falling back to future/absent.
      const status = rec ? 'present'
        : dm.isWeekoff ? 'weekoff'
        : isLeave ? 'leave'
        : dm.isFuture ? 'future'
        : 'absent';
      const lateLevel = rec ? lateLevelOf(rec.firstIn) : null;
      return {
        date: dm.ymd, weekday: dm.weekday, status,
        sessions: rec?.sessions || 0,
        firstIn: rec?.firstIn || null, lastOut: rec?.lastOut || null,
        hours: rec ? Math.round(rec.hours * 100) / 100 : 0,
        late: isLateLevel(lateLevel), lateLevel, sites: rec?.sites || [],
      };
    });
    const leaveSoFar = days.filter(d => d.status === 'leave' && d.date <= todayStr).length;
    const stats = {
      // present + late + leave + absent === workingDaysSoFar.
      present: days.filter(d => d.status === 'present' && !d.late).length,
      leave: leaveSoFar,
      absent: days.filter(d => d.status === 'absent').length,
      late: days.filter(d => d.late).length,
      hours: Math.round(days.reduce((s, d) => s + d.hours, 0) * 100) / 100,
    };
    res.json({
      month, workingDaysSoFar, hoursPerDay: HOURS_PER_DAY,
      // Required = hours the employee was expected to physically work (leave excluded).
      requiredHours: Math.max(workingDaysSoFar - leaveSoFar, 0) * HOURS_PER_DAY,
      grossRequiredHours: workingDaysSoFar * HOURS_PER_DAY,
      stats, days,
    });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// GET /api/attendance/admin/day-sessions?date=YYYY-MM-DD[&userId=N]
// Full session records (photos, addresses, sites) for the selected date
router.get('/admin/day-sessions', requireRole(ADMIN), async (req, res) => {
  try {
    const dateStr = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : ymdIST(new Date());
    const { start, end } = dayWindowIST(dateStr);
    const where = { punchInTime: { gte: start, lt: end } };
    if (req.query.userId) where.userId = Number(req.query.userId);
    const sessions = await prisma.attendanceSession.findMany({
      where,
      orderBy: { punchInTime: 'asc' },
      include: { user: { select: { id: true, username: true, fullName: true } } },
    });
    res.json({ date: dateStr, sessions });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

/* ==================== SELF SERVICE (EMPLOYEE) ==================== */

// GET /api/attendance/my-month?month=YYYY-MM — monthly breakdown for the logged-in user
router.get('/my-month', async (req, res) => {
  try {
    const month = req.query.month;
    if (!/^\d{4}-\d{2}$/.test(month || ''))
      return res.status(400).json({ message: 'month=YYYY-MM required' });
    const [y, m] = month.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const start = new Date(`${month}-01T00:00:00+05:30`);
    const end = new Date(start.getTime() + daysInMonth * 24 * 3600 * 1000);
    const todayStr = ymdIST(new Date());

    const sessions = await prisma.attendanceSession.findMany({
      where: { userId: req.user.sub, punchInTime: { gte: start, lt: end } },
      orderBy: { punchInTime: 'asc' },
    });

    const byDay = {};
    for (const s of sessions) {
      const ymd = ymdIST(s.punchInTime);
      const d = byDay[ymd] || (byDay[ymd] = { sessions: 0, firstIn: s.punchInTime, lastOut: null, hours: 0, sites: [] });
      d.sessions++;
      if (s.punchOutTime) { d.lastOut = s.punchOutTime; d.hours += s.workingHours || 0; }
      const site = (s.siteName || 'SESS').trim();
      if (!d.sites.includes(site)) d.sites.push(site);
    }

    let workingDaysSoFar = 0;
    const leaveSet = (await approvedLeaveSets(month, [req.user.sub])).get(req.user.sub) || new Set();
    const days = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const ymd = `${month}-${String(d).padStart(2, '0')}`;
      const wd = new Date(ymd + 'T00:00:00+05:30').getDay();
      const isWeekoff = wd === 0; // Sunday is the weekly off
      const isFuture = ymd > todayStr;
      if (!isWeekoff && !isFuture) workingDaysSoFar++;
      const rec = byDay[ymd];
      const isLeave = leaveSet.has(ymd);
      const status = rec ? 'present'
        : isWeekoff ? 'weekoff'
        : isLeave ? 'leave'
        : isFuture ? 'future'
        : 'absent';
      const lateLevel = rec ? lateLevelOf(rec.firstIn) : null;
      days.push({
        date: ymd, weekday: wd, status,
        sessions: rec?.sessions || 0,
        firstIn: rec?.firstIn || null, lastOut: rec?.lastOut || null,
        hours: rec ? Math.round(rec.hours * 100) / 100 : 0,
        late: isLateLevel(lateLevel), lateLevel, sites: rec?.sites || [],
      });
    }
    const leaveSoFar = days.filter(d => d.status === 'leave' && d.date <= todayStr).length;
    const stats = {
      present: days.filter(d => d.status === 'present' && !d.late).length, // late days excluded
      late: days.filter(d => d.late).length,
      leave: leaveSoFar,
      absent: days.filter(d => d.status === 'absent').length,
      weekoff: days.filter(d => d.status === 'weekoff').length,
      hours: Math.round(days.reduce((s, d) => s + d.hours, 0) * 100) / 100,
    };
    res.json({
      month, workingDaysSoFar, hoursPerDay: HOURS_PER_DAY,
      requiredHours: Math.max(workingDaysSoFar - leaveSoFar, 0) * HOURS_PER_DAY,
      grossRequiredHours: workingDaysSoFar * HOURS_PER_DAY,
      stats, days,
    });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// GET /api/attendance/my-day?date=YYYY-MM-DD — own full session records for a date
router.get('/my-day', async (req, res) => {
  try {
    const dateStr = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : ymdIST(new Date());
    const { start, end } = dayWindowIST(dateStr);
    const sessions = await prisma.attendanceSession.findMany({
      where: { userId: req.user.sub, punchInTime: { gte: start, lt: end } },
      orderBy: { punchInTime: 'asc' },
    });
    res.json({ date: dateStr, sessions });
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

    const session = await prisma.attendanceSession.create({
      data: {
        userId: Number(userId),
        punchInTime: pin,
        punchOutTime: pout,
        workingHours,
        isLate: isLateLevel(lateLevelOf(pin)),
        siteName: (siteName || 'SESS').trim().slice(0, 60),
        punchInAddress: punchInAddress || null,
        punchOutAddress: punchOutAddress || null,
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

    if (punchInTime !== undefined) {
      const pin = new Date(punchInTime);
      if (isNaN(pin)) return res.status(400).json({ message: 'Invalid punch-in time' });
      data.punchInTime = pin;
      data.isLate = isLateLevel(lateLevelOf(pin));
    }
    if (siteName !== undefined) data.siteName = (siteName || 'SESS').trim().slice(0, 60);
    if (punchInAddress !== undefined) data.punchInAddress = punchInAddress || null;
    if (punchOutAddress !== undefined) data.punchOutAddress = punchOutAddress || null;

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
    await prisma.attendanceSession.delete({ where: { id: Number(req.params.id) } });
    res.json({ ok: true });
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ message: 'Session not found' });
    console.error(e); res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
