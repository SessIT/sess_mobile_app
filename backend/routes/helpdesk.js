const express = require('express');
const prisma = require('../lib/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');
const { notify, adminIds } = require('../lib/notify');
const router = express.Router();
const ADMIN = 'Admin';

router.use(requireAuth);
const { can } = require('../lib/permissions');
const isAdmin = (req) => can(req, 'helpdesk'); // Admin, or a role holding this area's permission

const CATEGORIES = [
  'Payslip & salary', 'Leave & attendance', 'Letter / certificate request', 'Reimbursement',
  'IT / asset', 'Policy question', 'Other',
];
const STATUSES = ['open', 'in_progress', 'resolved', 'closed'];
const USER_SEL = { select: { id: true, fullName: true, username: true, employeeId: true } };

router.get('/categories', (req, res) => res.json(CATEGORIES));

// Ticket rows for lists: last message preview + count.
async function withMeta(tickets) {
  if (!tickets.length) return [];
  const ids = tickets.map((t) => t.id);
  const [counts, lasts, users] = await Promise.all([
    prisma.ticketMessage.groupBy({ by: ['ticketId'], where: { ticketId: { in: ids } }, _count: true }),
    prisma.ticketMessage.findMany({ where: { ticketId: { in: ids } }, orderBy: { id: 'desc' }, distinct: ['ticketId'] }),
    prisma.user.findMany({ where: { id: { in: [...new Set(tickets.map((t) => t.userId))] } }, ...USER_SEL }),
  ]);
  const cnt = new Map(counts.map((c) => [c.ticketId, c._count]));
  const last = new Map(lasts.map((m) => [m.ticketId, m]));
  const um = new Map(users.map((u) => [u.id, u]));
  return tickets.map((t) => ({
    ...t, user: um.get(t.userId) || null, messageCount: cnt.get(t.id) || 0,
    lastMessage: last.get(t.id) ? { body: last.get(t.id).body.slice(0, 120), at: last.get(t.id).createdAt, fromHR: last.get(t.id).authorId !== t.userId } : null,
  }));
}

// GET /api/helpdesk/my — my tickets.
router.get('/my', async (req, res) => {
  try {
    const t = await prisma.ticket.findMany({ where: { userId: req.user.sub }, orderBy: { updatedAt: 'desc' }, take: 100 });
    res.json({ tickets: await withMeta(t) });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// POST /api/helpdesk — { category, subject, body } raise a ticket.
router.post('/', async (req, res) => {
  try {
    const category = CATEGORIES.includes(req.body?.category) ? req.body.category : null;
    const subject = String(req.body?.subject || '').trim().slice(0, 120);
    const body = String(req.body?.body || '').trim().slice(0, 3000);
    if (!category) return res.status(400).json({ message: 'Pick a category' });
    if (!subject) return res.status(400).json({ message: 'Enter a subject' });
    if (!body) return res.status(400).json({ message: 'Describe your request' });
    const ticket = await prisma.ticket.create({
      data: { userId: req.user.sub, category, subject, messages: { create: { authorId: req.user.sub, body } } },
    });
    const me = await prisma.user.findUnique({ where: { id: req.user.sub }, select: { fullName: true, username: true } });
    notify((await adminIds('helpdesk')).filter((id) => id !== req.user.sub), {
      kind: 'helpdesk', title: `Helpdesk: ${subject}`,
      body: `${me?.fullName || me?.username} · ${category}`, data: { screen: 'Helpdesk' },
    });
    res.status(201).json(ticket);
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// GET /api/helpdesk/all?status= (admin) — the queue.
router.get('/all', requireRole(ADMIN), async (req, res) => {
  try {
    const where = STATUSES.includes(req.query.status) ? { status: req.query.status } : {};
    const t = await prisma.ticket.findMany({ where, orderBy: [{ updatedAt: 'desc' }], take: 300 });
    const counts = await prisma.ticket.groupBy({ by: ['status'], _count: true });
    res.json({ tickets: await withMeta(t), counts: Object.fromEntries(counts.map((c) => [c.status, c._count])) });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

async function readable(req) {
  const t = await prisma.ticket.findUnique({ where: { id: Number(req.params.id) } });
  if (!t) return null;
  return t.userId === req.user.sub || isAdmin(req) ? t : null;
}

// GET /api/helpdesk/:id — ticket + thread (owner or admin).
router.get('/:id', async (req, res) => {
  try {
    const t = await readable(req);
    if (!t) return res.status(404).json({ message: 'Ticket not found' });
    const msgs = await prisma.ticketMessage.findMany({ where: { ticketId: t.id }, orderBy: { id: 'asc' } });
    const authors = await prisma.user.findMany({ where: { id: { in: [...new Set(msgs.map((m) => m.authorId))] } }, ...USER_SEL });
    const am = new Map(authors.map((u) => [u.id, u]));
    const [withUser] = await withMeta([t]);
    res.json({
      ticket: withUser,
      messages: msgs.map((m) => ({ ...m, author: am.get(m.authorId) || null, fromHR: m.authorId !== t.userId })),
    });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// POST /api/helpdesk/:id/messages — { body } reply (owner or admin).
router.post('/:id/messages', async (req, res) => {
  try {
    const t = await readable(req);
    if (!t) return res.status(404).json({ message: 'Ticket not found' });
    const body = String(req.body?.body || '').trim().slice(0, 3000);
    if (!body) return res.status(400).json({ message: 'Write a reply' });
    const fromOwner = t.userId === req.user.sub;
    // Owner replying reopens a resolved/closed ticket; HR replying to a new one takes it in hand.
    const status = fromOwner
      ? (['resolved', 'closed'].includes(t.status) ? 'open' : t.status)
      : (t.status === 'open' ? 'in_progress' : t.status);
    await prisma.$transaction([
      prisma.ticketMessage.create({ data: { ticketId: t.id, authorId: req.user.sub, body } }),
      prisma.ticket.update({ where: { id: t.id }, data: { status, closedAt: ['resolved', 'closed'].includes(status) ? t.closedAt : null } }),
    ]);
    if (fromOwner) {
      notify((await adminIds('helpdesk')).filter((id) => id !== req.user.sub), {
        kind: 'helpdesk', title: `Reply on: ${t.subject}`, body: body.slice(0, 140), data: { screen: 'Helpdesk' },
      });
    } else {
      notify(t.userId, { kind: 'helpdesk', title: `HR replied: ${t.subject}`, body: body.slice(0, 140), data: { screen: 'Helpdesk' } });
    }
    res.status(201).json({ ok: true, status });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// PATCH /api/helpdesk/:id — { status }. Admin: any status. Owner: may close.
router.patch('/:id', async (req, res) => {
  try {
    const t = await readable(req);
    if (!t) return res.status(404).json({ message: 'Ticket not found' });
    const status = req.body?.status;
    if (!STATUSES.includes(status)) return res.status(400).json({ message: 'Invalid status' });
    if (!isAdmin(req) && status !== 'closed') return res.status(403).json({ message: 'You can only close your ticket' });
    await prisma.ticket.update({
      where: { id: t.id },
      data: { status, closedAt: ['resolved', 'closed'].includes(status) ? new Date() : null },
    });
    if (isAdmin(req) && t.userId !== req.user.sub && status === 'resolved') {
      notify(t.userId, { kind: 'helpdesk', title: `Resolved: ${t.subject}`, body: 'Reply on the ticket if you still need help.', data: { screen: 'Helpdesk' } });
    }
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

module.exports = router;
