const express = require('express');
const path = require('path');
const fs = require('fs');
const prisma = require('../lib/prisma');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

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

module.exports = router;
