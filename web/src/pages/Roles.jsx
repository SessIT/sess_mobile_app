// Roles & Permissions — which admin areas each role may open. The Admin role
// always has everything; only Admins can change this page.
import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost, api } from '../lib/api';
import { Card, CardBody, Button, Input, Badge, Loading, ErrorNote, PageHeader, Spinner, cx } from '../components/ui';
import { IconPlus, IconTrash } from '../components/icons';

export default function Roles() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState({}); // roleId -> Set(perms) being edited
  const [saving, setSaving] = useState(null);
  const [newName, setNewName] = useState('');

  const load = useCallback(() => {
    apiGet('/roles').then((d) => {
      setData(d);
      setDraft(Object.fromEntries(d.roles.map((r) => [r.id, new Set(r.permissions)])));
    }).catch((e) => setError(e.message));
  }, []);
  useEffect(() => { load(); }, [load]);

  const toggle = (roleId, key) => setDraft((d) => {
    const s = new Set(d[roleId]);
    if (s.has(key)) s.delete(key); else s.add(key);
    return { ...d, [roleId]: s };
  });
  const dirty = (r) => {
    const a = draft[r.id] || new Set();
    return a.size !== r.permissions.length || r.permissions.some((p) => !a.has(p));
  };
  const save = async (r) => {
    setSaving(r.id);
    setError('');
    try { await api(`/roles/${r.id}`, { method: 'PUT', body: JSON.stringify({ permissions: [...draft[r.id]] }) }); load(); }
    catch (e) { setError(e.message); } finally { setSaving(null); }
  };
  const create = async () => {
    if (!newName.trim()) return;
    try { await apiPost('/roles', { name: newName.trim() }); setNewName(''); load(); } catch (e) { setError(e.message); }
  };
  const remove = async (r) => {
    if (!window.confirm(`Delete the role "${r.name}"?`)) return;
    try { await api(`/roles/${r.id}`, { method: 'DELETE' }); load(); } catch (e) { setError(e.message); }
  };

  return (
    <div>
      <PageHeader title="Roles & Permissions"
        subtitle="Give each role exactly the admin areas it needs. People get a role in User Management. Changes apply on their next action." />
      <ErrorNote>{error}</ErrorNote>
      {!data ? <Loading /> : (
        <>
          <Card className="mb-4">
            <CardBody className="flex flex-wrap items-end gap-2">
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New role name, e.g. Payroll Executive" className="w-72" />
              <Button onClick={create} disabled={!newName.trim()}><IconPlus className="h-4 w-4" /> Add role</Button>
            </CardBody>
          </Card>
          <Card>
            <CardBody className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="sticky left-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Area</th>
                    {data.roles.map((r) => (
                      <th key={r.id} className="min-w-[7.5rem] px-2 py-3 text-center font-semibold">
                        <div className="normal-case">{r.name}</div>
                        <div className="text-[10px] font-normal text-slate-400">{r.users} user{r.users === 1 ? '' : 's'}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.catalog.map((p) => (
                    <tr key={p.key} className="border-b border-slate-100">
                      <td className="sticky left-0 z-10 bg-white px-4 py-2.5">
                        <p className="font-medium text-slate-800">{p.label}</p>
                        <p className="text-xs text-slate-400">{p.hint}</p>
                      </td>
                      {data.roles.map((r) => (
                        <td key={r.id} className="px-2 py-2.5 text-center">
                          <input type="checkbox" className="h-4 w-4" disabled={r.locked}
                            checked={r.locked || !!draft[r.id]?.has(p.key)} onChange={() => toggle(r.id, p.key)} />
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr>
                    <td className="sticky left-0 bg-white px-4 py-3" />
                    {data.roles.map((r) => (
                      <td key={r.id} className="px-2 py-3 text-center">
                        {r.locked ? <Badge tone="blue">Full access</Badge> : (
                          <div className="flex flex-col items-center gap-1">
                            <Button size="sm" disabled={!dirty(r) || saving === r.id} onClick={() => save(r)}>
                              {saving === r.id && <Spinner className="h-3 w-3 text-white" />} Save
                            </Button>
                            {r.users === 0 && (
                              <button type="button" onClick={() => remove(r)} className={cx('rounded p-1 text-red-600 hover:bg-red-50')} title="Delete role">
                                <IconTrash className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </CardBody>
          </Card>
          <p className="mt-3 text-xs text-slate-400">
            Safety: only an Admin can create Admins or edit Admin accounts, even for roles with User management.
            Every action is recorded in the Audit Log.
          </p>
        </>
      )}
    </div>
  );
}
