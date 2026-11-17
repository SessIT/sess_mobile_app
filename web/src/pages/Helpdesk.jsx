// HR Helpdesk — employees' questions and requests (raised from the app),
// with a reply thread and a status per ticket.
import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost, api } from '../lib/api';
import { Card, CardBody, Button, Badge, Loading, EmptyState, ErrorNote, PageHeader, Select, cx } from '../components/ui';

const STATUS = {
  open: ['amber', 'Open'], in_progress: ['blue', 'In progress'], resolved: ['green', 'Resolved'], closed: ['gray', 'Closed'],
};
const when = (iso) => new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function Helpdesk() {
  const [filter, setFilter] = useState('open');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState(null);

  const load = useCallback(() => {
    apiGet(`/helpdesk/all${filter ? `?status=${filter}` : ''}`).then(setData).catch((e) => setError(e.message));
  }, [filter]);
  useEffect(() => { load(); }, [load]);

  const counts = data?.counts || {};
  return (
    <div>
      <PageHeader title="HR Helpdesk" subtitle="Questions and requests from employees — reply, then resolve." />
      <div className="mb-4 flex flex-wrap gap-2">
        {[['open', 'Open'], ['in_progress', 'In progress'], ['resolved', 'Resolved'], ['closed', 'Closed'], ['', 'All']].map(([k, label]) => (
          <button key={k || 'all'} type="button" onClick={() => setFilter(k)}
            className={cx('rounded-full border px-3 py-1 text-sm font-semibold',
              filter === k ? 'border-brand-800 bg-brand-800 text-white' : 'border-slate-300 bg-white text-slate-600')}>
            {label}{k && counts[k] ? ` · ${counts[k]}` : ''}
          </button>
        ))}
      </div>
      <ErrorNote>{error}</ErrorNote>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Card>
          <CardBody className="p-0">
            {!data ? <Loading /> : data.tickets.length === 0 ? <EmptyState title="No tickets here" /> : (
              <ul className="divide-y divide-slate-100">
                {data.tickets.map((t) => (
                  <li key={t.id}>
                    <button type="button" onClick={() => setOpenId(t.id)}
                      className={cx('w-full px-4 py-3 text-left hover:bg-slate-50', openId === t.id && 'bg-brand-50/60')}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-semibold text-slate-800">{t.subject}</span>
                        <Badge tone={STATUS[t.status][0]}>{STATUS[t.status][1]}</Badge>
                      </div>
                      <p className="text-xs text-slate-500">{t.user?.fullName || t.user?.username} · {t.category} · {t.messageCount} msg</p>
                      {t.lastMessage && <p className="mt-0.5 truncate text-xs text-slate-400">{t.lastMessage.fromHR ? 'You: ' : ''}{t.lastMessage.body}</p>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
        {openId ? <Thread id={openId} onChanged={load} /> : (
          <Card><CardBody><EmptyState title="Pick a ticket" hint="Select a ticket to read and reply." /></CardBody></Card>
        )}
      </div>
    </div>
  );
}

function Thread({ id, onChanged }) {
  const [data, setData] = useState(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(() => { apiGet(`/helpdesk/${id}`).then(setData).catch((e) => setError(e.message)); }, [id]);
  useEffect(() => { setData(null); setReply(''); load(); }, [load]);

  const send = async () => {
    if (!reply.trim()) return;
    setBusy(true);
    try { await apiPost(`/helpdesk/${id}/messages`, { body: reply }); setReply(''); load(); onChanged(); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const setStatus = async (status) => {
    try { await api(`/helpdesk/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }); load(); onChanged(); }
    catch (e) { setError(e.message); }
  };

  if (!data) return <Card><CardBody>{error ? <ErrorNote>{error}</ErrorNote> : <Loading />}</CardBody></Card>;
  const t = data.ticket;
  return (
    <Card>
      <CardBody>
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h3 className="font-bold text-slate-800">{t.subject}</h3>
            <p className="text-xs text-slate-500">{t.user?.fullName || t.user?.username} ({t.user?.employeeId || `@${t.user?.username}`}) · {t.category}</p>
          </div>
          <Select value={t.status} onChange={(e) => setStatus(e.target.value)} className="w-40">
            {Object.entries(STATUS).map(([k, [, label]]) => <option key={k} value={k}>{label}</option>)}
          </Select>
        </div>
        <div className="max-h-[50vh] space-y-3 overflow-y-auto py-4">
          {data.messages.map((m) => (
            <div key={m.id} className={cx('max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm', m.fromHR ? 'ml-auto bg-brand-50 text-slate-800' : 'bg-slate-100 text-slate-800')}>
              <p className="whitespace-pre-wrap">{m.body}</p>
              <p className="mt-1 text-[11px] text-slate-400">{m.author?.fullName || m.author?.username} · {when(m.createdAt)}</p>
            </div>
          ))}
        </div>
        <ErrorNote>{error}</ErrorNote>
        <div className="flex gap-2 border-t border-slate-100 pt-3">
          <textarea rows={2} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write a reply…" maxLength={3000}
            className="flex-1 rounded-lg border border-slate-300/90 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none" />
          <div className="flex flex-col gap-1.5">
            <Button onClick={send} disabled={busy || !reply.trim()}>Send</Button>
            {t.status !== 'resolved' && <Button variant="success" size="sm" onClick={() => setStatus('resolved')}>Resolve</Button>}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
