const express = require('express');
const prisma = require('../lib/prisma');
const { requireAuth } = require('../middleware/auth');
const { isExpoToken } = require('../lib/notify');
const router = express.Router();

router.use(requireAuth);

// GET /api/notifications — my latest 50 + unread count.
router.get('/', async (req, res) => {
  try {
    const [items, unread] = await Promise.all([
      prisma.notification.findMany({ where: { userId: req.user.sub }, orderBy: { createdAt: 'desc' }, take: 50 }),
      prisma.notification.count({ where: { userId: req.user.sub, readAt: null } }),
    ]);
    res.json({ items, unread });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// GET /api/notifications/unread-count — cheap badge probe.
router.get('/unread-count', async (req, res) => {
  try {
    res.json({ count: await prisma.notification.count({ where: { userId: req.user.sub, readAt: null } }) });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// POST /api/notifications/read — { ids:[..] } or { all:true }
router.post('/read', async (req, res) => {
  try {
    const where = { userId: req.user.sub, readAt: null };
    if (!req.body?.all) {
      const ids = (Array.isArray(req.body?.ids) ? req.body.ids : []).map(Number).filter(Number.isInteger);
      if (!ids.length) return res.json({ ok: true, updated: 0 });
      where.id = { in: ids };
    }
    const { count } = await prisma.notification.updateMany({ where, data: { readAt: new Date() } });
    res.json({ ok: true, updated: count });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// POST /api/notifications/push-token — { token, platform } register this phone.
// A token already owned by another account moves to this one (phone handed
// over / account switched), so a push never reaches the previous user.
router.post('/push-token', async (req, res) => {
  try {
    const token = String(req.body?.token || '');
    if (!isExpoToken(token)) return res.status(400).json({ message: 'Invalid push token' });
    const platform = ['android', 'ios'].includes(req.body?.platform) ? req.body.platform : null;
    await prisma.pushToken.upsert({
      where: { token },
      update: { userId: req.user.sub, platform },
      create: { token, userId: req.user.sub, platform },
    });
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// DELETE /api/notifications/push-token — { token } on logout.
router.delete('/push-token', async (req, res) => {
  try {
    await prisma.pushToken.deleteMany({ where: { token: String(req.body?.token || ''), userId: req.user.sub } });
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

module.exports = router;
