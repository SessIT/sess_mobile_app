// Payroll — three tabs:
//   Run payroll        month → generate from LOCKED attendance → adjust → finalize → registers
//   Salary structures  per-employee monthly pay, effective-dated (increments keep history)
//   Settings           PF / ESI / PT / TDS / OT rules (every statutory number is editable)

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet, apiPost, api, apiDownload, payslipUrl } from '../lib/api';
import { monthIST } from '../lib/format';
import {
  Card, CardBody, Button, Input, Field, Select, Badge, StatCard, Loading, EmptyState, ErrorNote, PageHeader, Modal, Spinner, cx,
} from '../components/ui';
import { IconChart, IconDownload, IconEdit, IconEye, IconLock, IconTrash, IconUsers, IconPlus } from '../components/icons';

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const prevMonth = () => {
  const [y, m] = monthIST().split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
};
const monthName = (ym) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const COMPONENTS = [
  ['basic', 'Basic'], ['da', 'Dearness allowance (DA)'], ['hra', 'HRA'],
  ['conveyance', 'Conveyance'], ['specialAllowance', 'Special allowance'], ['otherAllowance', 'Other allowance'],
];
const nameOf = (u) => u?.fullName || u?.username || u?.name || '—';

export default function Payroll() {
  const [tab, setTab] = useState('run');
  const seg = (key) => cx(
    'rounded-lg px-4 py-1.5 text-sm font-semibold transition focus:outline-none',
    tab === key ? 'bg-white text-brand-800 shadow-sm ring-1 ring-slate-200/80' : 'text-slate-500 hover:text-slate-700',
  );
  return (
    <div>
      <PageHeader
        title="Payroll"
        subtitle="Monthly salary from locked attendance, with PF, ESI, Professional Tax and TDS."
        actions={(
          <div className="inline-flex items-center gap-1 rounded-xl bg-slate-100 p-1">
            <button type="button" className={seg('run')} onClick={() => setTab('run')}>Run payroll</button>
            <button type="button" className={seg('structures')} onClick={() => setTab('structures')}>Salary structures</button>
            <button type="button" className={seg('settings')} onClick={() => setTab('settings')}>Settings</button>
          </div>
        )}
      />
      {tab === 'run' && <RunTab onGoStructures={() => setTab('structures')} />}
      {tab === 'structures' && <StructuresTab />}
      {tab === 'settings' && <SettingsTab />}
    </div>
  );
}

/* ================================================================ Run tab */

const EXPORTS = [
  ['register', 'Salary register (CSV)'],
  ['bank', 'Bank transfer sheet (CSV)'],
  ['ecr', 'PF ECR upload (TXT)'],
  ['esi', 'ESI contribution (CSV)'],
  ['pt', 'Professional Tax (CSV)'],
  ['tds', 'TDS (CSV)'],
];

