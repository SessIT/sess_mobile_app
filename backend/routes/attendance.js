const express = require('express');
const path = require('path');
const fs = require('fs');
const prisma = require('../lib/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');
const router = express.Router();
const ADMIN = 'Technical Director / Admin';

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
  const lateCutoff = new Date(Date.UTC(y, m, d, 3, 45));
  return { start, end, lateCutoff };
}

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
      if (s.isLate) u.late = true;
      const site = (s.siteName || 'SESS').trim();
      if (!u.sites.includes(site)) u.sites.push(site);
    }
    const present = Object.values(byUser).map(u => ({ ...u, hours: Math.round(u.hours * 100) / 100 }));
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
      const map = {};
      for (const u of users) map[u.id] = { userId: u.id, username: u.username, fullName: u.fullName, days: new Set(), late: 0, hours: 0 };
      for (const s of sessions) {
        const r = map[s.userId]; if (!r) continue;
        r.days.add(ymdIST(s.punchInTime));
        if (s.isLate) r.late++;
        r.hours += s.workingHours || 0;
      }
      const summary = Object.values(map).map(r => ({
        userId: r.userId, username: r.username, fullName: r.fullName,
        present: r.days.size,
        absent: Math.max(workingDaysSoFar - r.days.size, 0),
        late: r.late,
        hours: Math.round(r.hours * 100) / 100,
      })).sort((a, b) => (a.fullName || a.username).localeCompare(b.fullName || b.username));
      return res.json({ month, workingDaysSoFar, summary });
    }

    const byDay = {};
    for (const s of sessions) {
      const ymd = ymdIST(s.punchInTime);
      const d = byDay[ymd] || (byDay[ymd] = { sessions: 0, firstIn: s.punchInTime, lastOut: null, hours: 0, late: false, sites: [] });
      d.sessions++;
      if (s.punchOutTime) { d.lastOut = s.punchOutTime; d.hours += s.workingHours || 0; }
      if (s.isLate) d.late = true;
      const site = (s.siteName || 'SESS').trim();
      if (!d.sites.includes(site)) d.sites.push(site);
    }
    const days = dayMeta.map(dm => {
      const rec = byDay[dm.ymd];
      const status = dm.isFuture ? (dm.isWeekoff ? 'weekoff' : 'future')
        : rec ? 'present' : dm.isWeekoff ? 'weekoff' : 'absent';
      return {
        date: dm.ymd, weekday: dm.weekday, status,
        sessions: rec?.sessions || 0,
        firstIn: rec?.firstIn || null, lastOut: rec?.lastOut || null,
        hours: rec ? Math.round(rec.hours * 100) / 100 : 0,
        late: rec?.late || false, sites: rec?.sites || [],
      };
    });
    const stats = {
      present: days.filter(d => d.status === 'present').length,
      absent: days.filter(d => d.status === 'absent').length,
      late: days.filter(d => d.late).length,
      hours: Math.round(days.reduce((s, d) => s + d.hours, 0) * 100) / 100,
    };
    res.json({ month, workingDaysSoFar, stats, days });
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
      const d = byDay[ymd] || (byDay[ymd] = { sessions: 0, firstIn: s.punchInTime, lastOut: null, hours: 0, late: false, sites: [] });
      d.sessions++;
      if (s.punchOutTime) { d.lastOut = s.punchOutTime; d.hours += s.workingHours || 0; }
      if (s.isLate) d.late = true;
      const site = (s.siteName || 'SESS').trim();
      if (!d.sites.includes(site)) d.sites.push(site);
    }

    const days = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const ymd = `${month}-${String(d).padStart(2, '0')}`;
      const wd = new Date(ymd + 'T00:00:00+05:30').getDay();
      const isWeekoff = wd === 0; // Sunday is the weekly off
      const isFuture = ymd > todayStr;
      const rec = byDay[ymd];
      const status = isFuture ? 'future' : rec ? 'present' : isWeekoff ? 'weekoff' : 'absent';
      days.push({
        date: ymd, weekday: wd, status,
        sessions: rec?.sessions || 0,
        firstIn: rec?.firstIn || null, lastOut: rec?.lastOut || null,
        hours: rec ? Math.round(rec.hours * 100) / 100 : 0,
        late: rec?.late || false, sites: rec?.sites || [],
      });
    }
    const stats = {
      present: days.filter(d => d.status === 'present' && !d.late).length, // late days excluded
      late: days.filter(d => d.late).length,
      absent: days.filter(d => d.status === 'absent').length,
      weekoff: days.filter(d => d.status === 'weekoff').length,
      hours: Math.round(days.reduce((s, d) => s + d.hours, 0) * 100) / 100,
    };
    res.json({ month, stats, days });
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

module.exports = router;
