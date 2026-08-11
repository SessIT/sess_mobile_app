// Overtime — admin console for the OT module.
// Employees request OT from mobile BEFORE doing the work; it reaches their OT
// calendar only once approved here (or in the mobile OT Approvals screen).
// Admins can also add pre-approved OT directly — for one employee or a group.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiGet, apiPost, apiPatch, api } from '../lib/api';
import { fmtDate, fmtTime, todayIST, monthIST } from '../lib/format';
import {
  Card,
  CardBody,
  Button,
  Input,
  Field,
  Badge,
  StatCard,
  Spinner,
  Loading,
  EmptyState,
  ErrorNote,
  PageHeader,
  Modal,
  cx,
} from '../components/ui';
import {
  IconCheckCircle,
  IconBan,
  IconClock,
  IconTimer,
  IconUsers,
  IconInbox,
  IconPlus,
  IconTrash,
} from '../components/icons';

const STATUS_TONE = { pending: 'amber', approved: 'green', rejected: 'red', cancelled: 'gray' };
const FILTERS = ['pending', 'approved', 'rejected', 'all'];
const fmtHrs = (h) => (h == null ? '—' : `${h === Math.floor(h) ? h : h.toFixed(1)}h`);

export default function Overtime() {
  const [month, setMonth] = useState(monthIST());
  const [status, setStatus] = useState('pending');
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    apiGet(`/ot/requests?month=${month}${status ? `&status=${status}` : ''}`)
      .then((r) => setRequests(r.requests || []))
      .catch((e) => setError(e.message || 'Failed to load OT requests'))
      .finally(() => setLoading(false));
  }, [month, status]);

  useEffect(() => { load(); }, [load]);

  const decide = async (r, decision) => {
    let reviewNote = '';
    if (decision === 'rejected') reviewNote = window.prompt('Reason for rejection (optional):', '') ?? '';
    setBusyId(r.id);
    try {
      await apiPatch(`/ot/requests/${r.id}/decision`, { status: decision, reviewNote });
      load();
    } catch (e) {
      alert(e.message || 'Could not update the request');
    } finally {
      setBusyId((prev) => (prev === r.id ? null : prev));
    }
  };

  const remove = async (r) => {
    const who = r.user?.fullName || r.user?.username || 'this employee';
    if (!window.confirm(`Delete this OT entry for ${who} on ${fmtDate(r.date)}?`)) return;
    try {
      await api(`/ot/admin/${r.id}`, { method: 'DELETE' });
      load();
    } catch (e) {
      alert(e.message || 'Delete failed');
    }
  };

  // Month roll-up for the stat cards (uses the loaded, filtered list).
  const stats = useMemo(() => {
    const pending = requests.filter((r) => r.status === 'pending');
    const approved = requests.filter((r) => r.status === 'approved');
    return {
      pending: pending.length,
      approved: approved.length,
      approvedHours: Math.round(approved.reduce((s, r) => s + r.hours, 0) * 100) / 100,
      people: new Set(approved.map((r) => r.userId)).size,
    };
  }, [requests]);

  return (
    <div>
      <PageHeader
        title="Overtime"
        subtitle="Approve OT requests and add OT for employees — individually or as a group."
        actions={
          <Button onClick={() => setAddOpen(true)}>
            <IconPlus className="h-4 w-4" />
            Add OT
          </Button>
        }
      />

      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Month</span>
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-48" />
          </label>

          <div className="inline-flex items-center gap-1 rounded-xl bg-slate-100 p-1">
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setStatus(f === 'all' ? '' : f)}
                className={cx(
                  'rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition',
                  (status === f || (f === 'all' && status === ''))
                    ? 'bg-white text-brand-800 shadow-sm ring-1 ring-slate-200/80'
                    : 'text-slate-500 hover:text-slate-700'
                )}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {!loading && !error && (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Pending requests" value={stats.pending} tone="amber" icon={<IconClock className="h-5 w-5" />} />
            <StatCard label="Approved entries" value={stats.approved} tone="green" icon={<IconCheckCircle className="h-5 w-5" />} />
            <StatCard label="Approved OT hours" value={fmtHrs(stats.approvedHours)} tone="blue" icon={<IconTimer className="h-5 w-5" />} />
            <StatCard label="Employees with OT" value={stats.people} tone="slate" icon={<IconUsers className="h-5 w-5" />} />
          </div>
        )}

        {error && <ErrorNote>{error}</ErrorNote>}

        <Card>
          {loading ? (
            <CardBody><Loading label="Loading OT requests…" /></CardBody>
          ) : requests.length === 0 ? (
            <CardBody>
              <EmptyState
                title="No OT entries"
                hint="Employees request OT from the mobile app before doing the work; approved entries land on their OT calendar."
                icon={<IconInbox />}
              />
            </CardBody>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-3 font-semibold">Employee</th>
                    <th className="px-4 py-3 font-semibold">Date</th>
                    <th className="px-4 py-3 font-semibold">Time</th>
                    <th className="px-4 py-3 text-right font-semibold">Hours</th>
                    <th className="px-4 py-3 font-semibold">OT Work / Reason</th>
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
                          <div className="text-xs text-slate-400">
                            @{r.user?.username}
                            {r.source === 'admin' && <span className="ml-1.5 text-brand-600">· added by admin</span>}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-600">{fmtDate(r.date)}</td>
                        <td className="whitespace-nowrap px-4 py-3 tabular-nums text-slate-700">
                          {fmtTime(r.startTime)} → {fmtTime(r.endTime)}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums text-brand-700">{fmtHrs(r.hours)}</td>
                        <td className="max-w-[18rem] px-4 py-3 text-slate-500"><span className="line-clamp-2">{r.reason}</span></td>
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
                            <div className="flex items-center justify-end gap-2">
                              <span className="text-xs text-slate-400">
                                {r.reviewedBy ? `by ${r.reviewedBy.fullName || r.reviewedBy.username}` : '—'}
                              </span>
                              <Button size="sm" variant="danger" onClick={() => remove(r)} title="Delete entry">
                                <IconTrash className="h-4 w-4" />
                              </Button>
                            </div>
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

      <AddOtModal open={addOpen} onClose={() => setAddOpen(false)} onSaved={() => { setAddOpen(false); load(); }} />
    </div>
  );
}

