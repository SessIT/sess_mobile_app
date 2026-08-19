const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');
const router = express.Router();

const ADMIN = 'Admin';

const STANDARD_ROLES = [
  'Admin',
  'Managing Director',
  'HR',
  'Accounts',
  'Production Manager',
  'Project Manager',
  'Service Engineer',
  'Fabrication Engineer',
  'Employee Self Login',
];

// Every route below: must be logged in AND must be admin
router.use(requireAuth, requireRole(ADMIN));

// GET /api/users/roles - role options for the create form
router.get('/roles', (req, res) => {
  res.json(STANDARD_ROLES);
});

// GET /api/users - list all users with roles
router.get('/', async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { id: 'asc' },
      select: USER_SELECT,
    });
    res.json(users.map(shapeUser));
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Server error' });
  }
});

// Normalise a 10-digit phone; '' / null -> null. Returns { ok, value } / { ok:false, message }.
function normPhone(phone) {
  if (phone === undefined || phone === null || String(phone).trim() === '') return { ok: true, value: null };
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length !== 10) return { ok: false, message: 'Phone must be a 10-digit mobile number' };
  return { ok: true, value: digits };
}

/* ---------------- Employment / personal / statutory profile fields ---------------- */
const EMPLOYMENT_TYPES = ['Permanent', 'Temporary', 'Intern', 'Contract', 'Consultant'];
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const dateOnly = (ymd) => new Date(ymd + 'T00:00:00.000Z');
const strOrNull = (v, max) => {
  if (v === undefined) return undefined;
  const s = String(v ?? '').trim();
  return s ? s.slice(0, max) : null;
};
// Fields shown on the admin user list / edit form (everything except passwordHash).
const USER_SELECT = {
  id: true, username: true, fullName: true, phone: true, isActive: true, createdAt: true,
  employeeId: true, designation: true, department: true, employmentType: true,
  dateOfJoining: true, reportingManagerId: true,
  reportingManager: { select: { id: true, fullName: true, username: true } },
  dateOfBirth: true, bloodGroup: true, address: true, emergencyContact: true, email: true,
  esiNumber: true, epfNumber: true, panNumber: true, salaryCtc: true,
  bankName: true, bankAccount: true, bankIfsc: true,
  exitDate: true, exitReason: true, noticeServed: true, exitFormalitiesDone: true,
  role: { select: { name: true } },
};

