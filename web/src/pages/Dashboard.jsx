// Dashboard — landing overview of TODAY's attendance (Asia/Kolkata).
// Pulls GET /attendance/admin/day and lets the admin scrub the date from the header.

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet } from '../lib/api';
import { fmtTime, fmtHours, fmtDate, todayIST } from '../lib/format';
import {
  Card,
  CardBody,
  Input,
  Badge,
  StatCard,
  Loading,
  EmptyState,
  ErrorNote,
  PageHeader,
} from '../components/ui';
import {
  IconCheckCircle,
  IconClock,
  IconBan,
  IconUsers,
  IconCalendar,
  IconSparkles,
  IconGift,
} from '../components/icons';

/* ---------------------------------------------- Celebrations (premium strip) */
const initialsOf = (n) =>
  (n || 'U').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();

const whenLabel = (d) =>
  d === 0 ? 'Today 🎉' : d === 1 ? 'Tomorrow' : `in ${d} days`;

// Gradient strip of upcoming birthdays & work anniversaries (next 30 days).
function CelebrationsStrip() {
  const navigate = useNavigate();
  const [events, setEvents] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    apiGet('/reports/upcoming?days=7')
      .then((r) => alive && setEvents(r.events || []))
      .catch(() => { if (alive) { setFailed(true); setEvents([]); } }); // never blocks the dashboard
    return () => { alive = false; };
  }, []);

  if (!events || failed) return null; // loading, or old backend without the endpoint

  // Empty state — tell the admin what feeds this strip instead of hiding it.
  if (events.length === 0) {
    return (
      <div className="flex items-center gap-3 px-5 py-4 border border-dashed rounded-2xl border-slate-300 bg-slate-50">
        <span className="text-xl">🎂</span>
        <div>
          <p className="text-sm font-semibold text-slate-700">No celebrations in the next 1 week</p>
          <p className="text-xs text-slate-400">
            Birthdays and work anniversaries appear here automatically — add each employee's
            <b> Date of birth</b> and <b>Date of joining</b> in User Management → Edit.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-brand-900 via-brand-800 to-[#312E81] p-5 shadow-lg">
      {/* soft glow decorations */}
      <div className="absolute w-48 h-48 rounded-full pointer-events-none -right-16 -top-16 bg-brand-400/20 blur-3xl" />
      <div className="absolute w-40 h-40 rounded-full pointer-events-none -bottom-20 left-1/3 bg-fuchsia-400/10 blur-3xl" />

      <div className="relative z-10 flex items-center justify-between mb-3">
        <h2 className="flex items-center gap-2 text-sm font-bold tracking-widest uppercase text-brand-100">
          <IconSparkles className="w-4 h-4 text-amber-300" />
          Upcoming celebrations
        </h2>
        <span className="text-[11px] font-medium text-brand-300/80">next 7 days</span>
      </div>

      <div className="relative z-10 flex gap-3 overflow-x-auto pb-1 [scrollbar-width:thin]">
        {events.map((e) => {
          const isToday = e.daysUntil === 0;
          return (
            <button
              key={`${e.type}-${e.id}`}
              type="button"
              onClick={() => navigate(`/chat?to=${e.id}&wish=${e.type}`)}
              title="Send your wishes 💬"
              className={`flex min-w-[15rem] cursor-pointer items-center gap-3 rounded-xl border p-3 text-left backdrop-blur transition hover:scale-[1.02] hover:bg-white/20 ${
                isToday
                  ? 'border-amber-300/60 bg-amber-400/15 shadow-[0_0_20px_rgba(251,191,36,0.15)]'
                  : 'border-white/10 bg-white/10'
              }`}
            >
              <div className="relative">
                <span className="flex items-center justify-center text-sm font-extrabold text-white rounded-full h-11 w-11 bg-gradient-to-br from-brand-400 to-brand-600 ring-2 ring-white/20">
                  {initialsOf(e.fullName || e.username)}
                </span>
                <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-white text-[13px] shadow">
                  {e.type === 'birthday' ? '🎂' : '🏆'}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white truncate">{e.fullName || e.username}</p>
                <p className="truncate text-[11px] text-brand-200/90">
                  {e.type === 'birthday'
                    ? 'Birthday'
                    : `${e.years} year${e.years === 1 ? '' : 's'} with SESS`}
                  {e.designation ? ` · ${e.designation}` : ''}
                </p>
                <span
                  className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    isToday ? 'animate-pulse bg-amber-300 text-amber-900' : 'bg-white/15 text-brand-100'
                  }`}
                >
                  {whenLabel(e.daysUntil)}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Map a session's lateLevel into a Badge tone + label.
function lateBadge(level) {
  if (level === 'ontime') return { tone: 'green', label: 'On time' };
  if (level === 'grace' || level === 'late') return { tone: 'amber', label: 'Late' };
  return null; // null / unknown -> no badge
}

// Render a row of site badges (guards empty/undefined arrays).
function SiteBadges({ sites }) {
  if (!sites || sites.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {sites.map((s, i) => (
        <Badge key={`${s}-${i}`} tone="blue">
          {s}
        </Badge>
      ))}
    </span>
  );
}

export default function Dashboard() {
  const [date, setDate] = useState(todayIST());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    apiGet(`/attendance/admin/day?date=${date}`)
      .then((res) => {
        if (alive) setData(res);
      })
      .catch((err) => {
        if (alive) setError(err.message || 'Failed to load attendance');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [date]);

  const present = data?.present || [];
  const absent = data?.absent || [];
  // { date, name } when the selected date is a company holiday. Nobody is expected
  // in, so "absent" is the wrong word for a list that is really the whole company.
  const holiday = data?.holiday || null;

  // People still on the clock right now.
  const openNow = useMemo(() => present.filter((p) => p.open), [present]);

  // Present table: late first, then alphabetical by name.
  const presentSorted = useMemo(() => {
    return [...present].sort((a, b) => {
      if (!!a.late !== !!b.late) return a.late ? -1 : 1; // late rows bubble to top
      return (a.fullName || a.username || '').localeCompare(b.fullName || b.username || '');
    });
  }, [present]);

  const lateCount = present.filter((p) => p.late).length;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Today's attendance at a glance"
        actions={
          <Input
            type="date"
            value={date}
            max={todayIST()}
            onChange={(e) => setDate(e.target.value || todayIST())}
            className="w-auto"
          />
        }
      />

      {/* Celebrations — independent of the attendance date being scrubbed */}
      <div className="mb-6">
        <CelebrationsStrip />
      </div>

      {loading ? (
        <Loading label="Loading attendance…" />
      ) : error ? (
        <ErrorNote>{error}</ErrorNote>
      ) : (
        <div className="space-y-6">
          {/* Company holiday callout — explains an empty day before the admin reads
              the numbers below. Same wording as the Team Attendance day view. */}
          {holiday && (
            <Card className="border-brand-200 bg-brand-50">
              <CardBody className="flex items-start gap-3">
                <span className="flex items-center justify-center rounded-xl w-9 h-9 shrink-0 bg-white text-brand-700">
                  <IconGift className="w-5 h-5" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    Company holiday · {holiday.name}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {fmtDate(holiday.date)} — nobody is expected to punch in. Anyone listed below
                    worked the holiday.
                  </p>
                </div>
              </CardBody>
            </Card>
          )}

          {/* --------------------------------------------------- Stat cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Present today"
              value={present.length}
              tone="green"
              icon={<IconCheckCircle className="w-5 h-5" />}
              sub={openNow.length ? `${openNow.length} still punched in` : 'All punched out'}
            />
            <StatCard
              label="Late arrivals"
              value={lateCount}
              tone="amber"
              icon={<IconClock className="w-5 h-5" />}
              sub={present.length ? `of ${present.length} present` : undefined}
            />
            {/* On a company holiday nobody is absent — they are simply off, so the
                tile drops the alarming red and says why. */}
            <StatCard
              label={holiday ? 'Off (holiday)' : 'Absent'}
              value={absent.length}
              tone={holiday ? 'slate' : 'red'}
              icon={holiday ? <IconGift className="w-5 h-5" /> : <IconBan className="w-5 h-5" />}
            />
            <StatCard
              label="Total employees"
              value={data?.totalUsers ?? 0}
              tone="blue"
              icon={<IconUsers className="w-5 h-5" />}
            />
          </div>

          {/* --------------------------------------- Currently punched in */}
          <Card>
            <CardBody>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold tracking-wide uppercase text-slate-500">
                  Currently punched in
                </h2>
                <Badge tone={openNow.length ? 'green' : 'slate'}>{openNow.length}</Badge>
              </div>

              {openNow.length === 0 ? (
                <EmptyState
                  icon={<IconClock />}
                  title="No one is punched in"
                  hint="Everybody has clocked out for this date."
                />
              ) : (
                <div className="flex flex-wrap gap-2">
                  {openNow.map((p) => (
                    <div
                      key={p.userId}
                      className="flex items-center gap-2 py-1 pl-3 pr-2 text-sm border rounded-full border-emerald-200 bg-emerald-50"
                    >
                      <span className="relative flex w-2 h-2">
                        <span className="absolute inline-flex w-full h-full rounded-full opacity-75 animate-ping bg-emerald-400" />
                        <span className="relative inline-flex w-2 h-2 rounded-full bg-emerald-500" />
                      </span>
                      <span className="font-medium text-slate-800">
                        {p.fullName || p.username}
                      </span>
                      <span className="text-xs text-slate-500">in {fmtTime(p.firstIn)}</span>
                      <SiteBadges sites={p.sites} />
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>

          {/* ---------------------------------------------- Present / Absent */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Present table (spans 2 cols on large screens) */}
            <Card className="lg:col-span-2">
              <CardBody>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-semibold text-slate-800">Present</h2>
                  <Badge tone="green">{present.length}</Badge>
                </div>

                {present.length === 0 ? (
                  <EmptyState
                    icon={<IconCalendar />}
                    title="No one present"
                    hint={
                      holiday
                        ? 'Company holiday — no punches expected.'
                        : 'No attendance recorded for this date.'
                    }
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-left text-sm">
                      <thead>
                        <tr className="text-xs tracking-wide uppercase border-b border-slate-200 text-slate-400">
                          <th className="px-3 py-2 font-medium">Name</th>
                          <th className="px-3 py-2 font-medium">First In</th>
                          <th className="px-3 py-2 font-medium">Last Out</th>
                          <th className="px-3 py-2 font-medium text-center">Sessions</th>
                          <th className="px-3 py-2 font-medium">Hours</th>
                          <th className="px-3 py-2 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {presentSorted.map((p) => {
                          const badge = lateBadge(p.lateLevel);
                          return (
                            <tr key={p.userId} className="hover:bg-slate-50">
                              <td className="px-3 py-2.5">
                                <div className="font-medium text-slate-800">
                                  {p.fullName || p.username}
                                </div>
                                {p.fullName && (
                                  <div className="text-xs text-slate-400">@{p.username}</div>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-slate-600">{fmtTime(p.firstIn)}</td>
                              <td className="px-3 py-2.5 text-slate-600">
                                {p.open ? (
                                  <span className="text-emerald-600">— open</span>
                                ) : (
                                  fmtTime(p.lastOut)
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-center text-slate-600">
                                {p.sessions ?? 0}
                              </td>
                              <td className="px-3 py-2.5 text-slate-600">{fmtHours(p.hours)}</td>
                              <td className="px-3 py-2.5">
                                {badge ? (
                                  <Badge tone={badge.tone}>{badge.label}</Badge>
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
              </CardBody>
            </Card>

            {/* Absent list */}
            <Card>
              <CardBody>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-semibold text-slate-800">
                    {holiday ? 'Off for the holiday' : 'Absent'} ({absent.length})
                  </h2>
                  <Badge tone={holiday ? 'slate' : absent.length ? 'red' : 'green'}>{absent.length}</Badge>
                </div>

                {absent.length === 0 ? (
                  <EmptyState
                    icon={<IconSparkles />}
                    title={holiday ? 'Everyone worked' : 'Everyone is in'}
                    hint={holiday ? 'Nobody took the holiday off.' : 'No absentees for this date.'}
                  />
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {absent.map((u) => (
                      <li key={u.id} className="flex items-center gap-3 py-2.5">
                        <span className="flex items-center justify-center w-8 h-8 text-xs font-semibold rounded-full shrink-0 bg-slate-100 text-slate-500">
                          {(u.fullName || u.username || '?').charAt(0).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <div className="font-medium truncate text-slate-800">
                            {u.fullName || u.username}
                          </div>
                          <div className="text-xs truncate text-slate-400">@{u.username}</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
