const express = require('express');
const prisma = require('../lib/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');
const router = express.Router();

router.use(requireAuth, requireRole('Admin'));

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const PAGE = 100;

// GET /api/audit?userId=&entity=&from=&to=&q=&page= — newest first, 100 per page.
router.get('/', async (req, res) => {
  try {
    const where = {};
    if (Number(req.query.userId)) where.userId = Number(req.query.userId);
    if (req.query.entity) where.entity = String(req.query.entity).slice(0, 40);
    if (req.query.failed === '1') where.status = { gte: 400 };
    const from = YMD.test(req.query.from || '') ? new Date(`${req.query.from}T00:00:00+05:30`) : null;
    const to = YMD.test(req.query.to || '') ? new Date(new Date(`${req.query.to}T00:00:00+05:30`).getTime() + 86400000) : null;
    if (from || to) where.createdAt = { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) };
    if (req.query.q) where.path = { contains: String(req.query.q).slice(0, 80), mode: 'insensitive' };
    const page = Math.max(0, Number(req.query.page) || 0);
    const [rows, total, entities] = await Promise.all([
      prisma.auditLog.findMany({ where, orderBy: { id: 'desc' }, skip: page * PAGE, take: PAGE }),
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({ distinct: ['entity'], select: { entity: true }, orderBy: { entity: 'asc' } }),
    ]);
    const ids = [...new Set(rows.map((r) => r.userId).filter(Boolean))];
    const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true, username: true } }) : [];
    const um = new Map(users.map((u) => [u.id, u.fullName || u.username]));
    res.json({
      rows: rows.map((r) => ({ ...r, who: um.get(r.userId) || r.userName || '—' })),
      total, page, pageSize: PAGE,
      entities: entities.map((e) => e.entity).filter(Boolean),
    });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

module.exports = router;
