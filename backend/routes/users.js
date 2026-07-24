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

// Normalise a 10-digit phone; '' / null -> null. Returns { ok, value } / { ok:false, message }.
function normPhone(phone) {
  if (phone === undefined || phone === null || String(phone).trim() === '') return { ok: true, value: null };
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length !== 10) return { ok: false, message: 'Phone must be a 10-digit mobile number' };
  return { ok: true, value: digits };
}

// POST /api/users - create a user
router.post('/', async (req, res) => {
  try {
    const { username, fullName, password, roleName, phone } = req.body || {};
    if (!username || !username.trim() || !password || !roleName)
      return res.status(400).json({ message: 'username, password and roleName are required' });
    if (password.length < 6)
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    if (!STANDARD_ROLES.includes(roleName))
      return res.status(400).json({ message: 'Invalid role' });

    const ph = normPhone(phone);
    if (!ph.ok) return res.status(400).json({ message: ph.message });

    const exists = await prisma.user.findUnique({ where: { username: username.trim() } });
    if (exists) return res.status(409).json({ message: 'Username already exists' });
    if (ph.value) {
      const phoneTaken = await prisma.user.findUnique({ where: { phone: ph.value } });
      if (phoneTaken) return res.status(409).json({ message: 'Phone number already in use' });
    }

    const role = await prisma.role.upsert({
      where: { name: roleName }, update: {}, create: { name: roleName },
    });

    const user = await prisma.user.create({
      data: {
        username: username.trim(),
        fullName: (fullName || '').trim() || null,
        phone: ph.value,
        passwordHash: await bcrypt.hash(password, 10),
        roles: { create: { roleId: role.id } },
      },
      select: { id: true, username: true, fullName: true, phone: true, isActive: true },
    });

    res.status(201).json({ ...user, roles: [roleName] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Server error' });
  }
});

// PATCH /api/users/:id - edit a user (name, phone, role, and optionally reset password)
router.patch('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { fullName, phone, roleName, password, username } = req.body || {};

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ message: 'User not found' });

    const data = {};

    if (username !== undefined) {
      const u = String(username).trim();
      if (!u) return res.status(400).json({ message: 'Username cannot be empty' });
      if (/\s/.test(u)) return res.status(400).json({ message: 'Username cannot contain spaces' });
      if (u !== existing.username) {
        const taken = await prisma.user.findUnique({ where: { username: u } });
        if (taken) return res.status(409).json({ message: 'Username already exists' });
        data.username = u;
      }
    }

    if (fullName !== undefined) data.fullName = String(fullName).trim() || null;

    if (phone !== undefined) {
      const ph = normPhone(phone);
      if (!ph.ok) return res.status(400).json({ message: ph.message });
      if (ph.value !== existing.phone) {
        if (ph.value) {
          const taken = await prisma.user.findFirst({ where: { phone: ph.value, id: { not: id } } });
          if (taken) return res.status(409).json({ message: 'Phone number already in use' });
        }
        data.phone = ph.value;
      }
    }

    if (password !== undefined && password !== '') {
      if (String(password).length < 6)
        return res.status(400).json({ message: 'Password must be at least 6 characters' });
      data.passwordHash = await bcrypt.hash(String(password), 10);
    }

    if (roleName !== undefined) {
      if (!STANDARD_ROLES.includes(roleName))
        return res.status(400).json({ message: 'Invalid role' });
      const role = await prisma.role.upsert({ where: { name: roleName }, update: {}, create: { name: roleName } });
      // Replace the user's roles with the single selected role.
      await prisma.userRole.deleteMany({ where: { userId: id } });
      await prisma.userRole.create({ data: { userId: id, roleId: role.id } });
    }

    if (Object.keys(data).length > 0) {
      await prisma.user.update({ where: { id }, data });
    }

    const updated = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true, username: true, fullName: true, phone: true, isActive: true, createdAt: true,
        roles: { select: { role: { select: { name: true } } } },
      },
    });
    res.json({ ...updated, roles: updated.roles.map(r => r.role.name) });
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ message: 'User not found' });
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
