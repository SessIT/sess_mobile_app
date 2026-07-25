const express = require('express');
const prisma = require('../lib/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');
const router = express.Router();
const ADMIN = 'Technical Director / Admin';

router.use(requireAuth);

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const dateOnly = (ymd) => new Date(ymd + 'T00:00:00.000Z');
const ymdIST = (d) => new Date(new Date(d).getTime() + 5.5 * 3600000).toISOString().slice(0, 10);
const intYear = (v) => (/^\d{4}$/.test(String(v || '')) ? Number(v) : Number(ymdIST(new Date()).slice(0, 4)));

// Default paid-leave categories, seeded on first use.
const DEFAULT_TYPES = [
  { code: 'CL', name: 'Casual Leave' },
  { code: 'SL', name: 'Sick Leave' },
  { code: 'PL', name: 'Privilege Leave' },
];
async function ensureTypes() {
  for (const t of DEFAULT_TYPES) {
    await prisma.leaveType.upsert({ where: { code: t.code }, update: {}, create: t });
  }
}

// Count leave days between two YMD dates (inclusive), skipping Sundays and
// company holidays. A half-day request on a single working day counts as 0.5.
async function countLeaveDays(startYmd, endYmd, halfDay) {
  const holidayRows = await prisma.holiday.findMany({
    where: { date: { gte: dateOnly(startYmd), lte: dateOnly(endYmd) } },
    select: { date: true },
  });
  const holidays = new Set(holidayRows.map((h) => new Date(h.date).toISOString().slice(0, 10)));
  const dayMs = 86400000;
  const s = Date.parse(startYmd + 'T00:00:00Z');
  const e = Date.parse(endYmd + 'T00:00:00Z');
  let count = 0;
  for (let t = s; t <= e; t += dayMs) {
    const dt = new Date(t);
    if (dt.getUTCDay() === 0) continue; // Sunday = weekly off
    if (holidays.has(dt.toISOString().slice(0, 10))) continue; // holiday
    count++;
  }
  if (halfDay && startYmd === endYmd && count === 1) return 0.5;
  return count;
}

// Per-type balances for a user in a year: quota, approved-used, pending, available.
async function balancesFor(userId, year) {
  await ensureTypes();
  const [types, policies, reqs] = await Promise.all([
    prisma.leaveType.findMany({ where: { active: true }, orderBy: { id: 'asc' } }),
    prisma.leavePolicy.findMany({ where: { year } }),
    prisma.leaveRequest.findMany({
      where: {
        userId,
        status: { in: ['approved', 'pending'] },
        startDate: { gte: dateOnly(`${year}-01-01`), lt: dateOnly(`${year + 1}-01-01`) },
      },
    }),
  ]);
  const quota = new Map(policies.map((p) => [p.leaveTypeId, p.quota]));
  const used = {}, pending = {};
  for (const r of reqs) {
    const bucket = r.status === 'approved' ? used : pending;
    bucket[r.leaveTypeId] = (bucket[r.leaveTypeId] || 0) + r.days;
  }
  return types.map((t) => {
    const q = quota.get(t.id) ?? 0, u = used[t.id] || 0, p = pending[t.id] || 0;
    return {
      leaveTypeId: t.id, code: t.code, name: t.name,
      quota: q, used: u, pending: p, available: Math.round((q - u - p) * 100) / 100,
    };
  });
}

/* ==================== TYPES & POLICY ==================== */

