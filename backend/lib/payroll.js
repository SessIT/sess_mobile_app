// Payroll engine.
//   computePay()  — pure: one employee's month from structure + attendance + settings
//   buildContext() / payslipData() — load everything a month needs, then compute
//   generateRun() — (re)build a draft run from the LOCKED attendance snapshot
//
// Proration is on calendar days: earned = monthly rate × paidDays / daysInMonth,
// where paidDays = employed days in the month − loss-of-pay days.
const prisma = require('./prisma');
const { getPayrollSettings } = require('./payrollSettings');

const r0 = (n) => Math.round(Number(n) || 0);
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const daysIn = (month) => { const [y, m] = month.split('-').map(Number); return new Date(y, m, 0).getDate(); };

const COMPONENTS = [
  ['basic', 'Basic'], ['da', 'Dearness Allowance'], ['hra', 'House Rent Allowance'],
  ['conveyance', 'Conveyance'], ['specialAllowance', 'Special Allowance'], ['otherAllowance', 'Other Allowance'],
];
const fixedGrossOf = (s) => COMPONENTS.reduce((sum, [k]) => sum + (Number(s[k]) || 0), 0);

// Financial year (Apr–Mar) and PT half-year (Apr–Sep / Oct–Mar) boundaries.
function fyStart(month) {
  const [y, m] = month.split('-').map(Number);
  return `${m >= 4 ? y : y - 1}-04`;
}
function halfYearStart(month) {
  const [y, m] = month.split('-').map(Number);
  if (m >= 4 && m <= 9) return `${y}-04`;
  return `${m >= 10 ? y : y - 1}-10`;
}
// Months left in the FY including this one (April → 12 … March → 1).
const fyMonthsRemaining = (month) => { const m = Number(month.slice(5, 7)); return m >= 4 ? 16 - m : 4 - m; };

function slabAmount(slabs, income) {
  for (const s of slabs) if (s.upTo == null || income <= Number(s.upTo)) return Number(s.amount) || 0;
  return 0;
}

// Annual income tax on taxable income (progressive slabs, s.87A rebate with
// marginal relief, then cess).
function annualTax(taxable, tds) {
  let tax = 0;
  let lower = 0;
  for (const s of tds.slabs) {
    const upper = s.upTo == null ? Infinity : Number(s.upTo);
    if (taxable > lower) tax += (Math.min(taxable, upper) - lower) * (Number(s.rate) / 100);
    lower = upper;
    if (taxable <= upper) break;
  }
  const limit = Number(tds.rebateLimit) || 0;
  if (taxable <= limit) tax = 0;
  else tax = Math.min(tax, taxable - limit); // marginal relief just above the rebate limit
  return r0(tax * (1 + (Number(tds.cess) || 0) / 100));
}

/* One employee, one month. Pure — every input is passed in.
 *   structure   SalaryStructure row (full-month rates + statutory flags)
 *   attendance  { payableDays, lopDays, otHours }
 *   adjustments { arrears, bonus, otherEarning, otherEarningLabel, otherDeduction,
 *                 otherDeductionLabel, lopOverride, tdsOverride }
 *   history     { fyGross, fyTds, halfGross } from finalized months before this one */
