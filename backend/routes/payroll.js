const express = require('express');
const prisma = require('../lib/prisma');
const { requireAuth, requireAuthFile, requireRole } = require('../middleware/auth');
const { getPayrollSettings, validateSettings, savePayrollSettings, PAYROLL_DEFAULTS } = require('../lib/payrollSettings');
const { COMPONENTS, generateRun, recomputePayslip, fixedGrossOf } = require('../lib/payroll');
const { MONTH, currentMonthIST, monthLabel } = require('../lib/attendanceLock');
const { notify } = require('../lib/notify');
const router = express.Router();
const ADMIN = 'Admin';

const admin = [requireAuth, requireRole(ADMIN)];
const { can } = require('../lib/permissions');
const isAdmin = (req) => can(req, 'payroll'); // Admin, or a role holding this area's permission
const fail = (res, e) => {
  if (e.status) return res.status(e.status).json({ message: e.message });
  console.error(e);
  res.status(500).json({ message: 'Server error' });
};

/* ==================== SETTINGS ==================== */

router.get('/settings', ...admin, async (req, res) => {
  try { res.json({ settings: await getPayrollSettings(), defaults: PAYROLL_DEFAULTS }); } catch (e) { fail(res, e); }
});

router.put('/settings', ...admin, async (req, res) => {
  try {
    const v = validateSettings(req.body?.settings || {});
    if (!v.ok) return res.status(400).json({ message: v.message });
    await savePayrollSettings(v.value);
    res.json({ settings: v.value });
  } catch (e) { fail(res, e); }
});

/* ==================== SALARY STRUCTURES ==================== */

const MONEY_FIELDS = COMPONENTS.map(([k]) => k);
const FLAG_FIELDS = ['pfEnabled', 'pfOnFullWage', 'esiEnabled', 'ptEnabled', 'tdsEnabled'];

// GET /api/payroll/structures — every active employee with their structure
// history (newest first) and the one in force this month.
router.get('/structures', ...admin, async (req, res) => {
  try {
    const month = currentMonthIST();
    const users = await prisma.user.findMany({
      where: { isActive: true },
      orderBy: { fullName: 'asc' },
      select: {
        id: true, username: true, fullName: true, employeeId: true, designation: true, salaryCtc: true,
        salaryStructures: { orderBy: { effectiveFrom: 'desc' } },
      },
    });
    res.json({
      month,
      employees: users.map(({ salaryStructures, ...u }) => {
        const current = salaryStructures.find((s) => s.effectiveFrom <= month) || null;
        return {
          ...u,
          current: current && { ...current, gross: fixedGrossOf(current) },
          upcoming: salaryStructures.filter((s) => s.effectiveFrom > month).map((s) => ({ ...s, gross: fixedGrossOf(s) })),
          history: salaryStructures.map((s) => ({ ...s, gross: fixedGrossOf(s) })),
        };
      }),
    });
  } catch (e) { fail(res, e); }
});

// POST /api/payroll/structures — create/replace the structure for (userId, effectiveFrom).
router.post('/structures', ...admin, async (req, res) => {
  try {
    const b = req.body || {};
    const userId = Number(b.userId);
    if (!Number.isInteger(userId) || !(await prisma.user.findUnique({ where: { id: userId } })))
      return res.status(400).json({ message: 'Employee not found' });
    if (!MONTH.test(String(b.effectiveFrom || '')))
      return res.status(400).json({ message: 'Effective month (YYYY-MM) is required' });
    const data = { userId, effectiveFrom: b.effectiveFrom, note: String(b.note || '').trim().slice(0, 200) || null };
    for (const k of MONEY_FIELDS) {
      const n = Number(b[k] ?? 0);
      if (!Number.isFinite(n) || n < 0 || n > 1e8) return res.status(400).json({ message: `${k} must be a positive amount` });
      data[k] = Math.round(n * 100) / 100;
    }
    if (!(data.basic > 0)) return res.status(400).json({ message: 'Basic pay is required' });
    for (const k of FLAG_FIELDS) if (b[k] !== undefined) data[k] = !!b[k];
    if (b.tdsMonthlyOverride === '' || b.tdsMonthlyOverride == null) data.tdsMonthlyOverride = null;
    else {
      const n = Number(b.tdsMonthlyOverride);
      if (!Number.isFinite(n) || n < 0) return res.status(400).json({ message: 'Fixed TDS must be a positive amount' });
      data.tdsMonthlyOverride = n;
    }
    const saved = await prisma.salaryStructure.upsert({
      where: { userId_effectiveFrom: { userId, effectiveFrom: data.effectiveFrom } },
      update: data,
      create: data,
    });
    res.status(201).json({ ...saved, gross: fixedGrossOf(saved) });
  } catch (e) { fail(res, e); }
});

