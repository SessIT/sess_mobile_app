const express = require('express');
const prisma = require('../lib/prisma');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

router.use(requireAuth);

const MSG_MAX = 1000;
const SENDER_SELECT = { select: { id: true, fullName: true, username: true } };

/* ---------------- membership helper ---------------- */
async function myMembership(groupId, userId) {
  return prisma.chatGroupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
  });
}

// GET /api/chat/conversations — DMs + groups, each with unread count and
// last-message preview, sorted newest-conversation first.
router.get('/conversations', async (req, res) => {
  try {
    const me = req.user.sub;

    /* ---- direct messages ---- */
    const [users, unreadGroupsBySender, recentDMs] = await Promise.all([
      prisma.user.findMany({
        where: { isActive: true, id: { not: me } },
        select: { id: true, username: true, fullName: true, designation: true, department: true },
        orderBy: { fullName: 'asc' },
      }),
      prisma.chatMessage.groupBy({
        by: ['senderId'],
        where: { receiverId: me, readAt: null },
        _count: { _all: true },
      }),
      prisma.chatMessage.findMany({
        where: { groupId: null, OR: [{ senderId: me }, { receiverId: me }] },
        orderBy: { id: 'desc' },
        take: 500,
        select: { id: true, senderId: true, receiverId: true, body: true, createdAt: true },
      }),
    ]);
    const dmUnread = new Map(unreadGroupsBySender.map((g) => [g.senderId, g._count._all]));
    const lastByUser = new Map();
    for (const m of recentDMs) {
      const other = m.senderId === me ? m.receiverId : m.senderId;
      if (!lastByUser.has(other)) lastByUser.set(other, m);
    }

    const userConvos = users.map((u) => {
      const last = lastByUser.get(u.id) || null;
      return {
        kind: 'user',
        id: u.id,
        name: u.fullName || u.username,
        username: u.username,
        designation: u.designation,
        department: u.department,
        unread: dmUnread.get(u.id) || 0,
        lastMessage: last
          ? { body: last.body.slice(0, 80), mine: last.senderId === me, at: last.createdAt }
          : null,
      };
    });

    /* ---- groups I belong to ---- */
    const memberships = await prisma.chatGroupMember.findMany({
      where: { userId: me },
      include: { group: { include: { _count: { select: { members: true } } } } },
    });
    const groupConvos = await Promise.all(memberships.map(async (mem) => {
      const [unread, last] = await Promise.all([
        prisma.chatMessage.count({
          where: { groupId: mem.groupId, id: { gt: mem.lastReadId }, senderId: { not: me } },
        }),
        prisma.chatMessage.findFirst({
          where: { groupId: mem.groupId },
          orderBy: { id: 'desc' },
          include: { sender: SENDER_SELECT },
        }),
      ]);
      return {
        kind: 'group',
        id: mem.groupId,
        name: mem.group.name,
        memberCount: mem.group._count.members,
        unread,
        lastMessage: last
          ? {
              body: last.body.slice(0, 80),
              mine: last.senderId === me,
              at: last.createdAt,
              senderName: last.sender?.fullName || last.sender?.username,
            }
          : null,
      };
    }));

    const conversations = [...userConvos, ...groupConvos].sort((a, b) => {
      const at = a.lastMessage ? new Date(a.lastMessage.at).getTime() : 0;
      const bt = b.lastMessage ? new Date(b.lastMessage.at).getTime() : 0;
      if (at !== bt) return bt - at;
      return (a.name || '').localeCompare(b.name || '');
    });

    res.json({ conversations });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// POST /api/chat/groups — { name, memberIds: [] }. Creator is auto-added.
router.post('/groups', async (req, res) => {
  try {
    const me = req.user.sub;
    const name = String(req.body?.name || '').trim().slice(0, 60);
    const memberIds = Array.isArray(req.body?.memberIds)
      ? [...new Set(req.body.memberIds.map(Number).filter((n) => Number.isInteger(n) && n !== me))]
      : [];
    if (!name) return res.status(400).json({ message: 'Group name is required' });
    if (memberIds.length === 0) return res.status(400).json({ message: 'Pick at least one member' });

    const valid = await prisma.user.findMany({
      where: { id: { in: memberIds }, isActive: true },
      select: { id: true },
    });
    if (valid.length === 0) return res.status(400).json({ message: 'No valid members selected' });

    const group = await prisma.chatGroup.create({
      data: {
        name,
        createdById: me,
        members: { create: [{ userId: me }, ...valid.map((v) => ({ userId: v.id }))] },
      },
      include: { _count: { select: { members: true } } },
    });
    res.status(201).json({ id: group.id, name: group.name, memberCount: group._count.members });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// GET /api/chat/unread-count — DM + group unread total (dashboard bell)
router.get('/unread-count', async (req, res) => {
  try {
    const me = req.user.sub;
    const dm = await prisma.chatMessage.count({ where: { receiverId: me, readAt: null } });
    const memberships = await prisma.chatGroupMember.findMany({ where: { userId: me } });
    const groupCounts = await Promise.all(memberships.map((mem) =>
      prisma.chatMessage.count({
        where: { groupId: mem.groupId, id: { gt: mem.lastReadId }, senderId: { not: me } },
      })
    ));
    res.json({ count: dm + groupCounts.reduce((s, c) => s + c, 0) });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// GET /api/chat/thread/:userId[?after=id] — 1:1 thread; marks their msgs read.
router.get('/thread/:userId', async (req, res) => {
  try {
    const me = req.user.sub;
    const other = Number(req.params.userId);
    if (!Number.isInteger(other)) return res.status(400).json({ message: 'Invalid user' });
    const after = Number(req.query.after) || 0;

    const where = {
      groupId: null,
      OR: [
        { senderId: me, receiverId: other },
        { senderId: other, receiverId: me },
      ],
      ...(after ? { id: { gt: after } } : {}),
    };

    let messages;
    if (after) {
      messages = await prisma.chatMessage.findMany({ where, orderBy: { id: 'asc' }, take: 100 });
    } else {
      messages = (await prisma.chatMessage.findMany({ where, orderBy: { id: 'desc' }, take: 50 })).reverse();
    }

    await prisma.chatMessage.updateMany({
      where: { senderId: other, receiverId: me, readAt: null },
      data: { readAt: new Date() },
    });

    res.json({ meId: me, messages });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// GET /api/chat/group-thread/:groupId[?after=id] — group thread (members only);
// advances my read cursor. Messages include the sender for name labels.
router.get('/group-thread/:groupId', async (req, res) => {
  try {
    const me = req.user.sub;
    const groupId = Number(req.params.groupId);
    if (!Number.isInteger(groupId)) return res.status(400).json({ message: 'Invalid group' });
    const mem = await myMembership(groupId, me);
    if (!mem) return res.status(403).json({ message: 'You are not a member of this group' });
    const after = Number(req.query.after) || 0;

    const where = { groupId, ...(after ? { id: { gt: after } } : {}) };
    let messages;
    if (after) {
      messages = await prisma.chatMessage.findMany({
        where, orderBy: { id: 'asc' }, take: 100, include: { sender: SENDER_SELECT },
      });
    } else {
      messages = (await prisma.chatMessage.findMany({
        where, orderBy: { id: 'desc' }, take: 50, include: { sender: SENDER_SELECT },
      })).reverse();
    }

    const maxId = messages.length ? messages[messages.length - 1].id : mem.lastReadId;
    if (maxId > mem.lastReadId) {
      await prisma.chatGroupMember.update({
        where: { groupId_userId: { groupId, userId: me } },
        data: { lastReadId: maxId },
      });
    }

    const [group, meUser] = await Promise.all([
      prisma.chatGroup.findUnique({
        where: { id: groupId },
        include: { _count: { select: { members: true } }, members: { include: { user: SENDER_SELECT } } },
      }),
      prisma.user.findUnique({ where: { id: me }, select: { username: true } }),
    ]);

    res.json({
      meId: me,
      meUsername: meUser?.username || null,
      messages,
      group: group ? {
        id: group.id, name: group.name, memberCount: group._count.members,
        // Full member objects so clients can offer @mention suggestions.
        members: group.members.map((m) => ({
          id: m.user.id, username: m.user.username, fullName: m.user.fullName,
        })),
      } : null,
    });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// POST /api/chat/send — { toUserId, body } for DM, or { groupId, body } for group.
router.post('/send', async (req, res) => {
  try {
    const me = req.user.sub;
    const body = String(req.body?.body ?? '').trim();
    if (!body) return res.status(400).json({ message: 'Message cannot be empty' });

    const groupId = req.body?.groupId != null ? Number(req.body.groupId) : null;
    if (groupId != null) {
      if (!Number.isInteger(groupId)) return res.status(400).json({ message: 'Invalid group' });
      const mem = await myMembership(groupId, me);
      if (!mem) return res.status(403).json({ message: 'You are not a member of this group' });
      const message = await prisma.chatMessage.create({
        data: { senderId: me, groupId, body: body.slice(0, MSG_MAX) },
        include: { sender: SENDER_SELECT },
      });
      // The sender has obviously read their own message.
      await prisma.chatGroupMember.update({
        where: { groupId_userId: { groupId, userId: me } },
        data: { lastReadId: message.id },
      });
      return res.status(201).json(message);
    }

    const toUserId = Number(req.body?.toUserId);
    if (!Number.isInteger(toUserId) || toUserId === me)
      return res.status(400).json({ message: 'Invalid recipient' });
    const to = await prisma.user.findUnique({ where: { id: toUserId }, select: { id: true, isActive: true } });
    if (!to || !to.isActive) return res.status(404).json({ message: 'Recipient not found' });

    const message = await prisma.chatMessage.create({
      data: { senderId: me, receiverId: toUserId, body: body.slice(0, MSG_MAX) },
    });
    res.status(201).json(message);
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

module.exports = router;
