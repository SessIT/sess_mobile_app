// Reporting tree. A "manager" is simply anyone with active employees whose
// reportingManagerId points at them — no separate role to keep in sync.
//   VIEWING (team attendance) covers the whole subtree: direct and indirect reports.
//   FIRST-LEVEL APPROVAL belongs to the DIRECT manager only (see lib/approvals.js).
const prisma = require('./prisma');

async function activeTree() {
  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, reportingManagerId: true },
  });
  const children = new Map();
  for (const u of users) {
    if (!u.reportingManagerId || u.reportingManagerId === u.id) continue;
    if (!children.has(u.reportingManagerId)) children.set(u.reportingManagerId, []);
    children.get(u.reportingManagerId).push(u.id);
  }
  return children;
}

// Every active employee below `managerId`, any depth. Cycle-safe.
async function teamIdsOf(managerId) {
  const children = await activeTree();
  const seen = new Set([managerId]);
  const out = [];
  const queue = [...(children.get(managerId) || [])];
  while (queue.length) {
    const id = queue.shift();
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    queue.push(...(children.get(id) || []));
  }
  return out;
}

async function directReportIds(managerId) {
  const rows = await prisma.user.findMany({
    where: { isActive: true, reportingManagerId: managerId, id: { not: managerId } },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

// Has at least one active direct report (so a non-empty subtree).
async function isManager(userId) {
  const n = await prisma.user.count({ where: { isActive: true, reportingManagerId: userId, id: { not: userId } } });
  return n > 0;
}

// Gate for /team endpoints: attaches req.teamIds (the whole subtree).
async function requireManager(req, res, next) {
  try {
    const ids = await teamIdsOf(req.user.sub);
    if (ids.length === 0) return res.status(403).json({ message: 'You have no team members reporting to you' });
    req.teamIds = ids;
    next();
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Server error' });
  }
}

module.exports = { teamIdsOf, directReportIds, isManager, requireManager };
