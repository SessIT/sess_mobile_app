// Who hears about a request, and when:
//   raised            → the employee's reporting manager (or the admins when there is none)
//   manager approved  → the admins, for the final decision
//   manager rejected  → the employee
//   admin decided     → the employee
// Every function is fire-and-forget (never throws) — call without await.
const prisma = require('./prisma');
const { notify, adminIds } = require('./notify');

const KIND = {
  leave: { label: 'leave request', employeeScreen: 'Leave', adminScreen: 'LeaveApprovals', perm: 'leave' },
  ot: { label: 'overtime request', employeeScreen: 'Overtime', adminScreen: 'OtApprovals', perm: 'overtime' },
  compoff: { label: 'comp-off request', employeeScreen: 'CompOff', adminScreen: 'CompOffApprovals', perm: 'compoff' },
  expense: { label: 'expense claim', employeeScreen: 'Expense', adminScreen: 'ExpenseApprovals', perm: 'expenses' },
  correction: { label: 'attendance correction', employeeScreen: 'MyAttendance', adminScreen: 'TeamAttendance', perm: 'attendance' },
};

const day = (d) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'UTC' });
const nameOf = (u) => u?.fullName || u?.username || 'An employee';

// Short human description of a request row.
async function describe(kind, r) {
  switch (kind) {
    case 'leave': {
      const type = r.leaveType?.name
        || (await prisma.leaveType.findUnique({ where: { id: r.leaveTypeId }, select: { name: true } }))?.name || 'Leave';
      const range = day(r.startDate) === day(r.endDate) ? day(r.startDate) : `${day(r.startDate)} – ${day(r.endDate)}`;
      return `${type}, ${range} (${r.days} day${r.days === 1 ? '' : 's'})`;
    }
    case 'ot': return `${r.hours} h overtime on ${day(r.date)}`;
    case 'compoff': return `comp-off for working ${day(r.workDate)}`;
    case 'expense': return `${r.type} expense`;
    case 'correction': return `attendance correction for ${day(r.date)}`;
    default: return 'request';
  }
}

async function requestCreated(kind, row) {
  try {
    const owner = await prisma.user.findUnique({
      where: { id: row.userId },
      select: { id: true, fullName: true, username: true, reportingManager: { select: { id: true, isActive: true } } },
    });
    const desc = await describe(kind, row);
    const mgr = owner?.reportingManager;
    if (mgr?.isActive && mgr.id !== row.userId) {
      notify(mgr.id, {
        kind, title: `${nameOf(owner)} — ${desc}`, body: 'Waiting for your approval',
        data: { screen: 'TeamApprovals' },
      });
    } else {
      const admins = (await adminIds(KIND[kind].perm)).filter((id) => id !== row.userId);
      notify(admins, {
        kind, title: `${nameOf(owner)} — ${desc}`, body: `New ${KIND[kind].label} to review`,
        data: { screen: KIND[kind].adminScreen },
      });
    }
  } catch (e) { console.error('[requestEvents] created:', e.message); }
}

async function managerDecided(kind, requestId, decision, managerId, note) {
  try {
    const model = { leave: 'leaveRequest', ot: 'otRequest', compoff: 'compOffRequest', expense: 'expenseRequest', correction: 'attendanceCorrection' }[kind];
    const row = await prisma[model].findUnique({ where: { id: requestId } });
    if (!row) return;
    const [owner, mgr] = await Promise.all([
      prisma.user.findUnique({ where: { id: row.userId }, select: { fullName: true, username: true } }),
      prisma.user.findUnique({ where: { id: managerId }, select: { fullName: true, username: true } }),
    ]);
    const desc = await describe(kind, row);
    if (decision === 'approved') {
      notify((await adminIds(KIND[kind].perm)).filter((id) => id !== row.userId), {
        kind, title: `${nameOf(owner)} — ${desc}`,
        body: `Approved by ${nameOf(mgr)}. Needs your final approval.`,
        data: { screen: KIND[kind].adminScreen },
      });
    } else {
      notify(row.userId, {
        kind, title: `Your ${KIND[kind].label} was rejected`,
        body: `${desc} — ${nameOf(mgr)}${note ? `: ${note}` : ''}`,
        data: { screen: KIND[kind].employeeScreen },
      });
    }
  } catch (e) { console.error('[requestEvents] manager:', e.message); }
}

async function finalDecided(kind, row, status) {
  try {
    const desc = await describe(kind, row);
    const verb = { approved: 'approved ✅', rejected: 'rejected', revoked: 'revoked' }[status] || status;
    notify(row.userId, {
      kind, title: `Your ${KIND[kind].label} was ${verb}`,
      body: `${desc}${row.reviewNote ? ` — ${row.reviewNote}` : ''}`,
      data: { screen: KIND[kind].employeeScreen },
    });
  } catch (e) { console.error('[requestEvents] final:', e.message); }
}

module.exports = { requestCreated, managerDecided, finalDecided };
