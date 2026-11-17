const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const prisma = require('../lib/prisma');
const { requireAuth, requireAuthFile, requireRole } = require('../middleware/auth');
const { can } = require('../lib/permissions');
const { notify } = require('../lib/notify');
const { getPayrollSettings } = require('../lib/payrollSettings');
const router = express.Router();
const ADMIN = 'Admin';
// Recruitment admin = Admin or the 'recruitment' permission (via requireRole + mount path).
const recruiter = requireRole(ADMIN);

const STAGES = ['applied', 'screening', 'interview', 'offered', 'hired', 'rejected'];
const SOURCES = ['Referral', 'Job portal', 'Walk-in', 'Website', 'Agency', 'Campus', 'Other'];
const USER_SEL = { select: { id: true, fullName: true, username: true } };
const nameOf = (u) => u?.fullName || u?.username || '—';

/* Resumes live with the other private files, never under the public /uploads. */
const RESUME_DIR = path.join(__dirname, '..', 'private_uploads', 'resumes');
fs.mkdirSync(RESUME_DIR, { recursive: true });
const RESUME_MIME = {
  'application/pdf': '.pdf', 'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'image/jpeg': '.jpg', 'image/png': '.png',
};
const resumeUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, RESUME_DIR),
    filename: (req, file, cb) => cb(null, crypto.randomBytes(16).toString('hex') + RESUME_MIME[file.mimetype]),
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => (RESUME_MIME[file.mimetype] ? cb(null, true) : cb(new Error('Resume must be PDF, Word or an image'))),
}).single('resume');

// Resume and offer letter open in a browser tab (token as ?t=) and carry their
// own requireAuthFile; everything else needs the normal bearer token.
router.use((req, res, next) => (/\/(resume|offer-letter)$/.test(req.path) ? next() : requireAuth(req, res, next)));

router.get('/meta', (req, res) => res.json({ stages: STAGES, sources: SOURCES }));

/* ==================== INTERVIEWERS (any employee) ==================== */