// GET /api/leaves/types — the leave categories
router.get('/types', async (req, res) => {
  try {
    await ensureTypes();
    res.json(await prisma.leaveType.findMany({ where: { active: true }, orderBy: { id: 'asc' } }));
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// GET /api/leaves/policy?year=YYYY — annual allocation per type
router.get('/policy', async (req, res) => {
  try {
    await ensureTypes();
    const year = intYear(req.query.year);
    const [types, policies] = await Promise.all([
      prisma.leaveType.findMany({ where: { active: true }, orderBy: { id: 'asc' } }),
      prisma.leavePolicy.findMany({ where: { year } }),
    ]);
    const map = new Map(policies.map((p) => [p.leaveTypeId, p.quota]));
    res.json({
      year,
      allocations: types.map((t) => ({ leaveTypeId: t.id, code: t.code, name: t.name, quota: map.get(t.id) ?? 0 })),
    });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// PUT /api/leaves/policy (admin) — set { year, allocations:[{leaveTypeId, quota}] }
router.put('/policy', requireRole(ADMIN), async (req, res) => {
  try {
    const year = intYear(req.body?.year);
    const allocations = Array.isArray(req.body?.allocations) ? req.body.allocations : [];
    for (const a of allocations) {
      const leaveTypeId = Number(a.leaveTypeId);
      if (!leaveTypeId) continue;
      const quota = Math.max(0, Number(a.quota) || 0);
      await prisma.leavePolicy.upsert({
        where: { year_leaveTypeId: { year, leaveTypeId } },
        update: { quota },
        create: { year, leaveTypeId, quota },
      });
    }
    res.json({ ok: true, year });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

/* ==================== EMPLOYEE (SELF) ==================== */

// GET /api/leaves/balance?year=YYYY
router.get('/balance', async (req, res) => {
  try {
    const year = intYear(req.query.year);
    res.json({ year, balances: await balancesFor(req.user.sub, year) });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// GET /api/leaves/my?year=YYYY — my balances + my requests
router.get('/my', async (req, res) => {
  try {
    const year = intYear(req.query.year);
    const [balances, requests] = await Promise.all([
      balancesFor(req.user.sub, year),
      prisma.leaveRequest.findMany({
        where: {
          userId: req.user.sub,
          startDate: { gte: dateOnly(`${year}-01-01`), lt: dateOnly(`${year + 1}-01-01`) },
        },
        orderBy: { startDate: 'desc' },
        include: { leaveType: { select: { code: true, name: true } } },
      }),
    ]);
    res.json({ year, balances, requests });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// POST /api/leaves/requests — apply for leave
router.post('/requests', async (req, res) => {
  try {
    const { leaveTypeId, startDate, endDate, halfDay, reason } = req.body || {};
    if (!leaveTypeId || !YMD.test(startDate || '') || !YMD.test(endDate || ''))
      return res.status(400).json({ message: 'leaveTypeId, startDate and endDate (YYYY-MM-DD) are required' });
    const reasonTrim = String(reason || '').trim();
    if (!reasonTrim)
      return res.status(400).json({ message: 'A reason is required to apply for leave' });
    if (endDate < startDate)
      return res.status(400).json({ message: 'End date must be on or after start date' });
    if (startDate.slice(0, 4) !== endDate.slice(0, 4))
      return res.status(400).json({ message: 'Leave must be within a single calendar year' });

    const type = await prisma.leaveType.findUnique({ where: { id: Number(leaveTypeId) } });
    if (!type) return res.status(404).json({ message: 'Leave type not found' });

    const isHalf = !!halfDay && startDate === endDate;
    const days = await countLeaveDays(startDate, endDate, isHalf);
    if (days <= 0)
      return res.status(400).json({ message: 'Selected range has no working days (Sundays/holidays excluded)' });

    // Block overlapping pending/approved leave.
    const overlap = await prisma.leaveRequest.findFirst({
      where: {
        userId: req.user.sub,
        status: { in: ['pending', 'approved'] },
        startDate: { lte: dateOnly(endDate) },
        endDate: { gte: dateOnly(startDate) },
      },
    });
    if (overlap) return res.status(409).json({ message: 'You already have a leave request overlapping these dates' });

    // Balance check.
    const year = Number(startDate.slice(0, 4));
    const bal = (await balancesFor(req.user.sub, year)).find((b) => b.leaveTypeId === type.id);
    if (!bal || bal.quota <= 0)
      return res.status(400).json({ message: `No ${type.name} allocated for ${year}. Contact HR.` });
    if (days > bal.available)
      return res.status(400).json({ message: `Only ${bal.available} day(s) of ${type.code} available` });

    const created = await prisma.leaveRequest.create({
      data: {
        userId: req.user.sub,
        leaveTypeId: type.id,
        startDate: dateOnly(startDate),
        endDate: dateOnly(endDate),
        halfDay: isHalf,
        days,
        reason: reasonTrim.slice(0, 500),
        status: 'pending',
      },
      include: { leaveType: { select: { code: true, name: true } } },
    });
    res.status(201).json(created);
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// DELETE /api/leaves/requests/:id — cancel own pending request
router.delete('/requests/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const reqRow = await prisma.leaveRequest.findUnique({ where: { id } });
    if (!reqRow || reqRow.userId !== req.user.sub)
      return res.status(404).json({ message: 'Request not found' });
    if (reqRow.status !== 'pending')
      return res.status(400).json({ message: 'Only pending requests can be cancelled' });
    await prisma.leaveRequest.update({ where: { id }, data: { status: 'cancelled' } });
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

/* ==================== ADMIN ==================== */

// GET /api/leaves/requests?status=&year=  (admin) — all requests
router.get('/requests', requireRole(ADMIN), async (req, res) => {
  try {
    const year = intYear(req.query.year);
    const where = {
      startDate: { gte: dateOnly(`${year}-01-01`), lt: dateOnly(`${year + 1}-01-01`) },
    };
    if (['pending', 'approved', 'rejected', 'cancelled'].includes(req.query.status))
      where.status = req.query.status;
    const requests = await prisma.leaveRequest.findMany({
      where,
      orderBy: [{ status: 'asc' }, { appliedAt: 'desc' }],
      include: {
        leaveType: { select: { code: true, name: true } },
        user: { select: { id: true, username: true, fullName: true } },
        reviewedBy: { select: { fullName: true, username: true } },
      },
    });
    res.json({ year, requests });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// PATCH /api/leaves/requests/:id/decision (admin) — { status:'approved'|'rejected', reviewNote }
router.patch('/requests/:id/decision', requireRole(ADMIN), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { status, reviewNote } = req.body || {};
    if (!['approved', 'rejected'].includes(status))
      return res.status(400).json({ message: "status must be 'approved' or 'rejected'" });

    const reqRow = await prisma.leaveRequest.findUnique({ where: { id } });
    if (!reqRow) return res.status(404).json({ message: 'Request not found' });
    if (reqRow.status !== 'pending')
      return res.status(400).json({ message: `Request is already ${reqRow.status}` });

    // On approve, make sure it still fits the remaining (approved-only) balance.
    if (status === 'approved') {
      const year = Number(new Date(reqRow.startDate).toISOString().slice(0, 4));
      const bal = (await balancesFor(reqRow.userId, year)).find((b) => b.leaveTypeId === reqRow.leaveTypeId);
      const approvedRemaining = (bal?.quota ?? 0) - (bal?.used ?? 0);
      if (reqRow.days > approvedRemaining)
        return res.status(400).json({ message: `Approving exceeds balance — only ${approvedRemaining} day(s) left` });
    }

    const updated = await prisma.leaveRequest.update({
      where: { id },
      data: {
        status,
        reviewedById: req.user.sub,
        reviewedAt: new Date(),
        reviewNote: (reviewNote || '').trim().slice(0, 500) || null,
      },
      include: {
        leaveType: { select: { code: true, name: true } },
        user: { select: { id: true, username: true, fullName: true } },
      },
    });
    res.json(updated);
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

module.exports = router;
