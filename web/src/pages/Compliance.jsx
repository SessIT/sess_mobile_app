// Compliance calendar — statutory filings by due date (PF, ESI, TDS, PT…),
// mark them filed with the challan / acknowledgement number.
import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost, api } from '../lib/api';
import { Card, CardBody, Button, Input, Field, Select, Badge, Loading, EmptyState, ErrorNote, PageHeader, Modal, cx } from '../components/ui';
import { IconPlus, IconTrash } from '../components/icons';

const fmt = (ymd) => new Date(`${ymd}T00:00:00Z`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
const curFY = () => { const d = new Date(Date.now() + 5.5 * 3600000); return d.getUTCMonth() >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1; };

export default function Compliance() {
  const [fy, setFy] = useState(curFY());
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [show, setShow] = useState('open');
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => { apiGet(`/compliance?fy=${fy}`).then(setData).catch((e) => setError(e.message)); }, [fy]);
  useEffect(() => { setData(null); load(); }, [load]);

  const generate = async () => {
    try { const r = await apiPost('/compliance/generate', { fy }); window.alert(`Added ${r.added} standard due dates for FY ${fy}-${String(fy + 1).slice(2)}.`); load(); }
    catch (e) { window.alert(e.message); }
  };
  const markFiled = async (t) => {
    const reference = window.prompt(`Mark "${t.title}" as filed.\n\nChallan / acknowledgement number (optional):`, '');
    if (reference === null) return;
    try { await api(`/compliance/${t.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'filed', reference }) }); load(); } catch (e) { window.alert(e.message); }
  };
  const reopen = async (t) => { await api(`/compliance/${t.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'pending' }) }); load(); };
  const remove = async (t) => { if (window.confirm(`Delete "${t.title}"?`)) { await api(`/compliance/${t.id}`, { method: 'DELETE' }); load(); } };

  const tasks = (data?.tasks || []).filter((t) => show === 'all' || (show === 'open' ? t.status !== 'filed' : t.status === 'filed'));
  const overdue = (data?.tasks || []).filter((t) => t.overdue).length;
  const soon = (data?.tasks || []).filter((t) => t.dueSoon).length;

  return (
    <div>
      <PageHeader title="Compliance Calendar" subtitle="Statutory filing due dates — never miss PF, ESI or TDS."
        actions={<>
          <Select value={fy} onChange={(e) => setFy(Number(e.target.value))} className="w-36">
            {[curFY() - 1, curFY(), curFY() + 1].map((y) => <option key={y} value={y}>FY {y}-{String(y + 1).slice(2)}</option>)}
          </Select>
          <Button variant="secondary" onClick={generate}>Add standard dates</Button>
          <Button onClick={() => setAdding(true)}><IconPlus className="h-4 w-4" /> Custom</Button>
        </>} />
      <ErrorNote>{error}</ErrorNote>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {[['open', 'To do'], ['filed', 'Filed'], ['all', 'All']].map(([k, l]) => (
          <button key={k} type="button" onClick={() => setShow(k)} className={cx('rounded-full border px-3 py-1 text-sm font-semibold', show === k ? 'border-brand-800 bg-brand-800 text-white' : 'border-slate-300 bg-white text-slate-600')}>{l}</button>
        ))}
        {overdue > 0 && <Badge tone="red">{overdue} overdue</Badge>}
        {soon > 0 && <Badge tone="amber">{soon} due this week</Badge>}
      </div>
      <Card>
        <CardBody className="p-0">
          {!data ? <Loading /> : tasks.length === 0 ? (
            <EmptyState title={data.tasks.length ? 'Nothing here' : 'No due dates yet'} hint={data.tasks.length ? '' : 'Click "Add standard dates" to load the PF / ESI / TDS / PT calendar for this year.'} />
          ) : (
            <ul className="divide-y divide-slate-100">
              {tasks.map((t) => (
                <li key={t.id} className={cx('flex flex-wrap items-center gap-3 px-4 py-3', t.overdue && 'bg-red-50/50')}>
                  <div className="w-28 shrink-0">
                    <p className={cx('text-sm font-bold', t.overdue ? 'text-red-600' : t.dueSoon ? 'text-amber-600' : 'text-slate-700')}>{fmt(t.dueDate)}</p>
                    <Badge tone="slate">{t.category}</Badge>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-800">{t.title}</p>
                    {t.status === 'filed' && <p className="text-xs text-emerald-700">Filed {t.filedOn ? fmt(t.filedOn) : ''}{t.reference ? ` · ref ${t.reference}` : ''}</p>}
                    {t.note && <p className="text-xs text-slate-400">{t.note}</p>}
                  </div>
                  {t.status === 'filed'
                    ? <Button size="sm" variant="ghost" onClick={() => reopen(t)}>Undo</Button>
                    : <Button size="sm" variant="success" onClick={() => markFiled(t)}>Mark filed</Button>}
                  <button type="button" onClick={() => remove(t)} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"><IconTrash className="h-4 w-4" /></button>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
      <p className="mt-3 text-xs text-slate-400">Standard dates follow the general rules (PF & ESI by the 15th, TDS by the 7th, 24Q quarterly, Form 16 by 15 June). Professional Tax dates vary by local body — confirm them.</p>
      <AddTask open={adding} categories={data?.categories || []} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); }} />
    </div>
  );
}

function AddTask({ open, categories, onClose, onSaved }) {
  const [f, setF] = useState({ title: '', category: 'Other', dueDate: '', note: '' });
  const [error, setError] = useState('');
  useEffect(() => { if (open) { setF({ title: '', category: 'Other', dueDate: '', note: '' }); setError(''); } }, [open]);
  const save = async () => { try { await apiPost('/compliance', f); onSaved(); } catch (e) { setError(e.message); } };
  return (
    <Modal open={open} onClose={onClose} title="Custom compliance task"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save}>Add</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><ErrorNote>{error}</ErrorNote></div>
        <div className="sm:col-span-2"><Field label="What has to be filed / renewed"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Factory licence renewal" /></Field></div>
        <Field label="Category"><Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{categories.map((c) => <option key={c}>{c}</option>)}</Select></Field>
        <Field label="Due date"><Input type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></Field>
        <div className="sm:col-span-2"><Field label="Note"><Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field></div>
      </div>
    </Modal>
  );
}