// Finalized payslips keep their own copy of every figure, so deleting a
// structure never rewrites past pay.
router.delete('/structures/:id', ...admin, async (req, res) => {
  try {
    const { count } = await prisma.salaryStructure.deleteMany({ where: { id: Number(req.params.id) } });
    if (!count) return res.status(404).json({ message: 'Structure not found' });
    res.json({ ok: true });
  } catch (e) { fail(res, e); }
});

/* ==================== PAYROLL RUNS ==================== */

const runTotals = (payslips) => {
  const sum = (k) => Math.round(payslips.reduce((s, p) => s + (p[k] || 0), 0));
  return {
    employees: payslips.length, gross: sum('gross'), netPay: sum('netPay'), totalDeductions: sum('totalDeductions'),
    pfEmployee: sum('pfEmployee'), pfEmployer: sum('epfEmployer') + sum('epsEmployer'),
    esiEmployee: sum('esiEmployee'), esiEmployer: sum('esiEmployer'), pt: sum('pt'), tds: sum('tds'),
  };
};

const nameMap = async (ids) => {
  const list = ids.filter(Boolean);
  if (!list.length) return new Map();
  const us = await prisma.user.findMany({ where: { id: { in: list } }, select: { id: true, fullName: true, username: true } });
  return new Map(us.map((u) => [u.id, u.fullName || u.username]));
};

// GET /api/payroll/runs — history of runs with totals.
router.get('/runs', ...admin, async (req, res) => {
  try {
    const runs = await prisma.payrollRun.findMany({ orderBy: { month: 'desc' }, include: { payslips: true } });
    res.json({ runs: runs.map(({ payslips, settings, ...r }) => ({ ...r, totals: runTotals(payslips) })) });
  } catch (e) { fail(res, e); }
});

// GET /api/payroll/runs/:month — the run (if any), its payslips, and readiness.
router.get('/runs/:month', ...admin, async (req, res) => {
  try {
    const { month } = req.params;
    if (!MONTH.test(month)) return res.status(400).json({ message: 'month must be YYYY-MM' });
    const [run, lock] = await Promise.all([
      prisma.payrollRun.findUnique({ where: { month }, include: { payslips: { orderBy: { id: 'asc' } } } }),
      prisma.attendanceLock.findUnique({ where: { month }, select: { lockedAt: true, snapshot: true } }),
    ]);
    // Who is in the locked attendance but has no salary structure for the month.
    let missing = [];
    if (lock?.snapshot?.summary) {
      const rows = lock.snapshot.summary;
      const withStructure = new Set((await prisma.salaryStructure.findMany({
        where: { userId: { in: rows.map((r) => r.userId) }, effectiveFrom: { lte: month } },
        select: { userId: true },
      })).map((s) => s.userId));
      missing = rows.filter((r) => !withStructure.has(r.userId))
        .map((r) => ({ userId: r.userId, name: r.fullName || r.username }));
    }
    const names = run ? await nameMap([run.createdById, run.finalizedById]) : new Map();
    const payslips = (run?.payslips || []).sort((a, b) => String(a.employee?.name).localeCompare(String(b.employee?.name)));
    res.json({
      month,
      attendanceLocked: !!lock,
      canRun: !!lock && month <= currentMonthIST(),
      missing,
      run: run && {
        id: run.id, month: run.month, status: run.status, createdAt: run.createdAt, updatedAt: run.updatedAt,
        finalizedAt: run.finalizedAt, createdBy: names.get(run.createdById) || null,
        finalizedBy: names.get(run.finalizedById) || null, totals: runTotals(payslips),
      },
      payslips,
    });
  } catch (e) { fail(res, e); }
});

// POST /api/payroll/runs/:month/generate — build or rebuild the draft.
router.post('/runs/:month/generate', ...admin, async (req, res) => {
  try {
    const { month } = req.params;
    if (!MONTH.test(month)) return res.status(400).json({ message: 'month must be YYYY-MM' });
    const out = await generateRun(month, req.user.sub);
    res.json({ ok: true, count: out.count, missing: out.missing });
  } catch (e) { fail(res, e); }
});