function RunTab({ onGoStructures }) {
  const [month, setMonth] = useState(prevMonth());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [adjusting, setAdjusting] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    return apiGet(`/payroll/runs/${month}`)
      .then(setData)
      .catch((e) => setError(e.message || 'Failed to load payroll'))
      .finally(() => setLoading(false));
  }, [month]);
  useEffect(() => { load(); }, [load]);

  const act = async (key, fn, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(key);
    try { await fn(); await load(); } catch (e) { window.alert(e.message); } finally { setBusy(''); }
  };

  const run = data?.run;
  const draft = run?.status === 'draft';
  const t = run?.totals;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Payroll month</span>
          <Input type="month" value={month} max={monthIST()} onChange={(e) => e.target.value && setMonth(e.target.value)} className="w-48" />
        </label>
        {run && (
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={draft ? 'amber' : 'green'}>{draft ? 'Draft' : 'Finalized'}</Badge>
            {draft && (
              <>
                <Button variant="secondary" disabled={!!busy} onClick={() => act('gen', () => apiPost(`/payroll/runs/${month}/generate`, {}))}>
                  {busy === 'gen' && <Spinner className="h-4 w-4" />} Regenerate
                </Button>
                <Button variant="ghost" disabled={!!busy}
                  onClick={() => act('del', () => api(`/payroll/runs/${month}`, { method: 'DELETE' }), `Discard the ${monthName(month)} draft?`)}>
                  Discard draft
                </Button>
                <Button variant="success" disabled={!!busy || !data.payslips.length}
                  onClick={() => act('fin', () => apiPost(`/payroll/runs/${month}/finalize`, {}),
                    `Finalize payroll for ${monthName(month)}?\n\nPayslips are published to employees and the figures are frozen.`)}>
                  {busy === 'fin' && <Spinner className="h-4 w-4 text-white" />} Finalize & publish
                </Button>
              </>
            )}
            {!draft && (
              <Button variant="secondary" disabled={!!busy}
                onClick={() => act('reopen', () => apiPost(`/payroll/runs/${month}/reopen`, {}),
                  `Reopen ${monthName(month)} payroll?\n\nPayslips are hidden from employees until you finalize again.`)}>
                Reopen
              </Button>
            )}
          </div>
        )}
      </div>

      {loading && <Loading label="Loading payroll…" />}
      {!loading && error && <ErrorNote>{error}</ErrorNote>}

      {!loading && !error && data && !data.attendanceLocked && (
        <Card>
          <CardBody className="flex flex-wrap items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600"><IconLock className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-slate-800">Attendance for {monthName(month)} isn&apos;t locked yet</p>
              <p className="text-sm text-slate-500">
                Payroll is calculated from the frozen attendance snapshot, so no late correction can change pay after it is run.
              </p>
            </div>
            <Link to="/attendance" className="text-sm font-semibold text-brand-700 hover:underline">Go to Team Attendance → Lock for payroll</Link>
          </CardBody>
        </Card>
      )}

      {!loading && !error && data?.attendanceLocked && !run && (
        <Card>
          <CardBody className="flex flex-col items-center gap-3 py-10 text-center">
            <IconChart className="h-8 w-8 text-slate-300" />
            <p className="font-semibold text-slate-700">No payroll for {monthName(month)} yet</p>
            <p className="max-w-md text-sm text-slate-500">
              Generating builds a draft payslip for every employee with a salary structure. You can adjust and regenerate
              freely until you finalize.
            </p>
            <Button disabled={!!busy} onClick={() => act('gen', () => apiPost(`/payroll/runs/${month}/generate`, {}))}>
              {busy === 'gen' && <Spinner className="h-4 w-4 text-white" />} Generate payroll
            </Button>
          </CardBody>
        </Card>
      )}

      {!loading && !error && data?.missing?.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span className="font-semibold">{data.missing.length} employee{data.missing.length === 1 ? '' : 's'} without a salary structure</span>
          {' '}— no payslip until one is set: {data.missing.map((m) => m.name).join(', ')}.{' '}
          <button type="button" className="font-semibold underline" onClick={onGoStructures}>Set salaries</button>
        </div>
      )}

      {!loading && !error && run && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard label="Employees" value={t.employees} tone="blue" icon={<IconUsers className="h-5 w-5" />} />
            <StatCard label="Gross pay" value={inr(t.gross)} />
            <StatCard label="Deductions" value={inr(t.totalDeductions)} tone="amber" sub={`PF ${inr(t.pfEmployee)} · ESI ${inr(t.esiEmployee)}`} />
            <StatCard label="Net pay" value={inr(t.netPay)} tone="green" sub={`PT ${inr(t.pt)} · TDS ${inr(t.tds)}`} />
            <StatCard label="Employer cost" value={inr(t.gross + t.pfEmployer + t.esiEmployer)} sub={`PF ${inr(t.pfEmployer)} · ESI ${inr(t.esiEmployer)}`} />
          </div>

          <Card>
            <CardBody>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-slate-600">Downloads{draft ? ' (marked DRAFT)' : ''}:</span>
                {EXPORTS.map(([k, label]) => (
                  <Button key={k} variant="secondary" size="sm" disabled={!!busy}
                    onClick={() => apiDownload(`/payroll/runs/${month}/export/${k}`).catch((e) => window.alert(e.message))}>
                    <IconDownload className="h-4 w-4" /> {label}
                  </Button>
                ))}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                      <th className="px-3 py-2 font-semibold">Employee</th>
                      <th className="px-3 py-2 text-center font-semibold">Paid days</th>
                      <th className="px-3 py-2 text-right font-semibold">Gross</th>
                      <th className="px-3 py-2 text-right font-semibold">PF</th>
                      <th className="px-3 py-2 text-right font-semibold">ESI</th>
                      <th className="px-3 py-2 text-right font-semibold">PT</th>
                      <th className="px-3 py-2 text-right font-semibold">TDS</th>
                      <th className="px-3 py-2 text-right font-semibold">Other</th>
                      <th className="px-3 py-2 text-right font-semibold">Net pay</th>
                      <th className="px-3 py-2 text-right font-semibold" />
                    </tr>
                  </thead>
                  <tbody>
                    {data.payslips.map((p) => {
                      const other = (p.deductions || []).find((d) => d.code === 'otherDeduction')?.amount || 0;
                      const adjusted = Object.keys(p.adjustments || {}).some((k) => k !== 'tdsNote');
                      return (
                        <tr key={p.id} className="border-b border-slate-100">
                          <td className="px-3 py-2.5">
                            <p className="font-semibold text-slate-800">{p.employee?.name}</p>
                            <p className="text-xs text-slate-400">
                              {p.employee?.employeeId || '—'}{adjusted ? ' · adjusted' : ''}
                            </p>
                          </td>
                          <td className="px-3 py-2.5 text-center tabular-nums">
                            {p.paidDays}/{p.daysInMonth}
                            {p.lopDays > 0 && <span className="block text-xs text-red-600">LOP {p.lopDays}</span>}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{inr(p.gross)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{p.pfEmployee ? inr(p.pfEmployee) : '—'}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{p.esiEmployee ? inr(p.esiEmployee) : '—'}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{p.pt ? inr(p.pt) : '—'}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{p.tds ? inr(p.tds) : '—'}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{other ? inr(other) : '—'}</td>
                          <td className={cx('px-3 py-2.5 text-right font-bold tabular-nums', p.netPay < 0 ? 'text-red-600' : 'text-emerald-700')}>
                            {inr(p.netPay)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-right">
                            <a href={payslipUrl(p.id)} target="_blank" rel="noreferrer" title="View payslip"
                              className="inline-flex rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
                              <IconEye className="h-4 w-4" />
                            </a>
                            {draft && (
                              <button type="button" title="Adjust" onClick={() => setAdjusting(p)}
                                className="inline-flex rounded-lg p-1.5 text-brand-700 hover:bg-brand-50">
                                <IconEdit className="h-4 w-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs text-slate-400">
                {run.createdBy ? `Generated by ${run.createdBy}. ` : ''}
                {run.finalizedAt ? `Finalized by ${run.finalizedBy || 'admin'} on ${new Date(run.finalizedAt).toLocaleDateString('en-IN')}.` : 'Not yet published to employees.'}
              </p>
            </CardBody>
          </Card>
        </>
      )}

      <AdjustModal payslip={adjusting} onClose={() => setAdjusting(null)} onSaved={() => { setAdjusting(null); load(); }} />
    </div>
  );
}

function AdjustModal({ payslip, onClose, onSaved }) {
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!payslip) return;
    const { tdsNote, ...a } = payslip.adjustments || {};
    setForm(Object.fromEntries(Object.entries(a).map(([k, v]) => [k, String(v ?? '')])));
    setError('');
  }, [payslip]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await api(`/payroll/payslips/${payslip.id}`, { method: 'PATCH', body: JSON.stringify({ adjustments: form }) });
      onSaved();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const tdsNote = payslip?.adjustments?.tdsNote;
  return (
    <Modal
      open={!!payslip}
      onClose={onClose}
      title={`Adjust — ${payslip?.employee?.name || ''}`}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy && <Spinner className="h-4 w-4 text-white" />} Save & recalculate</Button>
        </>
      )}
    >
      <div className="space-y-4">
        <ErrorNote>{error}</ErrorNote>
        <p className="text-xs text-slate-500">Leave a field empty for none. Everything is recalculated, including PF, ESI and TDS.</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Arrears (₹)"><Input type="number" min="0" value={form.arrears || ''} onChange={set('arrears')} /></Field>
          <Field label="Bonus (₹)" hint="Excluded from ESI wages"><Input type="number" min="0" value={form.bonus || ''} onChange={set('bonus')} /></Field>
          <Field label="Other earning (₹)"><Input type="number" min="0" value={form.otherEarning || ''} onChange={set('otherEarning')} /></Field>
          <Field label="…its label"><Input value={form.otherEarningLabel || ''} onChange={set('otherEarningLabel')} placeholder="e.g. Expense reimbursement" /></Field>
          <Field label="Other deduction (₹)"><Input type="number" min="0" value={form.otherDeduction || ''} onChange={set('otherDeduction')} /></Field>
          <Field label="…its label"><Input value={form.otherDeductionLabel || ''} onChange={set('otherDeductionLabel')} placeholder="e.g. Salary advance" /></Field>
          <Field label="LOP days override" hint={`From attendance: ${payslip?.lopDays ?? 0}`}>
            <Input type="number" min="0" step="0.5" value={form.lopOverride || ''} onChange={set('lopOverride')} />
          </Field>
          <Field label="TDS override (₹)"
            hint={tdsNote && typeof tdsNote === 'object'
              ? `Projected: taxable ${inr(tdsNote.taxable)}, annual tax ${inr(tdsNote.annualTax)}` : 'Replaces the projection'}>
            <Input type="number" min="0" value={form.tdsOverride || ''} onChange={set('tdsOverride')} />
          </Field>
        </div>
        <Field label="Note on payslip"><Input value={form.note || ''} onChange={set('note')} maxLength={80} /></Field>
      </div>
    </Modal>
  );
}

