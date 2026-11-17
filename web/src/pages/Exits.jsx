// Exits — resignations and other separations: accept with a last working day,
// work the clearance checklist (assets are checked live), record the full &
// final settlement, then complete (sets the exit date and deactivates).
import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost, api, fileUrl } from '../lib/api';
import { Card, CardBody, Button, Input, Field, Select, Badge, Loading, EmptyState, ErrorNote, PageHeader, Modal, cx } from '../components/ui';
import { IconPlus } from '../components/icons';

const STATUS = {
  requested: ['amber', 'Resignation received'], accepted: ['blue', 'Serving notice'], completed: ['gray', 'Exited'],
  withdrawn: ['gray', 'Withdrawn'], rejected: ['red', 'Not accepted'],
};
const nameOf = (u) => u?.fullName || u?.username || '—';
const fmt = (ymd) => (ymd ? new Date(`${ymd}T00:00:00Z`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—');

export default function Exits() {
  const [filter, setFilter] = useState('');
  const [cases, setCases] = useState(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(null);
  const [starting, setStarting] = useState(false);

  const load = useCallback(() => {
    apiGet(`/exits${filter ? `?status=${filter}` : ''}`).then((r) => {
      setCases(r.cases);
      setOpen((cur) => (cur ? r.cases.find((c) => c.id === cur.id) || null : null));
    }).catch((e) => setError(e.message));
  }, [filter]);
  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <PageHeader title="Exits" subtitle="Resignations, notice period, clearance and full & final settlement."
        actions={<Button variant="secondary" onClick={() => setStarting(true)}><IconPlus className="h-4 w-4" /> Start an exit</Button>} />
      <div className="mb-4 flex flex-wrap gap-2">
        {[['', 'All'], ['requested', 'New'], ['accepted', 'Serving notice'], ['completed', 'Exited']].map(([k, label]) => (
          <button key={k || 'all'} type="button" onClick={() => setFilter(k)}
            className={cx('rounded-full border px-3 py-1 text-sm font-semibold', filter === k ? 'border-brand-800 bg-brand-800 text-white' : 'border-slate-300 bg-white text-slate-600')}>
            {label}
          </button>
        ))}
      </div>
      <ErrorNote>{error}</ErrorNote>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Card>
          <CardBody className="p-0">
            {!cases ? <Loading /> : cases.length === 0 ? <EmptyState title="No exits" /> : (
              <ul className="divide-y divide-slate-100">
                {cases.map((c) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => setOpen(c)} className={cx('w-full px-4 py-3 text-left hover:bg-slate-50', open?.id === c.id && 'bg-brand-50/60')}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-800">{nameOf(c.user)}</span>
                        <Badge tone={STATUS[c.status][0]}>{STATUS[c.status][1]}</Badge>
                      </div>
                      <p className="text-xs text-slate-500">{c.exitType} · last day {fmt(c.lastWorkingDay || c.requestedLastDay)}{c.assetsHeld ? ` · ${c.assetsHeld} asset(s) out` : ''}</p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
        {open ? <CaseDetail c={open} onChanged={load} /> : <Card><CardBody><EmptyState title="Pick an exit" /></CardBody></Card>}
      </div>
      <StartExit open={starting} onClose={() => setStarting(false)} onSaved={() => { setStarting(false); load(); }} />
    </div>
  );
}

function CaseDetail({ c, onChanged }) {
  const [lwd, setLwd] = useState(c.lastWorkingDay || c.requestedLastDay);
  const [amount, setAmount] = useState(c.settlementAmount ?? '');
  const [sNote, setSNote] = useState(c.settlementNote || '');
  const [note, setNote] = useState(c.adminNote || '');
  const [error, setError] = useState('');
  useEffect(() => {
    setLwd(c.lastWorkingDay || c.requestedLastDay); setAmount(c.settlementAmount ?? '');
    setSNote(c.settlementNote || ''); setNote(c.adminNote || ''); setError('');
  }, [c]);

  const act = async (body, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setError('');
    try { await api(`/exits/${c.id}`, { method: 'PATCH', body: JSON.stringify(body) }); onChanged(); }
    catch (e) {
      if (/Checklist not finished/.test(e.message) && window.confirm(`${e.message}\n\nComplete the exit anyway?`)) return act({ ...body, force: true });
      setError(e.message);
    }
  };
  const toggle = (key, done) => act({ action: 'update', checklist: [{ key, done }] });
  const open = ['requested', 'accepted'].includes(c.status);

  return (
    <Card>
      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-lg font-bold text-slate-800">{nameOf(c.user)}</h3>
            <p className="text-xs text-slate-500">{c.user?.designation || ''}{c.user?.employeeId ? ` · ${c.user.employeeId}` : ''} · joined {c.user?.dateOfJoining ? new Date(c.user.dateOfJoining).toLocaleDateString('en-IN') : '—'}</p>
          </div>
          <Badge tone={STATUS[c.status][0]}>{STATUS[c.status][1]}</Badge>
        </div>
        <ErrorNote>{error}</ErrorNote>
        <div className="rounded-lg bg-slate-50 p-3 text-sm">
          <p><span className="text-slate-500">Type:</span> {c.exitType} · <span className="text-slate-500">Requested last day:</span> {fmt(c.requestedLastDay)}</p>
          <p className="mt-1 whitespace-pre-wrap text-slate-700">“{c.reason}”</p>
        </div>

        {c.status === 'requested' && (
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Last working day (after notice)"><Input type="date" value={lwd} onChange={(e) => setLwd(e.target.value)} /></Field>
            <Field label="Note to employee"><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
            <Button variant="success" onClick={() => act({ action: 'accept', lastWorkingDay: lwd, adminNote: note })}>Accept</Button>
            <Button variant="secondary" onClick={() => act({ action: 'reject', adminNote: note }, 'Do not accept this resignation?')}>Not accepted</Button>
          </div>
        )}

        {c.status === 'accepted' && (
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Last working day"><Input type="date" value={lwd} onChange={(e) => setLwd(e.target.value)} /></Field>
            {lwd !== c.lastWorkingDay && <Button variant="secondary" onClick={() => act({ action: 'update', lastWorkingDay: lwd })}>Change date</Button>}
          </div>
        )}

        {(c.status === 'accepted' || c.status === 'completed') && (
          <div>
            <p className="mb-2 text-sm font-semibold text-slate-700">Clearance checklist</p>
            <ul className="space-y-1.5">
              {(c.checklist || []).map((i) => (
                <li key={i.key} className="flex items-center gap-2 text-sm">
                  {i.key === 'assets' ? (
                    <span className={cx('flex h-4 w-4 items-center justify-center rounded text-[10px] font-bold text-white', c.assetsHeld ? 'bg-red-500' : 'bg-emerald-500')}>
                      {c.assetsHeld ? '!' : '✓'}
                    </span>
                  ) : (
                    <input type="checkbox" checked={!!i.done} disabled={!open} onChange={(e) => toggle(i.key, e.target.checked)} className="h-4 w-4" />
                  )}
                  <span className={cx(i.done || (i.key === 'assets' && !c.assetsHeld) ? 'text-slate-500' : 'text-slate-800')}>
                    {i.label}{i.key === 'assets' && c.assetsHeld ? ` — ${c.assetsHeld} still out (take back in Assets)` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {(c.status === 'accepted' || c.status === 'completed') && (
          <div className="grid gap-2 sm:grid-cols-[10rem_1fr_auto] sm:items-end">
            <Field label="F&F amount (₹)"><Input type="number" value={amount} disabled={!open} onChange={(e) => setAmount(e.target.value)} /></Field>
            <Field label="Settlement details"><Input value={sNote} disabled={!open} onChange={(e) => setSNote(e.target.value)} placeholder="e.g. last month salary + 6 days leave encashment − advance" /></Field>
            {open && <Button variant="secondary" onClick={() => act({ action: 'update', settlementAmount: amount, settlementNote: sNote })}>Save</Button>}
          </div>
        )}

        {c.status === 'accepted' && (
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
            <Button onClick={() => act({ action: 'complete', noticeServed: true },
              `Complete ${nameOf(c.user)}'s exit?\n\nTheir exit date becomes ${fmt(c.lastWorkingDay)} and their account is deactivated.`)}>
              Complete exit
            </Button>
            <span className="text-xs text-slate-400">Allowed on/after the last working day, once all assets are back.</span>
          </div>
        )}

        {c.status === 'completed' && (
          <div className="flex flex-wrap gap-3 border-t border-slate-100 pt-3 text-sm">
            <a className="font-semibold text-brand-700 hover:underline" target="_blank" rel="noreferrer" href={fileUrl(`api/documents/letters/relieving/${c.userId}/html`)}>Relieving letter</a>
            <a className="font-semibold text-brand-700 hover:underline" target="_blank" rel="noreferrer" href={fileUrl(`api/documents/letters/experience/${c.userId}/html`)}>Experience letter</a>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function StartExit({ open, onClose, onSaved }) {
  const [users, setUsers] = useState([]);
  const [f, setF] = useState({ userId: '', exitType: 'Termination', lastWorkingDay: '', reason: '' });
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    setF({ userId: '', exitType: 'Termination', lastWorkingDay: '', reason: '' }); setError('');
    apiGet('/users').then((u) => setUsers(u.filter((x) => x.isActive))).catch(() => {});
  }, [open]);
  const save = async () => {
    try { await apiPost('/exits', { ...f, userId: Number(f.userId) }); onSaved(); } catch (e) { setError(e.message); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Start an exit"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={!f.userId || !f.lastWorkingDay}>Start</Button></>}>
      <div className="space-y-3">
        <ErrorNote>{error}</ErrorNote>
        <p className="text-xs text-slate-500">For terminations or absconding. Resignations come in from the employee's app.</p>
        <Field label="Employee">
          <Select value={f.userId} onChange={(e) => setF({ ...f, userId: e.target.value })}>
            <option value="">Select…</option>
            {users.map((u) => <option key={u.id} value={u.id}>{nameOf(u)}</option>)}
          </Select>
        </Field>
        <Field label="Type">
          <Select value={f.exitType} onChange={(e) => setF({ ...f, exitType: e.target.value })}>
            {['Termination', 'Abscond', 'Resigned'].map((t) => <option key={t}>{t}</option>)}
          </Select>
        </Field>
        <Field label="Last working day"><Input type="date" value={f.lastWorkingDay} onChange={(e) => setF({ ...f, lastWorkingDay: e.target.value })} /></Field>
        <Field label="Reason"><Input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}
