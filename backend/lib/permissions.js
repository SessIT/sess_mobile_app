// Role-based access to the admin areas.
//
// The Admin role can do everything. Any other role (HR, Accounts, Production
// Manager…) gets exactly the areas ticked for it in Roles & Permissions.
// Routes keep their existing requireRole('Admin') guard: middleware/auth.js
// lets a non-admin through when their role holds the permission that the
// router's mount path maps to (BASE_TO_PERM below). So one table decides
// access for the whole API.
const prisma = require('./prisma');

const ADMIN = 'Admin';

const PERMISSIONS = [
  ['users', 'User management', 'Create and edit employees, roles on users'],
  ['attendance', 'Attendance', 'Team attendance, edits, corrections, month lock, biometric devices'],
  ['location', 'Team trail', 'Live location and route history'],
  ['shifts', 'Shifts & week-offs', 'Shift rules and assignment'],
  ['holidays', 'Holidays', 'Company and branch holidays'],
  ['sites', 'Customer sites', 'Punch geofence sites'],
  ['leave', 'Leave', 'Leave approvals, policy and leave types'],
  ['overtime', 'Overtime', 'OT approvals and grants'],
  ['compoff', 'Comp-off', 'Comp-off approvals'],
  ['expenses', 'Expenses', 'Expense approvals'],
  ['payroll', 'Payroll', 'Salaries, payroll runs, payslips, statutory files'],
  ['reports', 'Reports', 'All registers and exports'],
  ['announcements', 'Announcements & notes', 'Company notices and notes to staff'],
  ['helpdesk', 'HR helpdesk', 'Answer employee tickets'],
  ['assets', 'Assets', 'Asset register'],
  ['documents', 'Documents & letters', 'Employee documents and HR letters'],
  ['exits', 'Exits', 'Resignations and clearance'],
  ['recruitment', 'Recruitment', 'Jobs, candidates, interviews, offers, hiring'],
  ['training', 'Training', 'Courses and assignments'],
  ['compliance', 'Compliance calendar', 'Statutory filing due dates'],
  ['branches', 'Branches', 'Offices / plants and who belongs where'],
  ['audit', 'Audit log', 'Who changed what'],
];
const KEYS = PERMISSIONS.map(([k]) => k);

// Router mount path → permission. Anything not listed stays Admin-only.
const BASE_TO_PERM = {
  '/api/users': 'users',
  '/api/attendance': 'attendance',
  '/api/biometric': 'attendance',
  '/api/location': 'location',
  '/api/shifts': 'shifts',
  '/api/holidays': 'holidays',
  '/api/sites': 'sites',
  '/api/geo': 'sites',
  '/api/leaves': 'leave',
  '/api/ot': 'overtime',
  '/api/compoff': 'compoff',
  '/api/expenses': 'expenses',
  '/api/payroll': 'payroll',
  '/api/reports': 'reports',
  '/api/announcements': 'announcements',
  '/api/notes': 'announcements',
  '/api/helpdesk': 'helpdesk',
  '/api/assets': 'assets',
  '/api/documents': 'documents',
  '/api/exits': 'exits',
  '/api/recruitment': 'recruitment',
  '/api/training': 'training',
  '/api/compliance': 'compliance',
  '/api/branches': 'branches',
  '/api/audit': 'audit',
};

// role name → permission list, cached briefly (one query per role per minute).
const TTL = 60 * 1000;
const cache = new Map();
async function permissionsForRoles(roleNames = []) {
  if (roleNames.includes(ADMIN)) return [...KEYS];
  const out = new Set();
  const now = Date.now();
  for (const name of roleNames) {
    let hit = cache.get(name);
    if (!hit || hit.until < now) {
      const role = await prisma.role.findUnique({ where: { name }, select: { permissions: true } });
      hit = { perms: (role?.permissions || []).filter((p) => KEYS.includes(p)), until: now + TTL };
      cache.set(name, hit);
    }
    hit.perms.forEach((p) => out.add(p));
  }
  return [...out];
}
const clearPermissionCache = () => cache.clear();

// For handlers: may this request act on `perm`? (req.user.perms is set by requireAuth.)
const can = (req, perm) => (req.user?.roles || []).includes(ADMIN) || (req.user?.perms || []).includes(perm);

// Users who should hear about work in an area: Admins + roles holding `perm`.
async function idsWithPermission(perm) {
  const where = perm
    ? { isActive: true, role: { OR: [{ name: ADMIN }, { permissions: { has: perm } }] } }
    : { isActive: true, role: { name: ADMIN } };
  return (await prisma.user.findMany({ where, select: { id: true } })).map((u) => u.id);
}

module.exports = {
  ADMIN, PERMISSIONS, KEYS, BASE_TO_PERM, permissionsForRoles, clearPermissionCache, can, idsWithPermission,
};
