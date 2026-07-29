import { useCallback, useEffect, useState } from 'react';
import { apiGet } from '../lib/api';
import { fmtDate, todayIST } from '../lib/format';
import {
  Card,
  CardBody,
  Badge,
  Loading,
  EmptyState,
  ErrorNote,
  PageHeader,
  cx,
} from '../components/ui';
import { IconGift, IconCalendar, IconUsers, IconChart } from '../components/icons';

const MONTHS = [
  ['01', 'January'], ['02', 'February'], ['03', 'March'], ['04', 'April'],
  ['05', 'May'], ['06', 'June'], ['07', 'July'], ['08', 'August'],
  ['09', 'September'], ['10', 'October'], ['11', 'November'], ['12', 'December'],
];

// HR Reports — celebrations (birthdays / work anniversaries) and headcount.
export default function Reports() {
  const [month, setMonth] = useState(todayIST().slice(5, 7));
  const [celebrations, setCelebrations] = useState(null);
  const [headcount, setHeadcount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    Promise.all([
      apiGet(`/reports/celebrations?month=${month}`),
      apiGet('/reports/headcount'),
    ])
      .then(([c, h]) => { setCelebrations(c); setHeadcount(h); })
      .catch((e) => setError(e.message || 'Failed to load reports'))
      .finally(() => setLoading(false));
  }, [month]);

  useEffect(() => { load(); }, [load]);

  const birthdays = celebrations?.birthdays || [];
  const anniversaries = celebrations?.anniversaries || [];

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle="Birthdays, work anniversaries and team headcount."
        actions={
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="rounded-lg border border-slate-300/90 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm"
          >
            {MONTHS.map(([v, label]) => (
              <option key={v} value={v}>{label}</option>
            ))}
          </select>
        }
      />

      {error && <div className="mb-4"><ErrorNote>{error}</ErrorNote></div>}

      {loading ? (
        <Card><CardBody><Loading label="Loading reports…" /></CardBody></Card>
      ) : (
        <div className="space-y-6">
          {/* Headcount */}
          {headcount && (
            <div>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">Headcount</h2>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {[
                  ['Total', headcount.total, 'text-slate-800'],
                  ['Active', headcount.active, 'text-emerald-600'],
                  ['Inactive', headcount.inactive, 'text-red-600'],
                  ['Exited', headcount.exited, 'text-slate-500'],
                ].map(([label, value, tone]) => (
                  <div key={label} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
                    <p className={cx('mt-1 text-2xl font-bold tabular-nums', tone)}>{value}</p>
                  </div>
                ))}
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                {[
                  ['By department', headcount.byDepartment, <IconUsers key="d" className="h-4 w-4" />],
                  ['By employment type', headcount.byEmploymentType, <IconChart key="t" className="h-4 w-4" />],
                ].map(([title, rows, icon]) => (
                  <Card key={title}>
                    <CardBody>
                      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
                        <span className="text-slate-400">{icon}</span>
                        {title}
                      </div>
                      {(rows || []).length === 0 ? (
                        <p className="text-sm text-slate-400">No data — fill these fields in User Management.</p>
                      ) : (
                        <div className="space-y-2">
                          {rows.map((r) => (
                            <div key={r.name} className="flex items-center gap-3">
                              <span className="w-40 truncate text-sm text-slate-600">{r.name}</span>
                              <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                                <div
                                  className="h-full rounded-full bg-brand-500"
                                  style={{ width: `${Math.round((r.count / (headcount.active || 1)) * 100)}%` }}
                                />
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

          {/* Celebrations */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardBody>
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <IconGift className="h-4 w-4 text-slate-400" />
                  Birthdays · {MONTHS.find(([v]) => v === month)?.[1]}
                </div>
                {birthdays.length === 0 ? (
                  <EmptyState title="No birthdays this month" hint="Add dates of birth in User Management." icon={<IconGift />} />
                ) : (
                  <div className="divide-y divide-slate-100">
                    {birthdays.map((b) => (
                      <div key={b.id} className="flex items-center gap-3 py-2.5">
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-sm font-bold text-brand-700">
                          {b.day}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-slate-800">{b.fullName || b.username}</p>
                          <p className="truncate text-xs text-slate-400">
                            {[b.designation, b.department].filter(Boolean).join(' · ') || `@${b.username}`}
                          </p>
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
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <IconCalendar className="h-4 w-4 text-slate-400" />
                  Work anniversaries · {MONTHS.find(([v]) => v === month)?.[1]}
                </div>
                {anniversaries.length === 0 ? (
                  <EmptyState title="No anniversaries this month" hint="Add dates of joining in User Management." icon={<IconCalendar />} />
                ) : (
                  <div className="divide-y divide-slate-100">
                    {anniversaries.map((a) => (
                      <div key={a.id} className="flex items-center gap-3 py-2.5">
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-sm font-bold text-emerald-700">
                          {a.day}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-slate-800">{a.fullName || a.username}</p>
                          <p className="truncate text-xs text-slate-400">
                            {[a.designation, a.department].filter(Boolean).join(' · ') || `@${a.username}`}
                          </p>
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
    </div>
  );
}
