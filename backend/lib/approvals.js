// Two-step approval: the employee's DIRECT reporting manager decides first,
// the admin decides last.
//   manager approves → request stays 'pending', now marked manager-approved
//   manager rejects  → request becomes 'rejected' (final)
//   admin            → may still decide at any stage (override when the
//                      manager is unavailable); the UI warns while awaiting.
// Employees with no active manager go straight to the admin, as before.
const prisma = require('./prisma');

const KINDS = {
  leave: { model: 'leaveRequest', label: 'Leave' },
  ot: { model: 'otRequest', label: 'Overtime' },
  compoff: { model: 'compOffRequest', label: 'Comp-off' },
  expense: { model: 'expenseRequest', label: 'Expense' },
  correction: { model: 'attendanceCorrection', label: 'Attendance correction' },
};

const nameOf = (u) => (u ? u.fullName || u.username : null);

/* Annotate request rows (each needs id, userId, status) with `managerStage`:
 *   { state: 'awaiting' | 'approved' | 'rejected' | 'skipped' | 'none',
 *     manager, by, at, note }
 *   awaiting — pending, a manager exists and has not acted yet
 *   skipped  — decided by the admin without a manager decision
 *   none     — the employee has no active reporting manager */
async function withManagerStage(kind, rows) {
  if (!rows || rows.length === 0) return rows || [];
  const userIds = [...new Set(rows.map((r) => r.userId))];
  const [approvals, users] = await Promise.all([
    prisma.requestApproval.findMany({
      where: { kind, stage: 'manager', requestId: { in: rows.map((r) => r.id) } },
    }),
    prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        reportingManager: { select: { id: true, fullName: true, username: true, isActive: true } },
      },
    }),
  ]);
  const actorIds = [...new Set(approvals.map((a) => a.actorId))];
  const actors = actorIds.length
    ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, fullName: true, username: true } })
    : [];
  const actorName = new Map(actors.map((a) => [a.id, nameOf(a)]));
  const byReq = new Map(approvals.map((a) => [a.requestId, a]));
  const mgrOf = new Map(users.map((u) => [u.id, u.reportingManager]));

  return rows.map((r) => {
    const mgr = mgrOf.get(r.userId);
    const hasMgr = !!mgr && mgr.isActive && mgr.id !== r.userId;
    const a = byReq.get(r.id);
    const managerStage = a
      ? { state: a.decision, manager: nameOf(mgr), by: actorName.get(a.actorId) || null, at: a.createdAt, note: a.note }
      : { state: !hasMgr ? 'none' : r.status === 'pending' ? 'awaiting' : 'skipped', manager: hasMgr ? nameOf(mgr) : null };
    return { ...r, managerStage };
  });
}

// The direct manager's decision. Returns { ok:true } or { status, message }.
async function managerDecide({ kind, requestId, actorId, decision, note }) {
  const k = KINDS[kind];
  if (!k) return { status: 400, message: 'Unknown request type' };
  if (!['approved', 'rejected'].includes(decision))
    return { status: 400, message: "decision must be 'approved' or 'rejected'" };
  const row = await prisma[k.model].findUnique({ where: { id: requestId } });
  if (!row) return { status: 404, message: 'Request not found' };
  const owner = await prisma.user.findUnique({ where: { id: row.userId }, select: { reportingManagerId: true } });
  if (!owner || owner.reportingManagerId !== actorId || row.userId === actorId)
    return { status: 403, message: 'Only the employee\'s reporting manager can give the first approval' };
  if (row.status !== 'pending') return { status: 400, message: `Request is already ${row.status}` };

  const cleanNote = String(note || '').trim().slice(0, 500) || null;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.requestApproval.create({
        data: { kind, requestId, stage: 'manager', decision, actorId, note: cleanNote },
      });
      if (decision === 'rejected') {
        // Conditional on still-pending, so a concurrent admin decision wins
        // cleanly instead of being overwritten.
        const { count } = await tx[k.model].updateMany({
          where: { id: requestId, status: 'pending' },
          data: {
            status: 'rejected', reviewedById: actorId, reviewedAt: new Date(),
            reviewNote: cleanNote || 'Rejected by reporting manager',
          },
        });
        if (count === 0) throw Object.assign(new Error('raced'), { code: 'RACED' });
      }
    });
  } catch (e) {
    if (e.code === 'P2002') return { status: 409, message: 'You have already decided this request' };
    if (e.code === 'RACED') return { status: 409, message: 'This request was just decided by an admin' };
    throw e;
  }
  return { ok: true };
}

module.exports = { KINDS, withManagerStage, managerDecide };
