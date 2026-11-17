// Assets — company asset register: issue to an employee, take back (with
// condition), repair / retire, full history per asset.
import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost, api } from '../lib/api';
import { Card, CardBody, Button, Input, Field, Select, Badge, Loading, EmptyState, ErrorNote, PageHeader, Modal, Spinner, cx } from '../components/ui';
import { IconPlus, IconEdit, IconTrash } from '../components/icons';

const STATUS = { available: ['green', 'Available'], assigned: ['blue', 'Assigned'], repair: ['amber', 'In repair'], retired: ['gray', 'Retired'] };
const nameOf = (u) => u?.fullName || u?.username || '—';
const when = (iso) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

export default function Assets() {
  const [filter, setFilter] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null); // 'new' | asset
  const [assigning, setAssigning] = useState(null);
  const [history, setHistory] = useState(null);
  const [cats, setCats] = useState([]);
  const [users, setUsers] = useState([]);

  const load = useCallback(() => {
    apiGet(`/assets${filter ? `?status=${filter}` : ''}`).then(setData).catch((e) => setError(e.message));
  }, [filter]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    apiGet('/assets/categories').then(setCats).catch(() => {});
    apiGet('/users').then((u) => setUsers(u.filter((x) => x.isActive))).catch(() => {});
  }, []);

  const doReturn = async (a) => {
    const condition = window.prompt(`Return ${a.tag} from ${nameOf(a.holder)}.\n\nCondition — type Good, Damaged or Lost:`, 'Good');
    if (!condition) return;
    try { await apiPost(`/assets/${a.id}/return`, { condition: condition.trim().charAt(0).toUpperCase() + condition.trim().slice(1).toLowerCase() }); load(); }
    catch (e) { window.alert(e.message); }
  };
  const setStatus = async (a, status) => {
    try { await api(`/assets/${a.id}`, { method: 'PATCH', body: JSON.stringify({ status }) }); load(); } catch (e) { window.alert(e.message); }
  };
  const remove = async (a) => {
    if (!window.confirm(`Delete ${a.tag} and its history?`)) return;
    try { await api(`/assets/${a.id}`, { method: 'DELETE' }); load(); } catch (e) { window.alert(e.message); }
  };

  const rows = (data?.assets || []).filter((a) => !q || `${a.tag} ${a.name} ${a.serialNo || ''} ${nameOf(a.holder)}`.toLowerCase().includes(q.toLowerCase()));
  const counts = data?.counts || {};

  return (
    <div>
      <PageHeader title="Assets" subtitle="Laptops, phones, SIMs and tools — who holds what. Exits are blocked until assets come back."
        actions={<Button onClick={() => setEditing('new')}><IconPlus className="h-4 w-4" /> Add asset</Button>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {[['', 'All'], ...Object.entries(STATUS).map(([k, [, l]]) => [k, l])].map(([k, label]) => (
          <button key={k || 'all'} type="button" onClick={() => setFilter(k)}
            className={cx('rounded-full border px-3 py-1 text-sm font-semibold', filter === k ? 'border-brand-800 bg-brand-800 text-white' : 'border-slate-300 bg-white text-slate-600')}>
            {label}{k && counts[k] ? ` · ${counts[k]}` : ''}
          </button>
        ))}
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tag, name, serial, holder" className="ml-auto w-64" />
      </div>
      <ErrorNote>{error}</ErrorNote>
      <Card>
        <CardBody>
          {!data ? <Loading /> : rows.length === 0 ? <EmptyState title="No assets" /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-3 py-2 font-semibold">Asset</th><th className="px-3 py-2 font-semibold">Category</th>
                    <th className="px-3 py-2 font-semibold">Status</th><th className="px-3 py-2 font-semibold">Holder</th><th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((a) => (
                    <tr key={a.id} className="border-b border-slate-100">
                      <td className="px-3 py-2.5">
                        <button type="button" onClick={() => setHistory(a)} className="text-left">
                          <p className="font-semibold text-slate-800 hover:underline">{a.tag} · {a.name}</p>
                          <p className="text-xs text-slate-400">{a.serialNo ? `S/N ${a.serialNo}` : 'No serial'}{a.notes ? ` · ${a.notes}` : ''}</p>
                        </button>
                      </td>
                      <td className="px-3 py-2.5 text-slate-600">{a.category}</td>
                      <td className="px-3 py-2.5"><Badge tone={STATUS[a.status][0]}>{STATUS[a.status][1]}</Badge></td>
                      <td className="px-3 py-2.5 text-slate-700">{a.holder ? <>{nameOf(a.holder)}<span className="block text-xs text-slate-400">since {when(a.assignedAt)}</span></> : '—'}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right">
                        {a.status === 'available' && <Button size="sm" onClick={() => setAssigning(a)}>Assign</Button>}
                        {a.status === 'assigned' && <Button size="sm" variant="secondary" onClick={() => doReturn(a)}>Take back</Button>}
                        {a.status === 'repair' && <Button size="sm" variant="secondary" onClick={() => setStatus(a, 'available')}>Repaired</Button>}
                        {a.status === 'available' && <Button size="sm" variant="ghost" onClick={() => setStatus(a, 'repair')}>Repair</Button>}
                        <Button size="sm" variant="ghost" onClick={() => setEditing(a)} title="Edit"><IconEdit className="h-4 w-4" /></Button>
                        {a.status !== 'assigned' && <Button size="sm" variant="ghost" onClick={() => remove(a)} title="Delete"><IconTrash className="h-4 w-4 text-red-600" /></Button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
      <AssetEditor item={editing} cats={cats} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      <AssignDialog asset={assigning} users={users} onClose={() => setAssigning(null)} onSaved={() => { setAssigning(null); load(); }} />
      <History asset={history} onClose={() => setHistory(null)} />
    </div>
  );
}

function AssetEditor({ item, cats, onClose, onSaved }) {
  const isNew = item === 'new';
  const [f, setF] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!item) return;
    setF(isNew ? { tag: '', name: '', category: 'Laptop', serialNo: '', notes: '' }
      : { tag: item.tag, name: item.name, category: item.category, serialNo: item.serialNo || '', notes: item.notes || '' });
    setError('');
  }, [item, isNew]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    setBusy(true);
    try {
      if (isNew) await apiPost('/assets', f); else await api(`/assets/${item.id}`, { method: 'PATCH', body: JSON.stringify(f) });
      onSaved();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal open={!!item} onClose={onClose} title={isNew ? 'Add asset' : `Edit ${item?.tag}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={busy}>{busy && <Spinner className="h-4 w-4 text-white" />}Save</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><ErrorNote>{error}</ErrorNote></div>
        <Field label="Asset tag / code"><Input value={f.tag || ''} onChange={set('tag')} placeholder="e.g. SESS-LT-004" /></Field>
        <Field label="Category"><Select value={f.category || ''} onChange={set('category')}>{cats.map((c) => <option key={c}>{c}</option>)}</Select></Field>
        <Field label="Name / model"><Input value={f.name || ''} onChange={set('name')} placeholder="e.g. Dell Latitude 5440" /></Field>
        <Field label="Serial number"><Input value={f.serialNo || ''} onChange={set('serialNo')} /></Field>
        <div className="sm:col-span-2"><Field label="Notes"><Input value={f.notes || ''} onChange={set('notes')} /></Field></div>
      </div>
    </Modal>
  );
}

function AssignDialog({ asset, users, onClose, onSaved }) {
  const [userId, setUserId] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { setUserId(''); setNote(''); setError(''); }, [asset]);
  const save = async () => {
    try { await apiPost(`/assets/${asset.id}/assign`, { userId: Number(userId), note }); onSaved(); } catch (e) { setError(e.message); }
  };
  return (
    <Modal open={!!asset} onClose={onClose} title={`Assign ${asset?.tag || ''}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={!userId}>Assign</Button></>}>
      <div className="space-y-3">
        <ErrorNote>{error}</ErrorNote>
        <Field label="Employee">
          <Select value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">Select…</option>
            {users.map((u) => <option key={u.id} value={u.id}>{nameOf(u)}{u.employeeId ? ` (${u.employeeId})` : ''}</option>)}
          </Select>
        </Field>
        <Field label="Note (optional)"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. with charger and bag" /></Field>
      </div>
    </Modal>
  );
}

function History({ asset, onClose }) {
  const [events, setEvents] = useState(null);
  useEffect(() => {
    if (!asset) return;
    setEvents(null);
    apiGet(`/assets/${asset.id}/events`).then((r) => setEvents(r.events)).catch(() => setEvents([]));
  }, [asset]);
  return (
    <Modal open={!!asset} onClose={onClose} title={`History — ${asset?.tag || ''}`}>
      {!events ? <Loading /> : (
        <ul className="space-y-2 text-sm">
          {events.map((e) => (
            <li key={e.id} className="rounded-lg bg-slate-50 px-3 py-2">
              <span className="font-semibold capitalize text-slate-800">{e.action}</span>
              {e.userName && <> · {e.userName}</>}{e.condition && <> · condition: {e.condition}</>}
              <span className="block text-xs text-slate-400">{when(e.createdAt)}{e.byName ? ` by ${e.byName}` : ''}{e.note ? ` · ${e.note}` : ''}</span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
