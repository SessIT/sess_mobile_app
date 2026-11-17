// Audit Log — every create / change / delete made through the system: who,
// what, when, and whether it succeeded. Passwords, PINs, bank and PAN
// details are never stored.
import { useCallback, useEffect, useState } from 'react';
import { apiGet } from '../lib/api';
import { Card, CardBody, Button, Input, Select, Badge, Loading, EmptyState, ErrorNote, PageHeader } from '../components/ui';

const VERB = { POST: ['green', 'Create'], PUT: ['blue', 'Update'], PATCH: ['blue', 'Update'], DELETE: ['red', 'Delete'] };
const when = (iso) => new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });

export default function AuditLog() {
  const [f, setF] = useState({ entity: '', from: '', to: '', q: '', failed: false });
  const [page, setPage] = useState(0);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(null);

  const load = useCallback(() => {
    const qs = new URLSearchParams({ page: String(page) });
    if (f.entity) qs.set('entity', f.entity);
    if (f.from) qs.set('from', f.from);
    if (f.to) qs.set('to', f.to);
    if (f.q) qs.set('q', f.q);
    if (f.failed) qs.set('failed', '1');
    setData(null);
    apiGet(`/audit?${qs}`).then(setData).catch((e) => setError(e.message));
  }, [f, page]);
  useEffect(() => { load(); }, [load]);
  const set = (k) => (e) => { setPage(0); setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }); };

  return (
    <div>
      <PageHeader title="Audit Log" subtitle="Who changed what, and when. Sensitive values are redacted." />
      <Card className="mb-4">
        <CardBody className="flex flex-wrap items-end gap-3">
          <Select value={f.entity} onChange={set('entity')} className="w-44">
            <option value="">All areas</option>
            {(data?.entities || []).map((e) => <option key={e} value={e}>{e}</option>)}
          </Select>
          <Input type="date" value={f.from} onChange={set('from')} className="w-40" />
          <Input type="date" value={f.to} onChange={set('to')} className="w-40" />
          <Input value={f.q} onChange={set('q')} placeholder="Path contains…" className="w-48" />
          <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={f.failed} onChange={set('failed')} /> Failed / denied only</label>
        </CardBody>
      </Card>
      <ErrorNote>{error}</ErrorNote>
      <Card>
        <CardBody className="p-0">
          {!data ? <Loading /> : data.rows.length === 0 ? <EmptyState title="Nothing recorded" /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-2 font-semibold">When</th><th className="px-4 py-2 font-semibold">Who</th>
                    <th className="px-4 py-2 font-semibold">Action</th><th className="px-4 py-2 font-semibold">Path</th><th className="px-4 py-2 font-semibold">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.id} className="cursor-pointer border-b border-slate-100 hover:bg-slate-50" onClick={() => setOpen(open === r.id ? null : r.id)}>
                      <td className="whitespace-nowrap px-4 py-2 text-slate-500">{when(r.createdAt)}</td>
                      <td className="px-4 py-2 font-medium text-slate-800">{r.who}</td>
                      <td className="px-4 py-2"><Badge tone={VERB[r.method]?.[0] || 'slate'}>{VERB[r.method]?.[1] || r.method}</Badge> <span className="text-slate-600">{r.entity}</span></td>
                      <td className="px-4 py-2 font-mono text-xs text-slate-500">
                        {r.path}
                        {open === r.id && r.summary && <pre className="mt-2 max-w-xl whitespace-pre-wrap rounded bg-slate-50 p-2 text-[11px] text-slate-700">{JSON.stringify(r.summary, null, 2)}</pre>}
                      </td>
                      <td className="px-4 py-2"><Badge tone={r.status < 300 ? 'green' : r.status === 403 ? 'red' : 'amber'}>{r.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
      {data && data.total > data.pageSize && (
        <div className="mt-3 flex items-center justify-end gap-2 text-sm text-slate-500">
          <Button size="sm" variant="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>Newer</Button>
          Page {page + 1} of {Math.ceil(data.total / data.pageSize)}
          <Button size="sm" variant="secondary" disabled={(page + 1) * data.pageSize >= data.total} onClick={() => setPage(page + 1)}>Older</Button>
        </div>
      )}
    </div>
  );
}