const ADJ_NUM = ['arrears', 'bonus', 'otherEarning', 'otherDeduction', 'lopOverride', 'tdsOverride'];
const ADJ_TXT = ['otherEarningLabel', 'otherDeductionLabel', 'note'];

// PATCH /api/payroll/payslips/:id — { adjustments } on a DRAFT payslip, recomputed.
router.patch('/payslips/:id', ...admin, async (req, res) => {
  try {
    const p = await prisma.payslip.findUnique({ where: { id: Number(req.params.id) }, include: { run: true } });
    if (!p) return res.status(404).json({ message: 'Payslip not found' });
    if (p.run.status !== 'draft') return res.status(409).json({ message: 'Payroll is finalized — reopen it to make changes' });
    const a = req.body?.adjustments || {};
    const adj = {};
    for (const k of ADJ_NUM) {
      if (a[k] === '' || a[k] == null) continue;
      const n = Number(a[k]);
      if (!Number.isFinite(n) || n < 0 || n > 1e8) return res.status(400).json({ message: `${k} must be a positive amount` });
      if (k === 'lopOverride' && n > p.daysInMonth) return res.status(400).json({ message: 'LOP days cannot exceed the days in the month' });
      adj[k] = n;
    }
    for (const k of ADJ_TXT) if (a[k]) adj[k] = String(a[k]).trim().slice(0, 80);
    res.json(await recomputePayslip(p, adj));
  } catch (e) { fail(res, e); }
});

// POST /api/payroll/runs/:month/finalize — publish payslips, freeze figures.
router.post('/runs/:month/finalize', ...admin, async (req, res) => {
  try {
    const { month } = req.params;
    const run = await prisma.payrollRun.findUnique({ where: { month }, include: { _count: { select: { payslips: true } } } });
    if (!run) return res.status(404).json({ message: 'Generate the payroll first' });
    if (run.status === 'finalized') return res.status(409).json({ message: 'Already finalized' });
    if (!run._count.payslips) return res.status(400).json({ message: 'There are no payslips to finalize' });
    if (!(await prisma.attendanceLock.findUnique({ where: { month } })))
      return res.status(409).json({ message: 'Attendance for this month was unlocked — lock it and regenerate first' });
    await prisma.payrollRun.update({
      where: { id: run.id },
      data: { status: 'finalized', finalizedById: req.user.sub, finalizedAt: new Date() },
    });
    // Tell each employee their payslip is out; email anyone without the app.
    const ps = await prisma.payslip.findMany({ where: { runId: run.id }, select: { userId: true } });
    notify(ps.map((p) => p.userId), {
      kind: 'payroll', title: `Your payslip for ${monthLabel(month)} is ready`,
      body: 'Open My Payslips in the SESS app to view or download it.',
      data: { screen: 'Payslips' }, email: true,
    });
    res.json({ ok: true });
  } catch (e) { fail(res, e); }
});

// POST /api/payroll/runs/:month/reopen — back to draft (payslips hidden from
// employees again until re-finalized).
router.post('/runs/:month/reopen', ...admin, async (req, res) => {
  try {
    const run = await prisma.payrollRun.findUnique({ where: { month: req.params.month } });
    if (!run) return res.status(404).json({ message: 'No payroll for this month' });
    if (run.status !== 'finalized') return res.status(409).json({ message: 'Payroll is already a draft' });
    await prisma.payrollRun.update({ where: { id: run.id }, data: { status: 'draft', finalizedById: null, finalizedAt: null } });
    res.json({ ok: true });
  } catch (e) { fail(res, e); }
});

// DELETE /api/payroll/runs/:month — discard a draft.
router.delete('/runs/:month', ...admin, async (req, res) => {
  try {
    const run = await prisma.payrollRun.findUnique({ where: { month: req.params.month } });
    if (!run) return res.status(404).json({ message: 'No payroll for this month' });
    if (run.status === 'finalized') return res.status(409).json({ message: 'Reopen the payroll before deleting it' });
    await prisma.payrollRun.delete({ where: { id: run.id } });
    res.json({ ok: true });
  } catch (e) { fail(res, e); }
});

/* ==================== REGISTERS / STATUTORY FILES ==================== */

const csvCell = (v) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (rows) => rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
const line = (p, code) => (p.earnings || []).find((e) => e.code === code)?.amount || 0;
const dline = (p, code) => (p.deductions || []).find((d) => d.code === code)?.amount || 0;