function computePay({ month, settings, structure, attendance, adjustments = {}, history = {} }) {
  const daysInMonth = daysIn(month);
  const lopDays = adjustments.lopOverride != null && adjustments.lopOverride !== ''
    ? Math.max(0, Number(adjustments.lopOverride)) : attendance.lopDays;
  const payableDays = Math.min(attendance.payableDays, daysInMonth);
  const paidDays = r2(Math.max(0, payableDays - lopDays));
  const factor = paidDays / daysInMonth;

  const earnings = [];
  const add = (list, code, label, amount) => { if (amount) list.push({ code, label, amount: r0(amount) }); };
  for (const [k, label] of COMPONENTS) add(earnings, k, label, (Number(structure[k]) || 0) * factor);

  const earned = Object.fromEntries(earnings.map((e) => [e.code, e.amount]));
  const pfBase = (earned.basic || 0) + (earned.da || 0);

  const ot = settings.ot;
  const fullBasicDa = (Number(structure.basic) || 0) + (Number(structure.da) || 0);
  const otHourly = fullBasicDa / ot.divisorDays / ot.hoursPerDay;
  add(earnings, 'ot', `Overtime (${r2(attendance.otHours || 0)} h)`, otHourly * ot.multiplier * (attendance.otHours || 0));
  add(earnings, 'arrears', 'Arrears', adjustments.arrears);
  add(earnings, 'bonus', 'Bonus', adjustments.bonus);
  add(earnings, 'otherEarning', adjustments.otherEarningLabel || 'Other earning', adjustments.otherEarning);
  const gross = earnings.reduce((s, e) => s + e.amount, 0);
  const amt = (code) => earnings.find((e) => e.code === code)?.amount || 0;

  // ---- PF ----
  let pfWage = 0, pfEmployee = 0, epfEmployer = 0, epsEmployer = 0;
  if (settings.pf.enabled && structure.pfEnabled && pfBase > 0) {
    const ceiling = Number(settings.pf.wageCeiling);
    pfWage = structure.pfOnFullWage ? pfBase : Math.min(pfBase, ceiling);
    pfEmployee = r0(pfWage * settings.pf.employeeRate / 100);
    epsEmployer = r0(Math.min(pfWage, ceiling) * settings.pf.epsRate / 100);
    epfEmployer = Math.max(0, r0(pfWage * settings.pf.employerRate / 100) - epsEmployer);
  }

  // ---- ESI ---- coverage judged on the full-month fixed gross; contribution on
  // the month's wages (annual bonus excluded), rounded up as ESIC does.
  let esiWage = 0, esiEmployee = 0, esiEmployer = 0;
  if (settings.esi.enabled && structure.esiEnabled && fixedGrossOf(structure) <= Number(settings.esi.wageLimit)) {
    esiWage = gross - amt('bonus');
    esiEmployee = Math.ceil(esiWage * settings.esi.employeeRate / 100);
    esiEmployer = Math.ceil(esiWage * settings.esi.employerRate / 100);
  }

  // ---- Professional Tax ----
  let pt = 0;
  if (settings.pt.enabled && structure.ptEnabled) {
    const m = Number(month.slice(5, 7));
    if (settings.pt.basis === 'monthly') {
      if (settings.pt.months.includes(m) || settings.pt.months.length === 0) pt = slabAmount(settings.pt.slabs, gross);
    } else if (settings.pt.months.includes(m)) {
      pt = slabAmount(settings.pt.slabs, (history.halfGross || 0) + gross);
    }
  }

  // ---- TDS ---- projected annual tax, spread over the months left in the FY,
  // net of TDS already deducted this FY. A fixed override (old regime,
  // declarations) replaces the projection.
  let tds = 0;
  let tdsNote = null;
  if (settings.tds.enabled && structure.tdsEnabled) {
    const override = adjustments.tdsOverride != null && adjustments.tdsOverride !== ''
      ? adjustments.tdsOverride : structure.tdsMonthlyOverride;
    if (override != null) {
      tds = r0(Math.max(0, Number(override)));
      tdsNote = 'fixed';
    } else {
      const remaining = fyMonthsRemaining(month);
      const projected = (history.fyGross || 0) + gross + fixedGrossOf(structure) * (remaining - 1);
      const taxable = Math.max(0, projected - Number(settings.tds.standardDeduction || 0));
      const tax = annualTax(taxable, settings.tds);
      tds = Math.max(0, r0((tax - (history.fyTds || 0)) / remaining));
      tdsNote = { projected: r0(projected), taxable: r0(taxable), annualTax: tax };
    }
  }

  const deductions = [];
  add(deductions, 'pf', 'Provident Fund', pfEmployee);
  add(deductions, 'esi', 'ESI', esiEmployee);
  add(deductions, 'pt', 'Professional Tax', pt);
  add(deductions, 'tds', 'Income Tax (TDS)', tds);
  add(deductions, 'otherDeduction', adjustments.otherDeductionLabel || 'Other deduction', adjustments.otherDeduction);
  const totalDeductions = deductions.reduce((s, d) => s + d.amount, 0);

  return {
    month, daysInMonth, payableDays: r2(payableDays), lopDays: r2(lopDays), paidDays,
    otHours: r2(attendance.otHours || 0),
    gross: r0(gross), totalDeductions: r0(totalDeductions), netPay: r0(gross - totalDeductions),
    pfWage: r0(pfWage), pfEmployee, epfEmployer, epsEmployer,
    esiWage: r0(esiWage), esiEmployee, esiEmployer, pt, tds,
    earnings, deductions, tdsNote,
  };
}

