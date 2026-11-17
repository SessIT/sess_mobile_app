const express = require('express');
const prisma = require('../lib/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');
const { getDefaultShift, shiftForUser, validateShift } = require('../lib/shifts');
const router = express.Router();
const ADMIN = 'Admin';

router.use(requireAuth);

const SHIFT_FIELDS = ['name', 'startTime', 'endTime', 'graceMinutes', 'hoursPerDay', 'halfDayHours', 'weekOffDays'];
const pickFields = (s) => Object.fromEntries(SHIFT_FIELDS.map((k) => [k, s[k]]));

// GET /api/shifts/my — the logged-in employee's effective shift.
router.get('/my', async (req, res) => {
  try {
    res.json(await shiftForUser(req.user.sub));
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// GET /api/shifts (admin) — every shift with its assigned employees. Employees
// with no shift are listed under the default, since that is what they follow.
router.get('/', requireRole(ADMIN), async (req, res) => {
  try {
    const def = await getDefaultShift();
    const [shifts, users] = await Promise.all([
      prisma.shift.findMany({ orderBy: { id: 'asc' } }),
      prisma.user.findMany({
        where: { isActive: true },
        select: { id: true, username: true, fullName: true, employeeId: true, shiftId: true },
        orderBy: { fullName: 'asc' },
      }),
    ]);
    const known = new Set(shifts.map((s) => s.id));
    res.json({
      shifts: shifts.map((s) => ({
        ...s,
        users: users
          .filter((u) => (u.shiftId && known.has(u.shiftId) ? u.shiftId : def.id) === s.id)
          .map(({ shiftId, ...u }) => u),
      })),
      defaultShiftId: def.id,
    });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// POST /api/shifts (admin)
router.post('/', requireRole(ADMIN), async (req, res) => {
  try {
    const v = validateShift(req.body || {});
    if (!v.ok) return res.status(400).json({ message: v.message });
    const created = await prisma.shift.create({ data: v.data });
    res.status(201).json(created);
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ message: 'A shift with this name already exists' });
    console.error(e); res.status(500).json({ message: 'Server error' });
  }
});

// PATCH /api/shifts/:id (admin) — edit; { isDefault:true } makes it the default.
// Changes apply to every UNLOCKED month (status is computed on read); locked
// months keep their frozen snapshot.
router.patch('/:id', requireRole(ADMIN), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = await prisma.shift.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ message: 'Shift not found' });
    // Validate the merged result so cross-field rules (half-day ≤ hours/day)
    // hold even when only one field changes.
    const v = validateShift({ ...pickFields(existing), ...(req.body || {}) });
    if (!v.ok) return res.status(400).json({ message: v.message });
    const makeDefault = req.body?.isDefault === true;
    const updated = await prisma.$transaction(async (tx) => {
      if (makeDefault) await tx.shift.updateMany({ where: { isDefault: true, id: { not: id } }, data: { isDefault: false } });
      return tx.shift.update({ where: { id }, data: { ...v.data, ...(makeDefault ? { isDefault: true } : {}) } });
    });
    res.json(updated);
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ message: 'A shift with this name already exists' });
    console.error(e); res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/shifts/:id/users (admin) — { userIds:[..] } move these employees onto
// this shift. Employees not listed keep whatever shift they are on.
router.put('/:id/users', requireRole(ADMIN), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const shift = await prisma.shift.findUnique({ where: { id } });
    if (!shift) return res.status(404).json({ message: 'Shift not found' });
    const userIds = [...new Set((Array.isArray(req.body?.userIds) ? req.body.userIds : []).map(Number).filter(Number.isInteger))];
    if (userIds.length === 0) return res.status(400).json({ message: 'Select at least one employee' });
    const { count } = await prisma.user.updateMany({ where: { id: { in: userIds } }, data: { shiftId: id } });
    res.json({ ok: true, assigned: count });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// DELETE /api/shifts/:id (admin) — its employees fall back to the default shift.
router.delete('/:id', requireRole(ADMIN), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const shift = await prisma.shift.findUnique({ where: { id } });
    if (!shift) return res.status(404).json({ message: 'Shift not found' });
    if (shift.isDefault)
      return res.status(400).json({ message: 'Make another shift the default before deleting this one' });
    await prisma.shift.delete({ where: { id } }); // users.shift_id → NULL (default)
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

module.exports = router;
