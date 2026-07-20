const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');
const router = express.Router();

const ADMIN = 'Technical Director / Admin';

const STANDARD_ROLES = [
  'Technical Director / Admin',
  'Managing Director',
  'HR',
  'Accounts',
  'Production Manager',
  'Project Manager',
  'Service Engineer',
  'Fabrication Engineer',
  'Employee Self Login',
];

// Every route below: must be logged in AND must be admin
router.use(requireAuth, requireRole(ADMIN));

// GET /api/users/roles - role options for the create form
router.get('/roles', (req, res) => {
  res.json(STANDARD_ROLES);
});

// GET /api/users - list all users with roles
router.get('/', async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { id: 'asc' },
      select: {
        id: true, username: true, fullName: true, phone: true, isActive: true, createdAt: true,
        roles: { select: { role: { select: { name: true } } } },
      },
    });
    res.json(users.map(u => ({ ...u, roles: u.roles.map(r => r.role.name) })));
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/users - create a user
router.post('/', async (req, res) => {
  try {
    const { username, fullName, password, roleName } = req.body || {};
    if (!username || !username.trim() || !password || !roleName)
      return res.status(400).json({ message: 'username, password and roleName are required' });
    if (password.length < 6)
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    if (!STANDARD_ROLES.includes(roleName))
      return res.status(400).json({ message: 'Invalid role' });

    const exists = await prisma.user.findUnique({ where: { username: username.trim() } });
    if (exists) return res.status(409).json({ message: 'Username already exists' });

    const role = await prisma.role.upsert({
      where: { name: roleName }, update: {}, create: { name: roleName },
    });

    const user = await prisma.user.create({
      data: {
        username: username.trim(),
        fullName: (fullName || '').trim() || null,
        passwordHash: await bcrypt.hash(password, 10),
        roles: { create: { roleId: role.id } },
      },
      select: { id: true, username: true, fullName: true, isActive: true },
    });

    res.status(201).json({ ...user, roles: [roleName] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Server error' });
  }
});

// PATCH /api/users/:id/status - activate or deactivate
router.patch('/:id/status', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { isActive } = req.body || {};
    if (typeof isActive !== 'boolean')
      return res.status(400).json({ message: 'isActive (true/false) required' });
    if (id === req.user.sub)
      return res.status(400).json({ message: 'You cannot deactivate your own account' });

    const user = await prisma.user.update({
      where: { id },
      data: { isActive },
      select: { id: true, username: true, isActive: true },
    });
    res.json(user);
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ message: 'User not found' });
    console.error(e);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
