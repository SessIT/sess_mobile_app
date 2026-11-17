const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const prisma = require('../lib/prisma');
const { requireAuth, requireAuthFile, requireRole } = require('../middleware/auth');
const { notify } = require('../lib/notify');
const { getPayrollSettings } = require('../lib/payrollSettings');
const { COMPONENTS, fixedGrossOf } = require('../lib/payroll');
const { inWords } = require('./payroll');
const router = express.Router();
const ADMIN = 'Admin';
const { can } = require('../lib/permissions');
const isAdmin = (req) => can(req, 'documents'); // Admin, or a role holding this area's permission

/* ==================== EMPLOYEE DOCUMENTS ====================
 * Stored under backend/private_uploads (NOT the public /uploads tree) with
 * random names, and only ever served through GET /:id/file, which checks the
 * caller owns the document or is an admin. */
const PRIVATE_DIR = path.join(__dirname, '..', 'private_uploads', 'documents');
fs.mkdirSync(PRIVATE_DIR, { recursive: true });

const CATEGORIES = ['ID proof', 'Address proof', 'PAN card', 'Education', 'Previous employment', 'Offer / appointment letter', 'Bank proof', 'Photo', 'Other'];
const EXT_BY_MIME = {
  'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/heic': '.heic',
};
// Some pickers send a generic type; fall back to an allowlisted extension.
const MIME_BY_EXT = { '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.heic': 'image/heic' };
const mimeOf = (file) => {
  const m = String(file.mimetype || '').toLowerCase();
  if (EXT_BY_MIME[m]) return m;
  return MIME_BY_EXT[path.extname(file.originalname || '').toLowerCase()] || null;
};

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, PRIVATE_DIR),
    filename: (req, file, cb) => cb(null, crypto.randomBytes(16).toString('hex') + EXT_BY_MIME[mimeOf(file)]),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => (mimeOf(file) ? cb(null, true) : cb(new Error('Upload a PDF or a photo (JPG, PNG, WEBP, HEIC)'))),
});

router.get('/categories', requireAuth, (req, res) => res.json(CATEGORIES));

const listFor = (userId) => prisma.employeeDocument.findMany({
  where: { userId }, orderBy: { createdAt: 'desc' },
  select: { id: true, userId: true, category: true, title: true, mimeType: true, uploadedById: true, createdAt: true },
});

