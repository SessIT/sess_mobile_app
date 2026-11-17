// Biometric devices — register ZKTeco / eSSL devices (ADMS push), map each
// employee to their device ID, watch incoming punches, or import a punch file.
import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost, api } from '../lib/api';
import { Card, CardBody, Button, Input, Field, Select, Badge, Loading, EmptyState, ErrorNote, PageHeader, Modal, cx } from '../components/ui';
import { IconPlus, IconEdit, IconTrash, IconUpload } from '../components/icons';

const when = (iso) => (iso ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'never');
const STATUS_TONE = { processed: 'green', unmatched: 'red', duplicate: 'gray', skipped: 'amber' };

export default function Biometric() {
  const [tab, setTab] = useState('devices');
  const seg = (k) => cx('rounded-lg px-4 py-1.5 text-sm font-semibold', tab === k ? 'bg-white text-brand-800 shadow-sm ring-1 ring-slate-200/80' : 'text-slate-500');
  return (
    <div>
      <PageHeader title="Biometric Devices" subtitle="Fingerprint / face devices feed attendance automatically, alongside mobile punches."
        actions={<div className="inline-flex gap-1 rounded-xl bg-slate-100 p-1">
          {[['devices', 'Devices'], ['mapping', 'Employee IDs'], ['logs', 'Punch log'], ['import', 'Import file']].map(([k, l]) =>
            <button key={k} type="button" className={seg(k)} onClick={() => setTab(k)}>{l}</button>)}
        </div>} />
      {tab === 'devices' && <Devices />}
      {tab === 'mapping' && <Mapping />}
      {tab === 'logs' && <Logs />}
      {tab === 'import' && <Import />}
    </div>
  );
}

