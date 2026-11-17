const express = require('express');
const prisma = require('../lib/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');
const { notify } = require('../lib/notify');
const router = express.Router();
const trainer = requireRole('Admin'); // Admin or the 'training' permission

router.use(requireAuth);

const todayIST = () => new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);

/* ==================== EMPLOYEE ==================== */

// GET /api/training/my — my courses (pending first, then done).
router.get('/my', async (req, res) => {
  try {
    const rows = await prisma.courseAssignment.findMany({
      where: { userId: req.user.sub }, include: { course: true }, orderBy: [{ status: 'asc' }, { assignedAt: 'desc' }],
    });
    const today = todayIST();
    res.json({
      items: rows.map((r) => ({ ...r, overdue: r.status !== 'completed' && !!r.course.dueDate && r.course.dueDate < today })),
      pending: rows.filter((r) => r.status !== 'completed').length,
    });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// POST /api/training/my/:courseId/complete — "I have completed this".
router.post('/my/:courseId/complete', async (req, res) => {
  try {
    const a = await prisma.courseAssignment.findUnique({
      where: { courseId_userId: { courseId: Number(req.params.courseId), userId: req.user.sub } },
    });
    if (!a) return res.status(404).json({ message: 'This course is not assigned to you' });
    if (a.status === 'completed') return res.json({ ok: true, completedAt: a.completedAt });
    const done = await prisma.courseAssignment.update({ where: { id: a.id }, data: { status: 'completed', completedAt: new Date() } });
    res.json({ ok: true, completedAt: done.completedAt });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

/* ==================== ADMIN ==================== */

router.get('/courses', trainer, async (req, res) => {
  try {
    const [courses, counts] = await Promise.all([
      prisma.course.findMany({ orderBy: { createdAt: 'desc' } }),
      prisma.courseAssignment.groupBy({ by: ['courseId', 'status'], _count: true }),
    ]);
    const n = (id, st) => counts.filter((c) => c.courseId === id && (!st || c.status === st)).reduce((s, c) => s + c._count, 0);
    res.json({ courses: courses.map((c) => ({ ...c, assigned: n(c.id), completed: n(c.id, 'completed') })) });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

function clean(b) {
  const title = String(b?.title || '').trim().slice(0, 150);
  if (!title) return { error: 'Enter the course title' };
  const url = String(b.contentUrl || '').trim();
  if (url && !/^https?:\/\//i.test(url)) return { error: 'The content link must start with http:// or https://' };
  const due = String(b.dueDate || '').trim();
  if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) return { error: 'Due date must be YYYY-MM-DD' };
  return {
    data: {
      title, contentUrl: url.slice(0, 500) || null, dueDate: due || null, mandatory: !!b.mandatory,
      description: String(b.description || '').trim().slice(0, 5000) || null,
      durationMins: Number(b.durationMins) > 0 ? Math.round(Number(b.durationMins)) : null,
    },
  };
}

router.post('/courses', trainer, async (req, res) => {
  try {
    const c = clean(req.body);
    if (c.error) return res.status(400).json({ message: c.error });
    res.status(201).json(await prisma.course.create({ data: { ...c.data, createdById: req.user.sub } }));
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

router.patch('/courses/:id', trainer, async (req, res) => {
  try {
    const c = clean(req.body);
    if (c.error) return res.status(400).json({ message: c.error });
    res.json(await prisma.course.update({ where: { id: Number(req.params.id) }, data: c.data }));
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ message: 'Course not found' });
    console.error(e); res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/courses/:id', trainer, async (req, res) => {
  try {
    await prisma.course.delete({ where: { id: Number(req.params.id) } });
    res.json({ ok: true });
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ message: 'Course not found' });
    console.error(e); res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/training/courses/:id/assign — { all:true } | { branchId } | { userIds:[..] }
router.post('/courses/:id/assign', trainer, async (req, res) => {
  try {
    const course = await prisma.course.findUnique({ where: { id: Number(req.params.id) } });
    if (!course) return res.status(404).json({ message: 'Course not found' });
    const b = req.body || {};
    const where = { isActive: true };
    if (b.all) { /* everyone active */ } else if (Number(b.branchId)) where.branchId = Number(b.branchId);
    else {
      const ids = (Array.isArray(b.userIds) ? b.userIds : []).map(Number).filter(Number.isInteger);
      if (!ids.length) return res.status(400).json({ message: 'Choose who should take this course' });
      where.id = { in: ids };
    }
    const users = await prisma.user.findMany({ where, select: { id: true } });
    const already = new Set((await prisma.courseAssignment.findMany({
      where: { courseId: course.id, userId: { in: users.map((u) => u.id) } }, select: { userId: true },
    })).map((a) => a.userId));
    const fresh = users.map((u) => u.id).filter((id) => !already.has(id));
    const { count } = await prisma.courseAssignment.createMany({
      data: fresh.map((userId) => ({ courseId: course.id, userId })), skipDuplicates: true,
    });
    if (count) {
      notify(fresh, {
        kind: 'training', title: `${course.mandatory ? 'Mandatory training' : 'New training'}: ${course.title}`,
        body: course.dueDate ? `Complete by ${course.dueDate}` : 'Open My Training to start.', data: { screen: 'Training' },
      });
    }
    res.json({ ok: true, assigned: count });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// GET /api/training/courses/:id/progress — who has / hasn't completed.
router.get('/courses/:id/progress', trainer, async (req, res) => {
  try {
    const rows = await prisma.courseAssignment.findMany({ where: { courseId: Number(req.params.id) } });
    const users = await prisma.user.findMany({
      where: { id: { in: rows.map((r) => r.userId) } }, select: { id: true, fullName: true, username: true, employeeId: true },
    });
    const um = new Map(users.map((u) => [u.id, u]));
    res.json({ rows: rows.map((r) => ({ ...r, user: um.get(r.userId) || null })).sort((a, b) => a.status.localeCompare(b.status)) });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

module.exports = router;
