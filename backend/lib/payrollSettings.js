// Statutory payroll configuration, stored as one JSON row (app_settings
// key "payroll") and editable from the web console's Payroll → Settings.
//
// The defaults below are starting points, NOT legal advice: PF/ESI rates and
// ceilings change by notification, Professional Tax differs by state and local
// body, and income-tax slabs change every Budget. Have them checked by your
// CA / payroll consultant before the first real run.
const prisma = require('./prisma');

const KEY = 'payroll';

const DEFAULTS = {
  company: { name: 'Sri Easwari Scientific Solutions Pvt Ltd', address: '' },
  pf: {
    enabled: true,
    employeeRate: 12, // % of PF wages (Basic + DA)
    employerRate: 12, // total employer share; EPS is carved out of it
    epsRate: 8.33, // employer → Pension Scheme, always on wages capped at the ceiling
    wageCeiling: 15000,
  },
  esi: {
    enabled: true,
    employeeRate: 0.75,
    employerRate: 3.25,
    wageLimit: 21000, // covered when the full monthly gross is at or below this
  },
  pt: {
    enabled: true,
    state: 'Tamil Nadu',
    // 'halfyearly': slab applied to the half-year's gross (Apr–Sep, Oct–Mar) and
    // deducted in the listed months. 'monthly': slab on each month's gross.
    basis: 'halfyearly',
    months: [9, 3],
    // Half-yearly income slabs (upTo null = and above). Revised TN slabs —
    // VERIFY against your local body's current schedule.
    slabs: [
      { upTo: 21000, amount: 0 },
      { upTo: 30000, amount: 180 },
      { upTo: 45000, amount: 430 },
      { upTo: 60000, amount: 930 },
      { upTo: 75000, amount: 1025 },
      { upTo: null, amount: 1250 },
    ],
  },
  tds: {
    enabled: true,
    regime: 'new',
    standardDeduction: 75000,
    // New-regime slabs on annual taxable income — VERIFY for the current FY.
    slabs: [
      { upTo: 400000, rate: 0 },
      { upTo: 800000, rate: 5 },
      { upTo: 1200000, rate: 10 },
      { upTo: 1600000, rate: 15 },
      { upTo: 2000000, rate: 20 },
      { upTo: 2400000, rate: 25 },
      { upTo: null, rate: 30 },
    ],
    rebateLimit: 1200000, // s.87A: no tax up to this taxable income (with marginal relief above)
    cess: 4,
  },
  ot: {
    multiplier: 2, // Factories Act: twice the ordinary rate
    divisorDays: 26, // ordinary daily rate = (Basic + DA) / this
    hoursPerDay: 8,
  },
  lop: {
    halfDayAsHalfLop: true, // a half-day flagged by the shift rules costs 0.5 day
  },
};

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
function merge(base, over) {
  if (!isObj(over)) return base;
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = isObj(v) && isObj(base[k]) ? merge(base[k], v) : v;
  return out;
}

async function getPayrollSettings() {
  const row = await prisma.appSetting.findUnique({ where: { key: KEY } });
  return merge(DEFAULTS, row?.value);
}

const num = (v, min, max) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};

// Validate a full settings object from the UI. Returns { ok, value } / { ok:false, message }.
function validateSettings(input) {
  const s = merge(DEFAULTS, input);
  const fail = (message) => ({ ok: false, message });
  const pct = (v, label) => (num(v, 0, 100) == null ? `${label} must be a percentage (0–100)` : null);
  const err = pct(s.pf.employeeRate, 'PF employee rate') || pct(s.pf.employerRate, 'PF employer rate')
    || pct(s.pf.epsRate, 'EPS rate') || pct(s.esi.employeeRate, 'ESI employee rate')
    || pct(s.esi.employerRate, 'ESI employer rate') || pct(s.tds.cess, 'Cess');
  if (err) return fail(err);
  if (s.pf.epsRate > s.pf.employerRate) return fail('EPS rate cannot exceed the employer PF rate');
  if (num(s.pf.wageCeiling, 0, 1e7) == null) return fail('PF wage ceiling must be a positive number');
  if (num(s.esi.wageLimit, 0, 1e7) == null) return fail('ESI wage limit must be a positive number');
  if (!['monthly', 'halfyearly'].includes(s.pt.basis)) return fail('PT basis must be monthly or half-yearly');
  if (!Array.isArray(s.pt.months) || s.pt.months.some((m) => !Number.isInteger(Number(m)) || m < 1 || m > 12))
    return fail('PT deduction months must be 1–12');
  s.pt.months = [...new Set(s.pt.months.map(Number))];
  const slabCheck = (slabs, field, label, max) => {
    if (!Array.isArray(slabs) || slabs.length === 0) return `${label} needs at least one slab`;
    let prev = -1;
    for (let i = 0; i < slabs.length; i++) {
      const sl = slabs[i];
      const last = i === slabs.length - 1;
      if (last ? sl.upTo != null && num(sl.upTo, 0, 1e10) == null : num(sl.upTo, 0, 1e10) == null)
        return `${label}: every slab except the last needs an upper limit`;
      if (sl.upTo != null && Number(sl.upTo) <= prev) return `${label}: slab limits must increase`;
      if (sl.upTo != null) prev = Number(sl.upTo);
      if (num(sl[field], 0, max) == null) return `${label}: invalid ${field} in slab ${i + 1}`;
    }
    return null;
  };
  const slabErr = slabCheck(s.pt.slabs, 'amount', 'Professional Tax', 1e6) || slabCheck(s.tds.slabs, 'rate', 'TDS', 100);
  if (slabErr) return fail(slabErr);
  for (const [v, label] of [[s.tds.standardDeduction, 'Standard deduction'], [s.tds.rebateLimit, 'Rebate limit']])
    if (num(v, 0, 1e9) == null) return fail(`${label} must be a positive number`);
  if (num(s.ot.multiplier, 0, 10) == null || num(s.ot.divisorDays, 1, 31) == null || num(s.ot.hoursPerDay, 1, 24) == null)
    return fail('Check the overtime settings');
  return { ok: true, value: s };
}

async function savePayrollSettings(value) {
  await prisma.appSetting.upsert({ where: { key: KEY }, update: { value }, create: { key: KEY, value } });
}

module.exports = { PAYROLL_DEFAULTS: DEFAULTS, getPayrollSettings, validateSettings, savePayrollSettings };
