const express = require('express');
const prisma = require('../lib/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');
const router = express.Router();
const ADMIN = 'Admin';

const ymdIST = (d) => new Date(new Date(d).getTime() + 5.5 * 3600000).toISOString().slice(0, 10);

/* GET /api/reports/upcoming?days=30 — birthdays & work anniversaries coming up.
 * Open to EVERY authenticated user (dashboard widget — celebration culture),
 * so it is registered before the admin gate and exposes no sensitive fields. */
router.get('/upcoming', requireAuth, async (req, res) => {
  try {
    const windowDays = Math.min(Math.max(parseInt(req.query.days) || 30, 1), 90);
    const today = ymdIST(new Date());
    const todayT = Date.parse(today + 'T00:00:00Z');
    const curYear = Number(today.slice(0, 4));

    // Next calendar occurrence of a MM-DD on/after today (Date.UTC rolls Feb-29 safely).
    const nextOccurrence = (iso) => {
      const d = new Date(iso);
      let occ = new Date(Date.UTC(curYear, d.getUTCMonth(), d.getUTCDate()));
      if (occ.getTime() < todayT) occ = new Date(Date.UTC(curYear + 1, d.getUTCMonth(), d.getUTCDate()));
      return occ;
    };

    const users = await prisma.user.findMany({
      where: { isActive: true },
      select: {
        id: true, username: true, fullName: true, designation: true, department: true,
        dateOfBirth: true, dateOfJoining: true,
      },
    });

    const events = [];
    for (const u of users) {
      const base = {
        id: u.id, username: u.username, fullName: u.fullName,
        designation: u.designation, department: u.department,
      };
      if (u.dateOfBirth) {
        const occ = nextOccurrence(u.dateOfBirth);
        const daysUntil = Math.round((occ.getTime() - todayT) / 86400000);
        if (daysUntil <= windowDays)
          events.push({ ...base, type: 'birthday', date: occ.toISOString().slice(0, 10), daysUntil });
      }
      if (u.dateOfJoining) {
        const occ = nextOccurrence(u.dateOfJoining);
        const daysUntil = Math.round((occ.getTime() - todayT) / 86400000);
        const years = occ.getUTCFullYear() - new Date(u.dateOfJoining).getUTCFullYear();
        if (daysUntil <= windowDays && years > 0)
          events.push({ ...base, type: 'anniversary', date: occ.toISOString().slice(0, 10), daysUntil, years });
      }
    }
    events.sort((a, b) => a.daysUntil - b.daysUntil || (a.fullName || a.username).localeCompare(b.fullName || b.username));
    res.json({ days: windowDays, events });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

router.use(requireAuth, requireRole(ADMIN));

// GET /api/reports/celebrations?month=MM — birthdays & work anniversaries in a month
router.get('/celebrations', async (req, res) => {
  try {
    const today = ymdIST(new Date());
    const month = /^(0[1-9]|1[0-2])$/.test(req.query.month || '') ? req.query.month : today.slice(5, 7);
    const curYear = Number(today.slice(0, 4));

    const users = await prisma.user.findMany({
      where: { isActive: true },
      select: {
        id: true, username: true, fullName: true, department: true, designation: true,
        dateOfBirth: true, dateOfJoining: true,
      },
      orderBy: { fullName: 'asc' },
    });

    const inMonth = (d) => d && new Date(d).toISOString().slice(5, 7) === month;
    const dayOf = (d) => new Date(d).toISOString().slice(8, 10);

    const birthdays = users
      .filter((u) => inMonth(u.dateOfBirth))
      .map((u) => ({
        id: u.id, username: u.username, fullName: u.fullName,
        department: u.department, designation: u.designation,
        date: new Date(u.dateOfBirth).toISOString().slice(0, 10),
        day: dayOf(u.dateOfBirth),
      }))
      .sort((a, b) => a.day.localeCompare(b.day));

    const anniversaries = users
      .filter((u) => inMonth(u.dateOfJoining))
      .map((u) => {
        const joinYear = Number(new Date(u.dateOfJoining).toISOString().slice(0, 4));
        return {
          id: u.id, username: u.username, fullName: u.fullName,
          department: u.department, designation: u.designation,
          date: new Date(u.dateOfJoining).toISOString().slice(0, 10),
          day: dayOf(u.dateOfJoining),
          years: Math.max(curYear - joinYear, 0),
        };
      })
      .filter((a) => a.years > 0) // joining THIS year isn't an anniversary yet
      .sort((a, b) => a.day.localeCompare(b.day));

    res.json({ month, birthdays, anniversaries });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// GET /api/reports/headcount — active headcount by department & employment type
router.get('/headcount', async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: { isActive: true, department: true, employmentType: true, exitDate: true },
    });
    const active = users.filter((u) => u.isActive);

    const tally = (list, key) => {
      const map = {};
      for (const u of list) {
        const k = (u[key] || 'Unassigned').trim() || 'Unassigned';
        map[k] = (map[k] || 0) + 1;
      }
      return Object.entries(map)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);
    };

    res.json({
      total: users.length,
      active: active.length,
      inactive: users.length - active.length,
      exited: users.filter((u) => u.exitDate).length,
      byDepartment: tally(active, 'department'),
      byEmploymentType: tally(active, 'employmentType'),
    });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

module.exports = router;
