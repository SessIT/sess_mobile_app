// Expenses — admin console for the expense-claim module.
// Employees submit a claim with a bill (photo or PDF) from the mobile app; it is
// reviewed here or in the mobile Expense Approvals screen. Approve/reject only —
// claims are always created by the employee, never by an admin.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiGet, apiPatch, fileUrl } from '../lib/api';
import { fmtDate, fmtDateTime, monthIST } from '../lib/format';
import {
  Card,
  CardBody,
  Button,
  Input,
  Select,
  Field,
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
  IconImage,
} from '../components/icons';

const STATUS_TONE = { pending: 'amber', approved: 'green', rejected: 'red', cancelled: 'gray' };
const FILTERS = ['pending', 'approved', 'rejected', 'all'];

// Bills are whatever the phone's picker produced, so sniff the extension to
// decide between an inline thumbnail and a plain file chip.
const IMAGE_RE = /\.(jpe?g|png|gif|webp|heic|heif|bmp)$/i;
const PDF_RE = /\.pdf$/i;

export default function Expenses() {
  const [month, setMonth] = useState(monthIST());
  const [status, setStatus] = useState('pending');
  const [userId, setUserId] = useState('');
  const [users, setUsers] = useState([]);
  const [usersErr, setUsersErr] = useState('');
  const [requests, setRequests] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  // Employee dropdown — loaded once, sorted by display name.
  useEffect(() => {
    let alive = true;
    apiGet('/users')
      .then((list) => {
        if (!alive) return;
        const sorted = [...(Array.isArray(list) ? list : [])].sort((a, b) =>
          (a.fullName || a.username).localeCompare(b.fullName || b.username)
        );
        setUsers(sorted);
      })
      .catch((e) => {
        if (alive) setUsersErr(e.message || 'Failed to load employees');
      });
    return () => {
      alive = false;
    };
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (month) params.set('month', month);
    if (userId) params.set('userId', userId);
    const qs = params.toString();
    apiGet(`/expenses/requests${qs ? `?${qs}` : ''}`)
      .then((r) => setRequests(r.requests || []))
      .catch((e) => setError(e.message || 'Failed to load expense claims'))
      .finally(() => setLoading(false));
  }, [month, status, userId]);

  useEffect(() => { load(); }, [load]);

  // The tiles summarise the whole month/employee queue, so they get their own
  // status-less fetch — keyed off month+employee only, so switching status tabs
  // re-runs the list query but never this one.
  const loadSummary = useCallback(() => {
    const params = new URLSearchParams();
    if (month) params.set('month', month);
    if (userId) params.set('userId', userId);
    const qs = params.toString();
    apiGet(`/expenses/requests${qs ? `?${qs}` : ''}`)
      .then((r) => setSummary(r.requests || []))
      .catch(() => setSummary(null));
  }, [month, userId]);

  useEffect(() => { loadSummary(); }, [loadSummary]);

  const decide = async (r, decision) => {
    let reviewNote = '';
    if (decision === 'rejected') reviewNote = window.prompt('Reason for rejection (optional):', '') ?? '';
    setBusyId(r.id);
    try {
      await apiPatch(`/expenses/requests/${r.id}/decision`, { status: decision, reviewNote });
      load();
      loadSummary();
    } catch (e) {
      alert(e.message || 'Could not update the claim');
    } finally {
      setBusyId((prev) => (prev === r.id ? null : prev));
    }
  };

  // Roll-up for the stat cards (whole queue, not the status tab's slice).
  const stats = useMemo(() => {
    const rows = summary || [];
    const count = (s) => rows.filter((r) => r.status === s).length;
    return {
      pending: count('pending'),
      approved: count('approved'),
      rejected: count('rejected'),
      people: new Set(rows.map((r) => r.user?.id)).size,
    };
  }, [summary]);

  return (
    <div>
      <PageHeader
        title="Expenses"
        subtitle="Review expense claims raised from the mobile app and check the uploaded bill."
      />

      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-48">
              <Field label="Month">
                <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
              </Field>
            </div>
            <div className="min-w-[14rem]">
              <Field label="Employee">
                <Select value={userId} onChange={(e) => setUserId(e.target.value)}>
                  <option value="">All employees</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.fullName || u.username}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </div>

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

        {usersErr && <ErrorNote>{usersErr}</ErrorNote>}

        {summary && !error && (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Pending claims" value={stats.pending} tone="amber" icon={<IconClock className="h-5 w-5" />} />
            <StatCard label="Approved claims" value={stats.approved} tone="green" icon={<IconCheckCircle className="h-5 w-5" />} />
            <StatCard label="Rejected claims" value={stats.rejected} tone="red" icon={<IconBan className="h-5 w-5" />} />
            <StatCard label="Employees claiming" value={stats.people} tone="slate" icon={<IconUsers className="h-5 w-5" />} />
          </div>
        )}

        {error && <ErrorNote>{error}</ErrorNote>}

        <Card>
          {loading ? (
            <CardBody><Loading label="Loading expense claims…" /></CardBody>
          ) : requests.length === 0 ? (
            <CardBody>
              <EmptyState
                title="No expense claims"
                hint="Employees submit expenses with a bill photo from the mobile app; approved claims are settled with payroll."
                icon={<IconInbox />}
              />
            </CardBody>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-3 font-semibold">Employee</th>
                    <th className="px-4 py-3 font-semibold">Type</th>
                    <th className="px-4 py-3 font-semibold">Details</th>
                    <th className="px-4 py-3 font-semibold">Bill</th>
                    <th className="px-4 py-3 font-semibold">Submitted</th>
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
                        <td className="whitespace-nowrap px-4 py-3">
                          <Badge tone="blue">{r.type || '—'}</Badge>
                        </td>
                        <td className="max-w-[18rem] px-4 py-3 text-slate-500">
                          <span className="line-clamp-2">{r.details || '—'}</span>
                        </td>
                        <td className="px-4 py-3"><BillCell path={r.billPath} /></td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-600">{fmtDate(r.createdAt)}</td>
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
                            <div className="text-xs text-slate-400">
                              {r.reviewedBy ? `by ${r.reviewedBy.fullName || r.reviewedBy.username}` : '—'}
                              {r.reviewedAt && <div>{fmtDateTime(r.reviewedAt)}</div>}
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
    </div>
  );
}

/* ====================================== Bill (image thumbnail or file chip) */
function BillCell({ path }) {
  const url = fileUrl(path);
  if (!url) return <span className="text-xs text-slate-400">No bill</span>;

  const isImage = IMAGE_RE.test(path);
  const isPdf = PDF_RE.test(path);

  if (isImage) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        title="Open the bill in a new tab"
        className="block h-12 w-12 overflow-hidden rounded-lg border border-slate-200 transition hover:border-brand-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
      >
        <img src={url} alt="Expense bill" className="h-full w-full object-cover" />
      </a>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      title="Open the bill in a new tab"
      className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-inset ring-slate-500/10 transition hover:bg-slate-200 hover:text-slate-800"
    >
      <IconImage className="h-3.5 w-3.5" />
      {isPdf ? 'PDF' : 'File'}
    </a>
  );
}
