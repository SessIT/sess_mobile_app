// Branches — offices / plants. Employees belong to one; holidays and
// biometric devices can be branch-specific; reports filter by branch.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiGet, apiPost, api } from '../lib/api';
import { Card, CardBody, Button, Input, Field, Badge, Loading, EmptyState, ErrorNote, PageHeader, Modal } from '../components/ui';
import { IconPlus, IconEdit, IconTrash, IconUsers } from '../components/icons';

const nameOf = (u) => u.fullName || u.username;

export default function Branches() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [assigning, setAssigning] = useState(null);

  const load = useCallback(() => { apiGet('/branches').then(setData).catch((e) => setError(e.message)); }, []);
  useEffect(() => { load(); }, [load]);

  const remove = async (b) => {
    if (!window.confirm(`Delete ${b.name}? Its employees become "no branch" and its branch-only holidays are removed.`)) return;
    try { await api(`/branches/${b.id}`, { method: 'DELETE' }); load(); } catch (e) { window.alert(e.message); }
  };
  const everyone = useMemo(() => data ? [...data.branches.flatMap((b) => b.users.map((u) => ({ ...u, branchName: b.name }))), ...data.unassigned.map((u) => ({ ...u, branchName: '—' }))] : [], [data]);

  return (
    <div>
      <PageHeader title="Branches" subtitle="Offices and plants. Holidays, biometric devices and reports can be branch-specific."
        actions={<Button onClick={() => setEditing('new')}><IconPlus className="h-4 w-4" /> Add branch</Button>} />
      <ErrorNote>{error}</ErrorNote>
      {!data ? <Loading /> : (
        <>
          {data.branches.length === 0 && <Card><CardBody><EmptyState title="No branches yet" hint="Single-location companies don't need any." /></CardBody></Card>}
          <div className="grid gap-4 lg:grid-cols-2">
            {data.branches.map((b) => (
              <Card key={b.id}>
                <CardBody>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-lg font-bold text-slate-800">{b.name} {b.code && <Badge tone="slate">{b.code}</Badge>} {!b.isActive && <Badge tone="gray">inactive</Badge>}</h3>
                      <p className="text-xs text-slate-500">{[b.address, b.state].filter(Boolean).join(' · ') || 'No address'}</p>
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(b)}><IconEdit className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => remove(b)}><IconTrash className="h-4 w-4 text-red-600" /></Button>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-700">{b.users.length} employee{b.users.length === 1 ? '' : 's'}</span>
                    <Button size="sm" variant="secondary" onClick={() => setAssigning(b)}><IconUsers className="h-4 w-4" /> Assign</Button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {b.users.slice(0, 15).map((u) => <span key={u.id} className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{nameOf(u)}</span>)}
                    {b.users.length > 15 && <span className="text-xs text-slate-400">+{b.users.length - 15} more</span>}
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
          {data.unassigned.length > 0 && data.branches.length > 0 && (
            <p className="mt-4 text-sm text-amber-700">{data.unassigned.length} employee(s) have no branch: {data.unassigned.slice(0, 10).map(nameOf).join(', ')}{data.unassigned.length > 10 ? '…' : ''}</p>
          )}
        </>
      )}
      <BranchEditor item={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      <AssignDialog branch={assigning} everyone={everyone} onClose={() => setAssigning(null)} onSaved={() => { setAssigning(null); load(); }} />
    </div>
  );
}

function BranchEditor({ item, onClose, onSaved }) {
  const isNew = item === 'new';
  const [f, setF] = useState({});
  const [error, setError] = useState('');
  useEffect(() => {
    if (!item) return;
    setF(isNew ? { name: '', code: '', address: '', state: '', isActive: true } : { name: item.name, code: item.code || '', address: item.address || '', state: item.state || '', isActive: item.isActive });
    setError('');
  }, [item, isNew]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const save = async () => {
    try {
      if (isNew) await apiPost('/branches', f); else await api(`/branches/${item.id}`, { method: 'PATCH', body: JSON.stringify(f) });
      onSaved();
    } catch (e) { setError(e.message); }
  };
  return (
    <Modal open={!!item} onClose={onClose} title={isNew ? 'Add branch' : `Edit ${item?.name}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save}>Save</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><ErrorNote>{error}</ErrorNote></div>
        <Field label="Name"><Input value={f.name || ''} onChange={set('name')} placeholder="e.g. Coimbatore HO" /></Field>
        <Field label="Code"><Input value={f.code || ''} onChange={set('code')} placeholder="e.g. CBE" /></Field>
        <Field label="State"><Input value={f.state || ''} onChange={set('state')} placeholder="e.g. Tamil Nadu" /></Field>
        <Field label="Address"><Input value={f.address || ''} onChange={set('address')} /></Field>
        {!isNew && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!f.isActive} onChange={set('isActive')} /> Active</label>}
      </div>
    </Modal>
  );
}

function AssignDialog({ branch, everyone, onClose, onSaved }) {
  const [picked, setPicked] = useState(new Set());
  const [q, setQ] = useState('');
  useEffect(() => { setPicked(new Set()); setQ(''); }, [branch]);
  const list = everyone.filter((u) => u.branchId !== branch?.id && (!q || nameOf(u).toLowerCase().includes(q.toLowerCase())));
  const save = async () => {
    try { await api(`/branches/${branch.id}/users`, { method: 'PUT', body: JSON.stringify({ userIds: [...picked] }) }); onSaved(); }
    catch (e) { window.alert(e.message); }
  };
  return (
    <Modal open={!!branch} onClose={onClose} title={`Move employees to ${branch?.name || ''}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={!picked.size}>Move {picked.size || ''}</Button></>}>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="mb-2" />
      <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
        {list.map((u) => (
          <li key={u.id}>
            <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-slate-50">
              <input type="checkbox" checked={picked.has(u.id)} onChange={() => setPicked((p) => { const n = new Set(p); if (n.has(u.id)) n.delete(u.id); else n.add(u.id); return n; })} />
              <span className="flex-1">{nameOf(u)}</span><Badge tone="gray">{u.branchName}</Badge>
            </label>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
