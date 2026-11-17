const express = require('express');
const prisma = require('../lib/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');
const router = express.Router();

router.use(requireAuth, requireRole('Admin')); // Admin or the 'compliance' permission

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const CATEGORIES = ['PF', 'ESI', 'TDS', 'PT', 'Labour law', 'Other'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pad = (n) => String(n).padStart(2, '0');

/* The standard statutory calendar for a financial year (April fy → March fy+1).
 * Due dates are the general central rules — PT varies by state / local body,
 * so its entries say so. Verify against current notifications. */
function standardCalendar(fy) {
  const tasks = [];
  for (let i = 0; i < 12; i++) {
    const m = ((3 + i) % 12) + 1; // Apr..Mar
    const y = m >= 4 ? fy : fy + 1;
    const ny = m === 12 ? y + 1 : y;
    const nm = m === 12 ? 1 : m + 1;
    const period = `${MONTHS[m - 1]} ${y}`;
    tasks.push({ title: `PF ECR & payment — ${period}`, category: 'PF', dueDate: `${ny}-${pad(nm)}-15`, period });
    tasks.push({ title: `ESI contribution — ${period}`, category: 'ESI', dueDate: `${ny}-${pad(nm)}-15`, period });
    // TDS for March is due 30 April; other months the 7th of the next month.
    tasks.push({ title: `TDS deposit (salary) — ${period}`, category: 'TDS', dueDate: m === 3 ? `${ny}-04-30` : `${ny}-${pad(nm)}-07`, period });
  }
  [['Q1 (Apr–Jun)', `${fy}-07-31`], ['Q2 (Jul–Sep)', `${fy}-10-31`], ['Q3 (Oct–Dec)', `${fy + 1}-01-31`], ['Q4 (Jan–Mar)', `${fy + 1}-05-31`]]
    .forEach(([q, due]) => tasks.push({ title: `TDS return 24Q — ${q} FY ${fy}-${String(fy + 1).slice(2)}`, category: 'TDS', dueDate: due, period: q }));
  tasks.push({ title: `Form 16 to employees — FY ${fy}-${String(fy + 1).slice(2)}`, category: 'TDS', dueDate: `${fy + 1}-06-15`, period: `FY ${fy}-${fy + 1}` });
  tasks.push({ title: `Professional Tax — Apr–Sep ${fy} (confirm due date with your local body)`, category: 'PT', dueDate: `${fy}-09-30`, period: 'H1' });
  tasks.push({ title: `Professional Tax — Oct ${fy}–Mar ${fy + 1} (confirm due date with your local body)`, category: 'PT', dueDate: `${fy + 1}-03-31`, period: 'H2' });
  return tasks;
}

const fyOf = (v) => {
  if (/^\d{4}$/.test(String(v || ''))) return Number(v);
  const d = new Date(Date.now() + 5.5 * 3600000);
  return d.getUTCMonth() >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
};

// GET /api/compliance?fy=2026 — that FY's tasks by due date, with overdue flag.
router.get('/', async (req, res) => {
  try {
    const fy = fyOf(req.query.fy);
    const tasks = await prisma.complianceTask.findMany({
      where: { dueDate: { gte: `${fy}-04-01`, lte: `${fy + 1}-06-30` } }, orderBy: [{ dueDate: 'asc' }, { title: 'asc' }],
    });
    const today = new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
    res.json({
      fy, categories: CATEGORIES,
      tasks: tasks.map((t) => ({ ...t, overdue: t.status !== 'filed' && t.dueDate < today, dueSoon: t.status !== 'filed' && t.dueDate >= today && t.dueDate <= new Date(Date.now() + 7 * 86400000 + 5.5 * 3600000).toISOString().slice(0, 10) })),
    });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// POST /api/compliance/generate — { fy } add the standard calendar (existing entries untouched).
router.post('/generate', async (req, res) => {
  try {
    const fy = fyOf(req.body?.fy);
    const { count } = await prisma.complianceTask.createMany({ data: standardCalendar(fy), skipDuplicates: true });
    res.json({ ok: true, added: count, fy });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// POST /api/compliance — custom task { title, category, dueDate, note }
router.post('/', async (req, res) => {
  try {
    const title = String(req.body?.title || '').trim().slice(0, 150);
    if (!title) return res.status(400).json({ message: 'Enter what has to be filed' });
    if (!YMD.test(req.body?.dueDate || '')) return res.status(400).json({ message: 'Pick the due date' });
    const t = await prisma.complianceTask.create({
      data: {
        title, dueDate: req.body.dueDate, category: CATEGORIES.includes(req.body?.category) ? req.body.category : 'Other',
        note: String(req.body?.note || '').trim().slice(0, 500) || null,
      },
    });
    res.status(201).json(t);
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ message: 'This task already exists for that date' });
    console.error(e); res.status(500).json({ message: 'Server error' });
  }
});

// PATCH /api/compliance/:id — { status:'filed'|'pending', filedOn, reference, note }
router.patch('/:id', async (req, res) => {
  try {
    const data = {};
    if (['filed', 'pending'].includes(req.body?.status)) {
      data.status = req.body.status;
      data.filedOn = req.body.status === 'filed'
        ? (YMD.test(req.body?.filedOn || '') ? req.body.filedOn : new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10))
        : null;
    }
    if (req.body?.reference !== undefined) data.reference = String(req.body.reference || '').trim().slice(0, 100) || null;
    if (req.body?.note !== undefined) data.note = String(req.body.note || '').trim().slice(0, 500) || null;
    res.json(await prisma.complianceTask.update({ where: { id: Number(req.params.id) }, data }));
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ message: 'Task not found' });
    console.error(e); res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await prisma.complianceTask.delete({ where: { id: Number(req.params.id) } });
    res.json({ ok: true });
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ message: 'Task not found' });
    console.error(e); res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
module.exports.standardCalendar = standardCalendar;
