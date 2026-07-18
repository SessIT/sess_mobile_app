const express = require('express');
const prisma = require('../lib/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');
const router = express.Router();

const ADMIN = 'Technical Director / Admin';
router.use(requireAuth);

function todayWindowIST() {
  const now = new Date();
  const istNow = new Date(now.getTime() + 5.5 * 3600 * 1000);
  const y = istNow.getUTCFullYear(), m = istNow.getUTCMonth(), d = istNow.getUTCDate();
  const start = new Date(Date.UTC(y, m, d, -5, -30));
  const end = new Date(start.getTime() + 24 * 3600 * 1000);
  return { start, end };
}

// POST /api/location/log  { points: [{lat,lng,acc,address,capturedAt}] }
router.post('/log', async (req, res) => {
  try {
    const points = Array.isArray(req.body?.points) ? req.body.points : [];
    if (!points.length) return res.status(400).json({ message: 'No points' });

    // Golden rule guard: open punch session irundha mattum accept
    const { start, end } = todayWindowIST();
    // Late-arriving offline points-um accept — but ONLY if captured inside a punch session window
    const sessions = await prisma.attendanceSession.findMany({
      where: { userId: req.user.sub, punchInTime: { gte: new Date(Date.now() - 7 * 24 * 3600 * 1000) } },
      select: { punchInTime: true, punchOutTime: true },
    });
    if (!sessions.length)
      return res.status(403).json({ message: 'Tracking allowed only between punch-in and punch-out' });

    const inAnySession = (t) => sessions.some(s =>
      t >= s.punchInTime && (s.punchOutTime ? t <= s.punchOutTime : true));

    const data = points
      .filter(p => typeof p.lat === 'number' && typeof p.lng === 'number')
      .filter(p => inAnySession(p.capturedAt ? new Date(p.capturedAt) : new Date()))
      .slice(0, 100)
      .map(p => ({
        userId: req.user.sub,
        lat: p.lat, lng: p.lng,
        acc: p.acc ?? null,
        address: p.address || null,
        capturedAt: p.capturedAt ? new Date(p.capturedAt) : new Date(),
      }));
    await prisma.locationLog.createMany({ data });
    res.status(201).json({ saved: data.length });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// GET /api/location/my?date=YYYY-MM-DD  (own trail)
// GET /api/location/user/:id?date=      (admin - "avan enga irundhaan" question-ku ??)
async function getTrail(userId, dateStr, res) {
  const base = dateStr ? new Date(dateStr + 'T00:00:00+05:30') : null;
  let start, end;
  if (base && !isNaN(base)) { start = base; end = new Date(base.getTime() + 24 * 3600 * 1000); }
  else ({ start, end } = todayWindowIST());
  const logs = await prisma.locationLog.findMany({
    where: { userId, capturedAt: { gte: start, lt: end } },
    orderBy: { capturedAt: 'asc' },
  });
  res.json(logs);
}

router.get('/my', (req, res) => getTrail(req.user.sub, req.query.date, res).catch(e => { console.error(e); res.status(500).json({ message: 'Server error' }); }));
router.get('/user/:id', requireRole(ADMIN), (req, res) => getTrail(Number(req.params.id), req.query.date, res).catch(e => { console.error(e); res.status(500).json({ message: 'Server error' }); }));

module.exports = router;