/* ================================ Add OT (individual or group) ================================ */
function AddOtModal({ open, onClose, onSaved }) {
  const [users, setUsers] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [query, setQuery] = useState('');
  const [date, setDate] = useState(todayIST());
  const [start, setStart] = useState('18:00');
  const [end, setEnd] = useState('20:00');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setSelected(new Set());
    setQuery('');
    setDate(todayIST());
    setStart('18:00');
    setEnd('20:00');
    setReason('');
    setError('');
    setBusy(false);
    apiGet('/users')
      .then((list) => setUsers((list || []).filter((u) => u.isActive)))
      .catch((e) => setError(e.message || 'Failed to load employees'));
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => (u.fullName || '').toLowerCase().includes(q) || u.username.toLowerCase().includes(q));
  }, [users, query]);

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const allSelected = filtered.length > 0 && filtered.every((u) => selected.has(u.id));
  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      filtered.forEach((u) => (allSelected ? next.delete(u.id) : next.add(u.id)));
      return next;
    });
  };

  const canSubmit = selected.size > 0 && date && start && end && reason.trim() && !busy;

  const submit = async (e) => {
    e?.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError('');
    try {
      const res = await apiPost('/ot/grant', {
        userIds: [...selected], date, startTime: start, endTime: end, reason: reason.trim(),
      });
      const skipped = res.skipped || [];
      if (skipped.length) {
        alert(`OT added for ${res.created?.length || 0} employee(s).\nSkipped (already have OT that day): ${skipped.map((s) => s.name).join(', ')}`);
      }
      onSaved();
    } catch (err) {
      setError(err.message || 'Could not add OT.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onClose}
      title="Add OT · individual or group"
      width="max-w-lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {busy ? (
              <>
                <Spinner className="h-4 w-4 text-current" />
                <span>Adding…</span>
              </>
            ) : (
              `Add OT (${selected.size})`
            )}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {error && <ErrorNote>{error}</ErrorNote>}

        <Field label={`Employees · ${selected.size} selected`}>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Input
                placeholder="Search employees…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="flex-1"
              />
              <Button type="button" variant="secondary" size="sm" onClick={toggleAll}>
                {allSelected ? 'Clear all' : 'Select all'}
              </Button>
            </div>
            <div className="max-h-44 overflow-y-auto rounded-xl border border-slate-200 p-1">
              {filtered.length === 0 ? (
                <p className="px-3 py-4 text-center text-sm text-slate-400">No matching employees</p>
              ) : (
                filtered.map((u) => {
                  const on = selected.has(u.id);
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => toggle(u.id)}
                      className={cx(
                        'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition',
                        on ? 'bg-brand-50 text-brand-800' : 'text-slate-600 hover:bg-slate-50'
                      )}
                    >
                      <span
                        className={cx(
                          'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded border',
                          on ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 bg-white'
                        )}
                      >
                        {on && <IconCheckCircle className="h-3.5 w-3.5" />}
                      </span>
                      <span className="font-medium">{u.fullName || u.username}</span>
                      <span className="text-xs text-slate-400">@{u.username}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </Field>

        <Field label="OT date">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Start time">
            <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="End time" hint="An end at/before the start rolls to the next day">
            <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
        </div>

        <Field label="OT work / reason">
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Urgent dispatch for Client X"
          />
        </Field>

        <button type="submit" className="hidden" disabled={!canSubmit} aria-hidden="true" />
      </form>
    </Modal>
  );
}