function Devices() {
  const [data, setData] = useState(null);
  const [editing, setEditing] = useState(null);
  const [branches, setBranches] = useState([]);
  const load = useCallback(() => { apiGet('/biometric/devices').then(setData).catch(() => setData({ devices: [], unknownSeen: [] })); }, []);
  useEffect(() => { load(); apiGet('/branches/list').then(setBranches).catch(() => {}); }, [load]);
  const remove = async (d) => { if (window.confirm(`Remove ${d.name}? Its punches will be refused.`)) { await api(`/biometric/devices/${d.id}`, { method: 'DELETE' }); load(); } };
  const server = `${window.location.protocol}//${window.location.hostname}:4000`;
  return (
    <>
      <Card className="mb-4">
        <CardBody className="text-sm text-slate-600">
          <p className="font-semibold text-slate-800">Connecting a device</p>
          <ol className="ml-5 mt-1 list-decimal space-y-0.5">
            <li>On the device: <b>Menu → Comm → Cloud Server Setting</b> (ADMS). Server address: this backend's address (now <code>{server}</code>), port <b>4000</b>, HTTPS off unless your server has it.</li>
            <li>Register the device's serial number (SN, on its label or <b>System info</b>) below. Unregistered devices are refused and listed here.</li>
            <li>In <b>Employee IDs</b>, enter each person's user ID as enrolled on the device.</li>
          </ol>
        </CardBody>
      </Card>
      <div className="mb-3 flex justify-end"><Button onClick={() => setEditing('new')}><IconPlus className="h-4 w-4" /> Register device</Button></div>
      {!data ? <Loading /> : (
        <>
          {data.unknownSeen.length > 0 && (
            <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Unregistered devices tried to connect: {data.unknownSeen.map((u) => (
                <button key={u.serialNo} type="button" className="ml-1 font-semibold underline" onClick={() => setEditing({ serialNo: u.serialNo, name: '', isNewFromUnknown: true })}>{u.serialNo}</button>
              ))} — click to register.
            </div>
          )}
          <Card>
            <CardBody>
              {data.devices.length === 0 ? <EmptyState title="No devices registered" /> : (
                <ul className="divide-y divide-slate-100">
                  {data.devices.map((d) => {
                    const online = d.lastSeenAt && Date.now() - new Date(d.lastSeenAt).getTime() < 10 * 60000;
                    return (
                      <li key={d.id} className="flex items-center gap-3 py-2.5">
                        <span className={cx('h-2.5 w-2.5 rounded-full', online ? 'bg-emerald-500' : 'bg-slate-300')} title={online ? 'Online' : 'Not seen recently'} />
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-slate-800">{d.name} {!d.isActive && <Badge tone="gray">disabled</Badge>}</p>
                          <p className="text-xs text-slate-500">SN {d.serialNo}{d.siteName ? ` · site "${d.siteName}"` : ''} · last seen {when(d.lastSeenAt)}</p>
                        </div>
                        <Button size="sm" variant="ghost" onClick={() => setEditing(d)}><IconEdit className="h-4 w-4" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => remove(d)}><IconTrash className="h-4 w-4 text-red-600" /></Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardBody>
          </Card>
        </>
      )}
      <DeviceEditor item={editing} branches={branches} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
    </>
  );
}

function DeviceEditor({ item, branches, onClose, onSaved }) {
  const isNew = item === 'new' || item?.isNewFromUnknown;
  const [f, setF] = useState({});
  const [error, setError] = useState('');
  useEffect(() => {
    if (!item) return;
    setF(item === 'new' ? { serialNo: '', name: '', branchId: '', siteName: '', isActive: true }
      : { serialNo: item.serialNo, name: item.name || '', branchId: item.branchId || '', siteName: item.siteName || '', isActive: item.isActive ?? true });
    setError('');
  }, [item]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const save = async () => {
    try {
      if (isNew) await apiPost('/biometric/devices', f); else await api(`/biometric/devices/${item.id}`, { method: 'PATCH', body: JSON.stringify(f) });
      onSaved();
    } catch (e) { setError(e.message); }
  };
  return (
    <Modal open={!!item} onClose={onClose} title={isNew ? 'Register device' : `Edit ${item?.name}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save}>Save</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><ErrorNote>{error}</ErrorNote></div>
        <Field label="Serial number (SN)"><Input value={f.serialNo || ''} onChange={set('serialNo')} /></Field>
        <Field label="Name"><Input value={f.name || ''} onChange={set('name')} placeholder="e.g. Main gate" /></Field>
        <Field label="Branch"><Select value={f.branchId || ''} onChange={set('branchId')}><option value="">—</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field>
        <Field label="Site name on punches"><Input value={f.siteName || ''} onChange={set('siteName')} placeholder="e.g. SESS Factory" /></Field>
        {!isNew && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!f.isActive} onChange={set('isActive')} /> Accept punches</label>}
      </div>
    </Modal>
  );
}

function Mapping() {
  const [rows, setRows] = useState(null);
  const [edit, setEdit] = useState({});
  const [msg, setMsg] = useState('');
  const load = useCallback(() => { apiGet('/biometric/mapping').then((r) => { setRows(r); setEdit(Object.fromEntries(r.map((u) => [u.id, u.biometricId || '']))); }).catch(() => setRows([])); }, []);
  useEffect(() => { load(); }, [load]);
  const save = async (u) => {
    setMsg('');
    try { await api('/biometric/mapping', { method: 'PUT', body: JSON.stringify({ userId: u.id, biometricId: edit[u.id] }) }); load(); setMsg(`Saved for ${u.fullName || u.username}`); }
    catch (e) { setMsg(e.message); }
  };
  const reprocess = async () => {
    try { const r = await apiPost('/biometric/reprocess', {}); setMsg(`Re-checked unmatched punches: ${r.processed} now recorded, ${r.unmatched} still unmatched.`); } catch (e) { setMsg(e.message); }
  };
  return (
    <Card>
      <CardBody>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-slate-500">The ID each person is enrolled with on the device (often their employee code).</p>
          <Button variant="secondary" size="sm" onClick={reprocess}>Re-check unmatched punches</Button>
        </div>
        {msg && <p className="mb-2 text-sm font-semibold text-brand-700">{msg}</p>}
        {!rows ? <Loading /> : (
          <table className="w-full text-sm">
            <tbody>
              {rows.map((u) => (
                <tr key={u.id} className="border-b border-slate-100">
                  <td className="py-2"><span className="font-medium text-slate-800">{u.fullName || u.username}</span> <span className="text-xs text-slate-400">{u.employeeId}</span></td>
                  <td className="py-2"><Input value={edit[u.id] ?? ''} onChange={(e) => setEdit({ ...edit, [u.id]: e.target.value })} className="w-40" placeholder="Device ID" /></td>
                  <td className="py-2 text-right">{(edit[u.id] ?? '') !== (u.biometricId || '') && <Button size="sm" onClick={() => save(u)}>Save</Button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardBody>
    </Card>
  );
}

function Logs() {
  const [status, setStatus] = useState('');
  const [data, setData] = useState(null);
  useEffect(() => { setData(null); apiGet(`/biometric/logs${status ? `?status=${status}` : ''}`).then(setData).catch(() => setData({ logs: [], counts: {} })); }, [status]);
  return (
    <Card>
      <CardBody>
        <div className="mb-3 flex flex-wrap gap-2">
          {['', 'processed', 'unmatched', 'duplicate', 'skipped'].map((s) => (
            <button key={s || 'all'} type="button" onClick={() => setStatus(s)} className={cx('rounded-full border px-3 py-1 text-sm font-semibold', status === s ? 'border-brand-800 bg-brand-800 text-white' : 'border-slate-300 bg-white text-slate-600')}>
              {s || 'All'}{s && data?.counts?.[s] ? ` · ${data.counts[s]}` : ''}
            </button>
          ))}
        </div>
        {!data ? <Loading /> : data.logs.length === 0 ? <EmptyState title="No punches received yet" /> : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400"><th className="py-2">Punch time</th><th>Device</th><th>Device ID</th><th>Employee</th><th>Result</th></tr></thead>
            <tbody>
              {data.logs.map((l) => (
                <tr key={l.id} className="border-b border-slate-100">
                  <td className="py-1.5">{when(l.punchTime)}</td><td className="text-slate-500">{l.deviceSn}</td><td>{l.pin}</td>
                  <td>{l.userName || '—'}</td>
                  <td><Badge tone={STATUS_TONE[l.status]}>{l.status}{l.note && l.status === 'processed' ? ` · ${l.note}` : ''}</Badge>{l.note && l.status !== 'processed' && <span className="ml-1 text-xs text-slate-400">{l.note}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardBody>
    </Card>
  );
}

function Import() {
  const [file, setFile] = useState(null);
  const [siteName, setSiteName] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const run = async () => {
    setError(''); setResult(null);
    try { const csv = await file.text(); setResult(await apiPost('/biometric/import', { csv, siteName })); } catch (e) { setError(e.message); }
  };
  return (
    <Card>
      <CardBody className="space-y-3 text-sm">
        <p className="text-slate-600">For devices without cloud push: export the attendance log from the device software as CSV/TXT
          with one punch per line: <b>employee ID, date time</b> (e.g. <code>1023, 2026-11-20 09:12:05</code> or <code>1023,20/11/2026,09:12</code>).
          Re-importing the same file never double-counts.</p>
        <ErrorNote>{error}</ErrorNote>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Punch file"><input type="file" accept=".csv,.txt" onChange={(e) => setFile(e.target.files?.[0] || null)} /></Field>
          <Field label="Site name (optional)"><Input value={siteName} onChange={(e) => setSiteName(e.target.value)} className="w-48" /></Field>
          <Button onClick={run} disabled={!file}><IconUpload className="h-4 w-4" /> Import</Button>
        </div>
        {result && (
          <p className="rounded-lg bg-slate-50 p-3">
            <b>{result.processed}</b> recorded · {result.duplicate} duplicates skipped · <span className={result.unmatched ? 'text-red-600' : ''}>{result.unmatched} unknown IDs</span> · {result.skipped} in locked months · {result.unreadableLines} unreadable lines
          </p>
        )}
      </CardBody>
    </Card>
  );
}
