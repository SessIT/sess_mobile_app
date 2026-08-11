// Comp-Off — admin review of compensation-leave credits.
// An employee who worked a week-off (Sunday) or company holiday requests a
// credit; approving it adds 1 day to their CO leave balance (spent through the
// normal leave flow). Each row shows the worked day's punch record — a full
// day is 9:30 → 18:30 IST. Missing or short punches are flagged in red/amber
// so the admin can reject, or revoke an already-approved credit.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiGet, apiPatch } from '../lib/api';
import { fmtDate, fmtTime, todayIST } from '../lib/format';
import {
  Card,
  CardBody,
  Button,
  Input,
  Badge,
  StatCard,
  Spinner,
  Loading,
  EmptyState,
  ErrorNote,
  PageHeader,
  cx,
} from '../components/ui';
import {
  IconCheckCircle,
  IconBan,
  IconClock,
  IconUsers,
  IconInbox,
  IconTrash,
} from '../components/icons';

const STATUS_TONE = { pending: 'amber', approved: 'green', rejected: 'red', cancelled: 'gray', revoked: 'red' };
const FILTERS = ['pending', 'approved', 'rejected', 'all'];
const CUR_YEAR = Number(todayIST().slice(0, 4));

// Punch verdict cell — the reason this page exists.
function PunchCell({ punch }) {
  if (!punch) return <span className="text-slate-300">—</span>;
  if (!punch.punched) {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700 ring-1 ring-inset ring-red-600/20">
        <IconBan className="h-3.5 w-3.5" />
        Not punched in/out
      </div>
    );
  }
  const times = (
    <span className="tabular-nums">
      {fmtTime(punch.firstIn)} → {punch.lastOut ? fmtTime(punch.lastOut) : 'no out'} · {punch.hours}h
    </span>
  );
  if (!punch.fullDay) {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/20">
        <IconClock className="h-3.5 w-3.5" />
        {times}
        <span className="font-bold">— short of 9:30–6:30</span>
      </div>
    );
  }
  return (
    <div className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
      <IconCheckCircle className="h-3.5 w-3.5" />
      {times}
      <span className="font-bold">· full day</span>
    </div>
  );
}

export default function CompOff() {
  const [year, setYear] = useState(CUR_YEAR);
  const [status, setStatus] = useState('pending');
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    apiGet(`/compoff/requests?year=${year}${status ? `&status=${status}` : ''}`)
      .then((r) => setRequests(r.requests || []))
      .catch((e) => setError(e.message || 'Failed to load comp-off requests'))
      .finally(() => setLoading(false));
  }, [year, status]);

  useEffect(() => { load(); }, [load]);

  const decide = async (r, decision) => {
    if (decision === 'approved' && (!r.punch?.punched || !r.punch?.fullDay)) {
      const warn = !r.punch?.punched
        ? 'This employee did NOT punch in/out on the worked day.'
        : 'Their punches do not cover the full 9:30–6:30 day.';
      if (!window.confirm(`${warn}\n\nApprove the comp-off credit anyway?`)) return;
    }
    let reviewNote = '';
    if (decision === 'rejected') reviewNote = window.prompt('Reason for rejection (optional):', '') ?? '';
    setBusyId(r.id);
    try {
      await apiPatch(`/compoff/requests/${r.id}/decision`, { status: decision, reviewNote });
      load();
    } catch (e) {
      alert(e.message || 'Could not update the request');
    } finally {
      setBusyId((prev) => (prev === r.id ? null : prev));
    }
  };

  const revoke = async (r) => {
    const who = r.user?.fullName || r.user?.username;
    if (!window.confirm(`Revoke the approved comp-off credit for ${who} (worked ${fmtDate(r.workDate)})?\nTheir CO leave balance drops by 1 day.`)) return;
    const reviewNote = window.prompt('Reason (optional):', 'Punch record did not meet the full-day requirement') ?? '';
    setBusyId(r.id);
    try {
      await apiPatch(`/compoff/admin/${r.id}/revoke`, { reviewNote });
      load();
    } catch (e) {
      alert(e.message || 'Could not revoke the credit');
    } finally {
      setBusyId((prev) => (prev === r.id ? null : prev));
    }
  };

  const stats = useMemo(() => {
    const pending = requests.filter((r) => r.status === 'pending');
    const approved = requests.filter((r) => r.status === 'approved');
    const flagged = requests.filter((r) => r.status !== 'rejected' && r.status !== 'cancelled' && r.punch && (!r.punch.punched || !r.punch.fullDay));
    return {
      pending: pending.length,
      approved: approved.length,
      flagged: flagged.length,
      people: new Set(approved.map((r) => r.userId)).size,
    };
  }, [requests]);

  return (
    <div>
      <PageHeader
        title="Comp-Off"
        subtitle="Credits for week-offs/holidays worked. Approve only when the punch record shows a full 9:30–6:30 day."
      />

      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Year</span>
            <Input
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value) || CUR_YEAR)}
              className="w-32"
            />
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
            <StatCard label="Approved credits" value={stats.approved} tone="green" icon={<IconCheckCircle className="h-5 w-5" />} />
            <StatCard label="Punch alerts" value={stats.flagged} tone="red" icon={<IconBan className="h-5 w-5" />} />
            <StatCard label="Employees with credits" value={stats.people} tone="blue" icon={<IconUsers className="h-5 w-5" />} />
          </div>
        )}

        {error && <ErrorNote>{error}</ErrorNote>}

        <Card>
          {loading ? (
            <CardBody><Loading label="Loading comp-off requests…" /></CardBody>
          ) : requests.length === 0 ? (
            <CardBody>
              <EmptyState
                title="No comp-off requests"
                hint="Employees raise these from the mobile app after working a Sunday or company holiday."
                icon={<IconInbox />}
              />
            </CardBody>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-3 font-semibold">Employee</th>
                    <th className="px-4 py-3 font-semibold">Worked day</th>
                    <th className="px-4 py-3 font-semibold">Punch record (9:30–6:30 required)</th>
                    <th className="px-4 py-3 font-semibold">Work done</th>
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
                        <td className="whitespace-nowrap px-4 py-3 text-slate-600">{fmtDate(r.workDate)}</td>
                        <td className="px-4 py-3"><PunchCell punch={r.punch} /></td>
                        <td className="max-w-[14rem] px-4 py-3 text-slate-500">
                          <span className="line-clamp-2">{r.reason || '—'}</span>
                        </td>
                        <td className="px-4 py-3">
                          <Badge tone={STATUS_TONE[r.status] || 'gray'}>{r.status}</Badge>
                          {(r.status === 'rejected' || r.status === 'revoked') && r.reviewNote && (
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
                          ) : r.status === 'approved' ? (
                            <div className="flex items-center justify-end gap-2">
                              <span className="text-xs text-slate-400">
                                {r.reviewedBy ? `by ${r.reviewedBy.fullName || r.reviewedBy.username}` : '—'}
                              </span>
                              <Button size="sm" variant="danger" disabled={busy} onClick={() => revoke(r)} title="Remove this credit">
                                {busy ? <Spinner className="h-4 w-4 text-current" /> : <IconTrash className="h-4 w-4" />}
                                Revoke
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
    </div>
  );
}
