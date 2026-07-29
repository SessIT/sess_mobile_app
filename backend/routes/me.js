const express = require('express');
const prisma = require('../lib/prisma');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.sub },
    select: { id: true, username: true, fullName: true, isActive: true, createdAt: true },
  });
  if (!user || !user.isActive) return res.status(401).json({ message: 'User not found' });
  res.json({ ...user, roles: req.user.roles });
});

/* ---------------- Self-service profile ----------------
 * Employees can VIEW their employment + personal + statutory data, and EDIT
 * only the personal contact fields. Employment/statutory/salary/bank changes
 * stay admin-only (HR console). */
const PROFILE_SELECT = {
  id: true, username: true, fullName: true, phone: true,
  employeeId: true, designation: true, department: true, employmentType: true,
  dateOfJoining: true,
  reportingManager: { select: { fullName: true, username: true } },
  dateOfBirth: true, bloodGroup: true, address: true, emergencyContact: true,
  esiNumber: true, epfNumber: true, panNumber: true,
};

// GET /api/me/profile — own profile
router.get('/profile', requireAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.sub }, select: PROFILE_SELECT });
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// PATCH /api/me/profile — employee-editable personal fields only
router.patch('/profile', requireAuth, async (req, res) => {
  try {
    const { address, emergencyContact, bloodGroup, dateOfBirth } = req.body || {};
    const data = {};

    if (address !== undefined) {
      const s = String(address ?? '').trim();
      data.address = s ? s.slice(0, 300) : null;
    }
    if (emergencyContact !== undefined) {
      const digits = String(emergencyContact ?? '').replace(/\D/g, '');
      if (String(emergencyContact ?? '').trim() && digits.length !== 10)
        return res.status(400).json({ message: 'Emergency contact must be a 10-digit number' });
      data.emergencyContact = digits || null;
    }
    if (bloodGroup !== undefined) {
      const s = String(bloodGroup ?? '').trim();
      data.bloodGroup = s ? s.slice(0, 10) : null;
    }
    if (dateOfBirth !== undefined) {
      const raw = String(dateOfBirth ?? '').trim();
      if (!raw) data.dateOfBirth = null;
      else if (!/^\d{4}-\d{2}-\d{2}$/.test(raw))
        return res.status(400).json({ message: 'Date of birth must be YYYY-MM-DD' });
      else data.dateOfBirth = new Date(raw + 'T00:00:00.000Z');
    }

    const user = await prisma.user.update({
      where: { id: req.user.sub },
      data,
      select: PROFILE_SELECT,
    });
    res.json(user);
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

module.exports = router;