// GET /api/recruitment/interviews/my — interviews I'm on, upcoming first.
router.get('/interviews/my', async (req, res) => {
  try {
    const rows = await prisma.interview.findMany({
      where: { interviewerId: req.user.sub, status: { not: 'cancelled' } },
      orderBy: { scheduledAt: 'asc' },
      include: { candidate: { select: { id: true, name: true, experienceYears: true, resumePath: true, job: { select: { title: true } } } } },
      take: 100,
    });
    res.json({
      interviews: rows.map((r) => ({
        ...r,
        candidate: { id: r.candidate.id, name: r.candidate.name, experienceYears: r.candidate.experienceYears, jobTitle: r.candidate.job.title, hasResume: !!r.candidate.resumePath },
      })),
      pending: rows.filter((r) => r.status === 'scheduled').length,
    });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// POST /api/recruitment/interviews/:id/feedback — { rating 1-5, recommendation, feedback } (the interviewer only)
router.post('/interviews/:id/feedback', async (req, res) => {
  try {
    const iv = await prisma.interview.findUnique({ where: { id: Number(req.params.id) }, include: { candidate: true } });
    if (!iv || iv.interviewerId !== req.user.sub) return res.status(404).json({ message: 'Interview not found' });
    if (iv.status === 'cancelled') return res.status(409).json({ message: 'This interview was cancelled' });
    const rating = Number(req.body?.rating);
    const recommendation = ['hire', 'hold', 'reject'].includes(req.body?.recommendation) ? req.body.recommendation : null;
    const feedback = String(req.body?.feedback || '').trim().slice(0, 2000);
    if (!(rating >= 1 && rating <= 5)) return res.status(400).json({ message: 'Rate the candidate 1 to 5' });
    if (!recommendation) return res.status(400).json({ message: 'Choose hire, hold or reject' });
    if (!feedback) return res.status(400).json({ message: 'Write your feedback' });
    await prisma.interview.update({ where: { id: iv.id }, data: { rating, recommendation, feedback, status: 'done' } });
    const me = await prisma.user.findUnique({ where: { id: req.user.sub }, ...USER_SEL });
    const { idsWithPermission } = require('../lib/permissions');
    notify((await idsWithPermission('recruitment')).filter((id) => id !== req.user.sub), {
      kind: 'recruitment', title: `Feedback: ${iv.candidate.name} (${iv.round})`,
      body: `${nameOf(me)} → ${recommendation.toUpperCase()} · ${rating}/5`, data: { screen: 'Recruitment' },
    });
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

/* ==================== JOBS ==================== */

router.get('/jobs', recruiter, async (req, res) => {
  try {
    const [jobs, counts] = await Promise.all([
      prisma.jobOpening.findMany({ orderBy: [{ status: 'asc' }, { createdAt: 'desc' }] }),
      prisma.candidate.groupBy({ by: ['jobId', 'stage'], _count: true }),
    ]);
    res.json({
      jobs: jobs.map((j) => ({
        ...j,
        pipeline: Object.fromEntries(STAGES.map((s) => [s, counts.find((c) => c.jobId === j.id && c.stage === s)?._count || 0])),
      })),
    });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

function cleanJob(b) {
  const title = String(b?.title || '').trim().slice(0, 120);
  if (!title) return { error: 'Enter the job title' };
  const openings = Math.max(1, Math.min(500, Number(b.openings) || 1));
  return {
    data: {
      title, openings,
      department: String(b.department || '').trim().slice(0, 80) || null,
      branchId: Number(b.branchId) || null,
      description: String(b.description || '').trim().slice(0, 5000) || null,
      ...(['open', 'on_hold', 'closed'].includes(b.status) ? { status: b.status } : {}),
    },
  };
}

router.post('/jobs', recruiter, async (req, res) => {
  try {
    const c = cleanJob(req.body);
    if (c.error) return res.status(400).json({ message: c.error });
    res.status(201).json(await prisma.jobOpening.create({ data: { ...c.data, createdById: req.user.sub } }));
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

router.patch('/jobs/:id', recruiter, async (req, res) => {
  try {
    const c = cleanJob(req.body);
    if (c.error) return res.status(400).json({ message: c.error });
    res.json(await prisma.jobOpening.update({ where: { id: Number(req.params.id) }, data: c.data }));
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ message: 'Job not found' });
    console.error(e); res.status(500).json({ message: 'Server error' });
  }
});

/* ==================== CANDIDATES ==================== */

router.get('/jobs/:id/candidates', recruiter, async (req, res) => {
  try {
    const rows = await prisma.candidate.findMany({
      where: { jobId: Number(req.params.id) }, orderBy: { updatedAt: 'desc' },
      include: { interviews: { select: { status: true, rating: true, recommendation: true } } },
    });
    res.json({
      candidates: rows.map(({ interviews, resumePath, ...c }) => {
        const rated = interviews.filter((i) => i.rating);
        return {
          ...c, hasResume: !!resumePath, interviewCount: interviews.length,
          avgRating: rated.length ? Math.round((rated.reduce((s, i) => s + i.rating, 0) / rated.length) * 10) / 10 : null,
        };
      }),
    });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

const num = (v) => (v === '' || v == null ? null : Number.isFinite(Number(v)) ? Number(v) : null);
function cleanCandidate(b, partial = false) {
  const data = {};
  if (!partial || b.name !== undefined) {
    const name = String(b.name || '').trim().slice(0, 100);
    if (!name) return { error: 'Enter the candidate name' };
    data.name = name;
  }
  for (const k of ['email', 'phone', 'notes', 'joiningDate']) if (b[k] !== undefined) data[k] = String(b[k] || '').trim().slice(0, k === 'notes' ? 3000 : 120) || null;
  if (b.source !== undefined) data.source = SOURCES.includes(b.source) ? b.source : null;
  for (const k of ['experienceYears', 'currentCtc', 'expectedCtc', 'offeredCtc']) if (b[k] !== undefined) data[k] = num(b[k]);
  if (b.noticeDays !== undefined) data.noticeDays = num(b.noticeDays) == null ? null : Math.round(num(b.noticeDays));
  if (b.stage !== undefined) {
    if (!STAGES.includes(b.stage) || b.stage === 'hired') return { error: 'Use Hire to mark a candidate as hired' };
    data.stage = b.stage;
  }
  return { data };
}

// POST /api/recruitment/candidates — multipart (resume optional) or JSON; needs jobId.
router.post('/candidates', recruiter, (req, res) => {
  resumeUpload(req, res, async (err) => {
    const discard = () => req.file && fs.unlink(req.file.path, () => {});
    if (err) return res.status(400).json({ message: err.code === 'LIMIT_FILE_SIZE' ? 'Resume is too large (max 8 MB)' : err.message });
    try {
      const jobId = Number(req.body?.jobId);
      if (!jobId || !(await prisma.jobOpening.findUnique({ where: { id: jobId } }))) { discard(); return res.status(400).json({ message: 'Pick the job opening' }); }
      const c = cleanCandidate(req.body || {});
      if (c.error) { discard(); return res.status(400).json({ message: c.error }); }
      const cand = await prisma.candidate.create({
        data: { ...c.data, jobId, ...(req.file ? { resumePath: path.basename(req.file.path), resumeMime: req.file.mimetype } : {}) },
      });
      res.status(201).json(cand);
    } catch (e) { discard(); console.error(e); res.status(500).json({ message: 'Server error' }); }
  });
});

router.get('/candidates/:id', recruiter, async (req, res) => {
  try {
    const c = await prisma.candidate.findUnique({
      where: { id: Number(req.params.id) },
      include: { job: true, interviews: { orderBy: { scheduledAt: 'asc' } } },
    });
    if (!c) return res.status(404).json({ message: 'Candidate not found' });
    const ids = [...new Set(c.interviews.map((i) => i.interviewerId))];
    const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, ...USER_SEL }) : [];
    const um = new Map(users.map((u) => [u.id, nameOf(u)]));
    const { resumePath, ...rest } = c;
    res.json({ ...rest, hasResume: !!resumePath, interviews: c.interviews.map((i) => ({ ...i, interviewer: um.get(i.interviewerId) || '—' })) });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

router.patch('/candidates/:id', recruiter, async (req, res) => {
  try {
    const cur = await prisma.candidate.findUnique({ where: { id: Number(req.params.id) } });
    if (!cur) return res.status(404).json({ message: 'Candidate not found' });
    if (cur.stage === 'hired') return res.status(409).json({ message: 'This candidate is already hired' });
    const c = cleanCandidate(req.body || {}, true);
    if (c.error) return res.status(400).json({ message: c.error });
    res.json(await prisma.candidate.update({ where: { id: cur.id }, data: c.data }));
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// GET /api/recruitment/candidates/:id/resume — recruiters, or an interviewer of this candidate.
router.get('/candidates/:id/resume', requireAuthFile, async (req, res) => {
  try {
    const c = await prisma.candidate.findUnique({ where: { id: Number(req.params.id) } });
    if (!c?.resumePath) return res.status(404).json({ message: 'No resume' });
    const interviewer = await prisma.interview.findFirst({ where: { candidateId: c.id, interviewerId: req.user.sub } });
    if (!can(req, 'recruitment') && !interviewer) return res.status(404).json({ message: 'No resume' });
    const abs = path.join(RESUME_DIR, path.basename(c.resumePath));
    if (!fs.existsSync(abs)) return res.status(404).json({ message: 'File missing on the server' });
    res.setHeader('Content-Type', c.resumeMime || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${c.name.replace(/[^\w .-]/g, '_')}_resume${path.extname(abs)}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.sendFile(abs);
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

/* ==================== INTERVIEWS (recruiter side) ==================== */

// POST /api/recruitment/candidates/:id/interviews — { interviewerId, scheduledAt (ISO), round, mode }
router.post('/candidates/:id/interviews', recruiter, async (req, res) => {
  try {
    const c = await prisma.candidate.findUnique({ where: { id: Number(req.params.id) }, include: { job: true } });
    if (!c) return res.status(404).json({ message: 'Candidate not found' });
    const interviewerId = Number(req.body?.interviewerId);
    const who = interviewerId ? await prisma.user.findUnique({ where: { id: interviewerId } }) : null;
    if (!who?.isActive) return res.status(400).json({ message: 'Pick an interviewer' });
    const at = new Date(req.body?.scheduledAt);
    if (Number.isNaN(at.getTime())) return res.status(400).json({ message: 'Pick the interview date and time' });
    const round = String(req.body?.round || '').trim().slice(0, 60) || 'Interview';
    const mode = ['In person', 'Phone', 'Video'].includes(req.body?.mode) ? req.body.mode : 'In person';
    const iv = await prisma.interview.create({ data: { candidateId: c.id, interviewerId, scheduledAt: at, round, mode } });
    if (['applied', 'screening'].includes(c.stage)) await prisma.candidate.update({ where: { id: c.id }, data: { stage: 'interview' } });
    const when = at.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
    notify(interviewerId, {
      kind: 'recruitment', title: `Interview: ${c.name} for ${c.job.title}`,
      body: `${round} · ${mode} · ${when}`, data: { screen: 'Interviews' },
    });
    res.status(201).json(iv);
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

router.patch('/interviews/:id', recruiter, async (req, res) => {
  try {
    const data = {};
    if (req.body?.status === 'cancelled') data.status = 'cancelled';
    if (req.body?.scheduledAt) {
      const at = new Date(req.body.scheduledAt);
      if (Number.isNaN(at.getTime())) return res.status(400).json({ message: 'Invalid date' });
      data.scheduledAt = at;
    }
    res.json(await prisma.interview.update({ where: { id: Number(req.params.id) }, data }));
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ message: 'Interview not found' });
    console.error(e); res.status(500).json({ message: 'Server error' });
  }
});

/* ==================== OFFER & HIRE ==================== */

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

// GET /api/recruitment/candidates/:id/offer-letter — printable (token as ?t=).
router.get('/candidates/:id/offer-letter', requireAuthFile, async (req, res) => {
  try {
    if (!can(req, 'recruitment')) return res.status(403).send('Not allowed');
    const c = await prisma.candidate.findUnique({ where: { id: Number(req.params.id) }, include: { job: true } });
    if (!c) return res.status(404).send('Candidate not found');
    if (!c.offeredCtc || !c.joiningDate) return res.status(400).send('Set the offered CTC and joining date on the candidate first.');
    const { company } = await getPayrollSettings();
    const today = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
    const join = new Date(`${c.joiningDate}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'");
    res.send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Offer letter — ${esc(c.name)}</title><style>
body{font-family:Georgia,serif;color:#1e293b;margin:0;background:#f1f5f9}.page{max-width:780px;margin:24px auto;background:#fff;padding:48px 56px;min-height:900px}
.lh{border-bottom:3px solid #1e3a8a;padding-bottom:12px;margin-bottom:28px}.lh h1{font-family:system-ui,Arial;font-size:22px;margin:0;color:#1e3a8a}.lh div{font-size:13px;color:#64748b}
p{font-size:15px;line-height:1.7;text-align:justify}h2{text-align:center;font-size:17px;letter-spacing:1px}.sign{margin-top:56px}
.print{position:fixed;right:16px;bottom:16px;background:#1e3a8a;color:#fff;border:0;border-radius:10px;padding:12px 18px;font-weight:700;cursor:pointer;font-family:system-ui}
@media print{body{background:#fff}.page{margin:0}.print{display:none}}</style></head><body><div class="page">
<div class="lh"><h1>${esc(company.name)}</h1>${company.address ? `<div>${esc(company.address)}</div>` : ''}</div>
<p style="text-align:right">Date: ${today}</p>
<p>Dear <b>${esc(c.name)}</b>,</p><h2>OFFER OF EMPLOYMENT</h2>
<p>We are pleased to offer you the position of <b>${esc(c.job.title)}</b>${c.job.department ? ` in our ${esc(c.job.department)} department` : ''} at ${esc(company.name)}.</p>
<p>Your annual cost to company will be <b>${inr(c.offeredCtc)}</b>, and your expected date of joining is <b>${join}</b>. A detailed salary break-up and appointment letter will be issued on joining.</p>
<p>This offer is subject to verification of your documents and references. Please confirm your acceptance by signing and returning a copy of this letter.</p>
<p>We look forward to welcoming you to the team.</p>
<div class="sign">For <b>${esc(company.name)}</b><br><br><br>Authorised Signatory</div>
<p style="margin-top:48px">Accepted by: ____________________ &nbsp; Date: ____________</p>
</div><button class="print" onclick="window.print()">Print / Save as PDF</button></body></html>`);
  } catch (e) { console.error(e); res.status(500).send('Server error'); }
});

/* POST /api/recruitment/candidates/:id/hire — { username, joiningDate }
 * Creates the employee (role "Employee Self Login", next SESS-nnn ID, random
 * password — they sign in on the app with email + OTP/PIN). */
router.post('/candidates/:id/hire', recruiter, async (req, res) => {
  try {
    const c = await prisma.candidate.findUnique({ where: { id: Number(req.params.id) }, include: { job: true } });
    if (!c) return res.status(404).json({ message: 'Candidate not found' });
    if (c.stage === 'hired') return res.status(409).json({ message: 'Already hired' });
    const username = String(req.body?.username || '').trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,30}$/.test(username)) return res.status(400).json({ message: 'Username: 3–30 letters, digits, dot, dash or underscore' });
    if (await prisma.user.findUnique({ where: { username } })) return res.status(409).json({ message: 'Username already exists' });
    const joiningDate = /^\d{4}-\d{2}-\d{2}$/.test(req.body?.joiningDate || '') ? req.body.joiningDate : c.joiningDate;
    if (!joiningDate) return res.status(400).json({ message: 'Set the joining date' });
    const email = c.email ? c.email.toLowerCase() : null;
    if (email && (await prisma.user.findFirst({ where: { email } }))) return res.status(409).json({ message: 'An employee already uses this email' });
    const phone = (c.phone || '').replace(/\D/g, '');
    const phoneOk = phone.length === 10 && !(await prisma.user.findUnique({ where: { phone } }));
    const role = await prisma.role.upsert({ where: { name: 'Employee Self Login' }, update: {}, create: { name: 'Employee Self Login' } });
    const { nextEmployeeId } = require('./users');
    let user = null;
    for (let i = 0; i < 5 && !user; i++) {
      try {
        user = await prisma.user.create({
          data: {
            username, fullName: c.name, email, phone: phoneOk ? phone : null,
            passwordHash: await bcrypt.hash(crypto.randomBytes(18).toString('base64'), 10),
            roleId: role.id, employeeId: await nextEmployeeId(),
            designation: c.job.title, department: c.job.department, branchId: c.job.branchId,
            dateOfJoining: new Date(`${joiningDate}T00:00:00.000Z`), employmentType: 'Permanent',
            salaryCtc: c.offeredCtc || null,
          },
          select: { id: true, username: true, employeeId: true, fullName: true },
        });
      } catch (e) {
        if (!(e.code === 'P2002' && String(e.meta?.target || '').includes('employee'))) throw e;
      }
    }
    await prisma.candidate.update({ where: { id: c.id }, data: { stage: 'hired', hiredUserId: user.id, joiningDate } });
    res.status(201).json({ user, emailOnFile: !!email });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

module.exports = router;
