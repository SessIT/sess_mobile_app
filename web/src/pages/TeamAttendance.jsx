// TeamAttendance — the flagship admin page.
// Two tabs (Month Summary / Day View) driven by local state.
//   Month tab: per-user month roll-up + drill-down into one user's day-by-day grid.
//   Day tab:   day-level stat cards + per-user punch sessions (with photos) + absentees.
// All data comes from the /attendance/admin/* endpoints via the api helpers.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiGet, apiPost, apiPatch, api, fileUrl } from '../lib/api';
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
  Select,
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
  IconCalendar,
  IconInbox,
  IconMapPin,
  IconChevronLeft,
  IconEdit,
  IconTrash,
  IconPlus,
} from '../components/icons';

/* Time helpers for the manual-entry editor — everything is IST (+05:30). */
// ISO instant -> "HH:MM" for a <input type="time">.
const isoToTimeInput = (iso) => {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata',
  });
};
// "YYYY-MM-DD" + "HH:MM" (IST) -> ISO instant.
const dateTimeToIso = (ymd, hhmm) => new Date(`${ymd}T${hhmm}:00+05:30`).toISOString();
// IST calendar date ("YYYY-MM-DD") of an ISO instant.
const isoToDateIST = (iso) =>
  new Date(new Date(iso).getTime() + 5.5 * 3600000).toISOString().slice(0, 10);

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
  const [manage, setManage] = useState(null); // { userId, userName, date } | null

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    return apiGet(`/attendance/admin/month?month=${month}&userId=${user.userId}`)
      .then((d) => setData(d))
      .catch((e) => setError(e.message || 'Failed to load user month'))
      .finally(() => setLoading(false));
  }, [month, user.userId]);

  useEffect(() => { load(); }, [load]);

  const stats = data?.stats;
  const days = data?.days || [];
  const userName = user.fullName || user.username;

  // Click a day to fix its punches. Future days aren't editable.
  const openDay = (d) => {
    if (d.status === 'future') return;
    setManage({ userId: user.userId, userName, date: d.date });
  };

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
              <p className="mb-2 text-xs text-slate-400">Tip: click any day to fix punches (e.g. a missing punch-out).</p>
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
                    <th className="px-3 py-2 text-right font-semibold">Edit</th>
                  </tr>
                </thead>
                <tbody>
                  {days.map((d) => {
                    const editable = d.status !== 'future';
                    return (
                      <tr
                        key={d.date}
                        onClick={() => openDay(d)}
                        className={cx(
                          'border-b border-slate-100',
                          editable ? 'cursor-pointer hover:bg-brand-50/50' : 'opacity-60'
                        )}
                      >
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
                        <td className="px-3 py-2.5 text-right">
                          {editable ? (
                            <IconEdit className="ml-auto h-4 w-4 text-slate-400" />
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <DayManager ctx={manage} onClose={() => setManage(null)} onChanged={load} />
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

function DaySessionRow({ s, onOpenPhoto, onEdit, onDelete }) {
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

      {/* Admin edit / delete */}
      <div className="flex items-center gap-1.5">
        <Button size="sm" variant="secondary" onClick={() => onEdit(s)} title="Edit session">
          <IconEdit className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="danger" onClick={() => onDelete(s)} title="Delete session">
          <IconTrash className="h-4 w-4" />
        </Button>
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
  const [editor, setEditor] = useState(null); // { mode:'create'|'edit', session?, date, employees }

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

  // Combined employee list (present + absent) for the manual-entry picker.
  const employees = useMemo(() => {
    const map = new Map();
    (summary?.present || []).forEach((p) => map.set(p.userId, { id: p.userId, username: p.username, fullName: p.fullName }));
    (summary?.absent || []).forEach((a) => map.set(a.id, { id: a.id, username: a.username, fullName: a.fullName }));
    return Array.from(map.values()).sort((a, b) => (a.fullName || a.username).localeCompare(b.fullName || b.username));
  }, [summary]);

  const openCreate = (userId) => setEditor({ mode: 'create', date, employees, userId: userId ?? '' });
  const openEdit = (s) => setEditor({ mode: 'edit', session: s, date: isoToDateIST(s.punchInTime), employees });
  const afterSave = () => { setEditor(null); load(date); };

  const deleteSession = async (s) => {
    const who = s.user?.fullName || s.user?.username || 'this employee';
    if (!window.confirm(`Delete this punch session for ${who}?`)) return;
    try {
      await api(`/attendance/admin/session/${s.id}`, { method: 'DELETE' });
      load(date);
    } catch (e) {
      alert(e.message || 'Delete failed');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Date</span>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-48" />
        </label>
        <Button onClick={() => openCreate()}>
          <IconPlus className="h-4 w-4" />
          Add manual entry
        </Button>
      </div>

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
                      <DaySessionRow
                        key={s.id}
                        s={s}
                        onOpenPhoto={setPhoto}
                        onEdit={openEdit}
                        onDelete={deleteSession}
                      />
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
                  <button
                    onClick={() => openCreate(u.id)}
                    title="Add attendance for this employee"
                    className="ml-1 flex h-5 w-5 items-center justify-center rounded-md text-brand-600 hover:bg-brand-50"
                  >
                    <IconPlus className="h-4 w-4" />
                  </button>
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

      {/* Manual attendance entry / edit */}
      <SessionEditor editor={editor} onClose={() => setEditor(null)} onSaved={afterSave} />
    </div>
  );
}

/* ============================================= Manual attendance editor */
// Create a session for a missed punch, or edit an existing one. All times IST.
function SessionEditor({ editor, onClose, onSaved }) {
  const open = !!editor;
  const isEdit = editor?.mode === 'edit';

  const [userId, setUserId] = useState('');
  const [date, setDate] = useState(todayIST());
  const [inTime, setInTime] = useState('09:30');
  const [outTime, setOutTime] = useState('18:00');
  const [site, setSite] = useState('SESS');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!editor) return;
    setError('');
    setBusy(false);
    setDate(editor.date || todayIST());
    if (editor.mode === 'edit' && editor.session) {
      const s = editor.session;
      setUserId(s.userId ?? s.user?.id ?? '');
      setInTime(isoToTimeInput(s.punchInTime) || '09:30');
      setOutTime(s.punchOutTime ? isoToTimeInput(s.punchOutTime) : '');
      setSite(s.siteName || 'SESS');
    } else {
      setUserId(editor.userId ?? '');
      setInTime('09:30');
      setOutTime('18:00');
      setSite('SESS');
    }
  }, [editor]);

  const canSubmit = (isEdit || userId) && date && inTime && !busy;

  const submit = async (e) => {
    e?.preventDefault();
    if (!isEdit && !userId) { setError('Please choose an employee.'); return; }
    if (!inTime) { setError('Punch-in time is required.'); return; }
    if (outTime && outTime <= inTime) { setError('Punch-out must be after punch-in.'); return; }
    setBusy(true);
    setError('');
    try {
      const punchInTime = dateTimeToIso(date, inTime);
      const punchOutTime = outTime ? dateTimeToIso(date, outTime) : null;
      const body = { punchInTime, punchOutTime, siteName: site.trim() || 'SESS' };
      if (isEdit) {
        await apiPatch(`/attendance/admin/session/${editor.session.id}`, body);
      } else {
        await apiPost('/attendance/admin/session', { userId: Number(userId), ...body });
      }
      onSaved();
    } catch (err) {
      setError(err.message || 'Could not save the session.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onClose}
      title={isEdit ? 'Edit attendance' : 'Add attendance'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {busy ? (
              <>
                <Spinner className="h-4 w-4 text-current" />
                <span>Saving…</span>
              </>
            ) : (
              isEdit ? 'Save changes' : 'Add entry'
            )}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {error && <ErrorNote>{error}</ErrorNote>}

        <Field label="Employee">
          {isEdit || editor?.userName ? (
            // Employee is fixed (editing a session, or adding for a known person).
            <Input
              value={
                editor?.userName ||
                editor?.session?.user?.fullName ||
                editor?.session?.user?.username ||
                'Employee'
              }
              disabled
            />
          ) : (
            <Select value={userId} onChange={(e) => setUserId(e.target.value)}>
              <option value="">Select employee…</option>
              {(editor?.employees || []).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName || u.username} (@{u.username})
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field label="Date">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Punch in">
            <Input type="time" value={inTime} onChange={(e) => setInTime(e.target.value)} />
          </Field>
          <Field label="Punch out" hint="Leave blank = still open">
            <Input type="time" value={outTime} onChange={(e) => setOutTime(e.target.value)} />
          </Field>
        </div>

        <Field label="Site">
          <Input value={site} onChange={(e) => setSite(e.target.value)} placeholder="SESS" />
        </Field>

        <button type="submit" className="hidden" disabled={!canSubmit} aria-hidden="true" />
      </form>
    </Modal>
  );
}

/* ================================================ Per-day session manager */
// Opened by clicking a day. Lists that employee's sessions for the date and
// lets the admin edit/delete each or add a new one (e.g. a missing punch-out).
function DayManager({ ctx, onClose, onChanged }) {
  const open = !!ctx;
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editor, setEditor] = useState(null);

  const load = useCallback(() => {
    if (!ctx) return;
    setLoading(true);
    setError('');
    apiGet(`/attendance/admin/day-sessions?date=${ctx.date}&userId=${ctx.userId}`)
      .then((r) => setSessions(r.sessions || []))
      .catch((e) => setError(e.message || 'Failed to load sessions'))
      .finally(() => setLoading(false));
  }, [ctx]);

  useEffect(() => { if (ctx) load(); }, [ctx, load]);

  const afterSave = () => { setEditor(null); load(); onChanged?.(); };

  const del = async (s) => {
    if (!window.confirm('Delete this punch session?')) return;
    try {
      await api(`/attendance/admin/session/${s.id}`, { method: 'DELETE' });
      load();
      onChanged?.();
    } catch (e) {
      alert(e.message || 'Delete failed');
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={ctx ? `${ctx.userName} · ${fmtDate(ctx.date)}` : ''}
      footer={<Button variant="secondary" onClick={onClose}>Close</Button>}
    >
      <div className="space-y-3">
        {error && <ErrorNote>{error}</ErrorNote>}
        {loading ? (
          <Loading label="Loading sessions…" />
        ) : sessions.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-400">No punch sessions on this day.</p>
        ) : (
          sessions.map((s) => (
            <div key={s.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
              <div className="flex-1">
                <p className="font-semibold tabular-nums text-slate-800">
                  {fmtTime(s.punchInTime)} → {s.punchOutTime ? fmtTime(s.punchOutTime) : <span className="text-amber-600">Open</span>}
                </p>
                <p className="text-xs text-slate-400">
                  {s.siteName || 'SESS'}{s.workingHours != null ? ` · ${fmtHours(s.workingHours)}` : ''}
                </p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => setEditor({ mode: 'edit', session: s, date: ctx.date })} title="Edit">
                <IconEdit className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="danger" onClick={() => del(s)} title="Delete">
                <IconTrash className="h-4 w-4" />
              </Button>
            </div>
          ))
        )}

        <Button
          className="w-full"
          variant="secondary"
          onClick={() => setEditor({ mode: 'create', date: ctx.date, userId: ctx.userId, userName: ctx.userName })}
        >
          <IconPlus className="h-4 w-4" />
          Add session
        </Button>
      </div>

      <SessionEditor editor={editor} onClose={() => setEditor(null)} onSaved={afterSave} />
    </Modal>
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
