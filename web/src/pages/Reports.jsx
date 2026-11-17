// Reports — registers HR is asked for, each exportable to Excel:
//   Attendance register (muster roll) · Leave register · Overtime · Expenses ·
//   Payroll summary · People (headcount, birthdays, anniversaries)

import { useCallback, useEffect, useState } from 'react';
import { apiGet } from '../lib/api';
import { fmtDate, todayIST, monthIST } from '../lib/format';
import {
  Card, CardBody, Badge, Button, Input, Loading, EmptyState, ErrorNote, PageHeader, cx,
} from '../components/ui';
import { IconGift, IconCalendar, IconUsers, IconChart, IconDownload } from '../components/icons';

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const monthName = (ym) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });

// Excel export — xlsx is large, so it loads only when someone exports.
async function exportXlsx(filename, sheets) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  for (const { name, rows } of sheets) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name.slice(0, 31));
  XLSX.writeFile(wb, filename);
}

const TABS = [
  ['attendance', 'Attendance register'], ['leave', 'Leave register'], ['ot', 'Overtime'],
  ['expenses', 'Expenses'], ['payroll', 'Payroll summary'], ['people', 'People'],
];

export default function Reports() {
  const [tab, setTab] = useState('attendance');
  return (
    <div>
      <PageHeader title="Reports" subtitle="Registers for HR, audits and management — each one exports to Excel." />
      <div className="mb-5 flex flex-wrap gap-2">
        {TABS.map(([k, label]) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className={cx('rounded-full border px-3.5 py-1.5 text-sm font-semibold transition',
              tab === k ? 'border-brand-800 bg-brand-800 text-white' : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400')}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'attendance' && <AttendanceRegister />}
      {tab === 'leave' && <LeaveRegister />}
      {tab === 'ot' && <OvertimeReport />}
      {tab === 'expenses' && <ExpenseReport />}
      {tab === 'payroll' && <PayrollSummary />}
      {tab === 'people' && <PeopleReport />}
    </div>
  );
}

/* Shared: fetch on a key, show loading/error, render children(data). */
function useReport(path) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    apiGet(path)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e.message || 'Failed to load report'))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [path]);
  return { data, loading, error };
}

function Toolbar({ children, onExport, disabled }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="flex flex-wrap items-end gap-3">{children}</div>
      <Button variant="secondary" onClick={onExport} disabled={disabled}>
        <IconDownload className="h-4 w-4" /> Export to Excel
      </Button>
    </div>
  );
}

const MonthPicker = ({ value, onChange }) => (
  <label className="block">
    <span className="mb-1 block text-sm font-medium text-slate-700">Month</span>
    <Input type="month" value={value} max={monthIST()} onChange={(e) => e.target.value && onChange(e.target.value)} className="w-48" />
  </label>
);

/* --------------------------------------------------- attendance register */

const CODE_STYLE = {
  P: 'bg-emerald-50 text-emerald-700', LT: 'bg-amber-50 text-amber-700', HD: 'bg-orange-50 text-orange-700',
  A: 'bg-red-50 text-red-700', L: 'bg-brand-50 text-brand-700', WO: 'bg-slate-100 text-slate-400', H: 'bg-teal-50 text-teal-700',
};

