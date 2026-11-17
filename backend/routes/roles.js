const express = require('express');
const prisma = require('../lib/prisma');
const { requireAuth, requireAdminRole, clearUserCache } = require('../middleware/auth');
const { ADMIN, PERMISSIONS, KEYS, clearPermissionCache } = require('../lib/permissions');
const router = express.Router();

// Only the Admin role manages roles — a delegated permission must never be
// able to grant itself more.
router.use(requireAuth, requireAdminRole);

// GET /api/roles — every role, its permissions and member count, + the catalog.
router.get('/', async (req, res) => {
  try {
    const roles = await prisma.role.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { users: true } } } });
    res.json({
      catalog: PERMISSIONS.map(([key, label, hint]) => ({ key, label, hint })),
      roles: roles.map((r) => ({
        id: r.id, name: r.name, users: r._count.users, locked: r.name === ADMIN,
        permissions: r.name === ADMIN ? KEYS : r.permissions.filter((p) => KEYS.includes(p)),
      })),
    });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// POST /api/roles — { name, permissions? } create a role.
router.post('/', async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim().replace(/\s+/g, ' ').slice(0, 50);
    if (!name) return res.status(400).json({ message: 'Enter a role name' });
    const permissions = (Array.isArray(req.body?.permissions) ? req.body.permissions : []).filter((p) => KEYS.includes(p));
    const role = await prisma.role.create({ data: { name, permissions } });
    res.status(201).json(role);
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ message: 'A role with this name already exists' });
    console.error(e); res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/roles/:id — { permissions:[...] } replace a role's permissions.
router.put('/:id', async (req, res) => {
  try {
    const role = await prisma.role.findUnique({ where: { id: Number(req.params.id) } });
    if (!role) return res.status(404).json({ message: 'Role not found' });
    if (role.name === ADMIN) return res.status(400).json({ message: 'The Admin role always has full access' });
    const permissions = [...new Set((Array.isArray(req.body?.permissions) ? req.body.permissions : []).filter((p) => KEYS.includes(p)))];
    const updated = await prisma.role.update({ where: { id: role.id }, data: { permissions } });
    // Take effect on everyone's next request, not after a cache minute.
    clearPermissionCache();
    clearUserCache();
    res.json(updated);
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// DELETE /api/roles/:id — only an empty, non-Admin role.
router.delete('/:id', async (req, res) => {
  try {
    const role = await prisma.role.findUnique({ where: { id: Number(req.params.id) }, include: { _count: { select: { users: true } } } });
    if (!role) return res.status(404).json({ message: 'Role not found' });
    if (role.name === ADMIN) return res.status(400).json({ message: 'The Admin role cannot be deleted' });
    if (role._count.users) return res.status(409).json({ message: `${role._count.users} user(s) still have this role — move them first` });
    await prisma.role.delete({ where: { id: role.id } });
    clearPermissionCache();
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

module.exports = router;
