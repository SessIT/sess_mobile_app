// Training — courses (link to a video / document / external course), assign
// to everyone, a branch or chosen people, and track who has completed.
import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost, api } from '../lib/api';
import { Card, CardBody, Button, Input, Field, Select, Badge, Loading, EmptyState, ErrorNote, PageHeader, Modal } from '../components/ui';
import { IconPlus, IconEdit, IconTrash, IconUsers } from '../components/icons';

export default function Training() {
  const [courses, setCourses] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [assigning, setAssigning] = useState(null);
  const [progress, setProgress] = useState(null);

  const load = useCallback(() => { apiGet('/training/courses').then((r) => setCourses(r.courses)).catch((e) => setError(e.message)); }, []);
  useEffect(() => { load(); }, [load]);

  const remove = async (c) => {
    if (!window.confirm(`Delete "${c.title}" and its completion records?`)) return;
    try { await api(`/training/courses/${c.id}`, { method: 'DELETE' }); load(); } catch (e) { window.alert(e.message); }
  };

  return (
    <div>
      <PageHeader title="Training" subtitle="Courses and policies people must complete — employees see them in the app."
        actions={<Button onClick={() => setEditing('new')}><IconPlus className="h-4 w-4" /> New course</Button>} />
      <ErrorNote>{error}</ErrorNote>
      {!courses ? <Loading /> : courses.length === 0 ? <Card><CardBody><EmptyState title="No courses yet" hint="e.g. Safety induction, POSH awareness, product training." /></CardBody></Card> : (
        <div className="grid gap-4 lg:grid-cols-2">
          {courses.map((c) => (
            <Card key={c.id}>
              <CardBody>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-bold text-slate-800">{c.title} {c.mandatory && <Badge tone="red">Mandatory</Badge>}</h3>
                    <p className="text-xs text-slate-500">{c.durationMins ? `${c.durationMins} min · ` : ''}{c.dueDate ? `due ${c.dueDate}` : 'no due date'}</p>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(c)}><IconEdit className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(c)}><IconTrash className="h-4 w-4 text-red-600" /></Button>
                  </div>
                </div>
                {c.description && <p className="mt-2 line-clamp-3 text-sm text-slate-600">{c.description}</p>}
                {c.contentUrl && <a href={c.contentUrl} target="_blank" rel="noreferrer" className="mt-1 block truncate text-sm text-brand-700 hover:underline">{c.contentUrl}</a>}
                <div className="mt-3 flex items-center gap-3">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${c.assigned ? Math.round((c.completed / c.assigned) * 100) : 0}%` }} />
                  </div>
                  <button type="button" onClick={() => setProgress(c)} className="text-sm font-semibold text-slate-600 hover:underline">{c.completed}/{c.assigned} done</button>
                  <Button size="sm" variant="secondary" onClick={() => setAssigning(c)}><IconUsers className="h-4 w-4" /> Assign</Button>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
      <CourseEditor item={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      <AssignCourse course={assigning} onClose={() => setAssigning(null)} onSaved={() => { setAssigning(null); load(); }} />
      <Progress course={progress} onClose={() => setProgress(null)} />
    </div>
  );
}

function CourseEditor({ item, onClose, onSaved }) {
  const isNew = item === 'new';
  const [f, setF] = useState({});
  const [error, setError] = useState('');
  useEffect(() => {
    if (!item) return;
    setF(isNew ? { title: '', description: '', contentUrl: '', durationMins: '', dueDate: '', mandatory: false }
      : { title: item.title, description: item.description || '', contentUrl: item.contentUrl || '', durationMins: item.durationMins || '', dueDate: item.dueDate || '', mandatory: item.mandatory });
    setError('');
  }, [item, isNew]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const save = async () => {
    try {
      if (isNew) await apiPost('/training/courses', f); else await api(`/training/courses/${item.id}`, { method: 'PATCH', body: JSON.stringify(f) });
      onSaved();
    } catch (e) { setError(e.message); }
  };
  return (
    <Modal open={!!item} onClose={onClose} title={isNew ? 'New course' : 'Edit course'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save}>Save</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><ErrorNote>{error}</ErrorNote></div>
        <div className="sm:col-span-2"><Field label="Title"><Input value={f.title || ''} onChange={set('title')} /></Field></div>
        <div className="sm:col-span-2"><Field label="Content link (video / document / course URL)"><Input value={f.contentUrl || ''} onChange={set('contentUrl')} placeholder="https://…" /></Field></div>
        <Field label="Duration (minutes)"><Input type="number" value={f.durationMins || ''} onChange={set('durationMins')} /></Field>
        <Field label="Complete by"><Input type="date" value={f.dueDate || ''} onChange={set('dueDate')} /></Field>
        <div className="sm:col-span-2"><Field label="Description">
          <textarea rows={4} value={f.description || ''} onChange={set('description')} className="w-full rounded-lg border border-slate-300/90 px-3 py-2 text-sm" />
        </Field></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!f.mandatory} onChange={set('mandatory')} /> Mandatory</label>
      </div>
    </Modal>
  );
}

function AssignCourse({ course, onClose, onSaved }) {
  const [mode, setMode] = useState('all');
  const [branchId, setBranchId] = useState('');
  const [picked, setPicked] = useState(new Set());
  const [users, setUsers] = useState([]);
  const [branches, setBranches] = useState([]);
  useEffect(() => {
    if (!course) return;
    setMode('all'); setPicked(new Set()); setBranchId('');
    apiGet('/users').then((u) => setUsers(u.filter((x) => x.isActive))).catch(() => {});
    apiGet('/branches/list').then(setBranches).catch(() => {});
  }, [course]);
  const save = async () => {
    const body = mode === 'all' ? { all: true } : mode === 'branch' ? { branchId: Number(branchId) } : { userIds: [...picked] };
    try { const r = await apiPost(`/training/courses/${course.id}/assign`, body); window.alert(`Assigned to ${r.assigned} new people.`); onSaved(); }
    catch (e) { window.alert(e.message); }
  };
  return (
    <Modal open={!!course} onClose={onClose} title={`Assign — ${course?.title || ''}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={mode === 'branch' ? !branchId : mode === 'people' ? !picked.size : false}>Assign & notify</Button></>}>
      <div className="space-y-3 text-sm">
        <Select value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="all">Everyone</option>{branches.length > 0 && <option value="branch">A branch</option>}<option value="people">Chosen people</option>
        </Select>
        {mode === 'branch' && <Select value={branchId} onChange={(e) => setBranchId(e.target.value)}><option value="">Pick branch…</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select>}
        {mode === 'people' && (
          <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
            {users.map((u) => (
              <li key={u.id}><label className="flex items-center gap-2 px-3 py-1.5">
                <input type="checkbox" checked={picked.has(u.id)} onChange={() => setPicked((p) => { const n = new Set(p); if (n.has(u.id)) n.delete(u.id); else n.add(u.id); return n; })} />
                {u.fullName || u.username}
              </label></li>
            ))}
          </ul>
        )}
        <p className="text-xs text-slate-400">People already assigned are skipped; only new people are notified.</p>
      </div>
    </Modal>
  );
}

function Progress({ course, onClose }) {
  const [rows, setRows] = useState(null);
  useEffect(() => { if (course) { setRows(null); apiGet(`/training/courses/${course.id}/progress`).then((r) => setRows(r.rows)).catch(() => setRows([])); } }, [course]);
  return (
    <Modal open={!!course} onClose={onClose} title={`Progress — ${course?.title || ''}`}>
      {!rows ? <Loading /> : rows.length === 0 ? <p className="text-sm text-slate-400">Not assigned to anyone yet.</p> : (
        <ul className="divide-y divide-slate-100 text-sm">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between py-2">
              <span>{r.user?.fullName || r.user?.username}</span>
              {r.status === 'completed' ? <Badge tone="green">Done {new Date(r.completedAt).toLocaleDateString('en-IN')}</Badge> : <Badge tone="amber">Pending</Badge>}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
