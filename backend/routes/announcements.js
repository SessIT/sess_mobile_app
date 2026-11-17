const express = require('express');
const prisma = require('../lib/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');
const { notify } = require('../lib/notify');
const router = express.Router();
const ADMIN = 'Admin';

router.use(requireAuth);
const { can } = require('../lib/permissions');
const isAdmin = (req) => can(req, 'announcements'); // Admin, or a role holding this area's permission

// GET /api/announcements — newest first (pinned on top), with my acknowledgement.
// Admins also get acknowledgement progress.
router.get('/', async (req, res) => {
  try {
    const admin = isAdmin(req);
    const [rows, staff] = await Promise.all([
      prisma.announcement.findMany({
        orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
        take: 100,
        include: { acks: { select: { userId: true, ackedAt: true } } },
      }),
      admin ? prisma.user.count({ where: { isActive: true } }) : 0,
    ]);
    res.json({
      items: rows.map(({ acks, ...a }) => ({
        ...a,
        myAckAt: acks.find((k) => k.userId === req.user.sub)?.ackedAt || null,
        ...(admin ? { ackCount: acks.length, staff } : {}),
      })),
    });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// GET /api/announcements/pending-count — notices I still have to acknowledge.
router.get('/pending-count', async (req, res) => {
  try {
    const count = await prisma.announcement.count({
      where: { requiresAck: true, acks: { none: { userId: req.user.sub } } },
    });
    res.json({ count });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

function clean(body) {
  const title = String(body?.title || '').trim().slice(0, 120);
  const text = String(body?.body || '').trim().slice(0, 5000);
  if (!title) return { error: 'Enter a title' };
  if (!text) return { error: 'Write the announcement' };
  return { data: { title, body: text, requiresAck: !!body.requiresAck, pinned: !!body.pinned } };
}

// POST /api/announcements (admin) — publish + notify everyone.
router.post('/', requireRole(ADMIN), async (req, res) => {
  try {
    const c = clean(req.body);
    if (c.error) return res.status(400).json({ message: c.error });
    const a = await prisma.announcement.create({ data: { ...c.data, createdById: req.user.sub } });
    const everyone = (await prisma.user.findMany({ where: { isActive: true, id: { not: req.user.sub } }, select: { id: true } })).map((u) => u.id);
    notify(everyone, {
      kind: 'announcement',
      title: `${a.requiresAck ? '📌 Please read: ' : '📢 '}${a.title}`,
      body: a.body.slice(0, 140),
      data: { screen: 'Announcements' },
    });
    res.status(201).json(a);
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

router.patch('/:id', requireRole(ADMIN), async (req, res) => {
  try {
    const c = clean(req.body);
    if (c.error) return res.status(400).json({ message: c.error });
    const { count } = await prisma.announcement.updateMany({ where: { id: Number(req.params.id) }, data: c.data });
    if (!count) return res.status(404).json({ message: 'Announcement not found' });
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

router.delete('/:id', requireRole(ADMIN), async (req, res) => {
  try {
    const { count } = await prisma.announcement.deleteMany({ where: { id: Number(req.params.id) } });
    if (!count) return res.status(404).json({ message: 'Announcement not found' });
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// POST /api/announcements/:id/ack — "I have read this".
router.post('/:id/ack', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!(await prisma.announcement.findUnique({ where: { id } }))) return res.status(404).json({ message: 'Announcement not found' });
    const ack = await prisma.announcementAck.upsert({
      where: { announcementId_userId: { announcementId: id, userId: req.user.sub } },
      update: {},
      create: { announcementId: id, userId: req.user.sub },
    });
    res.json({ ok: true, ackedAt: ack.ackedAt });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// GET /api/announcements/:id/acks (admin) — who has and hasn't acknowledged.
router.get('/:id/acks', requireRole(ADMIN), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [acks, users] = await Promise.all([
      prisma.announcementAck.findMany({ where: { announcementId: id } }),
      prisma.user.findMany({ where: { isActive: true }, orderBy: { fullName: 'asc' }, select: { id: true, fullName: true, username: true, employeeId: true } }),
    ]);
    const at = new Map(acks.map((k) => [k.userId, k.ackedAt]));
    res.json({
      acked: users.filter((u) => at.has(u.id)).map((u) => ({ ...u, ackedAt: at.get(u.id) })),
      pending: users.filter((u) => !at.has(u.id)),
    });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

module.exports = router;
