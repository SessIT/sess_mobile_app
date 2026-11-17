const express = require('express');
const prisma = require('../lib/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');
const { ingestMany, parseLocalTime } = require('../lib/biometric');
const router = express.Router();

// Under the 'attendance' permission (see lib/permissions.js BASE_TO_PERM).
router.use(requireAuth, requireRole('Admin'));

/* ---------------- devices ---------------- */

router.get('/devices', async (req, res) => {
  try {
    const devices = await prisma.biometricDevice.findMany({ orderBy: { name: 'asc' } });
    const { unknownSeen } = require('./iclock');
    const known = new Set(devices.map((d) => d.serialNo));
    res.json({
      devices,
      unknownSeen: [...unknownSeen.entries()].filter(([sn]) => !known.has(sn)).map(([serialNo, v]) => ({ serialNo, ...v })),
    });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

function cleanDevice(b) {
  const serialNo = String(b?.serialNo || '').trim().slice(0, 60);
  const name = String(b?.name || '').trim().slice(0, 80);
  if (!serialNo) return { error: 'Enter the device serial number (SN)' };
  if (!name) return { error: 'Give the device a name, e.g. "Main gate"' };
  return {
    data: {
      serialNo, name,
      branchId: Number(b.branchId) || null,
      siteName: String(b.siteName || '').trim().slice(0, 60) || null,
      ...(b.isActive !== undefined ? { isActive: !!b.isActive } : {}),
    },
  };
}

router.post('/devices', async (req, res) => {
  try {
    const c = cleanDevice(req.body);
    if (c.error) return res.status(400).json({ message: c.error });
    res.status(201).json(await prisma.biometricDevice.create({ data: c.data }));
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ message: 'This serial number is already registered' });
    console.error(e); res.status(500).json({ message: 'Server error' });
  }
});

router.patch('/devices/:id', async (req, res) => {
  try {
    const c = cleanDevice(req.body);
    if (c.error) return res.status(400).json({ message: c.error });
    res.json(await prisma.biometricDevice.update({ where: { id: Number(req.params.id) }, data: c.data }));
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ message: 'Device not found' });
    console.error(e); res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/devices/:id', async (req, res) => {
  try {
    await prisma.biometricDevice.delete({ where: { id: Number(req.params.id) } });
    res.json({ ok: true });
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ message: 'Device not found' });
    console.error(e); res.status(500).json({ message: 'Server error' });
  }
});

/* ---------------- employee ↔ device ID mapping ---------------- */

router.get('/mapping', async (req, res) => {
  try {
    res.json(await prisma.user.findMany({
      where: { isActive: true }, orderBy: { fullName: 'asc' },
      select: { id: true, fullName: true, username: true, employeeId: true, biometricId: true },
    }));
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// PUT /api/biometric/mapping — { userId, biometricId } ('' clears).
router.put('/mapping', async (req, res) => {
  try {
    const userId = Number(req.body?.userId);
    const bio = String(req.body?.biometricId ?? '').trim().slice(0, 30) || null;
    if (!userId) return res.status(400).json({ message: 'userId is required' });
    await prisma.user.update({ where: { id: userId }, data: { biometricId: bio } });
    res.json({ ok: true });
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ message: 'Another employee already has this biometric ID' });
    if (e.code === 'P2025') return res.status(404).json({ message: 'Employee not found' });
    console.error(e); res.status(500).json({ message: 'Server error' });
  }
});

/* ---------------- logs, import, reprocess ---------------- */

router.get('/logs', async (req, res) => {
  try {
    const where = ['processed', 'unmatched', 'duplicate', 'skipped'].includes(req.query.status) ? { status: req.query.status } : {};
    const [logs, counts] = await Promise.all([
      prisma.biometricLog.findMany({ where, orderBy: { id: 'desc' }, take: 300 }),
      prisma.biometricLog.groupBy({ by: ['status'], _count: true }),
    ]);
    const ids = [...new Set(logs.map((l) => l.userId).filter(Boolean))];
    const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true, username: true } }) : [];
    const um = new Map(users.map((u) => [u.id, u.fullName || u.username]));
    res.json({ logs: logs.map((l) => ({ ...l, userName: um.get(l.userId) || null })), counts: Object.fromEntries(counts.map((c) => [c.status, c._count])) });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

/* POST /api/biometric/import — { csv } exported from the device software.
 * One punch per line: employee code/PIN, date-time (or date and time in two
 * columns). Comma, tab or semicolon separated; a header line is skipped. */
router.post('/import', async (req, res) => {
  try {
    const text = String(req.body?.csv || '');
    if (!text.trim()) return res.status(400).json({ message: 'The file is empty' });
    const punches = [];
    let bad = 0;
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      const f = line.split(/[,\t;]/).map((x) => x.trim().replace(/^"|"$/g, ''));
      let time = parseLocalTime(f[1]);
      if (!time && f[2]) time = parseLocalTime(`${f[1]} ${f[2]}`);
      if (!f[0] || !time) { bad++; continue; }
      punches.push({ deviceSn: 'IMPORT', pin: f[0], time, siteName: String(req.body?.siteName || '').slice(0, 60) || null, deviceName: 'Imported' });
    }
    if (punches.length > 20000) return res.status(400).json({ message: 'Import at most 20,000 punches at a time' });
    const counts = await ingestMany(punches);
    res.json({ ...counts, unreadableLines: bad });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// POST /api/biometric/reprocess — retry unmatched punches (after mapping IDs).
router.post('/reprocess', async (req, res) => {
  try {
    const logs = await prisma.biometricLog.findMany({ where: { status: 'unmatched' }, take: 20000 });
    await prisma.biometricLog.deleteMany({ where: { id: { in: logs.map((l) => l.id) } } });
    const devices = await prisma.biometricDevice.findMany();
    const dm = new Map(devices.map((d) => [d.serialNo, d]));
    const counts = await ingestMany(logs.map((l) => ({
      deviceSn: l.deviceSn, pin: l.pin, time: l.punchTime,
      siteName: dm.get(l.deviceSn)?.siteName || null, deviceName: dm.get(l.deviceSn)?.name || null,
    })));
    res.json(counts);
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

module.exports = router;
