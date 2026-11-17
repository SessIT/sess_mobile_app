const express = require('express');
const prisma = require('../lib/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');
const router = express.Router();
const ADMIN = 'Admin';

router.use(requireAuth);

// GET /api/branches/list — names only, for any signed-in user (pickers, filters).
router.get('/list', async (req, res) => {
  try {
    res.json(await prisma.branch.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, code: true } }));
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

router.use(requireRole(ADMIN));

// GET /api/branches — branches with their active employees.
router.get('/', async (req, res) => {
  try {
    const [branches, users] = await Promise.all([
      prisma.branch.findMany({ orderBy: { name: 'asc' } }),
      prisma.user.findMany({
        where: { isActive: true }, orderBy: { fullName: 'asc' },
        select: { id: true, fullName: true, username: true, employeeId: true, branchId: true },
      }),
    ]);
    res.json({
      branches: branches.map((b) => ({ ...b, users: users.filter((u) => u.branchId === b.id) })),
      unassigned: users.filter((u) => !u.branchId),
    });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

function clean(b) {
  const name = String(b?.name || '').trim().slice(0, 80);
  if (!name) return { error: 'Enter the branch name' };
  return {
    data: {
      name,
      code: String(b.code || '').trim().toUpperCase().slice(0, 12) || null,
      address: String(b.address || '').trim().slice(0, 300) || null,
      state: String(b.state || '').trim().slice(0, 60) || null,
      ...(b.isActive !== undefined ? { isActive: !!b.isActive } : {}),
    },
  };
}

router.post('/', async (req, res) => {
  try {
    const c = clean(req.body);
    if (c.error) return res.status(400).json({ message: c.error });
    res.status(201).json(await prisma.branch.create({ data: c.data }));
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ message: 'A branch with this name or code already exists' });
    console.error(e); res.status(500).json({ message: 'Server error' });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const c = clean(req.body);
    if (c.error) return res.status(400).json({ message: c.error });
    res.json(await prisma.branch.update({ where: { id: Number(req.params.id) }, data: c.data }));
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ message: 'Branch not found' });
    if (e.code === 'P2002') return res.status(409).json({ message: 'A branch with this name or code already exists' });
    console.error(e); res.status(500).json({ message: 'Server error' });
  }
});

// Employees fall back to "no branch"; branch holidays for it are removed.
router.delete('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    await prisma.$transaction([
      prisma.holiday.deleteMany({ where: { branchId: id } }),
      prisma.branch.delete({ where: { id } }),
    ]);
    res.json({ ok: true });
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ message: 'Branch not found' });
    console.error(e); res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/branches/:id/users — { userIds } move these employees into the branch.
router.put('/:id/users', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!(await prisma.branch.findUnique({ where: { id } }))) return res.status(404).json({ message: 'Branch not found' });
    const userIds = [...new Set((Array.isArray(req.body?.userIds) ? req.body.userIds : []).map(Number).filter(Number.isInteger))];
    if (!userIds.length) return res.status(400).json({ message: 'Select at least one employee' });
    const { count } = await prisma.user.updateMany({ where: { id: { in: userIds } }, data: { branchId: id } });
    res.json({ ok: true, moved: count });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

module.exports = router;
