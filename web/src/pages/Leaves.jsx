import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost, api } from '../lib/api';
import { fmtDate, todayIST } from '../lib/format';
import {
  Card,
  CardBody,
  Button,
  Input,
  Select,
  Field,
  Badge,
  Loading,
  EmptyState,
  ErrorNote,
  PageHeader,
  Modal,
  Spinner,
  cx,
} from '../components/ui';
import { IconLeave, IconCheckCircle, IconBan, IconCalendar, IconPlus, IconTrash } from '../components/icons';

const CURRENT_YEAR = Number(todayIST().slice(0, 4));
const YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - 1 + i);

const STATUS_TONE = { pending: 'amber', approved: 'green', rejected: 'red', cancelled: 'gray' };
const range = (a, b) => (a === b ? fmtDate(a) : `${fmtDate(a)} → ${fmtDate(b)}`);

// Admin leave console: set annual quotas and approve/reject requests.
export default function Leaves() {
  const [tab, setTab] = useState('requests'); // 'requests' | 'policy'
  const [year, setYear] = useState(CURRENT_YEAR);

  const segBtn = (key) =>
    cx(
      'rounded-lg px-4 py-1.5 text-sm font-semibold transition focus:outline-none',
      tab === key ? 'bg-white text-brand-800 shadow-sm ring-1 ring-slate-200/80' : 'text-slate-500 hover:text-slate-700'
    );

  return (
    <div>
      <PageHeader
        title="Leave Management"
        subtitle="Allocate yearly leave and review employee requests."
        actions={
          <div className="flex items-center gap-3">
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="rounded-lg border border-slate-300/90 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm"
            >
              {YEARS.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <div className="inline-flex items-center gap-1 rounded-xl bg-slate-100 p-1">
              <button className={segBtn('requests')} onClick={() => setTab('requests')}>Requests</button>
              <button className={segBtn('mine')} onClick={() => setTab('mine')}>My Leave</button>
              <button className={segBtn('policy')} onClick={() => setTab('policy')}>Policy</button>
            </div>
          </div>
        }
      />
      {tab === 'requests' ? <RequestsTab year={year} />
        : tab === 'mine' ? <MyLeaveTab year={year} />
        : <PolicyTab year={year} />}
    </div>
  );
}

/* ----------------------------------------------------- Requests tab */
function RequestsTab({ year }) {
  const [status, setStatus] = useState('pending');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    apiGet(`/leaves/requests?year=${year}&status=${status}`)
      .then((d) => setData(d))
      .catch((e) => setError(e.message || 'Failed to load requests'))
      .finally(() => setLoading(false));
  }, [year, status]);

  useEffect(() => { load(); }, [load]);

  const decide = async (r, decision) => {
    let reviewNote = '';
    if (decision === 'rejected') {
      reviewNote = window.prompt('Reason for rejection (optional):', '') ?? '';
    }
    setBusyId(r.id);
    try {
      await api(`/leaves/requests/${r.id}/decision`, {
        method: 'PATCH',
        body: JSON.stringify({ status: decision, reviewNote }),
      });
      load();
    } catch (e) {
      alert(e.message || 'Could not update request');
    } finally {
      setBusyId(null);
    }
  };

  const requests = data?.requests || [];
  const FILTERS = ['pending', 'approved', 'rejected', 'all'];

  return (
    <div className="space-y-4">
      <div className="inline-flex items-center gap-1 rounded-xl bg-slate-100 p-1">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setStatus(f === 'all' ? '' : f)}
            className={cx(
              'rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition',
              (status === f || (f === 'all' && status === '')) ? 'bg-white text-brand-800 shadow-sm ring-1 ring-slate-200/80' : 'text-slate-500 hover:text-slate-700'
            )}
          >
            {f}
          </button>
        ))}
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

      <Card>
        {loading ? (
          <Loading label="Loading requests…" />
        ) : requests.length === 0 ? (
          <EmptyState title="No leave requests" hint="Nothing to review for this filter." icon={<IconLeave />} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3 font-semibold">Employee</th>
                  <th className="px-4 py-3 font-semibold">Type</th>
                  <th className="px-4 py-3 font-semibold">Dates</th>
                  <th className="px-4 py-3 text-center font-semibold">Days</th>
                  <th className="px-4 py-3 font-semibold">Reason</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {requests.map((r) => {
                  const busy = busyId === r.id;
                  return (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-800">{r.user?.fullName || r.user?.username}</div>
                        <div className="text-xs text-slate-400">@{r.user?.username}</div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone="blue">{r.leaveType?.code}</Badge>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {range(r.startDate, r.endDate)}
                        {r.halfDay && <span className="ml-1 text-xs text-slate-400">(half)</span>}
                      </td>
                      <td className="px-4 py-3 text-center font-semibold tabular-nums text-slate-700">{r.days}</td>
                      <td className="max-w-[16rem] px-4 py-3 text-slate-500">
                        <span className="line-clamp-2">{r.reason || '—'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={STATUS_TONE[r.status] || 'gray'}>{r.status}</Badge>
                        {r.status === 'rejected' && r.reviewNote && (
                          <p className="mt-1 max-w-[12rem] text-xs text-slate-400">{r.reviewNote}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {r.status === 'pending' ? (
                          <div className="flex items-center justify-end gap-2">
                            <Button size="sm" variant="success" disabled={busy} onClick={() => decide(r, 'approved')}>
                              {busy ? <Spinner className="h-4 w-4 text-current" /> : <IconCheckCircle className="h-4 w-4" />}
                              Approve
                            </Button>
                            <Button size="sm" variant="danger" disabled={busy} onClick={() => decide(r, 'rejected')}>
                              <IconBan className="h-4 w-4" />
                              Reject
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">
                            {r.reviewedBy ? `by ${r.reviewedBy.fullName || r.reviewedBy.username}` : '—'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ----------------------------------------------------- Policy tab */
function PolicyTab({ year }) {
  const [allocations, setAllocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    setSaved(false);
    apiGet(`/leaves/policy?year=${year}`)
      .then((d) => alive && setAllocations(d.allocations || []))
      .catch((e) => alive && setError(e.message || 'Failed to load policy'))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [year]);

  const setQuota = (leaveTypeId, quota) =>
    setAllocations((prev) => prev.map((a) => (a.leaveTypeId === leaveTypeId ? { ...a, quota } : a)));

  const save = async () => {
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      await api('/leaves/policy', {
        method: 'PUT',
        body: JSON.stringify({
          year,
          allocations: allocations.map((a) => ({ leaveTypeId: a.leaveTypeId, quota: Number(a.quota) || 0 })),
        }),
      });
      setSaved(true);
    } catch (e) {
      setError(e.message || 'Could not save policy');
    } finally {
      setSaving(false);
    }
  };

  const total = allocations.reduce((s, a) => s + (Number(a.quota) || 0), 0);

  return (
    <Card>
      <CardBody>
        {loading ? (
          <Loading label="Loading policy…" />
        ) : (
          <div className="space-y-5">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <IconCalendar className="h-4 w-4 text-slate-400" />
              Set how many days of each leave type every employee gets in <b className="text-slate-700">{year}</b>.
            </div>

            {error && <ErrorNote>{error}</ErrorNote>}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {allocations.map((a) => (
                <div key={a.leaveTypeId} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center gap-2">
                    <Badge tone="blue">{a.code}</Badge>
                    <span className="text-sm font-semibold text-slate-700">{a.name}</span>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <Input
                      type="number"
                      min="0"
                      step="0.5"
                      value={a.quota}
                      onChange={(e) => setQuota(a.leaveTypeId, e.target.value)}
                      className="w-28"
                    />
                    <span className="text-sm text-slate-500">days / year</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between border-t border-slate-100 pt-4">
              <p className="text-sm text-slate-500">
                Total paid leave: <b className="text-slate-700">{total}</b> days
              </p>
              <div className="flex items-center gap-3">
                {saved && <span className="text-sm font-medium text-emerald-600">Saved ✓</span>}
                <Button onClick={save} disabled={saving}>
                  {saving ? (
                    <>
                      <Spinner className="h-4 w-4 text-current" />
                      <span>Saving…</span>
                    </>
                  ) : (
                    'Save policy'
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

/* ----------------------------------------------------- My Leave tab (self-service) */
// Lets the signed-in admin view their own balances and apply for leave.
function MyLeaveTab({ year }) {
  const [data, setData] = useState(null); // { balances, requests }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [applyOpen, setApplyOpen] = useState(false);
  const [cancelId, setCancelId] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    apiGet(`/leaves/my?year=${year}`)
      .then((d) => setData(d))
      .catch((e) => setError(e.message || 'Failed to load your leave'))
      .finally(() => setLoading(false));
  }, [year]);

  useEffect(() => { load(); }, [load]);

  const cancel = async (r) => {
    if (!window.confirm(`Cancel your ${r.leaveType?.code} request (${range(r.startDate, r.endDate)})?`)) return;
    setCancelId(r.id);
    try {
      await api(`/leaves/requests/${r.id}`, { method: 'DELETE' });
      load();
    } catch (e) {
      alert(e.message || 'Could not cancel');
    } finally {
      setCancelId(null);
    }
  };

  const balances = data?.balances || [];
  const requests = data?.requests || [];

  return (
    <div className="space-y-5">
      {error && <ErrorNote>{error}</ErrorNote>}

      {loading ? (
        <Card><CardBody><Loading label="Loading your leave…" /></CardBody></Card>
      ) : (
        <>
          {/* Balance cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {balances.map((b) => (
              <Card key={b.leaveTypeId}>
                <div className="p-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge tone="blue">{b.code}</Badge>
                      <span className="text-sm font-semibold text-slate-600">{b.name}</span>
                    </div>
                  </div>
                  <p className="mt-3 text-3xl font-bold tabular-nums text-slate-900">
                    {b.available}
                    <span className="text-base font-medium text-slate-400"> / {b.quota}</span>
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Used {b.used}{b.pending > 0 ? ` · ${b.pending} pending` : ''}
                  </p>
                </div>
              </Card>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">My Requests</h2>
            <Button onClick={() => setApplyOpen(true)}>
              <IconPlus className="h-4 w-4" />
              Apply for Leave
            </Button>
          </div>

          <Card>
            {requests.length === 0 ? (
              <EmptyState title="No leave applied yet" hint="Apply for leave using the button above." icon={<IconLeave />} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                      <th className="px-4 py-3 font-semibold">Type</th>
                      <th className="px-4 py-3 font-semibold">Dates</th>
                      <th className="px-4 py-3 text-center font-semibold">Days</th>
                      <th className="px-4 py-3 font-semibold">Reason</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 text-right font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {requests.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3"><Badge tone="blue">{r.leaveType?.code}</Badge></td>
                        <td className="px-4 py-3 text-slate-600">
                          {range(r.startDate, r.endDate)}{r.halfDay && <span className="ml-1 text-xs text-slate-400">(half)</span>}
                        </td>
                        <td className="px-4 py-3 text-center font-semibold tabular-nums text-slate-700">{r.days}</td>
                        <td className="max-w-[16rem] px-4 py-3 text-slate-500"><span className="line-clamp-2">{r.reason || '—'}</span></td>
                        <td className="px-4 py-3">
                          <Badge tone={STATUS_TONE[r.status] || 'gray'}>{r.status}</Badge>
                          {r.status === 'rejected' && r.reviewNote && (
                            <p className="mt-1 max-w-[12rem] text-xs text-slate-400">{r.reviewNote}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {r.status === 'pending' ? (
                            <Button size="sm" variant="danger" disabled={cancelId === r.id} onClick={() => cancel(r)}>
                              {cancelId === r.id ? <Spinner className="h-4 w-4 text-current" /> : <IconTrash className="h-4 w-4" />}
                              Cancel
                            </Button>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      <ApplyLeaveModal
        open={applyOpen}
        balances={balances}
        onClose={() => setApplyOpen(false)}
        onApplied={() => { setApplyOpen(false); load(); }}
      />
    </div>
  );
}

/* ----------------------------------------------------- Apply modal (reason required) */
function ApplyLeaveModal({ open, balances, onClose, onApplied }) {
  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [from, setFrom] = useState(todayIST());
  const [to, setTo] = useState(todayIST());
  const [halfDay, setHalfDay] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setLeaveTypeId(balances[0]?.leaveTypeId ?? '');
      setFrom(todayIST());
      setTo(todayIST());
      setHalfDay(false);
      setReason('');
      setError('');
      setBusy(false);
    }
  }, [open, balances]);

  const sameDay = from === to;
  const canSubmit = leaveTypeId && from && to && reason.trim() && !busy;

  const submit = async (e) => {
    e?.preventDefault();
    if (!leaveTypeId) { setError('Please choose a leave type.'); return; }
    if (to < from) { setError('End date must be on or after start date.'); return; }
    if (!reason.trim()) { setError('A reason is required to apply for leave.'); return; }
    setBusy(true);
    setError('');
    try {
      await apiPost('/leaves/requests', {
        leaveTypeId: Number(leaveTypeId),
        startDate: from,
        endDate: to,
        halfDay: halfDay && sameDay,
        reason: reason.trim(),
      });
      onApplied();
    } catch (err) {
      setError(err.message || 'Could not apply for leave.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onClose}
      title="Apply for Leave"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {busy ? (<><Spinner className="h-4 w-4 text-current" /><span>Submitting…</span></>) : 'Submit'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {error && <ErrorNote>{error}</ErrorNote>}

        <Field label="Leave type">
          <Select value={leaveTypeId} onChange={(e) => setLeaveTypeId(e.target.value)}>
            {balances.length === 0 && <option value="">No leave types</option>}
            {balances.map((b) => (
              <option key={b.leaveTypeId} value={b.leaveTypeId}>
                {b.code} · {b.name} ({b.available} left)
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="From">
            <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); if (to < e.target.value) setTo(e.target.value); }} />
          </Field>
          <Field label="To">
            <Input type="date" min={from} value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </div>

        {sameDay && (
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={halfDay} onChange={(e) => setHalfDay(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
            Half day
          </label>
        )}

        <Field label="Reason" hint="Required.">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Family function"
            rows={3}
            className={cx(
              'w-full rounded-lg border bg-white px-3.5 py-2.5 text-sm text-slate-800 shadow-sm transition placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-brand-500/10',
              reason.trim() ? 'border-slate-300/90 focus:border-brand-500' : 'border-red-300 focus:border-red-400'
            )}
          />
        </Field>

        <button type="submit" className="hidden" disabled={!canSubmit} aria-hidden="true" />
      </form>
    </Modal>
  );
}
