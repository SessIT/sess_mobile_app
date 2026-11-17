// Recruitment — job openings → candidate pipeline (applied → screening →
// interview → offered → hired / rejected), interviews with interviewer
// feedback, offer letter, and one-click hire into an employee record.
import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost, apiUpload, api, fileUrl } from '../lib/api';
import { Card, CardBody, Button, Input, Field, Select, Badge, Loading, EmptyState, ErrorNote, PageHeader, Modal, Spinner, cx } from '../components/ui';
import { IconPlus, IconEdit } from '../components/icons';

const STAGE_LABEL = { applied: 'Applied', screening: 'Screening', interview: 'Interview', offered: 'Offered', hired: 'Hired', rejected: 'Rejected' };
const STAGE_TONE = { applied: 'slate', screening: 'blue', interview: 'amber', offered: 'green', hired: 'green', rejected: 'red' };
const inr = (n) => (n ? `₹${Number(n).toLocaleString('en-IN')}` : '—');
const when = (iso) => new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function Recruitment() {
  const [jobs, setJobs] = useState(null);
  const [jobId, setJobId] = useState(null);
  const [error, setError] = useState('');
  const [editingJob, setEditingJob] = useState(null);
  const [addingCand, setAddingCand] = useState(false);
  const [candidates, setCandidates] = useState(null);
  const [openCand, setOpenCand] = useState(null);
  const [meta, setMeta] = useState({ stages: [], sources: [] });
  const [users, setUsers] = useState([]);
  const [branches, setBranches] = useState([]);

  const loadJobs = useCallback(() => {
    apiGet('/recruitment/jobs').then((r) => { setJobs(r.jobs); setJobId((cur) => cur ?? r.jobs[0]?.id ?? null); }).catch((e) => setError(e.message));
  }, []);
  const loadCands = useCallback(() => {
    if (!jobId) return;
    apiGet(`/recruitment/jobs/${jobId}/candidates`).then((r) => setCandidates(r.candidates)).catch((e) => setError(e.message));
  }, [jobId]);
  useEffect(() => {
    loadJobs();
    apiGet('/recruitment/meta').then(setMeta).catch(() => {});
    apiGet('/users').then((u) => setUsers(u.filter((x) => x.isActive))).catch(() => {});
    apiGet('/branches/list').then(setBranches).catch(() => {});
  }, [loadJobs]);
  useEffect(() => { setCandidates(null); loadCands(); }, [loadCands]);

  const job = jobs?.find((j) => j.id === jobId);
  const refresh = () => { loadJobs(); loadCands(); };

  return (
    <div>
      <PageHeader title="Recruitment" subtitle="Openings, candidate pipeline, interviews, offers — and hiring straight into an employee record."
        actions={<Button onClick={() => setEditingJob('new')}><IconPlus className="h-4 w-4" /> New opening</Button>} />
      <ErrorNote>{error}</ErrorNote>
      {!jobs ? <Loading /> : jobs.length === 0 ? <Card><CardBody><EmptyState title="No job openings yet" /></CardBody></Card> : (
        <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <Card>
            <CardBody className="p-0">
              <ul className="divide-y divide-slate-100">
                {jobs.map((j) => (
                  <li key={j.id}>
                    <button type="button" onClick={() => setJobId(j.id)} className={cx('w-full px-4 py-3 text-left hover:bg-slate-50', jobId === j.id && 'bg-brand-50/60')}>
                      <p className="font-semibold text-slate-800">{j.title}</p>
                      <p className="text-xs text-slate-500">{j.department || '—'} · {j.openings} opening{j.openings === 1 ? '' : 's'} · <span className={j.status === 'open' ? 'text-emerald-600' : 'text-slate-400'}>{j.status.replace('_', ' ')}</span></p>
                      <p className="mt-0.5 text-[11px] text-slate-400">{Object.values(j.pipeline).reduce((a, b) => a + b, 0)} candidates · {j.pipeline.hired} hired</p>
                    </button>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>

          {job && (
            <div className="space-y-3">
              <Card>
                <CardBody className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-bold text-slate-800">{job.title}</h2>
                    <p className="text-xs text-slate-500">{job.department || 'No department'} · {job.openings} opening(s)</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="secondary" size="sm" onClick={() => setEditingJob(job)}><IconEdit className="h-4 w-4" /> Edit</Button>
                    <Button size="sm" onClick={() => setAddingCand(true)}><IconPlus className="h-4 w-4" /> Add candidate</Button>
                  </div>
                </CardBody>
              </Card>
              {!candidates ? <Loading /> : (
                <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
                  {meta.stages.map((st) => (
                    <div key={st} className="rounded-xl bg-slate-100/70 p-2">
                      <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{STAGE_LABEL[st]} · {candidates.filter((c) => c.stage === st).length}</p>
                      <div className="space-y-2">
                        {candidates.filter((c) => c.stage === st).map((c) => (
                          <button key={c.id} type="button" onClick={() => setOpenCand(c.id)}
                            className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-left shadow-sm hover:border-brand-300">
                            <p className="truncate text-sm font-semibold text-slate-800">{c.name}</p>
                            <p className="text-[11px] text-slate-500">{c.experienceYears != null ? `${c.experienceYears} yrs` : '—'}{c.source ? ` · ${c.source}` : ''}</p>
                            {c.avgRating != null && <p className="text-[11px] font-semibold text-amber-600">★ {c.avgRating} ({c.interviewCount})</p>}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      <JobEditor item={editingJob} branches={branches} onClose={() => setEditingJob(null)} onSaved={() => { setEditingJob(null); loadJobs(); }} />
      <AddCandidate open={addingCand} jobId={jobId} sources={meta.sources} onClose={() => setAddingCand(false)} onSaved={() => { setAddingCand(false); refresh(); }} />
      <CandidateDrawer id={openCand} meta={meta} users={users} onClose={() => setOpenCand(null)} onChanged={refresh} />
    </div>
  );
}

function JobEditor({ item, branches, onClose, onSaved }) {
  const isNew = item === 'new';
  const [f, setF] = useState({});
  const [error, setError] = useState('');
  useEffect(() => {
    if (!item) return;
    setF(isNew ? { title: '', department: '', openings: 1, branchId: '', description: '', status: 'open' }
      : { title: item.title, department: item.department || '', openings: item.openings, branchId: item.branchId || '', description: item.description || '', status: item.status });
    setError('');
  }, [item, isNew]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    try {
      if (isNew) await apiPost('/recruitment/jobs', f); else await api(`/recruitment/jobs/${item.id}`, { method: 'PATCH', body: JSON.stringify(f) });
      onSaved();
    } catch (e) { setError(e.message); }
  };
  return (
    <Modal open={!!item} onClose={onClose} title={isNew ? 'New job opening' : 'Edit opening'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save}>Save</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><ErrorNote>{error}</ErrorNote></div>
        <Field label="Job title"><Input value={f.title || ''} onChange={set('title')} placeholder="e.g. Service Engineer" /></Field>
        <Field label="Department"><Input value={f.department || ''} onChange={set('department')} /></Field>
        <Field label="Openings"><Input type="number" min="1" value={f.openings || 1} onChange={set('openings')} /></Field>
        <Field label="Branch"><Select value={f.branchId || ''} onChange={set('branchId')}><option value="">Any</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field>
        {!isNew && <Field label="Status"><Select value={f.status} onChange={set('status')}><option value="open">Open</option><option value="on_hold">On hold</option><option value="closed">Closed</option></Select></Field>}
        <div className="sm:col-span-2"><Field label="Description / requirements">
          <textarea rows={4} value={f.description || ''} onChange={set('description')} className="w-full rounded-lg border border-slate-300/90 px-3 py-2 text-sm" />
        </Field></div>
      </div>
    </Modal>
  );
}

function AddCandidate({ open, jobId, sources, onClose, onSaved }) {
  const blank = { name: '', email: '', phone: '', source: '', experienceYears: '', currentCtc: '', expectedCtc: '', noticeDays: '', notes: '' };
  const [f, setF] = useState(blank);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (open) { setF(blank); setFile(null); setError(''); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    setBusy(true);
    try {
      const fd = new FormData();
      Object.entries({ ...f, jobId }).forEach(([k, v]) => v !== '' && fd.append(k, v));
      if (file) fd.append('resume', file);
      await apiUpload('/recruitment/candidates', fd);
      onSaved();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Add candidate" width="max-w-2xl"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={busy}>{busy && <Spinner className="h-4 w-4 text-white" />}Add</Button></>}>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-3"><ErrorNote>{error}</ErrorNote></div>
        <Field label="Name"><Input value={f.name} onChange={set('name')} /></Field>
        <Field label="Email"><Input value={f.email} onChange={set('email')} /></Field>
        <Field label="Phone"><Input value={f.phone} onChange={set('phone')} /></Field>
        <Field label="Source"><Select value={f.source} onChange={set('source')}><option value="">—</option>{sources.map((s) => <option key={s}>{s}</option>)}</Select></Field>
        <Field label="Experience (years)"><Input type="number" value={f.experienceYears} onChange={set('experienceYears')} /></Field>
        <Field label="Notice (days)"><Input type="number" value={f.noticeDays} onChange={set('noticeDays')} /></Field>
        <Field label="Current CTC (₹/yr)"><Input type="number" value={f.currentCtc} onChange={set('currentCtc')} /></Field>
        <Field label="Expected CTC (₹/yr)"><Input type="number" value={f.expectedCtc} onChange={set('expectedCtc')} /></Field>
        <Field label="Resume (PDF / Word, max 8 MB)"><input type="file" accept=".pdf,.doc,.docx,image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} className="text-sm" /></Field>
        <div className="sm:col-span-3"><Field label="Notes"><Input value={f.notes} onChange={set('notes')} /></Field></div>
      </div>
    </Modal>
  );
}

function CandidateDrawer({ id, meta, users, onClose, onChanged }) {
  const [c, setC] = useState(null);
  const [error, setError] = useState('');
  const [iv, setIv] = useState({ interviewerId: '', date: '', time: '10:00', round: 'Technical', mode: 'In person' });
  const [offer, setOffer] = useState({ offeredCtc: '', joiningDate: '' });
  const [username, setUsername] = useState('');
  const load = useCallback(() => {
    if (!id) return;
    apiGet(`/recruitment/candidates/${id}`).then((d) => {
      setC(d);
      setOffer({ offeredCtc: d.offeredCtc ?? '', joiningDate: d.joiningDate || '' });
      setUsername((d.email || d.name).split('@')[0].toLowerCase().replace(/[^a-z0-9._-]/g, '.').slice(0, 30));
    }).catch((e) => setError(e.message));
  }, [id]);
  useEffect(() => { setC(null); setError(''); load(); }, [load]);

  const patch = async (body) => {
    try { await api(`/recruitment/candidates/${id}`, { method: 'PATCH', body: JSON.stringify(body) }); load(); onChanged(); } catch (e) { setError(e.message); }
  };
  const schedule = async () => {
    try {
      await apiPost(`/recruitment/candidates/${id}/interviews`, {
        interviewerId: Number(iv.interviewerId), round: iv.round, mode: iv.mode,
        scheduledAt: new Date(`${iv.date}T${iv.time}:00+05:30`).toISOString(),
      });
      setIv({ ...iv, date: '' }); load(); onChanged();
    } catch (e) { setError(e.message); }
  };
  const hire = async () => {
    if (!window.confirm(`Hire ${c.name}? An employee record is created (username "${username}", joining ${offer.joiningDate || c.joiningDate}).`)) return;
    try {
      const r = await apiPost(`/recruitment/candidates/${id}/hire`, { username, joiningDate: offer.joiningDate });
      window.alert(`Created ${r.user.fullName} (${r.user.employeeId}).${r.emailOnFile ? ' They can sign in on the app with their email.' : ' Add their email in User Management so they can sign in on the app.'} Set their salary in Payroll.`);
      load(); onChanged();
    } catch (e) { setError(e.message); }
  };

  return (
    <Modal open={!!id} onClose={onClose} title={c?.name || 'Candidate'} width="max-w-3xl">
      {!c ? <Loading /> : (
        <div className="space-y-4 text-sm">
          <ErrorNote>{error}</ErrorNote>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={STAGE_TONE[c.stage]}>{STAGE_LABEL[c.stage]}</Badge>
            <span className="text-slate-500">for {c.job.title}</span>
            {c.hasResume && <a className="font-semibold text-brand-700 hover:underline" href={fileUrl(`api/recruitment/candidates/${c.id}/resume`)} target="_blank" rel="noreferrer">Resume ↗</a>}
            {c.stage !== 'hired' && (
              <Select value={c.stage} onChange={(e) => patch({ stage: e.target.value })} className="ml-auto w-40">
                {meta.stages.filter((s) => s !== 'hired').map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
              </Select>
            )}
          </div>
          <div className="grid gap-x-6 gap-y-1 rounded-lg bg-slate-50 p-3 sm:grid-cols-2">
            <p><span className="text-slate-500">Email:</span> {c.email || '—'}</p><p><span className="text-slate-500">Phone:</span> {c.phone || '—'}</p>
            <p><span className="text-slate-500">Experience:</span> {c.experienceYears ?? '—'} yrs</p><p><span className="text-slate-500">Notice:</span> {c.noticeDays ?? '—'} days</p>
            <p><span className="text-slate-500">Current CTC:</span> {inr(c.currentCtc)}</p><p><span className="text-slate-500">Expected CTC:</span> {inr(c.expectedCtc)}</p>
            {c.notes && <p className="sm:col-span-2"><span className="text-slate-500">Notes:</span> {c.notes}</p>}
          </div>

          <div>
            <p className="mb-2 font-semibold text-slate-700">Interviews</p>
            {c.interviews.length === 0 && <p className="text-slate-400">None yet.</p>}
            <ul className="space-y-2">
              {c.interviews.map((i) => (
                <li key={i.id} className="rounded-lg border border-slate-200 p-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{i.round}</span><span className="text-slate-500">· {i.mode} · {when(i.scheduledAt)} · {i.interviewer}</span>
                    <Badge tone={i.status === 'done' ? 'green' : i.status === 'cancelled' ? 'gray' : 'amber'}>{i.status}</Badge>
                    {i.status === 'scheduled' && (
                      <button type="button" className="ml-auto text-xs font-semibold text-red-600 hover:underline"
                        onClick={async () => { await api(`/recruitment/interviews/${i.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'cancelled' }) }); load(); }}>Cancel</button>
                    )}
                  </div>
                  {i.feedback && <p className="mt-1 text-slate-700">★ {i.rating}/5 · <b className="uppercase">{i.recommendation}</b> — {i.feedback}</p>}
                </li>
              ))}
            </ul>
            {!['hired', 'rejected'].includes(c.stage) && (
              <div className="mt-2 grid gap-2 rounded-lg bg-slate-50 p-2 sm:grid-cols-5">
                <Select value={iv.interviewerId} onChange={(e) => setIv({ ...iv, interviewerId: e.target.value })}>
                  <option value="">Interviewer…</option>{users.map((u) => <option key={u.id} value={u.id}>{u.fullName || u.username}</option>)}
                </Select>
                <Input value={iv.round} onChange={(e) => setIv({ ...iv, round: e.target.value })} placeholder="Round" />
                <Select value={iv.mode} onChange={(e) => setIv({ ...iv, mode: e.target.value })}>{['In person', 'Phone', 'Video'].map((m) => <option key={m}>{m}</option>)}</Select>
                <Input type="date" value={iv.date} onChange={(e) => setIv({ ...iv, date: e.target.value })} />
                <div className="flex gap-1">
                  <Input type="time" value={iv.time} onChange={(e) => setIv({ ...iv, time: e.target.value })} />
                  <Button size="sm" onClick={schedule} disabled={!iv.interviewerId || !iv.date}>Schedule</Button>
                </div>
              </div>
            )}
          </div>

          {c.stage !== 'hired' && c.stage !== 'rejected' && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
              <p className="mb-2 font-semibold text-slate-700">Offer & hire</p>
              <div className="flex flex-wrap items-end gap-2">
                <Field label="Offered CTC (₹/yr)"><Input type="number" value={offer.offeredCtc} onChange={(e) => setOffer({ ...offer, offeredCtc: e.target.value })} className="w-40" /></Field>
                <Field label="Joining date"><Input type="date" value={offer.joiningDate} onChange={(e) => setOffer({ ...offer, joiningDate: e.target.value })} /></Field>
                <Button variant="secondary" onClick={() => patch({ ...offer, stage: 'offered' })}>Save & mark offered</Button>
                {c.offeredCtc && c.joiningDate && (
                  <a href={fileUrl(`api/recruitment/candidates/${c.id}/offer-letter`)} target="_blank" rel="noreferrer" className="pb-2 text-sm font-semibold text-brand-700 hover:underline">Offer letter ↗</a>
                )}
              </div>
              {c.stage === 'offered' && (
                <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-emerald-200 pt-3">
                  <Field label="Username for the new employee"><Input value={username} onChange={(e) => setUsername(e.target.value)} className="w-56" /></Field>
                  <Button variant="success" onClick={hire}>Hire → create employee</Button>
                </div>
              )}
            </div>
          )}
          {c.stage === 'hired' && <p className="font-semibold text-emerald-700">Hired — now an employee (see User Management).</p>}
        </div>
      )}
    </Modal>
  );
}