/* ---------------- loading a month ---------------- */

const ymdOf = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

// Employed calendar days in the month, from the joining / exit dates.
function employedDays(month, user) {
  const dim = daysIn(month);
  const first = `${month}-01`;
  const last = `${month}-${String(dim).padStart(2, '0')}`;
  const from = user.dateOfJoining && ymdOf(user.dateOfJoining) > first ? ymdOf(user.dateOfJoining) : first;
  const to = user.exitDate && ymdOf(user.exitDate) < last ? ymdOf(user.exitDate) : last;
  if (to < from) return 0;
  return Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
}

const employeeSnapshot = (u) => ({
  name: u.fullName || u.username, username: u.username, employeeId: u.employeeId,
  designation: u.designation, department: u.department,
  dateOfJoining: ymdOf(u.dateOfJoining), pan: u.panNumber, uan: u.epfNumber, esiNumber: u.esiNumber,
  bankName: u.bankName, bankAccount: u.bankAccount, bankIfsc: u.bankIfsc,
});

const USER_FIELDS = {
  id: true, username: true, fullName: true, employeeId: true, designation: true, department: true,
  dateOfJoining: true, exitDate: true, panNumber: true, epfNumber: true, esiNumber: true,
  bankName: true, bankAccount: true, bankIfsc: true,
};

// Latest structure effective on or before the month, per user.
async function structuresFor(month, userIds) {
  const rows = await prisma.salaryStructure.findMany({
    where: { userId: { in: userIds }, effectiveFrom: { lte: month } },
    orderBy: { effectiveFrom: 'desc' },
  });
  const map = new Map();
  for (const r of rows) if (!map.has(r.userId)) map.set(r.userId, r);
  return map;
}

async function buildContext(month, settings, onlyUserIds = null) {
  const lock = await prisma.attendanceLock.findUnique({ where: { month } });
  if (!lock || !lock.snapshot) {
    const e = new Error('Lock this month\'s attendance (Team Attendance → Lock for payroll) before running payroll');
    e.status = 409;
    throw e;
  }
  let rows = lock.snapshot.summary || [];
  if (onlyUserIds) rows = rows.filter((r) => onlyUserIds.includes(r.userId));
  const ids = rows.map((r) => r.userId);
  const [users, structures, fyRows, halfRows] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: ids } }, select: USER_FIELDS }),
    structuresFor(month, ids),
    prisma.payslip.groupBy({
      by: ['userId'],
      where: { userId: { in: ids }, month: { gte: fyStart(month), lt: month }, run: { status: 'finalized' } },
      _sum: { gross: true, tds: true },
    }),
    prisma.payslip.groupBy({
      by: ['userId'],
      where: { userId: { in: ids }, month: { gte: halfYearStart(month), lt: month }, run: { status: 'finalized' } },
      _sum: { gross: true },
    }),
  ]);
  return {
    month, settings, rows,
    users: new Map(users.map((u) => [u.id, u])),
    structures,
    fy: new Map(fyRows.map((r) => [r.userId, r._sum])),
    half: new Map(halfRows.map((r) => [r.userId, r._sum.gross || 0])),
  };
}