// Validate + coerce the optional profile fields from a request body into a
// Prisma `data` fragment. `id` is the user being edited (null on create).
async function buildProfileData(body, id) {
  const data = {};
  const fail = (message) => ({ ok: false, message });

  if (body.employeeId !== undefined) {
    const v = strOrNull(body.employeeId, 30);
    if (v) {
      const taken = await prisma.user.findFirst({ where: { employeeId: v, ...(id ? { id: { not: id } } : {}) } });
      if (taken) return fail('Employee ID already in use');
    }
    data.employeeId = v;
  }
  if (body.designation !== undefined) data.designation = strOrNull(body.designation, 80);
  if (body.department !== undefined) data.department = strOrNull(body.department, 80);
  if (body.employmentType !== undefined) {
    const v = strOrNull(body.employmentType, 20);
    if (v && !EMPLOYMENT_TYPES.includes(v)) return fail('Invalid employment type');
    data.employmentType = v;
  }
  for (const [key] of [['dateOfJoining'], ['dateOfBirth']]) {
    if (body[key] !== undefined) {
      const raw = String(body[key] || '').trim();
      if (!raw) data[key] = null;
      else if (!YMD.test(raw)) return fail(`${key} must be YYYY-MM-DD`);
      else data[key] = dateOnly(raw);
    }
  }
  if (body.reportingManagerId !== undefined) {
    const raw = body.reportingManagerId;
    if (raw === null || raw === '') data.reportingManagerId = null;
    else {
      const mid = Number(raw);
      if (!Number.isInteger(mid)) return fail('Invalid reporting manager');
      if (id && mid === id) return fail('An employee cannot report to themselves');
      const mgr = await prisma.user.findUnique({ where: { id: mid } });
      if (!mgr) return fail('Reporting manager not found');
      data.reportingManagerId = mid;
    }
  }
  if (body.bloodGroup !== undefined) data.bloodGroup = strOrNull(body.bloodGroup, 10);
  if (body.address !== undefined) data.address = strOrNull(body.address, 300);
  if (body.emergencyContact !== undefined) {
    const v = strOrNull(body.emergencyContact, 15);
    if (v && String(v).replace(/\D/g, '').length !== 10) return fail('Emergency contact must be a 10-digit number');
    data.emergencyContact = v ? String(v).replace(/\D/g, '') : null;
  }
  if (body.email !== undefined) {
    const v = strOrNull(body.email, 120);
    if (v) {
      const email = v.toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail('Enter a valid email address');
      const taken = await prisma.user.findFirst({ where: { email, ...(id ? { id: { not: id } } : {}) } });
      if (taken) return fail('Email already in use');
      data.email = email;
    } else data.email = null;
  }
  if (body.esiNumber !== undefined) data.esiNumber = strOrNull(body.esiNumber, 25);
  if (body.epfNumber !== undefined) data.epfNumber = strOrNull(body.epfNumber, 30);
  if (body.panNumber !== undefined) {
    const v = strOrNull(body.panNumber, 10);
    if (v && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v.toUpperCase())) return fail('PAN must look like ABCDE1234F');
    data.panNumber = v ? v.toUpperCase() : null;
  }
  if (body.salaryCtc !== undefined) {
    const raw = body.salaryCtc;
    if (raw === null || raw === '') data.salaryCtc = null;
    else {
      const n = parseFloat(raw);
      if (!Number.isFinite(n) || n < 0) return fail('Salary / CTC must be a positive number');
      data.salaryCtc = n;
    }
  }
  if (body.bankName !== undefined) data.bankName = strOrNull(body.bankName, 80);
  if (body.bankAccount !== undefined) data.bankAccount = strOrNull(body.bankAccount, 30);
  if (body.bankIfsc !== undefined) {
    const v = strOrNull(body.bankIfsc, 11);
    if (v && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(v.toUpperCase())) return fail('IFSC must look like SBIN0001234');
    data.bankIfsc = v ? v.toUpperCase() : null;
  }
  return { ok: true, data };
}

// Storage is a single role now, but the clients still read an array (web does u.roles?.[0],
// mobile does editing.roles?.[0]), so keep emitting one. Destructuring `role` out of the rest
// keeps the raw relation object from leaking in alongside it - the response shape is unchanged.
const shapeUser = ({ role, ...u }) => ({ ...u, roles: role ? [role.name] : [] });