const EXPORTS = {
  register: {
    ext: 'csv', title: 'Salary register',
    build: (ps) => csv([
      ['Emp ID', 'Name', 'Designation', 'Days in month', 'Paid days', 'LOP days', 'Basic', 'DA', 'HRA', 'Conveyance',
        'Special', 'Other allowance', 'OT pay', 'Arrears', 'Bonus', 'Other earning', 'Gross', 'PF', 'ESI', 'PT', 'TDS',
        'Other deduction', 'Total deductions', 'Net pay', 'Employer EPF', 'Employer EPS', 'Employer ESI'],
      ...ps.map((p) => [p.employee.employeeId, p.employee.name, p.employee.designation, p.daysInMonth, p.paidDays, p.lopDays,
        line(p, 'basic'), line(p, 'da'), line(p, 'hra'), line(p, 'conveyance'), line(p, 'specialAllowance'),
        line(p, 'otherAllowance'), line(p, 'ot'), line(p, 'arrears'), line(p, 'bonus'), line(p, 'otherEarning'),
        p.gross, p.pfEmployee, p.esiEmployee, p.pt, p.tds, dline(p, 'otherDeduction'), p.totalDeductions, p.netPay,
        p.epfEmployer, p.epsEmployer, p.esiEmployer]),
    ]),
  },
  bank: {
    ext: 'csv', title: 'Bank transfer',
    build: (ps) => csv([
      ['Emp ID', 'Name', 'Bank', 'Account number', 'IFSC', 'Net pay'],
      ...ps.filter((p) => p.netPay > 0).map((p) => [p.employee.employeeId, p.employee.name, p.employee.bankName,
        p.employee.bankAccount ? `'${p.employee.bankAccount}` : '', p.employee.bankIfsc, p.netPay]),
    ]),
  },
  // EPFO ECR 2.0 text upload: one member per line, fields joined by #~#
  // UAN, name, gross wages, EPF wages, EPS wages, EDLI wages, EE share,
  // EPS share, ER (EPF) share, NCP days, refund of advances.
  ecr: {
    ext: 'txt', title: 'PF ECR',
    build: (ps, settings) => ps.filter((p) => p.pfEmployee > 0).map((p) => {
      const capped = Math.min(p.pfWage, Number(settings.pf.wageCeiling));
      return [p.employee.uan || 'UAN-MISSING', p.employee.name, p.gross, p.pfWage, capped, capped,
        p.pfEmployee, p.epsEmployer, p.epfEmployer, Math.round(p.lopDays), 0].join('#~#');
    }).join('\r\n'),
  },
  esi: {
    ext: 'csv', title: 'ESI contribution',
    build: (ps) => csv([
      ['IP Number', 'IP Name', 'No of days paid', 'Total monthly wages', 'Employee contribution', 'Employer contribution', 'Reason code'],
      ...ps.filter((p) => p.esiWage > 0).map((p) => [p.employee.esiNumber || 'IP-MISSING', p.employee.name,
        Math.round(p.paidDays), p.esiWage, p.esiEmployee, p.esiEmployer, Math.round(p.paidDays) === 0 ? 1 : 0]),
    ]),
  },
  pt: {
    ext: 'csv', title: 'Professional Tax',
    build: (ps) => csv([
      ['Emp ID', 'Name', 'Gross', 'Professional Tax'],
      ...ps.filter((p) => p.pt > 0).map((p) => [p.employee.employeeId, p.employee.name, p.gross, p.pt]),
    ]),
  },
  tds: {
    ext: 'csv', title: 'TDS',
    build: (ps) => csv([
      ['Emp ID', 'Name', 'PAN', 'Gross', 'TDS'],
      ...ps.filter((p) => p.tds > 0).map((p) => [p.employee.employeeId, p.employee.name, p.employee.pan || 'PAN-MISSING', p.gross, p.tds]),
    ]),
  },
};