function AttendanceRegister() {
  const [month, setMonth] = useState(monthIST());
  const [branchId, setBranchId] = useState('');
  const [branches, setBranches] = useState([]);
  useEffect(() => { apiGet('/branches/list').then(setBranches).catch(() => {}); }, []);
  const { data, loading, error } = useReport(`/attendance/admin/register?month=${month}${branchId ? `&branchId=${branchId}` : ''}`);
  const days = data?.days || [];
  const rows = data?.summary || [];

  const exportIt = () => exportXlsx(`attendance_register_${month}.xlsx`, [{
    name: 'Attendance register',
    rows: [
      [`Attendance register — ${monthName(month)}`], ['P present · LT late · HD half day · A absent · L leave · WO week-off · H holiday'], [],
      ['Name', 'Username', 'Shift', ...days.map((d) => Number(d.slice(8))), 'Present', 'Late', 'Half day', 'Absent', 'Leave', 'Hours', 'OT hours'],
      ...rows.map((r) => [r.fullName || r.username, r.username, r.shiftName, ...r.codes,
        r.present, r.late, r.halfDay, r.absent, r.leave, r.hours, r.otHours]),
    ],
  }]);

  return (
    <>
      <Toolbar onExport={exportIt} disabled={!rows.length}>
        <MonthPicker value={month} onChange={setMonth} />
        {branches.length > 0 && (
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Branch</span>
            <select value={branchId} onChange={(e) => setBranchId(e.target.value)}
              className="rounded-lg border border-slate-300/90 bg-white px-3 py-2.5 text-sm text-slate-700 shadow-sm">
              <option value="">All branches</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
        )}
        {data?.locked && <Badge tone="amber">Locked for payroll</Badge>}
      </Toolbar>
      {loading && <Loading label="Building register…" />}
      {!loading && error && <ErrorNote>{error}</ErrorNote>}
      {!loading && !error && (
        <Card>
          <CardBody>
            {rows.length === 0 ? <EmptyState title="No employees" /> : (
              <div className="overflow-x-auto">
                <table className="text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-400">
                      <th className="sticky left-0 z-10 bg-white px-2 py-2 text-left font-semibold">Employee</th>
                      {days.map((d) => <th key={d} className="w-8 px-0.5 py-2 text-center font-semibold">{Number(d.slice(8))}</th>)}
                      {['P', 'LT', 'HD', 'A', 'L', 'Hrs'].map((h) => <th key={h} className="px-2 py-2 text-right font-semibold">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.userId} className="border-b border-slate-100">
                        <td className="sticky left-0 z-10 whitespace-nowrap bg-white px-2 py-1.5 font-medium text-slate-700">{r.fullName || r.username}</td>
                        {r.codes.map((c, i) => (
                          <td key={i} className="px-0.5 py-1 text-center">
                            {c ? <span className={cx('inline-block w-7 rounded py-0.5 text-[10px] font-bold', CODE_STYLE[c])}>{c}</span> : <span className="text-slate-200">·</span>}
                          </td>
                        ))}
                        <td className="px-2 text-right font-semibold text-emerald-700">{r.present}</td>
                        <td className="px-2 text-right text-amber-700">{r.late}</td>
                        <td className="px-2 text-right text-orange-700">{r.halfDay}</td>
                        <td className="px-2 text-right font-semibold text-red-600">{r.absent}</td>
                        <td className="px-2 text-right text-brand-700">{r.leave}</td>
                        <td className="px-2 text-right tabular-nums text-slate-600">{r.hours}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>
      )}
    </>
  );
}

/* --------------------------------------------------------- leave register */

function LeaveRegister() {
  const [year, setYear] = useState(Number(todayIST().slice(0, 4)));
  const { data, loading, error } = useReport(`/reports/leave-register?year=${year}`);
  const types = data?.types || [];
  const rows = data?.rows || [];
  const bal = (r, t) => r.balances.find((b) => b.leaveTypeId === t.leaveTypeId) || {};

  const exportIt = () => exportXlsx(`leave_register_${year}.xlsx`, [{
    name: 'Leave register',
    rows: [
      [`Leave register — ${year}`], [],
      ['Name', 'Emp ID', 'Department', ...types.flatMap((t) => [`${t.code} quota`, `${t.code} used`, `${t.code} pending`, `${t.code} available`])],
      ...rows.map((r) => [r.fullName || r.username, r.employeeId || '', r.department || '',
        ...types.flatMap((t) => { const b = bal(r, t); return [b.quota ?? 0, b.used ?? 0, b.pending ?? 0, b.available ?? 0]; })]),
    ],
  }]);

  return (
    <>
      <Toolbar onExport={exportIt} disabled={!rows.length}>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Year</span>
          <Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value) || year)} className="w-32" />
        </label>
      </Toolbar>
      {loading && <Loading label="Loading balances…" />}
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
                      {types.map((t) => <th key={t.leaveTypeId} className="px-3 py-2 text-center font-semibold" title={t.name}>{t.code}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="border-b border-slate-100">
                        <td className="px-3 py-2.5">
                          <p className="font-semibold text-slate-800">{r.fullName || r.username}</p>
                          <p className="text-xs text-slate-400">{r.employeeId || `@${r.username}`}</p>
                        </td>
                        {types.map((t) => {
                          const b = bal(r, t);
                          return (
                            <td key={t.leaveTypeId} className="px-3 py-2.5 text-center tabular-nums">
                              <span className={cx('font-semibold', b.available <= 0 ? 'text-slate-400' : 'text-emerald-700')}>{b.available ?? 0}</span>
                              <span className="text-slate-400"> / {b.quota ?? 0}</span>
                              {b.pending > 0 && <span className="block text-[11px] text-amber-600">{b.pending} pending</span>}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-2 text-xs text-slate-400">Shown as available / allocated. Used = allocated − available − pending.</p>
              </div>
            )}
          </CardBody>
        </Card>
      )}
    </>
  );
}

/* --------------------------------------------------------------- overtime */

function OvertimeReport() {
  const [month, setMonth] = useState(monthIST());
  const { data, loading, error } = useReport(`/reports/overtime?month=${month}`);
  const rows = data?.rows || [];
  const total = rows.reduce((s, r) => s + r.approvedHours, 0);

  const exportIt = () => exportXlsx(`overtime_${month}.xlsx`, [{
    name: 'Overtime',
    rows: [[`Overtime — ${monthName(month)}`], [], ['Name', 'Emp ID', 'Department', 'Approved hours', 'Approved entries', 'Pending hours'],
      ...rows.map((r) => [r.fullName || r.username, r.employeeId || '', r.department || '', r.approvedHours, r.approvedEntries, r.pendingHours])],
  }]);

  return (
    <>
      <Toolbar onExport={exportIt} disabled={!rows.length}><MonthPicker value={month} onChange={setMonth} /></Toolbar>
      {loading && <Loading label="Loading overtime…" />}
      {!loading && error && <ErrorNote>{error}</ErrorNote>}
      {!loading && !error && (
        <Card>
          <CardBody>
            {rows.length === 0 ? <EmptyState title="No overtime this month" icon={<IconChart />} /> : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-3 py-2 font-semibold">Employee</th>
                    <th className="px-3 py-2 text-right font-semibold">Approved</th>
                    <th className="px-3 py-2 text-right font-semibold">Entries</th>
                    <th className="px-3 py-2 text-right font-semibold">Pending</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-slate-100">
                      <td className="px-3 py-2.5 font-semibold text-slate-800">{r.fullName || r.username}</td>
                      <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-brand-700">{r.approvedHours} h</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{r.approvedEntries}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-amber-600">{r.pendingHours ? `${r.pendingHours} h` : '—'}</td>
                    </tr>
                  ))}
                  <tr className="font-bold">
                    <td className="px-3 py-2.5">Total</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{Math.round(total * 100) / 100} h</td>
                    <td colSpan={2} />
                  </tr>
                </tbody>
              </table>
            )}
          </CardBody>
        </Card>
      )}
    </>
  );
}