// Next free SESS-nnn. Derived from the highest sequence actually in use (not the user
// count) so deleted users can't make us reissue an id. Non-conforming ids are ignored.
async function nextEmployeeId() {
  const rows = await prisma.user.findMany({
    where: { employeeId: { startsWith: 'SESS-' } },
    select: { employeeId: true },
  });
  let max = 0;
  for (const r of rows) {
    const m = /^SESS-(\d+)$/.exec(r.employeeId || '');
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `SESS-${String(max + 1).padStart(3, '0')}`;
}

// POST /api/users - create a user
router.post('/', async (req, res) => {
  try {
    const { username, fullName, password, roleName, phone } = req.body || {};
    if (!username || !username.trim() || !password || !roleName)
      return res.status(400).json({ message: 'username, password and roleName are required' });
    if (password.length < 6)
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    if (!STANDARD_ROLES.includes(roleName))
      return res.status(400).json({ message: 'Invalid role' });

    const ph = normPhone(phone);
    if (!ph.ok) return res.status(400).json({ message: ph.message });

    const exists = await prisma.user.findUnique({ where: { username: username.trim() } });
    if (exists) return res.status(409).json({ message: 'Username already exists' });
    if (ph.value) {
      const phoneTaken = await prisma.user.findUnique({ where: { phone: ph.value } });
      if (phoneTaken) return res.status(409).json({ message: 'Phone number already in use' });
    }

    // Optional employment/personal/statutory fields on create.
    const prof = await buildProfileData(req.body || {}, null);
    if (!prof.ok) return res.status(400).json({ message: prof.message });

    const role = await prisma.role.upsert({
      where: { name: roleName }, update: {}, create: { name: roleName },
    });

    const data = {
      username: username.trim(),
      fullName: (fullName || '').trim() || null,
      phone: ph.value,
      passwordHash: await bcrypt.hash(password, 10),
      roleId: role.id,
      ...prof.data,
    };
    // An explicitly supplied Employee ID wins; otherwise the system allocates one.
    const autoEmployeeId = !data.employeeId;

    // employee_id is UNIQUE, so two concurrent creates can pick the same number:
    // on that collision only, recompute and try again.
    let user = null;
    for (let attempt = 0; attempt < 5 && !user; attempt++) {
      if (autoEmployeeId) data.employeeId = await nextEmployeeId();
      try {
        user = await prisma.user.create({ data, select: USER_SELECT });
      } catch (e) {
        const target = String(e?.meta?.target || '').toLowerCase().replace(/_/g, '');
        const employeeIdTaken = e.code === 'P2002' && target.includes('employeeid');
        // A typed-in id that loses the race is not retryable - the admin chose that exact
        // value - so answer it the way buildProfileData's pre-check would have.
        if (employeeIdTaken && !autoEmployeeId)
          return res.status(400).json({ message: 'Employee ID already in use' });
        if (!(autoEmployeeId && employeeIdTaken)) throw e;
      }
    }
    if (!user)
      return res.status(409).json({ message: 'Could not allocate an Employee ID, please retry' });

    res.status(201).json(shapeUser(user));
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Server error' });
  }
});

// PATCH /api/users/:id - edit a user (name, phone, role, and optionally reset password)
router.patch('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { fullName, phone, roleName, password, username } = req.body || {};

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ message: 'User not found' });

    const data = {};

    if (username !== undefined) {
      const u = String(username).trim();
      if (!u) return res.status(400).json({ message: 'Username cannot be empty' });
      if (/\s/.test(u)) return res.status(400).json({ message: 'Username cannot contain spaces' });
      if (u !== existing.username) {
        const taken = await prisma.user.findUnique({ where: { username: u } });
        if (taken) return res.status(409).json({ message: 'Username already exists' });
        data.username = u;
      }
    }

    if (fullName !== undefined) data.fullName = String(fullName).trim() || null;

    if (phone !== undefined) {
      const ph = normPhone(phone);
      if (!ph.ok) return res.status(400).json({ message: ph.message });
      if (ph.value !== existing.phone) {
        if (ph.value) {
          const taken = await prisma.user.findFirst({ where: { phone: ph.value, id: { not: id } } });
          if (taken) return res.status(409).json({ message: 'Phone number already in use' });
        }
        data.phone = ph.value;
      }
    }

    if (password !== undefined && password !== '') {
      if (String(password).length < 6)
        return res.status(400).json({ message: 'Password must be at least 6 characters' });
      data.passwordHash = await bcrypt.hash(String(password), 10);
    }

    // Employment / personal / statutory profile fields (all optional).
    const prof = await buildProfileData(req.body || {}, id);
    if (!prof.ok) return res.status(400).json({ message: prof.message });
    Object.assign(data, prof.data);

    if (roleName !== undefined) {
      if (!STANDARD_ROLES.includes(roleName))
        return res.status(400).json({ message: 'Invalid role' });
      const role = await prisma.role.upsert({ where: { name: roleName }, update: {}, create: { name: roleName } });
      // Goes into the same update as the other fields, so a role change can no longer half-apply
      // the way the old delete-then-create pair could (failing between the two left no role at all).
      data.roleId = role.id;
    }

    if (Object.keys(data).length > 0) {
      await prisma.user.update({ where: { id }, data });
    }

    const updated = await prisma.user.findUnique({
      where: { id },
      select: USER_SELECT,
    });
    res.json(shapeUser(updated));
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ message: 'User not found' });
    console.error(e);
    res.status(500).json({ message: 'Server error' });
  }
});

// PATCH /api/users/:id/status - activate or deactivate
router.patch('/:id/status', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { isActive } = req.body || {};
    if (typeof isActive !== 'boolean')
      return res.status(400).json({ message: 'isActive (true/false) required' });
    if (id === req.user.sub)
      return res.status(400).json({ message: 'You cannot deactivate your own account' });

    const user = await prisma.user.update({
      where: { id },
      data: { isActive },
      select: { id: true, username: true, isActive: true },
    });
    res.json(user);
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ message: 'User not found' });
    console.error(e);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