// Everything a Payslip row stores, for one user of a built context.
function payslipData(ctx, row, adjustments = {}) {
  const user = ctx.users.get(row.userId);
  const structure = ctx.structures.get(row.userId);
  if (!user || !structure) return null;
  const lop = (row.absent || 0) + (ctx.settings.lop.halfDayAsHalfLop ? 0.5 * (row.halfDay || 0) : 0);
  const calc = computePay({
    month: ctx.month,
    settings: ctx.settings,
    structure,
    attendance: { payableDays: employedDays(ctx.month, user), lopDays: lop, otHours: row.otHours || 0 },
    adjustments,
    history: {
      fyGross: ctx.fy.get(row.userId)?.gross || 0,
      fyTds: ctx.fy.get(row.userId)?.tds || 0,
      halfGross: ctx.half.get(row.userId) || 0,
    },
  });
  const { tdsNote, ...stored } = calc;
  return { ...stored, adjustments: { ...adjustments, tdsNote }, employee: employeeSnapshot(user) };
}

/* (Re)build the draft run for a month. Adjustments already typed into an
 * existing draft are kept. Employees without a salary structure are reported
 * back, not silently skipped. */
async function generateRun(month, actorId) {
  const existing = await prisma.payrollRun.findUnique({ where: { month }, include: { payslips: true } });
  if (existing?.status === 'finalized') {
    const e = new Error('This payroll is finalized. Reopen it before regenerating.');
    e.status = 409;
    throw e;
  }
  const settings = await getPayrollSettings();
  const ctx = await buildContext(month, settings);
  const keepAdj = new Map((existing?.payslips || []).map((p) => [p.userId, p.adjustments || {}]));

  const run = existing
    ? await prisma.payrollRun.update({ where: { id: existing.id }, data: { settings } })
    : await prisma.payrollRun.create({ data: { month, settings, createdById: actorId } });

  const missing = [];
  const done = new Set();
  for (const row of ctx.rows) {
    const { tdsNote, ...prevAdj } = keepAdj.get(row.userId) || {};
    const data = payslipData(ctx, row, prevAdj);
    if (!data) {
      const u = ctx.users.get(row.userId);
      missing.push({ userId: row.userId, name: u?.fullName || u?.username || row.fullName || row.username });
      continue;
    }
    done.add(row.userId);
    await prisma.payslip.upsert({
      where: { runId_userId: { runId: run.id, userId: row.userId } },
      update: data,
      create: { ...data, runId: run.id, userId: row.userId },
    });
  }
  // Drop drafts for anyone who no longer qualifies (structure removed, etc.).
  await prisma.payslip.deleteMany({ where: { runId: run.id, userId: { notIn: [...done] } } });
  return { run, missing, count: done.size };
}

// Recompute one draft payslip after the admin edits its adjustments.
async function recomputePayslip(payslip, adjustments) {
  const run = await prisma.payrollRun.findUnique({ where: { id: payslip.runId } });
  const ctx = await buildContext(run.month, run.settings, [payslip.userId]);
  const row = ctx.rows[0];
  if (!row) {
    const e = new Error('This employee is no longer in the locked attendance for the month');
    e.status = 409;
    throw e;
  }
  const data = payslipData(ctx, row, adjustments);
  if (!data) {
    const e = new Error('No salary structure applies to this employee for the month');
    e.status = 409;
    throw e;
  }
  return prisma.payslip.update({ where: { id: payslip.id }, data });
}

module.exports = {
  COMPONENTS, computePay, annualTax, slabAmount, fyMonthsRemaining, employedDays,
  fixedGrossOf, generateRun, recomputePayslip,
};
