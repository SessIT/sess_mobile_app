const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const prisma = require('../lib/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');
const router = express.Router();
const ADMIN = 'Technical Director / Admin';

router.use(requireAuth);

const EXPENSE_TYPES = ['Travel', 'Food & Meals', 'Office Supplies', 'Client Entertainment', 'Stationery', 'Other'];
const STATUSES = ['pending', 'approved', 'rejected', 'cancelled'];
const DETAILS_MAX = 500;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

// createdAt is a real timestamp, so an IST calendar month runs from IST
// midnight on the 1st to IST midnight on the 1st of the next month.
function monthRangeIST(month) {
  const [y, m] = month.split('-').map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  return { from: new Date(`${month}-01T00:00:00+05:30`), to: new Date(`${next}-01T00:00:00+05:30`) };
}

const includeUser = {
  user: { select: { id: true, username: true, fullName: true } },
  reviewedBy: { select: { fullName: true, username: true } },
};

// Every row leaves through here so the employee and admin lists agree on shape.
const shape = (r) => ({
  id: r.id,
  type: r.type,
  details: r.details,
  billPath: r.billPath,
  status: r.status,
  reviewNote: r.reviewNote,
  reviewedAt: r.reviewedAt,
  createdAt: r.createdAt,
  reviewedBy: r.reviewedBy || null,
  ...(r.user ? { user: r.user } : {}),
});

/* ---------------- bill upload ---------------- */
const EXPENSE_DIR = path.join(__dirname, '..', 'uploads', 'expenses');
fs.mkdirSync(EXPENSE_DIR, { recursive: true });

const BILL_PREFIX = 'uploads/expenses/';
const EXT_BY_MIME = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp',
  'image/heic': '.heic', 'application/pdf': '.pdf',
};
const EXT_BY_NAME = {
  '.jpg': '.jpg', '.jpeg': '.jpg', '.png': '.png', '.webp': '.webp', '.heic': '.heic', '.pdf': '.pdf',
};
// Some phone pickers send no usable type, so the filename is the only hint
// left. A part sent with no Content-Type at all reaches us as text/plain —
// busboy's default — so that counts as "generic" too. The extension is still
// allowlisted below, so this widens what we accept, never what we store.
const GENERIC_MIME = ['application/octet-stream', 'binary/octet-stream', 'text/plain'];

// /uploads is served unauthenticated, so the extension decides what a browser
// executes: derive it from the verified mimetype, never from originalname.
// Returns null when the file is not one of the five bill formats.
const extOf = (file) => {
  const mime = String(file.mimetype || '').trim().toLowerCase();
  if (EXT_BY_MIME[mime]) return EXT_BY_MIME[mime];
  if (!GENERIC_MIME.includes(mime)) return null;
  return EXT_BY_NAME[path.extname(file.originalname || '').toLowerCase()] || null;
};

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, EXPENSE_DIR),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${extOf(file) || '.jpg'}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    // A bill is a photo or a PDF — nothing else is worth storing as proof.
    if (extOf(file)) return cb(null, true);
    cb(new Error('A bill must be a photo (JPG, PNG, WEBP, HEIC) or a PDF'));
  },
});

// POST /api/expenses/upload — multipart "file" -> { path } for POST /api/expenses
router.post('/upload', (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Bill is too large (max 5 MB)' : err.message || 'Upload failed';
      return res.status(400).json({ message: msg });
    }
    if (!req.file) return res.status(400).json({ message: 'No file received' });
    res.status(201).json({ path: BILL_PREFIX + req.file.filename });
  });
});

// The client echoes back the path /upload gave it. Accept nothing else, so a
// record can never be pointed at some other file on the server.
function billOrNull(v) {
  const p = String(v || '').trim();
  if (!p.startsWith(BILL_PREFIX)) return null;
  const name = p.slice(BILL_PREFIX.length);
  if (!name || name.includes('/') || name.includes('..')) return null;
  return p;
}

/* ==================== EMPLOYEE (SELF) ==================== */

// GET /api/expenses/types — the dropdown options
router.get('/types', (req, res) => res.json(EXPENSE_TYPES));

