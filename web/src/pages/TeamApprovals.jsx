// Team Approvals — a reporting manager's inbox. The FIRST approval for every
// request type (leave, OT, comp-off, expenses, attendance corrections) raised by
// the manager's direct reports. Approving passes the request to the admin for
// the final decision; rejecting closes it.

import { useCallback, useEffect, useState } from 'react';
import { apiGet, api, fileUrl } from '../lib/api';
import { fmtDate } from '../lib/format';
import {
  Card, CardBody, Button, Badge, Loading, EmptyState, ErrorNote, PageHeader, Modal, Spinner, ManagerStage, cx,
} from '../components/ui';
import { IconCheckCircle, IconInbox, IconImage } from '../components/icons';

const KINDS = [
  ['all', 'All'], ['leave', 'Leave'], ['ot', 'Overtime'], ['compoff', 'Comp-off'],
  ['expense', 'Expense'], ['correction', 'Correction'],
];
const KIND_TONE = { leave: 'blue', ot: 'slate', compoff: 'green', expense: 'amber', correction: 'red' };
const STATUS_TONE = { pending: 'amber', approved: 'green', rejected: 'red', cancelled: 'gray', revoked: 'gray' };
const isImage = (p) => /\.(jpe?g|png|webp|heic|gif)$/i.test(p || '');
const istDay = (iso) => new Date(new Date(iso).getTime() + 5.5 * 3600000).toISOString().slice(0, 10);

