// Documents & Letters — per employee: their document folder (ID proofs,
// certificates, signed letters…) and printable HR letters generated from
// their profile (employment / salary certificate, appointment, experience,
// relieving).
import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiUpload, api, fileUrl } from '../lib/api';
import { Card, CardBody, Button, Input, Field, Select, Badge, Loading, EmptyState, ErrorNote, PageHeader, Spinner } from '../components/ui';
import { IconTrash, IconUpload, IconEye } from '../components/icons';

const nameOf = (u) => u?.fullName || u?.username || '—';
const when = (iso) => new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

export default function Documents() {
  const [users, setUsers] = useState([]);
  const [userId, setUserId] = useState('');
  const [docs, setDocs] = useState(null);
  const [cats, setCats] = useState([]);
  const [letters, setLetters] = useState([]);
  const [error, setError] = useState('');
  const [file, setFile] = useState(null);
  const [cat, setCat] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiGet('/users').then(setUsers).catch((e) => setError(e.message));
    apiGet('/documents/categories').then((c) => { setCats(c); setCat(c[0]); }).catch(() => {});
    apiGet('/documents/letters/types').then(setLetters).catch(() => {});
  }, []);

  const load = useCallback(() => {
    if (!userId) return;
    setDocs(null);
    apiGet(`/documents/user/${userId}`).then((r) => setDocs(r.documents)).catch((e) => setError(e.message));
  }, [userId]);
  useEffect(() => { load(); }, [load]);

  const upload = async () => {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('userId', userId);
      fd.append('category', cat);
      fd.append('title', title);
      await apiUpload('/documents', fd);
      setFile(null); setTitle('');
      document.getElementById('doc-file').value = '';
      load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const remove = async (d) => {
    if (!window.confirm(`Delete "${d.title}"? The file is removed permanently.`)) return;
    try { await api(`/documents/${d.id}`, { method: 'DELETE' }); load(); } catch (e) { window.alert(e.message); }
  };

  const user = users.find((u) => String(u.id) === String(userId));

  return (
    <div>
      <PageHeader title="Documents & Letters" subtitle="Each employee's document folder, and HR letters generated from their profile." />
      <ErrorNote>{error}</ErrorNote>
      <Card className="mb-4">
        <CardBody>
          <Field label="Employee">
            <Select value={userId} onChange={(e) => setUserId(e.target.value)} className="max-w-md">
              <option value="">Select an employee…</option>
              {users.map((u) => <option key={u.id} value={u.id}>{nameOf(u)}{u.employeeId ? ` (${u.employeeId})` : ''}{u.isActive ? '' : ' — exited / inactive'}</option>)}
            </Select>
          </Field>
        </CardBody>
      </Card>

      {userId && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <Card>
            <CardBody>
              <h3 className="mb-3 font-semibold text-slate-800">Document folder</h3>
              {!docs ? <Loading /> : docs.length === 0 ? <EmptyState title="No documents yet" /> : (
                <ul className="divide-y divide-slate-100">
                  {docs.map((d) => (
                    <li key={d.id} className="flex items-center gap-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-slate-800">{d.title}</p>
                        <p className="text-xs text-slate-400">{d.category} · {when(d.createdAt)} · {d.uploadedById === d.userId ? 'uploaded by employee' : 'added by HR'}</p>
                      </div>
                      <a href={fileUrl(`api/documents/${d.id}/file`)} target="_blank" rel="noreferrer" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" title="Open">
                        <IconEye className="h-4 w-4" />
                      </a>
                      <button type="button" onClick={() => remove(d)} className="rounded-lg p-1.5 text-red-600 hover:bg-red-50" title="Delete"><IconTrash className="h-4 w-4" /></button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-4 grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-2">
                <Field label="File (PDF or photo, max 10 MB)">
                  <input id="doc-file" type="file" accept=".pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} className="text-sm" />
                </Field>
                <Field label="Category"><Select value={cat} onChange={(e) => setCat(e.target.value)}>{cats.map((c) => <option key={c}>{c}</option>)}</Select></Field>
                <Field label="Title"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Aadhaar card" /></Field>
                <div className="flex items-end">
                  <Button onClick={upload} disabled={!file || busy}>{busy ? <Spinner className="h-4 w-4 text-white" /> : <IconUpload className="h-4 w-4" />} Upload</Button>
                </div>
              </div>
              <p className="mt-2 text-xs text-slate-400">Files are stored privately — only this employee and admins can open them.</p>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <h3 className="mb-1 font-semibold text-slate-800">HR letters</h3>
              <p className="mb-3 text-xs text-slate-500">Opens a printable letter on the company letterhead — use Print → Save as PDF, sign, and upload it to the folder if needed.</p>
              <div className="space-y-2">
                {letters.map((l) => {
                  const blocked = l.needsExit && !user?.exitDate;
                  return (
                    <div key={l.key} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                      <span className="text-sm font-medium text-slate-700">{l.title}</span>
                      {blocked ? <Badge tone="gray">after exit</Badge> : (
                        <a href={fileUrl(`api/documents/letters/${l.key}/${userId}/html`)} target="_blank" rel="noreferrer"
                          className="text-sm font-semibold text-brand-700 hover:underline">Generate</a>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}
