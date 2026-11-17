// Announcements — company notices & policies. "Requires acknowledgement"
// makes every employee confirm they've read it; track who hasn't.
import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost, api } from '../lib/api';
import { Card, CardBody, Button, Input, Field, Badge, Loading, EmptyState, ErrorNote, PageHeader, Modal, Spinner } from '../components/ui';
import { IconPlus, IconEdit, IconTrash, IconUsers } from '../components/icons';

const when = (iso) => new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

export default function Announcements() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null); // 'new' | item
  const [acks, setAcks] = useState(null); // item whose ack list is open

  const load = useCallback(() => {
    apiGet('/announcements').then((r) => setItems(r.items)).catch((e) => setError(e.message));
  }, []);
  useEffect(() => { load(); }, [load]);

  const remove = async (a) => {
    if (!window.confirm(`Delete "${a.title}"?`)) return;
    try { await api(`/announcements/${a.id}`, { method: 'DELETE' }); load(); } catch (e) { window.alert(e.message); }
  };

  return (
    <div>
      <PageHeader
        title="Announcements"
        subtitle="Notices and policies for everyone. Employees see them in the app and are notified."
        actions={<Button onClick={() => setEditing('new')}><IconPlus className="h-4 w-4" /> New announcement</Button>}
      />
      <ErrorNote>{error}</ErrorNote>
      {!items && !error && <Loading />}
      {items && items.length === 0 && <Card><CardBody><EmptyState title="No announcements yet" /></CardBody></Card>}
      <div className="space-y-3">
        {(items || []).map((a) => (
          <Card key={a.id}>
            <CardBody>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-bold text-slate-800">{a.title}</h3>
                    {a.pinned && <Badge tone="blue">Pinned</Badge>}
                    {a.requiresAck && <Badge tone="amber">Acknowledgement required</Badge>}
                  </div>
                  <p className="text-xs text-slate-400">{when(a.createdAt)}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setEditing(a)} title="Edit"><IconEdit className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="sm" onClick={() => remove(a)} title="Delete"><IconTrash className="h-4 w-4 text-red-600" /></Button>
                </div>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{a.body}</p>
              {a.requiresAck && (
                <div className="mt-4 flex items-center gap-3">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.round((a.ackCount / (a.staff || 1)) * 100)}%` }} />
                  </div>
                  <span className="text-sm font-semibold text-slate-600">{a.ackCount}/{a.staff} read</span>
                  <Button variant="secondary" size="sm" onClick={() => setAcks(a)}><IconUsers className="h-4 w-4" /> Who</Button>
                </div>
              )}
            </CardBody>
          </Card>
        ))}
      </div>
      <Editor item={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      <AckList item={acks} onClose={() => setAcks(null)} />
    </div>
  );
}

function Editor({ item, onClose, onSaved }) {
  const isNew = item === 'new';
  const [form, setForm] = useState({ title: '', body: '', requiresAck: false, pinned: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!item) return;
    setForm(isNew ? { title: '', body: '', requiresAck: false, pinned: false }
      : { title: item.title, body: item.body, requiresAck: item.requiresAck, pinned: item.pinned });
    setError('');
  }, [item, isNew]);
  const save = async () => {
    setBusy(true);
    setError('');
    try {
      if (isNew) await apiPost('/announcements', form);
      else await api(`/announcements/${item.id}`, { method: 'PATCH', body: JSON.stringify(form) });
      onSaved();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal open={!!item} onClose={onClose} title={isNew ? 'New announcement' : 'Edit announcement'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={save} disabled={busy}>{busy && <Spinner className="h-4 w-4 text-white" />}{isNew ? 'Publish & notify' : 'Save'}</Button></>}>
      <div className="space-y-3">
        <ErrorNote>{error}</ErrorNote>
        <Field label="Title"><Input value={form.title} maxLength={120} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
        <Field label="Message">
          <textarea rows={8} maxLength={5000} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })}
            className="w-full rounded-lg border border-slate-300/90 px-3.5 py-2.5 text-sm text-slate-800 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10" />
        </Field>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={form.requiresAck} onChange={(e) => setForm({ ...form, requiresAck: e.target.checked })} className="h-4 w-4" />
          Every employee must acknowledge (“I have read this”) — use for policies
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={form.pinned} onChange={(e) => setForm({ ...form, pinned: e.target.checked })} className="h-4 w-4" />
          Pin to the top
        </label>
      </div>
    </Modal>
  );
}

function AckList({ item, onClose }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!item) return;
    setData(null);
    apiGet(`/announcements/${item.id}/acks`).then(setData).catch(() => setData({ acked: [], pending: [] }));
  }, [item]);
  const name = (u) => u.fullName || u.username;
  return (
    <Modal open={!!item} onClose={onClose} title={`Read receipts — ${item?.title || ''}`}>
      {!data ? <Loading /> : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-sm font-semibold text-amber-700">Not yet ({data.pending.length})</p>
            <ul className="space-y-1 text-sm text-slate-700">{data.pending.map((u) => <li key={u.id}>{name(u)}</li>)}</ul>
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold text-emerald-700">Acknowledged ({data.acked.length})</p>
            <ul className="space-y-1 text-sm text-slate-700">
              {data.acked.map((u) => <li key={u.id}>{name(u)} <span className="text-xs text-slate-400">· {when(u.ackedAt)}</span></li>)}
            </ul>
          </div>
        </div>
      )}
    </Modal>
  );
}
