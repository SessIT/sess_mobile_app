// Shifts — work schedules. Each shift sets its timings, grace, required hours,
// half-day threshold and week-off days; lateness, early-out, half-day, absence
// and leave-day counting are all judged against the employee's shift. One shift
// is the default and covers everyone not assigned elsewhere.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiGet, apiPost, apiPatch, api } from '../lib/api';
import { WEEKDAYS } from '../lib/format';
import {
  Card, CardBody, Button, Input, Field, Badge, Loading, EmptyState, ErrorNote, PageHeader, Modal, Spinner, cx,
} from '../components/ui';
import { IconPlus, IconEdit, IconTrash, IconUsers, IconTimer, IconSearch } from '../components/icons';

const BLANK = {
  name: '', startTime: '09:30', endTime: '18:30',
  graceMinutes: 10, hoursPerDay: 8, halfDayHours: 4, weekOffDays: [0],
};

const isOvernight = (s) => s.endTime <= s.startTime;
const nameOf = (u) => u.fullName || u.username;

export default function Shifts() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null); // null | 'new' | shift
  const [assigning, setAssigning] = useState(null); // shift | null

  const load = useCallback(() => {
    setError('');
    return apiGet('/shifts')
      .then(setData)
      .catch((e) => setError(e.message || 'Failed to load shifts'))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const shifts = data?.shifts || [];
  // Every active employee appears under exactly one shift (unassigned ones under
  // the default), so this is the full roster for the assign dialog.
  const roster = useMemo(
    () => shifts.flatMap((s) => s.users.map((u) => ({ ...u, shiftId: s.id, shiftName: s.name })))
      .sort((a, b) => nameOf(a).localeCompare(nameOf(b))),
    [shifts],
  );

  const makeDefault = async (s) => {
    if (!window.confirm(`Make "${s.name}" the default shift?\n\nEveryone not assigned to another shift will follow it.`)) return;
    try { await apiPatch(`/shifts/${s.id}`, { isDefault: true }); load(); }
    catch (e) { window.alert(e.message); }
  };

  const remove = async (s) => {
    const n = s.users.length;
    if (!window.confirm(`Delete "${s.name}"?${n ? `\n\nIts ${n} employee${n === 1 ? '' : 's'} will move to the default shift.` : ''}`)) return;
    try { await api(`/shifts/${s.id}`, { method: 'DELETE' }); load(); }
    catch (e) { window.alert(e.message); }
  };

  return (
    <div>
      <PageHeader
        title="Shifts & Week-offs"
        subtitle="Timings, grace and week-off days used to judge late, early-out, half-day and absent"
        actions={(
          <Button onClick={() => setEditing('new')}>
            <IconPlus className="h-4 w-4" />
            New shift
          </Button>
        )}
      />

      {loading && <Loading label="Loading shifts…" />}
      {!loading && error && <ErrorNote>{error}</ErrorNote>}

      {!loading && !error && (
        <>
          <div className="mb-4 rounded-lg border border-brand-100 bg-brand-50/60 px-4 py-3 text-sm text-slate-600">
            Shift changes apply to every month that is <span className="font-semibold">not locked</span> — attendance is
            recalculated live. Locked months keep their frozen payroll figures.
          </div>

          {shifts.length === 0 ? (
            <Card><CardBody><EmptyState title="No shifts yet" icon={<IconTimer />} /></CardBody></Card>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {shifts.map((s) => (
                <Card key={s.id}>
                  <CardBody>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-lg font-bold text-slate-800">{s.name}</h3>
                          {s.isDefault && <Badge tone="blue">Default</Badge>}
                          {isOvernight(s) && <Badge tone="amber">Overnight</Badge>}
                        </div>
                        <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
                          {s.startTime} – {s.endTime}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setEditing(s)} title="Edit shift">
                          <IconEdit className="h-4 w-4" />
                        </Button>
                        {!s.isDefault && (
                          <Button variant="ghost" size="sm" onClick={() => remove(s)} title="Delete shift">
                            <IconTrash className="h-4 w-4 text-red-600" />
                          </Button>
                        )}
                      </div>
                    </div>

                    <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
                      <div><dt className="text-xs text-slate-400">Grace</dt><dd className="font-semibold text-slate-700">{s.graceMinutes} min</dd></div>
                      <div><dt className="text-xs text-slate-400">Full day</dt><dd className="font-semibold text-slate-700">{s.hoursPerDay} h</dd></div>
                      <div><dt className="text-xs text-slate-400">Half day under</dt><dd className="font-semibold text-slate-700">{s.halfDayHours} h</dd></div>
                    </dl>

                    <div className="mt-4">
                      <p className="mb-1.5 text-xs text-slate-400">Week-off days</p>
                      <div className="flex gap-1">
                        {WEEKDAYS.map((d, i) => (
                          <span
                            key={d}
                            className={cx(
                              'w-10 rounded-md py-1 text-center text-xs font-semibold',
                              s.weekOffDays.includes(i) ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-400',
                            )}
                          >
                            {d}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="mt-4 border-t border-slate-100 pt-3">
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-sm font-semibold text-slate-700">
                          {s.users.length} employee{s.users.length === 1 ? '' : 's'}
                        </p>
                        <div className="flex gap-2">
                          {!s.isDefault && (
                            <Button variant="ghost" size="sm" onClick={() => makeDefault(s)}>Make default</Button>
                          )}
                          <Button variant="secondary" size="sm" onClick={() => setAssigning(s)}>
                            <IconUsers className="h-4 w-4" />
                            Assign
                          </Button>
                        </div>
                      </div>
                      {s.users.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {s.users.slice(0, 12).map((u) => (
                            <span key={u.id} className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{nameOf(u)}</span>
                          ))}
                          {s.users.length > 12 && (
                            <span className="px-1 text-xs text-slate-400">+{s.users.length - 12} more</span>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400">Nobody on this shift yet.</p>
                      )}
                    </div>
                  </CardBody>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      <ShiftForm
        shift={editing}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); load(); }}
      />
      <AssignDialog
        shift={assigning}
        roster={roster}
        onClose={() => setAssigning(null)}
        onSaved={() => { setAssigning(null); load(); }}
      />
    </div>
  );
}

/* ------------------------------------------------------- create / edit form */
function ShiftForm({ shift, onClose, onSaved }) {
  const open = shift !== null;
  const isNew = shift === 'new';
  const [form, setForm] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setForm(isNew ? BLANK : {
      name: shift.name, startTime: shift.startTime, endTime: shift.endTime,
      graceMinutes: shift.graceMinutes, hoursPerDay: shift.hoursPerDay,
      halfDayHours: shift.halfDayHours, weekOffDays: shift.weekOffDays,
    });
    setError('');
    setBusy(false);
  }, [open, isNew, shift]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const toggleDay = (i) => setForm((f) => ({
    ...f,
    weekOffDays: f.weekOffDays.includes(i) ? f.weekOffDays.filter((d) => d !== i) : [...f.weekOffDays, i],
  }));

  const save = async () => {
    setBusy(true);
    setError('');
    const body = {
      ...form,
      graceMinutes: Number(form.graceMinutes),
      hoursPerDay: Number(form.hoursPerDay),
      halfDayHours: Number(form.halfDayHours),
    };
    try {
      if (isNew) await apiPost('/shifts', body);
      else await apiPatch(`/shifts/${shift.id}`, body);
      onSaved();
    } catch (e) {
      setError(e.message || 'Could not save the shift');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isNew ? 'New shift' : `Edit ${shift?.name || 'shift'}`}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy}>
            {busy && <Spinner className="h-4 w-4 text-white" />}
            {isNew ? 'Create shift' : 'Save changes'}
          </Button>
        </>
      )}
    >
      <div className="space-y-4">
        <ErrorNote>{error}</ErrorNote>
        <Field label="Shift name">
          <Input value={form.name} onChange={set('name')} placeholder="e.g. Night Shift" maxLength={40} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start time (IST)">
            <Input type="time" value={form.startTime} onChange={set('startTime')} />
          </Field>
          <Field label="End time (IST)" hint={isOvernight(form) ? 'Ends next morning (overnight)' : undefined}>
            <Input type="time" value={form.endTime} onChange={set('endTime')} />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Grace (min)" hint="On time up to start + grace">
            <Input type="number" min="0" max="120" value={form.graceMinutes} onChange={set('graceMinutes')} />
          </Field>
          <Field label="Full day (h)" hint="Required hours">
            <Input type="number" min="1" max="16" step="0.5" value={form.hoursPerDay} onChange={set('hoursPerDay')} />
          </Field>
          <Field label="Half day under (h)" hint="Fewer hours = half day">
            <Input type="number" min="0" max="16" step="0.5" value={form.halfDayHours} onChange={set('halfDayHours')} />
          </Field>
        </div>
        <div>
          <span className="mb-1 block text-sm font-medium text-slate-700">Week-off days</span>
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAYS.map((d, i) => {
              const on = form.weekOffDays.includes(i);
              return (
                <button
                  type="button"
                  key={d}
                  onClick={() => toggleDay(i)}
                  className={cx(
                    'w-12 rounded-lg border py-1.5 text-sm font-semibold transition',
                    on ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-300 bg-white text-slate-500 hover:border-slate-400',
                  )}
                >
                  {d}
                </button>
              );
            })}
          </div>
          <span className="mt-1 block text-xs text-slate-400">
            Week-offs are never absent, never charged as leave, and working one earns comp-off.
          </span>
        </div>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------- assign dialog */
function AssignDialog({ shift, roster, onClose, onSaved }) {
  const open = !!shift;
  const [picked, setPicked] = useState(new Set());
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) { setPicked(new Set()); setQ(''); setError(''); setBusy(false); }
  }, [open]);

  // Employees already on this shift aren't offered — assigning moves people IN.
  const candidates = roster.filter((u) => u.shiftId !== shift?.id
    && (!q || `${nameOf(u)} ${u.username} ${u.employeeId || ''}`.toLowerCase().includes(q.toLowerCase())));

  const toggle = (id) => setPicked((p) => {
    const n = new Set(p);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await api(`/shifts/${shift.id}/users`, { method: 'PUT', body: JSON.stringify({ userIds: [...picked] }) });
      onSaved();
    } catch (e) {
      setError(e.message || 'Could not assign');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Assign to ${shift?.name || ''}`}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy || picked.size === 0}>
            {busy && <Spinner className="h-4 w-4 text-white" />}
            Move {picked.size || ''} to this shift
          </Button>
        </>
      )}
    >
      <div className="space-y-3">
        <ErrorNote>{error}</ErrorNote>
        <div className="relative">
          <IconSearch className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search employees" className="pl-9" />
        </div>
        {candidates.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">
            {q ? 'No matching employees.' : 'Everyone is already on this shift.'}
          </p>
        ) : (
          <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
            {candidates.map((u) => (
              <li key={u.id}>
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={picked.has(u.id)}
                    onChange={() => toggle(u.id)}
                    className="h-4 w-4 rounded border-slate-300 text-brand-700"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-700">{nameOf(u)}</span>
                    <span className="block text-xs text-slate-400">@{u.username}{u.employeeId ? ` · ${u.employeeId}` : ''}</span>
                  </span>
                  <Badge tone="gray">{u.shiftName}</Badge>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
