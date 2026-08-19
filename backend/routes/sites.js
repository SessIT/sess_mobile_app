const express = require('express');
const prisma = require('../lib/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');
const router = express.Router();
const ADMIN = 'Admin';

router.use(requireAuth);

const validCoords = (lat, lng) =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
const clampRadius = (r) => Math.min(Math.max(parseInt(r) || 100, 20), 5000);

// GET /api/sites — active sites (every authenticated user; the mobile punch
// gate needs them). Admins can pass ?all=1 to also see inactive sites.
router.get('/', async (req, res) => {
  try {
    const isAdmin = (req.user?.roles || []).includes(ADMIN);
    const where = isAdmin && req.query.all === '1' ? {} : { isActive: true };
    const sites = await prisma.site.findMany({ where, orderBy: { name: 'asc' } });
    res.json(sites);
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// POST /api/sites (admin) — { name, address?, lat, lng, radiusM? }
router.post('/', requireRole(ADMIN), async (req, res) => {
  try {
    const { name, address, lat, lng, radiusM } = req.body || {};
    const la = parseFloat(lat), ln = parseFloat(lng);
    if (!name || !String(name).trim())
      return res.status(400).json({ message: 'Site name is required' });
    if (!validCoords(la, ln))
      return res.status(400).json({ message: 'Valid latitude and longitude are required' });
    const site = await prisma.site.create({
      data: {
        name: String(name).trim().slice(0, 80),
        address: (address || '').trim().slice(0, 200) || null,
        lat: la, lng: ln,
        radiusM: clampRadius(radiusM),
      },
    });
    res.status(201).json(site);
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// PATCH /api/sites/:id (admin) — partial edit incl. isActive toggle
router.patch('/:id', requireRole(ADMIN), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ message: 'Invalid site id' });
    const { name, address, lat, lng, radiusM, isActive } = req.body || {};
    const data = {};
    if (name !== undefined) {
      if (!String(name).trim()) return res.status(400).json({ message: 'Site name cannot be empty' });
      data.name = String(name).trim().slice(0, 80);
    }
    if (address !== undefined) data.address = (address || '').trim().slice(0, 200) || null;
    if (lat !== undefined || lng !== undefined) {
      const la = parseFloat(lat), ln = parseFloat(lng);
      if (!validCoords(la, ln))
        return res.status(400).json({ message: 'Valid latitude and longitude are required' });
      data.lat = la; data.lng = ln;
    }
    if (radiusM !== undefined) data.radiusM = clampRadius(radiusM);
    if (isActive !== undefined) data.isActive = !!isActive;

    const site = await prisma.site.update({ where: { id }, data });
    res.json(site);
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ message: 'Site not found' });
    console.error(e); res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/sites/:id (admin)
router.delete('/:id', requireRole(ADMIN), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ message: 'Invalid site id' });
    await prisma.site.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ message: 'Site not found' });
    console.error(e); res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
