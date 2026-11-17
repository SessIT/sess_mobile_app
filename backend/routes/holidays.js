const express = require('express');
const prisma = require('../lib/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');
const router = express.Router();
const ADMIN = 'Admin';

router.use(requireAuth);

const YMD = /^\d{4}-\d{2}-\d{2}$/;
// Holidays are calendar dates (stored as @db.Date at UTC midnight). We derive
// "today" in IST so the upcoming list flips over at IST midnight, like the rest
// of the app, but store/query the date part in plain UTC-midnight space.
const ymdIST = (d) => new Date(new Date(d).getTime() + 5.5 * 3600000).toISOString().slice(0, 10);
const dateOnly = (ymd) => new Date(ymd + 'T00:00:00.000Z');
const { can } = require('../lib/permissions');
const { branchOfUser } = require('../lib/holidays');

// Which holidays a request sees: holiday managers may ask for every branch
// (?branch=all) or one (?branch=<id>); everyone else gets company-wide days
// plus their own branch's.
async function branchFilter(req) {
  if (can(req, 'holidays') && req.query.branch === 'all') return {};
  if (can(req, 'holidays') && Number(req.query.branch)) return { OR: [{ branchId: null }, { branchId: Number(req.query.branch) }] };
  const own = await branchOfUser(req.user.sub);
  return { OR: [{ branchId: null }, ...(own ? [{ branchId: own }] : [])] };
}

// Upsert by (date, branch) — Prisma can't upsert on a compound key containing NULL.
async function saveHoliday(date, name, branchId) {
  const existing = await prisma.holiday.findFirst({ where: { date: dateOnly(date), branchId } });
  return existing
    ? prisma.holiday.update({ where: { id: existing.id }, data: { name } })
    : prisma.holiday.create({ data: { date: dateOnly(date), name, branchId } });
}
const branchIdOf = (v) => (Number(v) ? Number(v) : null);

// GET /api/holidays?year=YYYY — full list for a year (any authenticated user)
router.get('/', async (req, res) => {
  try {
    const year = /^\d{4}$/.test(req.query.year || '') ? Number(req.query.year) : new Date().getUTCFullYear();
    const holidays = await prisma.holiday.findMany({
      where: { date: { gte: dateOnly(`${year}-01-01`), lt: dateOnly(`${year + 1}-01-01`) }, ...(await branchFilter(req)) },
      orderBy: { date: 'asc' },
    });
    const branches = await prisma.branch.findMany({ select: { id: true, name: true } });
    const bm = new Map(branches.map((b) => [b.id, b.name]));
    res.json({ year, holidays: holidays.map((h) => ({ ...h, branchName: h.branchId ? bm.get(h.branchId) || null : null })) });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// GET /api/holidays/upcoming?limit=N — today onward, ascending (mobile widget)
router.get('/upcoming', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 5, 50);
    const holidays = await prisma.holiday.findMany({
      where: { date: { gte: dateOnly(ymdIST(new Date())) }, ...(await branchFilter(req)) },
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
    // Re-adding an existing date (for the same branch) just updates its name.
    const holiday = await saveHoliday(date, String(name).trim(), branchIdOf(req.body?.branchId));
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
    const branchId = branchIdOf(req.body?.branchId);
    for (const [date, name] of byDate) {
      await saveHoliday(date, name, branchId);
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
