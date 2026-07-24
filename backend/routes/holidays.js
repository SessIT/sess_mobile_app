const express = require('express');
const prisma = require('../lib/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');
const router = express.Router();
const ADMIN = 'Technical Director / Admin';

router.use(requireAuth);

const YMD = /^\d{4}-\d{2}-\d{2}$/;
// Holidays are calendar dates (stored as @db.Date at UTC midnight). We derive
// "today" in IST so the upcoming list flips over at IST midnight, like the rest
// of the app, but store/query the date part in plain UTC-midnight space.
const ymdIST = (d) => new Date(new Date(d).getTime() + 5.5 * 3600000).toISOString().slice(0, 10);
const dateOnly = (ymd) => new Date(ymd + 'T00:00:00.000Z');

// GET /api/holidays?year=YYYY — full list for a year (any authenticated user)
router.get('/', async (req, res) => {
  try {
    const year = /^\d{4}$/.test(req.query.year || '') ? Number(req.query.year) : new Date().getUTCFullYear();
    const holidays = await prisma.holiday.findMany({
      where: { date: { gte: dateOnly(`${year}-01-01`), lt: dateOnly(`${year + 1}-01-01`) } },
      orderBy: { date: 'asc' },
    });
    res.json({ year, holidays });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// GET /api/holidays/upcoming?limit=N — today onward, ascending (mobile widget)
router.get('/upcoming', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 5, 50);
    const holidays = await prisma.holiday.findMany({
      where: { date: { gte: dateOnly(ymdIST(new Date())) } },
      orderBy: { date: 'asc' },
      take: limit,
    });
    res.json({ holidays });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// POST /api/holidays — manual add { date: 'YYYY-MM-DD', name } (admin)
router.post('/', requireRole(ADMIN), async (req, res) => {
  try {
    const { date, name } = req.body || {};
    if (!YMD.test(date || '') || !name || !String(name).trim())
      return res.status(400).json({ message: 'date (YYYY-MM-DD) and name are required' });
    // upsert so re-adding an existing date just updates its name instead of 500ing.
    const holiday = await prisma.holiday.upsert({
      where: { date: dateOnly(date) },
      update: { name: String(name).trim() },
      create: { date: dateOnly(date), name: String(name).trim() },
    });
    res.status(201).json(holiday);
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// POST /api/holidays/import — bulk { holidays: [{ date, name }, ...] } (admin)
// The Excel file is parsed in the browser; here we just validate + upsert rows.
router.post('/import', requireRole(ADMIN), async (req, res) => {
  try {
    const rows = Array.isArray(req.body?.holidays) ? req.body.holidays : [];
    const errors = [];
    // Dedupe by date (last name wins) so one file can't fight itself on upsert.
    const byDate = new Map();
    rows.forEach((r, i) => {
      const date = String(r?.date || '').trim();
      const name = String(r?.name || '').trim();
      if (!YMD.test(date) || !name) { errors.push({ row: i + 1, date, name }); return; }
      byDate.set(date, name);
    });
    let imported = 0;
    for (const [date, name] of byDate) {
      await prisma.holiday.upsert({
        where: { date: dateOnly(date) },
        update: { name },
        create: { date: dateOnly(date), name },
      });
      imported++;
    }
    res.json({ imported, skipped: errors.length, errors: errors.slice(0, 20) });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// DELETE /api/holidays/:id (admin)
router.delete('/:id', requireRole(ADMIN), async (req, res) => {
  try {
    await prisma.holiday.delete({ where: { id: Number(req.params.id) } });
    res.json({ ok: true });
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ message: 'Holiday not found' });
    console.error(e); res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