/* ========================================================= Structures tab */

function StructuresTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);

  const load = useCallback(() => {
    setError('');
    return apiGet('/payroll/structures')
      .then(setData)
      .catch((e) => setError(e.message || 'Failed to load salary structures'))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const rows = (data?.employees || []).filter((u) =>
    !q || `${nameOf(u)} ${u.username} ${u.employeeId || ''}`.toLowerCase().includes(q.toLowerCase()));
  const without = (data?.employees || []).filter((u) => !u.current && !u.upcoming.length).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search employees" className="w-64" />
        {without > 0 && <Badge tone="amber">{without} without a salary</Badge>}
      </div>
      {loading && <Loading label="Loading salaries…" />}
      {!loading && error && <ErrorNote>{error}</ErrorNote>}
      {!loading && !error && (
        <Card>
          <CardBody>
            {rows.length === 0 ? <EmptyState title="No employees" /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                      <th className="px-3 py-2 font-semibold">Employee</th>
                      <th className="px-3 py-2 font-semibold">Effective</th>
                      <th className="px-3 py-2 text-right font-semibold">Basic + DA</th>
                      <th className="px-3 py-2 text-right font-semibold">Monthly gross</th>
                      <th className="px-3 py-2 font-semibold">Statutory</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((u) => {
                      const s = u.current;
                      return (
                        <tr key={u.id} className="border-b border-slate-100">
                          <td className="px-3 py-2.5">
                            <p className="font-semibold text-slate-800">{nameOf(u)}</p>
                            <p className="text-xs text-slate-400">{u.employeeId || `@${u.username}`}{u.designation ? ` · ${u.designation}` : ''}</p>
                          </td>
                          <td className="px-3 py-2.5 text-slate-600">
                            {s ? monthName(s.effectiveFrom) : <span className="text-amber-600">Not set</span>}
                            {u.upcoming.length > 0 && <Badge tone="blue" className="ml-1">next: {u.upcoming[u.upcoming.length - 1].effectiveFrom}</Badge>}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{s ? inr(s.basic + s.da) : '—'}</td>
                          <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{s ? inr(s.gross) : '—'}</td>
                          <td className="px-3 py-2.5">
                            {s && (
                              <div className="flex flex-wrap gap-1">
                                {s.pfEnabled && <Badge tone="slate">PF</Badge>}
                                {s.esiEnabled && <Badge tone="slate">ESI</Badge>}
                                {s.ptEnabled && <Badge tone="slate">PT</Badge>}
                                {s.tdsEnabled && <Badge tone="slate">{s.tdsMonthlyOverride != null ? `TDS ₹${s.tdsMonthlyOverride}` : 'TDS'}</Badge>}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <Button size="sm" variant={s ? 'secondary' : 'primary'} onClick={() => setEditing(u)}>
                              {s ? <><IconEdit className="h-4 w-4" /> Revise</> : <><IconPlus className="h-4 w-4" /> Set salary</>}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>
      )}
      <StructureModal employee={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} onChanged={load} />
    </div>
  );
}

const blankStructure = () => ({
  effectiveFrom: monthIST(), basic: '', da: '', hra: '', conveyance: '', specialAllowance: '', otherAllowance: '',
  pfEnabled: true, pfOnFullWage: false, esiEnabled: true, ptEnabled: true, tdsEnabled: true, tdsMonthlyOverride: '', note: '',
});

function StructureModal({ employee, onClose, onSaved, onChanged }) {
  const [form, setForm] = useState(blankStructure());
  const [splitGross, setSplitGross] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!employee) return;
    const s = employee.current;
    setForm(s ? {
      ...blankStructure(),
      ...Object.fromEntries(COMPONENTS.map(([k]) => [k, s[k] ? String(s[k]) : ''])),
      pfEnabled: s.pfEnabled, pfOnFullWage: s.pfOnFullWage, esiEnabled: s.esiEnabled, ptEnabled: s.ptEnabled,
      tdsEnabled: s.tdsEnabled, tdsMonthlyOverride: s.tdsMonthlyOverride != null ? String(s.tdsMonthlyOverride) : '',
    } : blankStructure());
    // CTC is stored per year on the profile — a monthly starting point.
    setSplitGross(!s && employee.salaryCtc ? String(Math.round(employee.salaryCtc / 12)) : '');
    setError('');
  }, [employee]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const gross = COMPONENTS.reduce((s, [k]) => s + (Number(form[k]) || 0), 0);

  // Common split: Basic 50 %, HRA 40 % of Basic, the rest Special allowance.
  const split = () => {
    const g = Number(splitGross);
    if (!(g > 0)) return;
    const basic = Math.round(g * 0.5);
    const hra = Math.round(basic * 0.4);
    setForm((f) => ({ ...f, basic: String(basic), da: '', hra: String(hra), conveyance: '', otherAllowance: '', specialAllowance: String(g - basic - hra) }));
  };

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await apiPost('/payroll/structures', { ...form, userId: employee.id });
      onSaved();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const remove = async (s) => {
    if (!window.confirm(`Delete the structure effective ${monthName(s.effectiveFrom)}? Finalized payslips are not affected.`)) return;
    try { await api(`/payroll/structures/${s.id}`, { method: 'DELETE' }); onChanged(); onClose(); } catch (e) { setError(e.message); }
  };

  return (
    <Modal
      open={!!employee}
      onClose={onClose}
      width="max-w-2xl"
      title={`Salary — ${nameOf(employee)}`}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy && <Spinner className="h-4 w-4 text-white" />} Save structure</Button>
        </>
      )}
    >
      <div className="space-y-4">
        <ErrorNote>{error}</ErrorNote>
        <div className="flex flex-wrap items-end gap-3 rounded-lg bg-slate-50 p-3">
          <Field label="Quick split from monthly gross (₹)" hint="Basic 50 % · HRA 40 % of basic · rest special">
            <Input type="number" min="0" value={splitGross} onChange={(e) => setSplitGross(e.target.value)} className="w-48" />
          </Field>
          <Button variant="secondary" onClick={split} disabled={!(Number(splitGross) > 0)}>Split</Button>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Effective from" hint="A revision applies from this month on">
            <Input type="month" value={form.effectiveFrom} onChange={set('effectiveFrom')} />
          </Field>
          {COMPONENTS.map(([k, label]) => (
            <Field key={k} label={`${label} (₹/month)`}>
              <Input type="number" min="0" value={form[k]} onChange={set(k)} />
            </Field>
          ))}
        </div>
        <p className="text-sm text-slate-600">Monthly gross: <span className="font-bold text-slate-800">{inr(gross)}</span> · Annual: {inr(gross * 12)}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {[['pfEnabled', 'Provident Fund'], ['pfOnFullWage', 'PF on full Basic+DA (not capped at ceiling)'],
            ['esiEnabled', 'ESI (only applies up to the ESI wage limit)'], ['ptEnabled', 'Professional Tax'], ['tdsEnabled', 'Income tax (TDS)']]
            .map(([k, label]) => (
              <label key={k} className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={!!form[k]} onChange={set(k)} className="h-4 w-4 rounded border-slate-300" /> {label}
              </label>
            ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fixed monthly TDS (₹)" hint="Optional — e.g. old regime / declarations; empty = auto projection">
            <Input type="number" min="0" value={form.tdsMonthlyOverride} onChange={set('tdsMonthlyOverride')} />
          </Field>
          <Field label="Note"><Input value={form.note} onChange={set('note')} placeholder="e.g. Annual increment" /></Field>
        </div>
        {employee?.history?.length > 0 && (
          <div>
            <p className="mb-1 text-sm font-semibold text-slate-700">History</p>
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm">
              {employee.history.map((s) => (
                <li key={s.id} className="flex items-center justify-between px-3 py-2">
                  <span>{monthName(s.effectiveFrom)} · <span className="font-semibold">{inr(s.gross)}</span>{s.note ? ` · ${s.note}` : ''}</span>
                  <button type="button" onClick={() => remove(s)} className="rounded p-1 text-red-600 hover:bg-red-50" title="Delete">
                    <IconTrash className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}

/* =========================================================== Settings tab */

function SlabEditor({ slabs, field, fieldLabel, onChange }) {
  const update = (i, k, v) => onChange(slabs.map((s, j) => (j === i ? { ...s, [k]: v } : s)));
  return (
    <div className="space-y-2">
      {slabs.map((s, i) => {
        const last = i === slabs.length - 1;
        return (
          <div key={i} className="flex items-center gap-2 text-sm">
            <span className="w-28 text-slate-500">{last ? 'Above' : 'Up to'}</span>
            {last ? <span className="w-40 text-slate-400">{inr(slabs[i - 1]?.upTo || 0)}</span> : (
              <Input type="number" value={s.upTo ?? ''} onChange={(e) => update(i, 'upTo', e.target.value)} className="w-40" />
            )}
            <span className="w-16 text-right text-slate-500">{fieldLabel}</span>
            <Input type="number" value={s[field]} onChange={(e) => update(i, field, e.target.value)} className="w-28" />
            {slabs.length > 1 && !last && (
              <button type="button" className="rounded p-1 text-red-600 hover:bg-red-50" onClick={() => onChange(slabs.filter((_, j) => j !== i))}>
                <IconTrash className="h-4 w-4" />
              </button>
            )}
          </div>
        );
      })}
      <Button variant="ghost" size="sm" onClick={() => onChange([...slabs.slice(0, -1), { upTo: '', [field]: 0 }, slabs[slabs.length - 1]])}>
        <IconPlus className="h-4 w-4" /> Add slab
      </Button>
    </div>
  );
}

// Card for one settings group; `enabledKey` adds the on/off switch for that section.
function SettingsSection({ s, upd, title, hint, children, enabledKey }) {
  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-slate-800">{title}</h3>
            {hint && <p className="text-xs text-slate-500">{hint}</p>}
          </div>
          {enabledKey && (
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={!!s[enabledKey].enabled} onChange={upd(enabledKey, 'enabled')} className="h-4 w-4 rounded border-slate-300" />
              Enabled
            </label>
          )}
        </div>
        {children}
      </CardBody>
    </Card>
  );
}

function SettingsNumField({ s, upd, section, k, label, hint }) {
  return (
    <Field label={label} hint={hint}>
      <Input type="number" step="any" value={s[section][k] ?? ''} onChange={upd(section, k)} />
    </Field>
  );
}

function SettingsTab() {
  const [s, setS] = useState(null);
  const [defaults, setDefaults] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    apiGet('/payroll/settings')
      .then((r) => { setS(r.settings); setDefaults(r.defaults); })
      .catch((e) => setError(e.message));
  }, []);

  const upd = (section, key) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setSaved(false);
    setS((cur) => ({ ...cur, [section]: { ...cur[section], [key]: v } }));
  };
  const setSection = (section, patch) => { setSaved(false); setS((cur) => ({ ...cur, [section]: { ...cur[section], ...patch } })); };

  const toNumbers = (x) => {
    const n = (v) => (v === '' || v == null ? v : Number(v));
    return {
      ...x,
      pf: { ...x.pf, employeeRate: n(x.pf.employeeRate), employerRate: n(x.pf.employerRate), epsRate: n(x.pf.epsRate), wageCeiling: n(x.pf.wageCeiling) },
      esi: { ...x.esi, employeeRate: n(x.esi.employeeRate), employerRate: n(x.esi.employerRate), wageLimit: n(x.esi.wageLimit) },
      pt: { ...x.pt, slabs: x.pt.slabs.map((sl, i, a) => ({ upTo: i === a.length - 1 ? null : n(sl.upTo), amount: n(sl.amount) })) },
      tds: {
        ...x.tds, standardDeduction: n(x.tds.standardDeduction), rebateLimit: n(x.tds.rebateLimit), cess: n(x.tds.cess),
        slabs: x.tds.slabs.map((sl, i, a) => ({ upTo: i === a.length - 1 ? null : n(sl.upTo), rate: n(sl.rate) })),
      },
      ot: { multiplier: n(x.ot.multiplier), divisorDays: n(x.ot.divisorDays), hoursPerDay: n(x.ot.hoursPerDay) },
    };
  };

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await api('/payroll/settings', { method: 'PUT', body: JSON.stringify({ settings: toNumbers(s) }) });
      setS(r.settings);
      setSaved(true);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  if (!s) return error ? <ErrorNote>{error}</ErrorNote> : <Loading label="Loading settings…" />;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        These are starting defaults, not legal advice. PF/ESI rates, your state&apos;s Professional Tax schedule and the
        income-tax slabs for the current year should be confirmed by your CA before the first real payroll. Changes apply
        to payrolls generated from now on; finalized payslips keep the figures they were computed with.
      </div>
      <ErrorNote>{error}</ErrorNote>

      <SettingsSection s={s} upd={upd} title="Company" hint="Printed on every payslip">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Company name"><Input value={s.company.name} onChange={upd('company', 'name')} /></Field>
          <Field label="Address"><Input value={s.company.address} onChange={upd('company', 'address')} /></Field>
        </div>
      </SettingsSection>

      <div className="grid gap-4 lg:grid-cols-2">
        <SettingsSection s={s} upd={upd} title="Provident Fund (EPF)" hint="On Basic + DA" enabledKey="pf">
          <div className="grid grid-cols-2 gap-3">
            <SettingsNumField s={s} upd={upd} section="pf" k="employeeRate" label="Employee %" />
            <SettingsNumField s={s} upd={upd} section="pf" k="employerRate" label="Employer % (total)" />
            <SettingsNumField s={s} upd={upd} section="pf" k="epsRate" label="EPS % (of employer share)" />
            <SettingsNumField s={s} upd={upd} section="pf" k="wageCeiling" label="Wage ceiling (₹)" />
          </div>
        </SettingsSection>
        <SettingsSection s={s} upd={upd} title="ESI" hint="Covered while monthly gross ≤ wage limit" enabledKey="esi">
          <div className="grid grid-cols-2 gap-3">
            <SettingsNumField s={s} upd={upd} section="esi" k="employeeRate" label="Employee %" />
            <SettingsNumField s={s} upd={upd} section="esi" k="employerRate" label="Employer %" />
            <SettingsNumField s={s} upd={upd} section="esi" k="wageLimit" label="Wage limit (₹)" />
          </div>
        </SettingsSection>
      </div>

      <SettingsSection s={s} upd={upd} title="Professional Tax" hint="State / local-body specific" enabledKey="pt">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="State"><Input value={s.pt.state} onChange={upd('pt', 'state')} /></Field>
          <Field label="Slab basis">
            <Select value={s.pt.basis} onChange={upd('pt', 'basis')}>
              <option value="halfyearly">Half-yearly income (Apr–Sep, Oct–Mar)</option>
              <option value="monthly">Monthly income</option>
            </Select>
          </Field>
        </div>
        <div>
          <span className="mb-1 block text-sm font-medium text-slate-700">Deduct in</span>
          <div className="flex flex-wrap gap-1.5">
            {MONTH_SHORT.map((label, i) => {
              const m = i + 1;
              const on = s.pt.months.includes(m);
              return (
                <button key={label} type="button"
                  onClick={() => setSection('pt', { months: on ? s.pt.months.filter((x) => x !== m) : [...s.pt.months, m] })}
                  className={cx('w-12 rounded-lg border py-1 text-xs font-semibold',
                    on ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-300 bg-white text-slate-500')}>
                  {label}
                </button>
              );
            })}
          </div>
        </div>
        <SlabEditor slabs={s.pt.slabs} field="amount" fieldLabel="PT ₹" onChange={(slabs) => setSection('pt', { slabs })} />
      </SettingsSection>

      <SettingsSection s={s} upd={upd} title="Income tax (TDS)" hint="New regime — projected annual tax spread over the remaining months of the FY" enabledKey="tds">
        <div className="grid grid-cols-3 gap-3">
          <SettingsNumField s={s} upd={upd} section="tds" k="standardDeduction" label="Standard deduction (₹)" />
          <SettingsNumField s={s} upd={upd} section="tds" k="rebateLimit" label="87A rebate up to (₹ taxable)" />
          <SettingsNumField s={s} upd={upd} section="tds" k="cess" label="Cess %" />
        </div>
        <SlabEditor slabs={s.tds.slabs} field="rate" fieldLabel="Rate %" onChange={(slabs) => setSection('tds', { slabs })} />
      </SettingsSection>

      <div className="grid gap-4 lg:grid-cols-2">
        <SettingsSection s={s} upd={upd} title="Overtime pay" hint="Approved OT hours × (Basic+DA) ÷ days ÷ hours × multiplier">
          <div className="grid grid-cols-3 gap-3">
            <SettingsNumField s={s} upd={upd} section="ot" k="multiplier" label="Multiplier" />
            <SettingsNumField s={s} upd={upd} section="ot" k="divisorDays" label="Days divisor" />
            <SettingsNumField s={s} upd={upd} section="ot" k="hoursPerDay" label="Hours / day" />
          </div>
        </SettingsSection>
        <SettingsSection s={s} upd={upd} title="Loss of pay">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={!!s.lop.halfDayAsHalfLop} onChange={upd('lop', 'halfDayAsHalfLop')} className="h-4 w-4 rounded border-slate-300" />
            A half-day (worked under the shift&apos;s half-day hours) costs 0.5 day of pay
          </label>
          <p className="text-xs text-slate-500">Absent days are always loss of pay. Approved leave, week-offs and holidays are paid.</p>
        </SettingsSection>
      </div>

      <div className="flex justify-end gap-2">
        {saved && <span className="self-center text-sm font-semibold text-emerald-600">Saved</span>}
        <Button variant="secondary" onClick={() => { if (window.confirm('Reset every payroll setting to the built-in defaults? (Not saved until you press Save.)')) { setS(defaults); setSaved(false); } }}>
          Reset to defaults
        </Button>
        <Button onClick={save} disabled={busy}>{busy && <Spinner className="h-4 w-4 text-white" />} Save settings</Button>
      </div>
    </div>
  );
}