router.get('/my', requireAuth, async (req, res) => {
  try { res.json({ documents: await listFor(req.user.sub) }); } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

router.get('/user/:userId', requireAuth, requireRole(ADMIN), async (req, res) => {
  try { res.json({ documents: await listFor(Number(req.params.userId)) }); } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// POST /api/documents — multipart: file + category + title (+ userId for admins).
router.post('/', requireAuth, (req, res) => {
  upload.single('file')(req, res, async (err) => {
    const discard = () => req.file && fs.unlink(req.file.path, () => {});
    if (err) {
      return res.status(400).json({ message: err.code === 'LIMIT_FILE_SIZE' ? 'File is too large (max 10 MB)' : err.message || 'Upload failed' });
    }
    try {
      if (!req.file) return res.status(400).json({ message: 'Choose a file' });
      const targetId = isAdmin(req) && Number(req.body?.userId) ? Number(req.body.userId) : req.user.sub;
      const target = await prisma.user.findUnique({ where: { id: targetId }, select: { id: true } });
      if (!target) { discard(); return res.status(404).json({ message: 'Employee not found' }); }
      const category = CATEGORIES.includes(req.body?.category) ? req.body.category : 'Other';
      const title = String(req.body?.title || '').trim().slice(0, 100) || category;
      const doc = await prisma.employeeDocument.create({
        data: { userId: targetId, category, title, filePath: path.basename(req.file.path), mimeType: mimeOf(req.file), uploadedById: req.user.sub },
      });
      if (targetId !== req.user.sub) {
        notify(targetId, { kind: 'document', title: `New document: ${title}`, body: `HR added a ${category} document to your profile.`, data: { screen: 'MyDocuments' } });
      }
      const { filePath, ...out } = doc;
      res.status(201).json(out);
    } catch (e) { discard(); console.error(e); res.status(500).json({ message: 'Server error' }); }
  });
});

async function readableDoc(req) {
  const d = await prisma.employeeDocument.findUnique({ where: { id: Number(req.params.id) } });
  if (!d) return null;
  return d.userId === req.user.sub || isAdmin(req) ? d : null;
}

// GET /api/documents/:id/file — the file itself (token as header or ?t=).
router.get('/:id/file', requireAuthFile, async (req, res) => {
  try {
    const d = await readableDoc(req);
    if (!d) return res.status(404).json({ message: 'Document not found' });
    const abs = path.join(PRIVATE_DIR, path.basename(d.filePath));
    if (!fs.existsSync(abs)) return res.status(404).json({ message: 'File is missing on the server' });
    const safeName = `${d.title.replace(/[^\w .-]/g, '_')}${path.extname(abs)}`;
    res.setHeader('Content-Type', d.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'");
    res.setHeader('Cache-Control', 'private, no-store');
    res.sendFile(abs);
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// DELETE /api/documents/:id — admin, or the employee for a file they uploaded.
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const d = await readableDoc(req);
    if (!d) return res.status(404).json({ message: 'Document not found' });
    if (!isAdmin(req) && d.uploadedById !== req.user.sub)
      return res.status(403).json({ message: 'Documents added by HR can only be removed by HR' });
    await prisma.employeeDocument.delete({ where: { id: d.id } });
    fs.unlink(path.join(PRIVATE_DIR, path.basename(d.filePath)), () => {});
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

/* ==================== HR LETTERS (printable) ==================== */

const LETTERS = {
  employment: { title: 'Employment certificate', needsExit: false },
  salary: { title: 'Salary certificate', needsExit: false },
  appointment: { title: 'Appointment letter', needsExit: false },
  experience: { title: 'Experience letter', needsExit: true },
  relieving: { title: 'Relieving letter', needsExit: true },
};

router.get('/letters/types', requireAuth, requireRole(ADMIN), (req, res) =>
  res.json(Object.entries(LETTERS).map(([key, v]) => ({ key, ...v }))));

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const longDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '—');

function letterBody(type, u, co, salary) {
  const name = `<b>${esc(u.fullName || u.username)}</b>`;
  const idPart = u.employeeId ? ` (Employee ID: ${esc(u.employeeId)})` : '';
  const role = esc(u.designation || 'a member of staff');
  const dept = u.department ? ` in the ${esc(u.department)} department` : '';
  const company = `<b>${esc(co.name)}</b>`;
  switch (type) {
    case 'employment':
      return `<h2>TO WHOM IT MAY CONCERN</h2>
<p>This is to certify that ${name}${idPart} is employed with ${company} as ${role}${dept} since ${longDate(u.dateOfJoining)}.</p>
<p>This certificate is issued at the request of the employee for whatever purpose it may serve.</p>`;
    case 'salary': {
      if (!salary) return null;
      const rows = COMPONENTS.filter(([k]) => salary[k]).map(([k, label]) => `<tr><td>${label}</td><td class="n">${inr(salary[k])}</td></tr>`).join('');
      const gross = fixedGrossOf(salary);
      return `<h2>SALARY CERTIFICATE</h2>
<p>This is to certify that ${name}${idPart} is employed with ${company} as ${role}${dept} since ${longDate(u.dateOfJoining)},
and is drawing a gross monthly salary of <b>${inr(gross)}</b> (${esc(inWords(gross))}), i.e. <b>${inr(gross * 12)}</b> per annum, as detailed below.</p>
<table><thead><tr><th>Component</th><th class="n">Monthly</th></tr></thead><tbody>${rows}
<tr class="t"><td>Gross</td><td class="n">${inr(gross)}</td></tr></tbody></table>
<p>This certificate is issued at the request of the employee.</p>`;
    }
    case 'appointment':
      return `<p>Dear ${name},</p>
<h2>LETTER OF APPOINTMENT</h2>
<p>We are pleased to confirm your appointment with ${company} as <b>${role}</b>${dept}, effective ${longDate(u.dateOfJoining)}.</p>
${u.salaryCtc ? `<p>Your annual cost to company will be <b>${inr(u.salaryCtc)}</b> (${esc(inWords(u.salaryCtc))}), subject to statutory deductions.</p>` : ''}
<p>Your employment is governed by the company's policies and service rules as amended from time to time.
${u.employmentType ? `Your employment type is <b>${esc(u.employmentType)}</b>.` : ''}</p>
<p>We welcome you to the team and look forward to a long association.</p>`;
    case 'experience':
      return `<h2>EXPERIENCE CERTIFICATE</h2>
<p>This is to certify that ${name}${idPart} worked with ${company} as ${role}${dept} from ${longDate(u.dateOfJoining)} to ${longDate(u.exitDate)}.</p>
<p>During this tenure we found them sincere and dedicated to their responsibilities. We wish them every success in their future endeavours.</p>`;
    case 'relieving':
      return `<p>Dear ${name},</p>
<h2>RELIEVING LETTER</h2>
<p>With reference to your resignation, we confirm that you have been relieved from your duties as ${role} with ${company}
at the close of business hours on ${longDate(u.exitDate)}.</p>
<p>Your tenure with us was from ${longDate(u.dateOfJoining)} to ${longDate(u.exitDate)}. We thank you for your contribution and wish you success ahead.</p>`;
    default:
      return null;
  }
}

// GET /api/documents/letters/:type/:userId/html — printable letter (admin; token as ?t=).
router.get('/letters/:type/:userId/html', requireAuthFile, async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).send('Admins only');
    const meta = LETTERS[req.params.type];
    if (!meta) return res.status(404).send('Unknown letter type');
    const u = await prisma.user.findUnique({ where: { id: Number(req.params.userId) } });
    if (!u) return res.status(404).send('Employee not found');
    if (meta.needsExit && !u.exitDate) return res.status(400).send('This letter needs the employee\'s exit date — complete their exit first.');
    const month = new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 7);
    const [settings, salary] = await Promise.all([
      getPayrollSettings(),
      prisma.salaryStructure.findFirst({ where: { userId: u.id, effectiveFrom: { lte: month } }, orderBy: { effectiveFrom: 'desc' } }),
    ]);
    const body = letterBody(req.params.type, u, settings.company, salary);
    if (!body) return res.status(400).send('Set a salary structure for this employee first (Payroll → Salary structures).');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'");
    res.setHeader('Cache-Control', 'no-store');
    res.send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(meta.title)} — ${esc(u.fullName || u.username)}</title>
<style>
  body{font-family:Georgia,"Times New Roman",serif;color:#1e293b;margin:0;background:#f1f5f9}
  .page{max-width:780px;margin:24px auto;background:#fff;padding:48px 56px;box-shadow:0 1px 3px rgba(0,0,0,.08);min-height:900px}
  .lh{border-bottom:3px solid #1e3a8a;padding-bottom:12px;margin-bottom:28px}
  .lh h1{font-family:system-ui,Arial,sans-serif;font-size:22px;margin:0;color:#1e3a8a} .lh div{font-size:13px;color:#64748b}
  .date{text-align:right;font-size:14px;margin-bottom:24px} h2{font-size:17px;text-align:center;letter-spacing:1px;margin:24px 0}
  p{font-size:15px;line-height:1.7;text-align:justify} table{width:60%;border-collapse:collapse;margin:12px 0;font-size:14px}
  th,td{border:1px solid #cbd5e1;padding:6px 10px;text-align:left} .n{text-align:right} .t td{font-weight:bold}
  .sign{margin-top:64px;font-size:15px} .print{position:fixed;right:16px;bottom:16px;background:#1e3a8a;color:#fff;border:0;border-radius:10px;padding:12px 18px;font-weight:700;cursor:pointer;font-family:system-ui}
  @media print{body{background:#fff}.page{box-shadow:none;margin:0;max-width:none}.print{display:none}}
</style></head><body><div class="page">
<div class="lh"><h1>${esc(settings.company.name)}</h1>${settings.company.address ? `<div>${esc(settings.company.address)}</div>` : ''}</div>
<div class="date">Date: ${longDate(new Date())}</div>
${body}
<div class="sign">For <b>${esc(settings.company.name)}</b><br><br><br>Authorised Signatory</div>
</div><button class="print" onclick="window.print()">Print / Save as PDF</button></body></html>`);
  } catch (e) { console.error(e); res.status(500).send('Server error'); }
});

module.exports = router;