// GET /api/payroll/runs/:month/export/:kind — register / statutory file download.
router.get('/runs/:month/export/:kind', ...admin, async (req, res) => {
  try {
    const exp = EXPORTS[req.params.kind];
    if (!exp) return res.status(404).json({ message: 'Unknown export' });
    const run = await prisma.payrollRun.findUnique({ where: { month: req.params.month }, include: { payslips: true } });
    if (!run) return res.status(404).json({ message: 'No payroll for this month' });
    const ps = run.payslips.sort((a, b) => String(a.employee?.name).localeCompare(String(b.employee?.name)));
    const body = exp.build(ps, run.settings);
    const draft = run.status === 'draft' ? '_DRAFT' : '';
    res.setHeader('Content-Type', exp.ext === 'csv' ? 'text/csv; charset=utf-8' : 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${req.params.kind}_${run.month}${draft}.${exp.ext}"`);
    res.send(exp.ext === 'csv' ? `﻿${body}` : body); // BOM so Excel reads ₹/UTF-8 names correctly
  } catch (e) { fail(res, e); }
});

/* ==================== EMPLOYEE: MY PAYSLIPS ==================== */

// GET /api/payroll/my — my finalized payslips, newest first.
router.get('/my', requireAuth, async (req, res) => {
  try {
    const ps = await prisma.payslip.findMany({
      where: { userId: req.user.sub, run: { status: 'finalized' } },
      orderBy: { month: 'desc' },
      select: { id: true, month: true, gross: true, totalDeductions: true, netPay: true, paidDays: true, daysInMonth: true },
    });
    res.json({ payslips: ps });
  } catch (e) { fail(res, e); }
});

// Own finalized payslip, or any payslip for an admin.
async function readablePayslip(req) {
  const p = await prisma.payslip.findUnique({ where: { id: Number(req.params.id) }, include: { run: true } });
  if (!p) return null;
  if (isAdmin(req)) return p;
  return p.userId === req.user.sub && p.run.status === 'finalized' ? p : null;
}

const publicPayslip = ({ run, adjustments, ...p }) => ({
  ...p,
  status: run.status,
  company: run.settings?.company || PAYROLL_DEFAULTS.company,
  note: adjustments?.note || null,
  employerContributions: { epf: p.epfEmployer, eps: p.epsEmployer, esi: p.esiEmployer },
});

router.get('/payslips/:id', requireAuth, async (req, res) => {
  try {
    const p = await readablePayslip(req);
    if (!p) return res.status(404).json({ message: 'Payslip not found' });
    res.json(publicPayslip(p));
  } catch (e) { fail(res, e); }
});

/* ---------- printable payslip (browser → Print → Save as PDF) ---------- */

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const maskAcct = (a) => (a ? `XXXX${String(a).slice(-4)}` : '—');

// Indian-system amount in words (lakh / crore), whole rupees.
function inWords(num) {
  const n = Math.round(Math.abs(Number(num) || 0));
  if (n === 0) return 'Zero Rupees Only';
  const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
    'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const two = (x) => (x < 20 ? a[x] : `${b[Math.floor(x / 10)]}${x % 10 ? ` ${a[x % 10]}` : ''}`);
  const three = (x) => (x >= 100 ? `${a[Math.floor(x / 100)]} Hundred${x % 100 ? ` ${two(x % 100)}` : ''}` : two(x));
  const parts = [];
  const crore = Math.floor(n / 1e7), lakh = Math.floor((n % 1e7) / 1e5), thousand = Math.floor((n % 1e5) / 1e3), rest = n % 1e3;
  if (crore) parts.push(`${three(crore)} Crore`);
  if (lakh) parts.push(`${two(lakh)} Lakh`);
  if (thousand) parts.push(`${two(thousand)} Thousand`);
  if (rest) parts.push(three(rest));
  return `${parts.join(' ')} Rupees Only`;
}

function payslipHtml(p) {
  const e = p.employee || {};
  const co = p.company;
  const rows = Math.max(p.earnings.length, p.deductions.length);
  const tr = [];
  for (let i = 0; i < rows; i++) {
    const er = p.earnings[i], dr = p.deductions[i];
    tr.push(`<tr><td>${esc(er?.label || '')}</td><td class="n">${er ? inr(er.amount) : ''}</td>
      <td>${esc(dr?.label || '')}</td><td class="n">${dr ? inr(dr.amount) : ''}</td></tr>`);
  }
  const info = [
    ['Employee', e.name], ['Employee ID', e.employeeId], ['Designation', e.designation], ['Department', e.department],
    ['Date of joining', e.dateOfJoining], ['PAN', e.pan], ['UAN', e.uan], ['ESI number', e.esiNumber],
    ['Bank', e.bankName], ['Account', maskAcct(e.bankAccount)],
    ['Days in month', p.daysInMonth], ['Paid days', p.paidDays], ['LOP days', p.lopDays],
  ].filter(([, v]) => v != null && v !== '');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Payslip ${esc(p.month)} — ${esc(e.name)}</title>
<style>
  *{box-sizing:border-box} body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#1e293b;margin:0;background:#f1f5f9}
  .page{max-width:820px;margin:24px auto;background:#fff;padding:32px;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.08)}
  h1{font-size:20px;margin:0} .co{color:#64748b;font-size:13px;margin-top:2px}
  .head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;border-bottom:2px solid #1e3a8a;padding-bottom:14px}
  .tag{font-size:13px;font-weight:700;color:#1e3a8a;text-align:right} .draft{color:#b45309}
  .info{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px 24px;margin:16px 0;font-size:13px}
  .info div{display:flex;justify-content:space-between;border-bottom:1px dashed #e2e8f0;padding:3px 0} .info span{color:#64748b}
  table{width:100%;border-collapse:collapse;font-size:13px;margin-top:8px}
  th{background:#eef2ff;color:#1e3a8a;text-align:left;padding:8px} td{padding:7px 8px;border-bottom:1px solid #f1f5f9}
  .n{text-align:right;font-variant-numeric:tabular-nums} tfoot td{font-weight:700;border-top:2px solid #cbd5e1}
  .net{margin-top:16px;padding:14px;border-radius:10px;background:#ecfdf5;display:flex;justify-content:space-between;align-items:center}
  .net b{font-size:22px;color:#047857} .words{font-size:12px;color:#475569;margin-top:4px}
  .foot{margin-top:18px;font-size:11px;color:#94a3b8} .er{font-size:12px;color:#64748b;margin-top:10px}
  .print{position:fixed;right:16px;bottom:16px;background:#1e3a8a;color:#fff;border:0;border-radius:10px;padding:12px 18px;font-weight:700;cursor:pointer}
  @media print{body{background:#fff}.page{box-shadow:none;margin:0;max-width:none}.print{display:none}}
  @media (max-width:560px){.page{padding:18px;margin:0;border-radius:0}.info{grid-template-columns:1fr}}
</style></head><body>
<div class="page">
  <div class="head">
    <div><h1>${esc(co.name)}</h1>${co.address ? `<div class="co">${esc(co.address)}</div>` : ''}</div>
    <div class="tag">PAYSLIP<br>${esc(monthLabel(p.month))}${p.status === 'draft' ? '<br><span class="draft">DRAFT — not final</span>' : ''}</div>
  </div>
  <div class="info">${info.map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</div>
  <table>
    <thead><tr><th>Earnings</th><th class="n">Amount</th><th>Deductions</th><th class="n">Amount</th></tr></thead>
    <tbody>${tr.join('')}</tbody>
    <tfoot><tr><td>Gross earnings</td><td class="n">${inr(p.gross)}</td><td>Total deductions</td><td class="n">${inr(p.totalDeductions)}</td></tr></tfoot>
  </table>
  <div class="net"><div><div>Net pay</div><div class="words">${esc(inWords(p.netPay))}</div></div><b>${inr(p.netPay)}</b></div>
  ${p.epfEmployer + p.epsEmployer + p.esiEmployer > 0
    ? `<div class="er">Employer contributions (not deducted from your pay): EPF ${inr(p.epfEmployer)} · EPS ${inr(p.epsEmployer)} · ESI ${inr(p.esiEmployer)}</div>`
    : ''}
  ${p.note ? `<div class="er">Note: ${esc(p.note)}</div>` : ''}
  <div class="foot">This is a system-generated payslip and does not require a signature.</div>
</div>
<button class="print" onclick="window.print()">Print / Save as PDF</button>
</body></html>`;
}

// GET /api/payroll/payslips/:id/html — accepts the token as ?t= so it can be
// opened straight in a browser tab (web) or the phone's browser (mobile).
router.get('/payslips/:id/html', requireAuthFile, async (req, res) => {
  try {
    const p = await readablePayslip(req);
    if (!p) return res.status(404).send('Payslip not found');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    // Inline style + the single print button only; nothing else may run.
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'");
    res.setHeader('Cache-Control', 'no-store');
    res.send(payslipHtml(publicPayslip(p)));
  } catch (e) { fail(res, e); }
});

module.exports = router;
// Exposed for tests.
Object.assign(module.exports, { inWords, payslipHtml, publicPayslip, EXPORTS });
