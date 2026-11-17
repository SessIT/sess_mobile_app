const express = require('express');
const prisma = require('../lib/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');
const { notify } = require('../lib/notify');
const router = express.Router();
const ADMIN = 'Admin';

router.use(requireAuth);

const CATEGORIES = ['Laptop', 'Desktop', 'Mobile phone', 'SIM card', 'Tablet', 'Tools & equipment', 'Vehicle', 'ID / access card', 'Furniture', 'Other'];
const USER_SEL = { select: { id: true, fullName: true, username: true, employeeId: true } };

async function withHolders(assets) {
  const ids = [...new Set(assets.map((a) => a.assignedToId).filter(Boolean))];
  const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, ...USER_SEL }) : [];
  const um = new Map(users.map((u) => [u.id, u]));
  return assets.map((a) => ({ ...a, holder: a.assignedToId ? um.get(a.assignedToId) || null : null }));
}

// GET /api/assets/my — what I hold.
router.get('/my', async (req, res) => {
  try {
    res.json({ assets: await prisma.asset.findMany({ where: { assignedToId: req.user.sub }, orderBy: { assignedAt: 'desc' } }) });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

router.use(requireRole(ADMIN));

router.get('/categories', (req, res) => res.json(CATEGORIES));

// GET /api/assets?status=&userId= — the register.
router.get('/', async (req, res) => {
  try {
    const where = {};
    if (['available', 'assigned', 'repair', 'retired'].includes(req.query.status)) where.status = req.query.status;
    if (Number(req.query.userId)) where.assignedToId = Number(req.query.userId);
    const assets = await prisma.asset.findMany({ where, orderBy: [{ category: 'asc' }, { tag: 'asc' }] });
    const counts = await prisma.asset.groupBy({ by: ['status'], _count: true });
    res.json({ assets: await withHolders(assets), counts: Object.fromEntries(counts.map((c) => [c.status, c._count])) });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

function clean(b) {
  const tag = String(b?.tag || '').trim().toUpperCase().slice(0, 40);
  const name = String(b?.name || '').trim().slice(0, 100);
  if (!tag) return { error: 'Enter the asset tag / code' };
  if (!name) return { error: 'Enter the asset name' };
  return {
    data: {
      tag, name,
      category: CATEGORIES.includes(b.category) ? b.category : 'Other',
      serialNo: String(b.serialNo || '').trim().slice(0, 80) || null,
      notes: String(b.notes || '').trim().slice(0, 300) || null,
    },
  };
}

router.post('/', async (req, res) => {
  try {
    const c = clean(req.body);
    if (c.error) return res.status(400).json({ message: c.error });
    const a = await prisma.asset.create({ data: { ...c.data, events: { create: { action: 'created', byId: req.user.sub } } } });
    res.status(201).json(a);
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ message: 'An asset with this tag already exists' });
    console.error(e); res.status(500).json({ message: 'Server error' });
  }
});

// PATCH /api/assets/:id — edit details; { status: available|repair|retired } when not assigned.
router.patch('/:id', async (req, res) => {
  try {
    const a = await prisma.asset.findUnique({ where: { id: Number(req.params.id) } });
    if (!a) return res.status(404).json({ message: 'Asset not found' });
    const c = clean({ ...a, ...req.body });
    if (c.error) return res.status(400).json({ message: c.error });
    const data = { ...c.data };
    const st = req.body?.status;
    if (st && st !== a.status) {
      if (!['available', 'repair', 'retired'].includes(st)) return res.status(400).json({ message: 'Use Assign to give an asset to someone' });
      if (a.status === 'assigned') return res.status(409).json({ message: 'Take the asset back (Return) before changing its status' });
      data.status = st;
      data.events = { create: { action: st, byId: req.user.sub, note: String(req.body.note || '').slice(0, 200) || null } };
    }
    res.json(await prisma.asset.update({ where: { id: a.id }, data }));
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ message: 'An asset with this tag already exists' });
    console.error(e); res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const a = await prisma.asset.findUnique({ where: { id: Number(req.params.id) } });
    if (!a) return res.status(404).json({ message: 'Asset not found' });
    if (a.status === 'assigned') return res.status(409).json({ message: 'Take the asset back before deleting it' });
    await prisma.asset.delete({ where: { id: a.id } });
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// POST /api/assets/:id/assign — { userId, note }
router.post('/:id/assign', async (req, res) => {
  try {
    const a = await prisma.asset.findUnique({ where: { id: Number(req.params.id) } });
    if (!a) return res.status(404).json({ message: 'Asset not found' });
    if (a.status !== 'available') return res.status(409).json({ message: `Asset is ${a.status} — only available assets can be assigned` });
    const userId = Number(req.body?.userId);
    const user = userId ? await prisma.user.findUnique({ where: { id: userId } }) : null;
    if (!user || !user.isActive) return res.status(400).json({ message: 'Pick an active employee' });
    const updated = await prisma.asset.update({
      where: { id: a.id },
      data: {
        status: 'assigned', assignedToId: userId, assignedAt: new Date(),
        events: { create: { action: 'assigned', userId, byId: req.user.sub, note: String(req.body.note || '').slice(0, 200) || null } },
      },
    });
    notify(userId, { kind: 'asset', title: `Asset issued to you: ${a.name}`, body: `${a.tag}${a.serialNo ? ` · S/N ${a.serialNo}` : ''}`, data: { screen: 'MyDocuments' } });
    res.json(updated);
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// POST /api/assets/:id/return — { condition, note }
router.post('/:id/return', async (req, res) => {
  try {
    const a = await prisma.asset.findUnique({ where: { id: Number(req.params.id) } });
    if (!a) return res.status(404).json({ message: 'Asset not found' });
    if (a.status !== 'assigned') return res.status(409).json({ message: 'Asset is not assigned' });
    const condition = ['Good', 'Damaged', 'Lost'].includes(req.body?.condition) ? req.body.condition : 'Good';
    // A damaged item goes to repair; a lost one is retired; otherwise back to the pool.
    const next = condition === 'Damaged' ? 'repair' : condition === 'Lost' ? 'retired' : 'available';
    const updated = await prisma.asset.update({
      where: { id: a.id },
      data: {
        status: next, assignedToId: null, assignedAt: null,
        events: { create: { action: 'returned', userId: a.assignedToId, byId: req.user.sub, condition, note: String(req.body.note || '').slice(0, 200) || null } },
      },
    });
    res.json(updated);
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// GET /api/assets/:id/events — history.
router.get('/:id/events', async (req, res) => {
  try {
    const ev = await prisma.assetEvent.findMany({ where: { assetId: Number(req.params.id) }, orderBy: { id: 'desc' } });
    const ids = [...new Set(ev.flatMap((e) => [e.userId, e.byId]).filter(Boolean))];
    const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, ...USER_SEL }) : [];
    const um = new Map(users.map((u) => [u.id, u.fullName || u.username]));
    res.json({ events: ev.map((e) => ({ ...e, userName: um.get(e.userId) || null, byName: um.get(e.byId) || null })) });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

module.exports = router;