// GET /api/expenses/my — my claims, newest first
router.get('/my', async (req, res) => {
  try {
    const userId = req.user.sub;
    const [requests, pending, approved] = await Promise.all([
      prisma.expenseRequest.findMany({
        where: { userId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 200,
        include: { reviewedBy: { select: { fullName: true, username: true } } },
      }),
      prisma.expenseRequest.count({ where: { userId, status: 'pending' } }),
      prisma.expenseRequest.count({ where: { userId, status: 'approved' } }),
    ]);
    res.json({ requests: requests.map(shape), totals: { pending, approved } });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// POST /api/expenses — submit a claim { type, details, bill }
router.post('/', async (req, res) => {
  try {
    const { type, details, bill } = req.body || {};
    if (!EXPENSE_TYPES.includes(type))
      return res.status(400).json({ message: 'Please select an expense type' });

    const detailsTrim = String(details || '').trim();
    if (!detailsTrim)
      return res.status(400).json({ message: 'Please describe what the expense was for' });
    if (detailsTrim.length > DETAILS_MAX)
      return res.status(400).json({ message: `Expense details must be ${DETAILS_MAX} characters or less` });

    const billPath = billOrNull(bill);
    if (!billPath)
      return res.status(400).json({ message: 'Attach the bill or proof for this expense' });

    const created = await prisma.expenseRequest.create({
      data: { userId: req.user.sub, type, details: detailsTrim, billPath, status: 'pending' },
    });
    res.status(201).json(shape(created));
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// DELETE /api/expenses/:id — cancel own pending claim
router.delete('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    // '/:id' is a broad path — a non-numeric segment is simply "not found".
    if (!Number.isInteger(id)) return res.status(404).json({ message: 'Request not found' });
    const row = await prisma.expenseRequest.findUnique({ where: { id } });
    if (!row || row.userId !== req.user.sub)
      return res.status(404).json({ message: 'Request not found' });
    if (row.status !== 'pending')
      return res.status(400).json({ message: 'Only pending requests can be cancelled' });
    await prisma.expenseRequest.update({ where: { id }, data: { status: 'cancelled' } });
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

/* ==================== ADMIN ==================== */

// GET /api/expenses/requests?status=&userId=&month=YYYY-MM (admin) — all claims
router.get('/requests', requireRole(ADMIN), async (req, res) => {
  try {
    const where = {};
    if (STATUSES.includes(req.query.status)) where.status = req.query.status;
    const userId = Number(req.query.userId);
    if (Number.isInteger(userId) && userId > 0) where.userId = userId;
    if (MONTH.test(String(req.query.month || ''))) {
      const { from, to } = monthRangeIST(req.query.month);
      where.createdAt = { gte: from, lt: to };
    }
    const requests = await prisma.expenseRequest.findMany({
      where,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }, { id: 'desc' }],
      take: 500,
      include: includeUser,
    });
    res.json({ requests: requests.map(shape) });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// PATCH /api/expenses/requests/:id/decision (admin) — { status:'approved'|'rejected', reviewNote }
router.patch('/requests/:id/decision', requireRole(ADMIN), async (req, res) => {
  try {
    const id = Number(req.params.id);
    // A non-numeric id is simply "not found" — never a NaN lookup into Prisma.
    if (!Number.isInteger(id)) return res.status(404).json({ message: 'Request not found' });
    const { status, reviewNote } = req.body || {};
    if (!['approved', 'rejected'].includes(status))
      return res.status(400).json({ message: "status must be 'approved' or 'rejected'" });

    const row = await prisma.expenseRequest.findUnique({ where: { id } });
    if (!row) return res.status(404).json({ message: 'Request not found' });
    if (row.status !== 'pending')
      return res.status(400).json({ message: `Request is already ${row.status}` });

    const updated = await prisma.expenseRequest.update({
      where: { id },
      data: {
        status,
        reviewedById: req.user.sub,
        reviewedAt: new Date(),
        reviewNote: (reviewNote || '').trim().slice(0, 500) || null,
      },
      include: includeUser,
    });
    res.json(shape(updated));
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

module.exports = router;
