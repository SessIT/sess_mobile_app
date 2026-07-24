// TeamAttendance — the flagship admin page.
// Two tabs (Month Summary / Day View) driven by local state.
//   Month tab: per-user month roll-up + drill-down into one user's day-by-day grid.
//   Day tab:   day-level stat cards + per-user punch sessions (with photos) + absentees.
// All data comes from the /attendance/admin/* endpoints via the api helpers.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiGet, fileUrl } from '../lib/api';
import {
  fmtTime,
  fmtDate,
  fmtHours,
  todayIST,
  monthIST,
  WEEKDAYS,
} from '../lib/format';
import {
  Card,
  CardBody,
  Button,
  Input,
  Badge,
  StatCard,
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
  IconCalendar,
  IconInbox,
  IconMapPin,
  IconChevronLeft,
} from '../components/icons';

/* ------------------------------------------------------------------ helpers */

// Small colored badge for a day/session status.
function StatusBadge({ status }) {
  const map = {
    present: { tone: 'green', label: 'Present' },
    absent: { tone: 'red', label: 'Absent' },
    weekoff: { tone: 'slate', label: 'Week off' },
    future: { tone: 'gray', label: '—' },
  };
  const { tone, label } = map[status] || { tone: 'slate', label: status || '—' };
  return <Badge tone={tone}>{label}</Badge>;
}

// Badge that reflects lateness level for a present row.
function LateBadge({ late, lateLevel }) {
  if (lateLevel === 'grace') return <Badge tone="amber">Grace</Badge>;
  if (lateLevel === 'late' || late) return <Badge tone="red">Late</Badge>;
  return <Badge tone="green">On time</Badge>;
}

// Row of small site badges (guards empty).
function SiteBadges({ sites }) {
  if (!sites || sites.length === 0) return <span className="text-slate-300">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {sites.map((s, i) => (
        <Badge key={`${s}-${i}`} tone="blue">
          {s}
        </Badge>
      ))}
    </div>
  );
}

/* ============================================================ Month: summary */