/* --------------------------------------------------------------- expenses */

function ExpenseReport() {
  const [month, setMonth] = useState(monthIST());
  const { data, loading, error } = useReport(`/reports/expenses?month=${month}`);
  const rows = data?.rows || [];
  const types = data?.types || [];

  const exportIt = () => exportXlsx(`expenses_${month}.xlsx`, [{
    name: 'Expenses',
    rows: [[`Expense claims — ${monthName(month)}`], [], ['Name', 'Emp ID', 'Total claims', 'Approved', 'Pending', 'Rejected', ...types],
      ...rows.map((r) => [r.fullName || r.username, r.employeeId || '', r.total, r.approved, r.pending, r.rejected, ...types.map((t) => r.byType[t] || 0)])],
  }]);

  return (
    <>
      <Toolbar onExport={exportIt} disabled={!rows.length}><MonthPicker value={month} onChange={setMonth} /></Toolbar>
      {loading && <Loading label="Loading expenses…" />}
      {!loading && error && <ErrorNote>{error}</ErrorNote>}
      {!loading && !error && (
        <Card>
          <CardBody>
            {rows.length === 0 ? <EmptyState title="No expense claims this month" /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                      <th className="px-3 py-2 font-semibold">Employee</th>
                      <th className="px-3 py-2 text-right font-semibold">Claims</th>
                      <th className="px-3 py-2 text-right font-semibold">Approved</th>
                      <th className="px-3 py-2 text-right font-semibold">Pending</th>
                      <th className="px-3 py-2 text-right font-semibold">Rejected</th>
                      {types.map((t) => <th key={t} className="px-3 py-2 text-right font-semibold">{t}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="border-b border-slate-100">
                        <td className="px-3 py-2.5 font-semibold text-slate-800">{r.fullName || r.username}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{r.total}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-emerald-700">{r.approved}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-amber-600">{r.pending}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-red-600">{r.rejected}</td>
                        {types.map((t) => <td key={t} className="px-3 py-2.5 text-right tabular-nums text-slate-500">{r.byType[t] || '—'}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-2 text-xs text-slate-400">Claims carry a bill, not an amount — amounts are paid through payroll adjustments.</p>
              </div>
            )}
          </CardBody>
        </Card>
      )}
    </>
  );
}

/* -------------------------------------------------------- payroll summary */

function PayrollSummary() {
  const { data, loading, error } = useReport('/payroll/runs');
  const runs = data?.runs || [];

  const exportIt = () => exportXlsx('payroll_summary.xlsx', [{
    name: 'Payroll summary',
    rows: [['Month', 'Status', 'Employees', 'Gross', 'Deductions', 'Net pay', 'Employee PF', 'Employer PF', 'Employee ESI', 'Employer ESI', 'PT', 'TDS', 'Employer cost'],
      ...runs.map((r) => {
        const t = r.totals;
        return [r.month, r.status, t.employees, t.gross, t.totalDeductions, t.netPay, t.pfEmployee, t.pfEmployer, t.esiEmployee, t.esiEmployer, t.pt, t.tds, t.gross + t.pfEmployer + t.esiEmployer];
      })],
  }]);

  return (
    <>
      <Toolbar onExport={exportIt} disabled={!runs.length} />
      {loading && <Loading label="Loading payroll history…" />}
      {!loading && error && <ErrorNote>{error}</ErrorNote>}
      {!loading && !error && (
        <Card>
          <CardBody>
            {runs.length === 0 ? <EmptyState title="No payroll runs yet" icon={<IconChart />} /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                      <th className="px-3 py-2 font-semibold">Month</th>
                      <th className="px-3 py-2 text-right font-semibold">Employees</th>
                      <th className="px-3 py-2 text-right font-semibold">Gross</th>
                      <th className="px-3 py-2 text-right font-semibold">Net pay</th>
                      <th className="px-3 py-2 text-right font-semibold">PF (EE+ER)</th>
                      <th className="px-3 py-2 text-right font-semibold">ESI (EE+ER)</th>
                      <th className="px-3 py-2 text-right font-semibold">PT</th>
                      <th className="px-3 py-2 text-right font-semibold">TDS</th>
                      <th className="px-3 py-2 text-right font-semibold">Employer cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map((r) => {
                      const t = r.totals;
                      return (
                        <tr key={r.id} className="border-b border-slate-100">
                          <td className="px-3 py-2.5">
                            <span className="font-semibold text-slate-800">{monthName(r.month)}</span>{' '}
                            <Badge tone={r.status === 'finalized' ? 'green' : 'amber'}>{r.status}</Badge>
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{t.employees}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{inr(t.gross)}</td>
                          <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-emerald-700">{inr(t.netPay)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{inr(t.pfEmployee + t.pfEmployer)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{inr(t.esiEmployee + t.esiEmployer)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{inr(t.pt)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{inr(t.tds)}</td>
                          <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{inr(t.gross + t.pfEmployer + t.esiEmployer)}</td>
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
    </>
  );
}

/* ----------------------------------------------------------------- people */

const MONTHS = [
  ['01', 'January'], ['02', 'February'], ['03', 'March'], ['04', 'April'],
  ['05', 'May'], ['06', 'June'], ['07', 'July'], ['08', 'August'],
  ['09', 'September'], ['10', 'October'], ['11', 'November'], ['12', 'December'],
];

function PeopleReport() {
  const [month, setMonth] = useState(todayIST().slice(5, 7));
  const [celebrations, setCelebrations] = useState(null);
  const [headcount, setHeadcount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    Promise.all([apiGet(`/reports/celebrations?month=${month}`), apiGet('/reports/headcount')])
      .then(([c, h]) => { setCelebrations(c); setHeadcount(h); })
      .catch((e) => setError(e.message || 'Failed to load reports'))
      .finally(() => setLoading(false));
  }, [month]);
  useEffect(() => { load(); }, [load]);

  const birthdays = celebrations?.birthdays || [];
  const anniversaries = celebrations?.anniversaries || [];
  const monthLabel = MONTHS.find(([v]) => v === month)?.[1];

  const exportIt = () => exportXlsx('people.xlsx', [
    { name: 'Headcount', rows: [['Department', 'Active'], ...(headcount?.byDepartment || []).map((r) => [r.name, r.count]), [],
      ['Employment type', 'Active'], ...(headcount?.byEmploymentType || []).map((r) => [r.name, r.count])] },
    { name: `Birthdays ${monthLabel}`, rows: [['Name', 'Date', 'Designation', 'Department'], ...birthdays.map((b) => [b.fullName || b.username, b.date, b.designation || '', b.department || ''])] },
    { name: `Anniversaries ${monthLabel}`, rows: [['Name', 'Day', 'Years', 'Designation'], ...anniversaries.map((a) => [a.fullName || a.username, a.day, a.years, a.designation || ''])] },
  ]);

  return (
    <>
      <Toolbar onExport={exportIt} disabled={!headcount}>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Celebrations month</span>
          <select value={month} onChange={(e) => setMonth(e.target.value)}
            className="rounded-lg border border-slate-300/90 bg-white px-3 py-2.5 text-sm text-slate-700 shadow-sm">
            {MONTHS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </select>
        </label>
      </Toolbar>
      {error && <div className="mb-4"><ErrorNote>{error}</ErrorNote></div>}
      {loading ? <Card><CardBody><Loading label="Loading…" /></CardBody></Card> : (
        <div className="space-y-6">
          {headcount && (
            <div>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {[['Total', headcount.total, 'text-slate-800'], ['Active', headcount.active, 'text-emerald-600'],
                  ['Inactive', headcount.inactive, 'text-red-600'], ['Exited', headcount.exited, 'text-slate-500']].map(([label, value, tone]) => (
                  <div key={label} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
                    <p className={cx('mt-1 text-2xl font-bold tabular-nums', tone)}>{value}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                {[['By department', headcount.byDepartment, <IconUsers key="d" className="h-4 w-4" />],
                  ['By employment type', headcount.byEmploymentType, <IconChart key="t" className="h-4 w-4" />]].map(([title, rows, icon]) => (
                  <Card key={title}>
                    <CardBody>
                      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700"><span className="text-slate-400">{icon}</span>{title}</div>
                      {(rows || []).length === 0 ? <p className="text-sm text-slate-400">No data — fill these fields in User Management.</p> : (
                        <div className="space-y-2">
                          {rows.map((r) => (
                            <div key={r.name} className="flex items-center gap-3">
                              <span className="w-40 truncate text-sm text-slate-600">{r.name}</span>
                              <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                                <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.round((r.count / (headcount.active || 1)) * 100)}%` }} />
                              </div>
                              <span className="w-8 text-right text-sm font-semibold tabular-nums text-slate-700">{r.count}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardBody>
                  </Card>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardBody>
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700"><IconGift className="h-4 w-4 text-slate-400" />Birthdays · {monthLabel}</div>
                {birthdays.length === 0 ? <EmptyState title="No birthdays this month" hint="Add dates of birth in User Management." icon={<IconGift />} /> : (
                  <div className="divide-y divide-slate-100">
                    {birthdays.map((b) => (
                      <div key={b.id} className="flex items-center gap-3 py-2.5">
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-sm font-bold text-brand-700">{b.day}</span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-slate-800">{b.fullName || b.username}</p>
                          <p className="truncate text-xs text-slate-400">{[b.designation, b.department].filter(Boolean).join(' · ') || `@${b.username}`}</p>
                        </div>
                        <span className="text-xs text-slate-400">{fmtDate(b.date)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700"><IconCalendar className="h-4 w-4 text-slate-400" />Work anniversaries · {monthLabel}</div>
                {anniversaries.length === 0 ? <EmptyState title="No anniversaries this month" hint="Add dates of joining in User Management." icon={<IconCalendar />} /> : (
                  <div className="divide-y divide-slate-100">
                    {anniversaries.map((a) => (
                      <div key={a.id} className="flex items-center gap-3 py-2.5">
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-sm font-bold text-emerald-700">{a.day}</span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-slate-800">{a.fullName || a.username}</p>
                          <p className="truncate text-xs text-slate-400">{[a.designation, a.department].filter(Boolean).join(' · ') || `@${a.username}`}</p>
                        </div>
                        <Badge tone="green">{a.years} yr{a.years === 1 ? '' : 's'}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardBody>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
