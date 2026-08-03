const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const prisma = require('../lib/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');
const router = express.Router();

const ADMIN = 'Technical Director / Admin';
const BODY_MAX = 2000;

router.use(requireAuth);

const AUTHOR_SELECT = { select: { id: true, fullName: true, username: true } };

/* ---------------- photo upload (self notes only) ---------------- */
const NOTE_DIR = path.join(__dirname, '..', 'uploads', 'notes');
fs.mkdirSync(NOTE_DIR, { recursive: true });

const EXT_BY_MIME = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp',
  'image/gif': '.gif', 'image/heic': '.heic',
};
const IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic'];
const extOf = (file) =>
  EXT_BY_MIME[file.mimetype] || path.extname(file.originalname || '').toLowerCase().slice(0, 6);

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, NOTE_DIR),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${extOf(file) || '.jpg'}`),
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    // Photos only — a note is not a media gallery.
    if (/^image\//.test(file.mimetype) || IMAGE_EXT.includes(extOf(file))) return cb(null, true);
    cb(new Error('Only photos can be attached to a note'));
  },
});

// POST /api/notes/upload — multipart "file" -> { path } for POST /api/notes
router.post('/upload', (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Photo is too large (max 10 MB)' : err.message || 'Upload failed';
      return res.status(400).json({ message: msg });
    }
    if (!req.file) return res.status(400).json({ message: 'No file received' });
    res.status(201).json({ path: 'uploads/notes/' + req.file.filename });
  });
});

/* ---------------- employee side ---------------- */

// GET /api/notes — my notes: own self notes + admin notices addressed to me.
router.get('/', async (req, res) => {
  try {
    const notes = await prisma.note.findMany({
      where: { userId: req.user.sub },
      orderBy: { id: 'desc' },
      take: 200,
      include: { author: AUTHOR_SELECT },
    });
    res.json({
      notes: notes.map((n) => ({
        id: n.id,
        kind: n.kind,
        body: n.body,
        photo: n.photo,
        readAt: n.readAt,
        createdAt: n.createdAt,
        // Only meaningful for admin notices; self notes are authored by the owner.
        from: n.kind === 'admin' ? (n.author?.fullName || n.author?.username || 'Admin') : null,
      })),
    });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// GET /api/notes/unread-count — unread admin notices (badge on the Notes tile)
router.get('/unread-count', async (req, res) => {
  try {
    const count = await prisma.note.count({
      where: { userId: req.user.sub, kind: 'admin', readAt: null },
    });
    res.json({ count });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// PATCH /api/notes/read — mark every admin notice of mine as read
router.patch('/read', async (req, res) => {
  try {
    const r = await prisma.note.updateMany({
      where: { userId: req.user.sub, kind: 'admin', readAt: null },
      data: { readAt: new Date() },
    });
    res.json({ updated: r.count });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// POST /api/notes — take a self note { body, photo? }
router.post('/', async (req, res) => {
  try {
    const body = String(req.body?.body ?? '').trim();
    const photo = req.body?.photo ? String(req.body.photo) : null;

    if (!body && !photo) return res.status(400).json({ message: 'Write something first' });
    if (body.length > BODY_MAX) return res.status(400).json({ message: `Note is too long (max ${BODY_MAX} characters)` });
    // A photo path must come from OUR upload endpoint and actually exist.
    if (photo) {
      if (!/^uploads\/notes\/[\w.-]+$/.test(photo))
        return res.status(400).json({ message: 'Invalid photo' });
      if (!fs.existsSync(path.join(__dirname, '..', photo)))
        return res.status(400).json({ message: 'Photo not found — upload it first' });
    }

    const note = await prisma.note.create({
      data: { userId: req.user.sub, authorId: req.user.sub, kind: 'self', body, photo },
    });
    res.status(201).json({ ...note, from: null });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// PATCH /api/notes/:id — edit one of MY self notes (admin notices are read-only)
router.patch('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = String(req.body?.body ?? '').trim();
    if (!Number.isInteger(id)) return res.status(400).json({ message: 'Invalid note' });
    if (!body) return res.status(400).json({ message: 'Note cannot be empty' });
    if (body.length > BODY_MAX) return res.status(400).json({ message: `Note is too long (max ${BODY_MAX} characters)` });

    const note = await prisma.note.findUnique({ where: { id } });
    if (!note || note.userId !== req.user.sub) return res.status(404).json({ message: 'Note not found' });
    if (note.kind !== 'self') return res.status(403).json({ message: 'Admin notes cannot be edited' });

    const updated = await prisma.note.update({ where: { id }, data: { body } });
    res.json(updated);
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// DELETE /api/notes/:id — delete one of MY self notes (admin notices stay)
router.delete('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ message: 'Invalid note' });

    const note = await prisma.note.findUnique({ where: { id } });
    if (!note || note.userId !== req.user.sub) return res.status(404).json({ message: 'Note not found' });
    if (note.kind !== 'self') return res.status(403).json({ message: 'Notes from admin cannot be deleted' });

    await prisma.note.delete({ where: { id } });
    if (note.photo) fs.promises.unlink(path.join(__dirname, '..', note.photo)).catch(() => {});
    res.json({ deleted: id });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

/* ---------------- admin side (one-way notices) ---------------- */

// POST /api/notes/send — admin -> employee(s). { userIds: [1,2] | userId: 1, body }
router.post('/send', requireRole(ADMIN), async (req, res) => {
  try {
    const raw = Array.isArray(req.body?.userIds)
      ? req.body.userIds
      : req.body?.userId !== undefined ? [req.body.userId] : [];
    const ids = [...new Set(raw.map(Number).filter(Number.isInteger))];
    const body = String(req.body?.body ?? '').trim();

    if (!ids.length) return res.status(400).json({ message: 'Choose at least one employee' });
    if (!body) return res.status(400).json({ message: 'Write the note first' });
    if (body.length > BODY_MAX) return res.status(400).json({ message: `Note is too long (max ${BODY_MAX} characters)` });

    const valid = await prisma.user.findMany({
      where: { id: { in: ids }, isActive: true },
      select: { id: true },
    });
    if (!valid.length) return res.status(400).json({ message: 'No active employee matched' });

    await prisma.note.createMany({
      data: valid.map((u) => ({ userId: u.id, authorId: req.user.sub, kind: 'admin', body })),
    });
    res.status(201).json({ sent: valid.length });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// GET /api/notes/sent — notices this admin has sent, newest first
router.get('/sent', requireRole(ADMIN), async (req, res) => {
  try {
    const notes = await prisma.note.findMany({
      where: { kind: 'admin', authorId: req.user.sub },
      orderBy: { id: 'desc' },
      take: 200,
      include: { user: AUTHOR_SELECT },
    });
    res.json({
      notes: notes.map((n) => ({
        id: n.id,
        body: n.body,
        createdAt: n.createdAt,
        readAt: n.readAt,
        to: n.user?.fullName || n.user?.username || 'Employee',
        toId: n.userId,
      })),
    });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// DELETE /api/notes/sent/:id — admin withdraws a notice they sent
router.delete('/sent/:id', requireRole(ADMIN), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ message: 'Invalid note' });

    const note = await prisma.note.findUnique({ where: { id } });
    if (!note || note.kind !== 'admin' || note.authorId !== req.user.sub)
      return res.status(404).json({ message: 'Note not found' });

    await prisma.note.delete({ where: { id } });
    res.json({ deleted: id });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

module.exports = router;