function MonthSummaryTable({ rows, onPick, requiredHours }) {
  if (!rows || rows.length === 0) {
    return <EmptyState title="No attendance yet" hint="No records for this month." icon={<IconCalendar />} />;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
            <th className="px-3 py-2 font-semibold">Name</th>
            <th className="px-3 py-2 text-center font-semibold">Present</th>
            <th className="px-3 py-2 text-center font-semibold">Leave</th>
            <th className="px-3 py-2 text-center font-semibold">Late</th>
            <th className="px-3 py-2 text-right font-semibold">Required</th>
            <th className="px-3 py-2 text-right font-semibold">Worked</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            // Short of the target usually means leave/half-days — flag amber, not alarming red.
            const short = requiredHours != null && r.hours < requiredHours;
            return (
              <tr
                key={r.userId}
                onClick={() => onPick(r)}
                className="cursor-pointer border-b border-slate-100 transition hover:bg-slate-50"
              >
                <td className="px-3 py-2.5">
                  <p className="font-semibold text-slate-800">{r.fullName || r.username}</p>
                  <p className="text-xs text-slate-400">@{r.username}</p>
                </td>
                <td className="px-3 py-2.5 text-center font-semibold text-emerald-600">{r.present}</td>
                <td className="px-3 py-2.5 text-center font-semibold text-red-600">{r.absent}</td>
                <td className="px-3 py-2.5 text-center font-semibold text-amber-600">{r.late}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-400">
                  {requiredHours != null ? fmtHours(requiredHours) : '—'}
                </td>
                <td className={cx('px-3 py-2.5 text-right font-semibold tabular-nums', short ? 'text-amber-600' : 'text-emerald-600')}>
                  {fmtHours(r.hours)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ==================================================== Month: user drill-down */

function MonthUserDetail({ month, user, onBack }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    apiGet(`/attendance/admin/month?month=${month}&userId=${user.userId}`)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e.message || 'Failed to load user month'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [month, user.userId]);

  const stats = data?.stats;
  const days = data?.days || [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-800">{user.fullName || user.username}</h2>
          <p className="text-xs text-slate-400">@{user.username} · {month}</p>
        </div>
        <Button variant="secondary" size="sm" onClick={onBack}>
          <IconChevronLeft className="h-4 w-4" />
          Back to summary
        </Button>
      </div>

      {loading && <Loading label="Loading month detail…" />}
      {!loading && error && <ErrorNote>{error}</ErrorNote>}

      {!loading && !error && stats && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <StatCard label="Present" value={stats.present} tone="green" icon={<IconCheckCircle className="h-5 w-5" />} />
            <StatCard label="Leave" value={stats.absent} tone="red" icon={<IconBan className="h-5 w-5" />} />
            <StatCard label="Late" value={stats.late} tone="amber" icon={<IconClock className="h-5 w-5" />} />
            <StatCard label="Required hrs" value={fmtHours(data.requiredHours)} sub={data.hoursPerDay ? `${data.hoursPerDay} h/day` : undefined} tone="slate" icon={<IconCalendar className="h-5 w-5" />} />
            <StatCard label="Worked hrs" value={fmtHours(stats.hours)} tone="blue" icon={<IconTimer className="h-5 w-5" />} />
          </div>

          {days.length === 0 ? (
            <EmptyState title="No days to show" icon={<IconCalendar />} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-3 py-2 font-semibold">Date</th>
                    <th className="px-3 py-2 font-semibold">Day</th>
                    <th className="px-3 py-2 font-semibold">Status</th>
                    <th className="px-3 py-2 font-semibold">First in</th>
                    <th className="px-3 py-2 font-semibold">Last out</th>
                    <th className="px-3 py-2 text-center font-semibold">Sessions</th>
                    <th className="px-3 py-2 text-right font-semibold">Hours</th>
                    <th className="px-3 py-2 font-semibold">Sites</th>
                  </tr>
                </thead>
                <tbody>
                  {days.map((d) => (
                    <tr key={d.date} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="whitespace-nowrap px-3 py-2.5 text-slate-700">{fmtDate(d.date)}</td>
                      <td className="px-3 py-2.5 text-slate-500">{WEEKDAYS[d.weekday]}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          {/* A late day belongs to the "Late" bucket, not "Present",
                              so it shows a Late badge instead of a green Present one —
                              keeping the grid consistent with the on-time-only stats. */}
                          {d.status === 'present' && d.late ? (
                            <LateBadge late={d.late} lateLevel={d.lateLevel} />
                          ) : (
                            <StatusBadge status={d.status} />
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-slate-600">{d.status === 'present' ? fmtTime(d.firstIn) : '—'}</td>
                      <td className="px-3 py-2.5 text-slate-600">{d.status === 'present' ? fmtTime(d.lastOut) : '—'}</td>
                      <td className="px-3 py-2.5 text-center tabular-nums text-slate-600">
                        {d.status === 'present' ? d.sessions : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                        {d.status === 'present' ? fmtHours(d.hours) : '—'}
                      </td>
                      <td className="px-3 py-2.5">
                        {d.status === 'present' ? <SiteBadges sites={d.sites} /> : <span className="text-slate-300">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ============================================================= Month tab root */

function MonthTab() {
  const [month, setMonth] = useState(monthIST());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null); // a summary row -> drill-down

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    setSelected(null); // reset drill-down when the month changes
    apiGet(`/attendance/admin/month?month=${month}`)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e.message || 'Failed to load month summary'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [month]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Month</span>
          <Input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="w-48"
          />
        </label>
        {data && (
          <p className="pb-2 text-sm text-slate-500">
            <span className="font-semibold text-slate-700">{data.workingDaysSoFar}</span> working days so far
            {data.requiredHours != null && (
              <> · <span className="font-semibold text-slate-700">{fmtHours(data.requiredHours)}</span> required
                {data.hoursPerDay ? ` (${data.hoursPerDay} h/day)` : ''}</>
            )}
            {typeof data.summary?.length === 'number' && (
              <> · {data.summary.length} employees</>
            )}
          </p>
        )}
      </div>

      <Card>
        <CardBody>
          {loading && <Loading label="Loading month summary…" />}
          {!loading && error && <ErrorNote>{error}</ErrorNote>}
          {!loading && !error && !selected && (
            <MonthSummaryTable rows={data?.summary} onPick={setSelected} requiredHours={data?.requiredHours} />
          )}
          {!loading && !error && selected && (
            <MonthUserDetail month={month} user={selected} onBack={() => setSelected(null)} />
          )}
        </CardBody>
      </Card>
    </div>
  );
}

/* ================================================================= Day tab */

// One punch photo thumbnail; clicking opens the enlarged modal.
function PhotoThumb({ path, label, address, time, onOpen }) {
  const url = fileUrl(path);
  if (!url) return null;
  return (
    <button
      type="button"
      onClick={() => onOpen({ url, label, address, time })}
      className="group relative h-12 w-12 overflow-hidden rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
      title={`${label} photo`}
    >
      <img src={url} alt={`${label} punch`} className="h-full w-full object-cover transition group-hover:scale-105" />
    </button>
  );
}

function DaySessionRow({ s, onOpenPhoto }) {
  const open = !s.punchOutTime;
  return (
    <div className="flex flex-wrap items-center gap-4 border-t border-slate-100 py-3 first:border-t-0">
      {/* In */}
      <div className="min-w-[10rem] flex-1">
        <div className="flex items-center gap-2">
          <Badge tone="green">In</Badge>
          <span className="font-semibold tabular-nums text-slate-800">{fmtTime(s.punchInTime)}</span>
          {s.siteName && <Badge tone="blue">{s.siteName}</Badge>}
          {s.isLate && <Badge tone="red">Late</Badge>}
        </div>
        {s.punchInAddress && (
          <p className="mt-1 flex items-center gap-1 text-xs text-slate-400" title={s.punchInAddress}>
            <IconMapPin className="h-3.5 w-3.5 flex-none" />
            <span className="truncate">{s.punchInAddress}</span>
          </p>
        )}
      </div>

      {/* Out */}
      <div className="min-w-[10rem] flex-1">
        <div className="flex items-center gap-2">
          <Badge tone={open ? 'amber' : 'slate'}>Out</Badge>
          {open ? (
            <span className="text-sm font-semibold text-amber-600">Open</span>
          ) : (
            <span className="font-semibold tabular-nums text-slate-800">{fmtTime(s.punchOutTime)}</span>
          )}
        </div>
        {!open && s.punchOutAddress && (
          <p className="mt-1 flex items-center gap-1 text-xs text-slate-400" title={s.punchOutAddress}>
            <IconMapPin className="h-3.5 w-3.5 flex-none" />
            <span className="truncate">{s.punchOutAddress}</span>
          </p>
        )}
      </div>

      {/* Hours */}
      <div className="w-20 text-right">
        <p className="text-xs uppercase tracking-wide text-slate-400">Hours</p>
        <p className="font-semibold tabular-nums text-slate-700">
          {open ? '—' : fmtHours(s.workingHours)}
        </p>
      </div>

      {/* Photos */}
      <div className="flex items-center gap-2">
        <PhotoThumb
          path={s.punchInPhoto}
          label="Punch in"
          address={s.punchInAddress}
          time={s.punchInTime}
          onOpen={onOpenPhoto}
        />
        <PhotoThumb
          path={s.punchOutPhoto}
          label="Punch out"
          address={s.punchOutAddress}
          time={s.punchOutTime}
          onOpen={onOpenPhoto}
        />
      </div>
    </div>
  );
}

function DayTab() {
  const [date, setDate] = useState(todayIST());

  // Two independent fetches: the day roll-up and the raw sessions.
  const [summary, setSummary] = useState(null);
  const [sumLoading, setSumLoading] = useState(true);
  const [sumError, setSumError] = useState('');

  const [sessions, setSessions] = useState(null);
  const [sesLoading, setSesLoading] = useState(true);
  const [sesError, setSesError] = useState('');

  const [photo, setPhoto] = useState(null); // { url, label, address, time }

  const load = useCallback((d) => {
    let alive = true;

    setSumLoading(true);
    setSumError('');
    apiGet(`/attendance/admin/day?date=${d}`)
      .then((r) => alive && setSummary(r))
      .catch((e) => alive && setSumError(e.message || 'Failed to load day summary'))
      .finally(() => alive && setSumLoading(false));

    setSesLoading(true);
    setSesError('');
    apiGet(`/attendance/admin/day-sessions?date=${d}`)
      .then((r) => alive && setSessions(r))
      .catch((e) => alive && setSesError(e.message || 'Failed to load sessions'))
      .finally(() => alive && setSesLoading(false));

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => load(date), [date, load]);

  // Group flat session list by user for card rendering.
  const grouped = useMemo(() => {
    const list = sessions?.sessions || [];
    const byUser = new Map();
    for (const s of list) {
      const u = s.user || { id: s.userId, username: '—', fullName: '—' };
      if (!byUser.has(u.id)) byUser.set(u.id, { user: u, items: [] });
      byUser.get(u.id).items.push(s);
    }
    return Array.from(byUser.values());
  }, [sessions]);

  const absent = summary?.absent || [];

  return (
    <div className="space-y-5">
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">Date</span>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-48" />
      </label>

      {/* Day-level stat cards */}
      {sumLoading && (
        <Card>
          <CardBody>
            <Loading label="Loading day summary…" />
          </CardBody>
        </Card>
      )}
      {!sumLoading && sumError && <ErrorNote>{sumError}</ErrorNote>}
      {!sumLoading && !sumError && summary && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Present" value={summary.present?.length ?? 0} tone="green" icon={<IconCheckCircle className="h-5 w-5" />} />
          <StatCard
            label="Late"
            value={(summary.present || []).filter((p) => p.late).length}
            tone="amber"
            icon={<IconClock className="h-5 w-5" />}
          />
          <StatCard label="Absent" value={summary.absent?.length ?? 0} tone="red" icon={<IconBan className="h-5 w-5" />} />
          <StatCard label="Total staff" value={summary.totalUsers ?? 0} tone="blue" icon={<IconUsers className="h-5 w-5" />} />
        </div>
      )}

      {/* Per-user punch sessions */}
      <div>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
          Punch sessions
        </h2>
        {sesLoading && (
          <Card>
            <CardBody>
              <Loading label="Loading sessions…" />
            </CardBody>
          </Card>
        )}
        {!sesLoading && sesError && <ErrorNote>{sesError}</ErrorNote>}
        {!sesLoading && !sesError && grouped.length === 0 && (
          <Card>
            <CardBody>
              <EmptyState title="No punches on this day" hint="Nobody punched in." icon={<IconInbox />} />
            </CardBody>
          </Card>
        )}
        {!sesLoading && !sesError && grouped.length > 0 && (
          <div className="space-y-4">
            {grouped.map(({ user, items }) => (
              <Card key={user.id}>
                <CardBody>
                  <div className="mb-1 flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-slate-800">{user.fullName || user.username}</h3>
                      <p className="text-xs text-slate-400">@{user.username}</p>
                    </div>
                    <Badge tone="slate">
                      {items.length} session{items.length === 1 ? '' : 's'}
                    </Badge>
                  </div>
                  <div>
                    {items.map((s) => (
                      <DaySessionRow key={s.id} s={s} onOpenPhoto={setPhoto} />
                    ))}
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Absentees (muted) */}
      {!sumLoading && !sumError && absent.length > 0 && (
        <Card className="border-slate-200 bg-slate-50">
          <CardBody>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
              Absent · {absent.length}
            </h2>
            <div className="flex flex-wrap gap-2">
              {absent.map((u) => (
                <span
                  key={u.id}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600"
                >
                  <span className="font-medium text-slate-700">{u.fullName || u.username}</span>
                  <span className="text-xs text-slate-400">@{u.username}</span>
                </span>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      {/* Enlarged photo modal */}
      <Modal open={!!photo} onClose={() => setPhoto(null)} title={photo?.label} width="max-w-md">
        {photo && (
          <div className="space-y-3">
            <img src={photo.url} alt={photo.label} className="w-full rounded-xl border border-slate-200" />
            <div className="space-y-1 text-sm">
              {photo.time && (
                <p className="text-slate-700">
                  <span className="font-semibold">Time:</span> {fmtTime(photo.time)}
                </p>
              )}
              {photo.address && (
                <p className="flex items-start gap-1.5 text-slate-600">
                  <IconMapPin className="mt-0.5 h-4 w-4 flex-none text-slate-400" />
                  <span>{photo.address}</span>
                </p>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* =============================================================== Page root */

export default function TeamAttendance() {
  const [tab, setTab] = useState('month'); // 'month' | 'day'

  // Segmented control: active tab lifts on a white pill; inactive is muted.
  const segBtn = (key) =>
    cx(
      'rounded-lg px-4 py-1.5 text-sm font-semibold transition focus:outline-none',
      tab === key
        ? 'bg-white text-brand-800 shadow-sm ring-1 ring-slate-200/80'
        : 'text-slate-500 hover:text-slate-700'
    );

  const segmented = (
    <div className="inline-flex items-center gap-1 rounded-xl bg-slate-100 p-1">
      <button type="button" className={segBtn('month')} onClick={() => setTab('month')}>
        Month Summary
      </button>
      <button type="button" className={segBtn('day')} onClick={() => setTab('day')}>
        Day View
      </button>
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Team Attendance"
        subtitle="Review monthly roll-ups and daily punch activity across the team."
        actions={segmented}
      />
      {tab === 'month' ? <MonthTab /> : <DayTab />}
    </div>
  );
}