export default function TeamApprovals() {
  const [view, setView] = useState('pending'); // 'pending' | 'done'
  const [kind, setKind] = useState('all');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deciding, setDeciding] = useState(null); // { item, decision }
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    apiGet(`/team/approvals?view=${view}`)
      .then((r) => setItems(r.items || []))
      .catch((e) => { setItems([]); setError(e.message || 'Failed to load approvals'); })
      .finally(() => setLoading(false));
  }, [view]);
  useEffect(() => { load(); }, [load]);

  const shown = kind === 'all' ? items : items.filter((i) => i.kind === kind);
  const count = (k) => (k === 'all' ? items.length : items.filter((i) => i.kind === k).length);

  const open = (item, decision) => { setNote(''); setSaveError(''); setDeciding({ item, decision }); };

  const submit = async () => {
    const { item, decision } = deciding;
    setBusy(true);
    setSaveError('');
    try {
      await api(`/team/approvals/${item.kind}/${item.id}`, {
        method: 'POST',
        body: JSON.stringify({ decision, note: note.trim() }),
      });
      setDeciding(null);
      setItems((prev) => prev.filter((i) => !(i.kind === item.kind && i.id === item.id)));
    } catch (e) {
      setSaveError(e.message || 'Could not save');
    } finally {
      setBusy(false);
    }
  };

  const seg = (key) => cx(
    'rounded-lg px-4 py-1.5 text-sm font-semibold transition focus:outline-none',
    view === key ? 'bg-white text-brand-800 shadow-sm ring-1 ring-slate-200/80' : 'text-slate-500 hover:text-slate-700',
  );

  return (
    <div>
      <PageHeader
        title="Team Approvals"
        subtitle="First approval for requests from your direct reports — approved items go to the admin for the final decision."
        actions={(
          <div className="inline-flex items-center gap-1 rounded-xl bg-slate-100 p-1">
            <button type="button" className={seg('pending')} onClick={() => setView('pending')}>Waiting for me</button>
            <button type="button" className={seg('done')} onClick={() => setView('done')}>My decisions</button>
          </div>
        )}
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {KINDS.map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={cx(
              'rounded-full border px-3 py-1 text-sm font-semibold transition',
              kind === k ? 'border-brand-800 bg-brand-800 text-white' : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400',
            )}
          >
            {label}{count(k) ? ` · ${count(k)}` : ''}
          </button>
        ))}
      </div>

      {loading && <Loading label="Loading approvals…" />}
      {!loading && error && <ErrorNote>{error}</ErrorNote>}
      {!loading && !error && shown.length === 0 && (
        <Card>
          <CardBody>
            <EmptyState
              title={view === 'pending' ? 'Nothing waiting for your approval' : 'No decisions yet'}
              icon={view === 'pending' ? <IconCheckCircle /> : <IconInbox />}
            />
          </CardBody>
        </Card>
      )}

      {!loading && !error && shown.length > 0 && (
        <div className="grid gap-3 lg:grid-cols-2">
          {shown.map((it) => (
            <Card key={`${it.kind}-${it.id}`}>
              <CardBody>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-800">{it.user?.fullName || it.user?.username}</p>
                    <p className="text-xs text-slate-400">
                      @{it.user?.username}{it.user?.designation ? ` · ${it.user.designation}` : ''} · raised {fmtDate(istDay(it.createdAt))}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap justify-end gap-1">
                    <Badge tone={KIND_TONE[it.kind]}>{it.kindLabel}</Badge>
                    {view === 'done' && <Badge tone={STATUS_TONE[it.status] || 'slate'}>{it.status}</Badge>}
                  </div>
                </div>

                <p className="mt-3 font-semibold text-slate-800">{it.title}</p>
                {it.subtitle && <p className="text-sm text-slate-600">{it.subtitle}</p>}
                {it.reason && <p className="mt-2 text-sm italic text-slate-500">“{it.reason}”</p>}

                {it.attachments?.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {it.attachments.map((p) => (
                      <a key={p} href={fileUrl(p)} target="_blank" rel="noreferrer"
                        className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                        {isImage(p)
                          ? <img src={fileUrl(p)} alt="Bill" className="h-full w-full object-cover" />
                          : <span className="flex flex-col items-center text-[10px] font-semibold text-red-600"><IconImage className="h-5 w-5" />PDF</span>}
                      </a>
                    ))}
                  </div>
                )}

                {view === 'done' && (
                  <div className="mt-3 space-y-1">
                    <ManagerStage stage={it.managerStage} />
                    {it.managerStage?.note && <p className="text-xs text-slate-500">Your note: {it.managerStage.note}</p>}
                  </div>
                )}

                {view === 'pending' && (
                  <div className="mt-4 flex justify-end gap-2">
                    <Button variant="secondary" size="sm" onClick={() => open(it, 'rejected')}>Reject</Button>
                    <Button variant="success" size="sm" onClick={() => open(it, 'approved')}>Approve</Button>
                  </div>
                )}
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={!!deciding}
        onClose={() => !busy && setDeciding(null)}
        title={deciding?.decision === 'approved' ? 'Approve request' : 'Reject request'}
        footer={(
          <>
            <Button variant="secondary" onClick={() => setDeciding(null)} disabled={busy}>Cancel</Button>
            <Button variant={deciding?.decision === 'approved' ? 'success' : 'danger'} onClick={submit} disabled={busy}>
              {busy && <Spinner className="h-4 w-4 text-white" />}
              {deciding?.decision === 'approved' ? 'Approve' : 'Reject'}
            </Button>
          </>
        )}
      >
        <div className="space-y-3">
          <ErrorNote>{saveError}</ErrorNote>
          <p className="text-sm text-slate-600">
            <span className="font-semibold">{deciding?.item?.user?.fullName || deciding?.item?.user?.username}</span>
            {' · '}{deciding?.item?.title}
          </p>
          <p className="text-xs text-slate-400">
            {deciding?.decision === 'approved'
              ? 'It goes to the admin for the final approval.'
              : 'This closes the request — the employee sees your note.'}
          </p>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder={deciding?.decision === 'approved' ? 'Note for the admin (optional)' : 'Reason (shown to the employee)'}
            className="w-full rounded-lg border border-slate-300/90 px-3.5 py-2.5 text-sm text-slate-800 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10"
          />
        </div>
      </Modal>
    </div>
  );
}
