import { useEffect, useMemo, useState } from 'react';
import { apiGet, apiPost, apiPatch } from '../lib/api';
import { fmtDate } from '../lib/format';
import {
  Button,
  Badge,
  Card,
  Field,
  Input,
  Select,
  Loading,
  EmptyState,
  ErrorNote,
  PageHeader,
  Modal,
  Spinner,
} from '../components/ui';
import { IconUserPlus, IconUserCircle, IconSearch, IconEdit, IconEye, IconEyeOff } from '../components/icons';

/* Password input with a visibility (eye) toggle. */
function PasswordInput({ value, onChange, placeholder = '••••••••', shown, onToggle, autoComplete = 'new-password' }) {
  return (
    <div className="relative">
      <Input
        type={shown ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="pr-10"
      />
      <button
        type="button"
        onClick={onToggle}
        tabIndex={-1}
        title={shown ? 'Hide password' : 'Show password'}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 transition hover:text-slate-600"
      >
        {shown ? <IconEyeOff className="h-4 w-4" /> : <IconEye className="h-4 w-4" />}
      </button>
    </div>
  );
}

// User management — list every account, create new ones, toggle active status.
export default function Users() {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(''); // top-level (list / toggle) errors

  const [query, setQuery] = useState('');
  const [togglingId, setTogglingId] = useState(null); // row currently being flipped

  // Create-user modal state
  const [createOpen, setCreateOpen] = useState(false);
  // Edit-user modal state (holds the user being edited, or null)
  const [editUser, setEditUser] = useState(null);

  // Load users + roles in parallel on mount.
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const [userList, roleList] = await Promise.all([apiGet('/users'), apiGet('/users/roles')]);
        if (!alive) return;
        setUsers(Array.isArray(userList) ? userList : []);
        setRoles(Array.isArray(roleList) ? roleList : []);
      } catch (err) {
        if (alive) setError(err.message || 'Failed to load users');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Client-side filter across name / username / phone / role.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      const haystack = [u.fullName, u.username, u.phone, ...(u.roles || [])]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [users, query]);

  // Flip a user's active status; update the row in place.
  const toggleStatus = async (user) => {
    setTogglingId(user.id);
    setError('');
    try {
      const updated = await apiPatch(`/users/${user.id}/status`, { isActive: !user.isActive });
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, isActive: updated.isActive } : u))
      );
    } catch (err) {
      setError(err.message || 'Could not update status');
    } finally {
      setTogglingId(null);
    }
  };

  // Prepend a freshly-created user to the list.
  const onCreated = (user) => {
    setUsers((prev) => [user, ...prev]);
    setCreateOpen(false);
  };

  // Replace an edited user in place.
  const onUpdated = (user) => {
    setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, ...user } : u)));
    setEditUser(null);
  };

  return (
    <div>
      <PageHeader
        title="User Management"
        subtitle="Create and manage employee accounts"
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <IconUserPlus className="h-4 w-4" />
            New User
          </Button>
        }
      />

      {/* Top-level errors (list load / status toggle failures) */}
      {error && (
        <div className="mb-4">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-4 max-w-sm">
        <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, username, phone or role…"
          aria-label="Search users"
          className="pl-9"
        />
      </div>

      <Card>
        {loading ? (
          <Loading label="Loading users…" />
        ) : users.length === 0 ? (
          <EmptyState
            title="No users yet"
            hint="Create the first employee account to get started."
            icon={<IconUserCircle />}
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No matches"
            hint="Try a different search term."
            icon={<IconSearch />}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-3 font-semibold">Name</th>
                  <th className="px-5 py-3 font-semibold">Phone</th>
                  <th className="px-5 py-3 font-semibold">Role</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold">Created</th>
                  <th className="px-5 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((u) => {
                  const busy = togglingId === u.id;
                  return (
                    <tr key={u.id} className="hover:bg-slate-50">
                      <td className="px-5 py-3">
                        <div className="font-semibold text-slate-800">{u.fullName || '—'}</div>
                        <div className="text-xs text-slate-400">@{u.username}</div>
                      </td>
                      <td className="px-5 py-3 text-slate-600">{u.phone || '—'}</td>
                      <td className="px-5 py-3">
                        {u.roles?.[0] ? <Badge tone="blue">{u.roles[0]}</Badge> : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="px-5 py-3">
                        {u.isActive ? (
                          <Badge tone="green">Active</Badge>
                        ) : (
                          <Badge tone="gray">Inactive</Badge>
                        )}
                      </td>
                      <td className="px-5 py-3 text-slate-600">{fmtDate(u.createdAt)}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <Button size="sm" variant="secondary" onClick={() => setEditUser(u)}>
                            <IconEdit className="h-4 w-4" />
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant={u.isActive ? 'danger' : 'success'}
                            disabled={busy}
                            onClick={() => toggleStatus(u)}
                          >
                            {busy ? (
                              <>
                                <Spinner className="h-4 w-4 text-current" />
                                <span>Saving…</span>
                              </>
                            ) : u.isActive ? (
                              'Deactivate'
                            ) : (
                              'Activate'
                            )}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <CreateUserModal
        open={createOpen}
        roles={roles}
        users={users}
        onClose={() => setCreateOpen(false)}
        onCreated={onCreated}
      />

      <EditUserModal
        user={editUser}
        roles={roles}
        users={users}
        onClose={() => setEditUser(null)}
        onUpdated={onUpdated}
      />
    </div>
  );
}

/* ----------------------------------------------- Shared profile fields */
const EMPLOYMENT_TYPES = ['Permanent', 'Temporary', 'Intern', 'Contract', 'Consultant'];
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

const EMPTY_PROFILE = {
  employeeId: '', designation: '', department: '', employmentType: '',
  dateOfJoining: '', reportingManagerId: '',
  dateOfBirth: '', bloodGroup: '', address: '', emergencyContact: '',
  esiNumber: '', epfNumber: '', panNumber: '', salaryCtc: '',
  bankName: '', bankAccount: '', bankIfsc: '',
};

// Prefill profile form state from an API user object (dates arrive as ISO).
const profileFromUser = (u) => ({
  employeeId: u.employeeId || '',
  designation: u.designation || '',
  department: u.department || '',
  employmentType: u.employmentType || '',
  dateOfJoining: u.dateOfJoining ? String(u.dateOfJoining).slice(0, 10) : '',
  reportingManagerId: u.reportingManagerId != null ? String(u.reportingManagerId) : '',
  dateOfBirth: u.dateOfBirth ? String(u.dateOfBirth).slice(0, 10) : '',
  bloodGroup: u.bloodGroup || '',
  address: u.address || '',
  emergencyContact: u.emergencyContact || '',
  esiNumber: u.esiNumber || '',
  epfNumber: u.epfNumber || '',
  panNumber: u.panNumber || '',
  salaryCtc: u.salaryCtc != null ? String(u.salaryCtc) : '',
  bankName: u.bankName || '',
  bankAccount: u.bankAccount || '',
  bankIfsc: u.bankIfsc || '',
});

const SectionTitle = ({ children }) => (
  <p className="col-span-full border-b border-slate-100 pb-1 pt-2 text-[11px] font-bold uppercase tracking-widest text-slate-400">
    {children}
  </p>
);

/* Employment + personal + statutory fields, shared by Create and Edit.
   `managers` = user list for the Reporting Manager dropdown; `selfId` excludes
   the user being edited from that list. */
function ProfileFields({ form, set, managers, selfId }) {
  return (
    <>
      <SectionTitle>Employment</SectionTitle>
      <Field label="Employee ID">
        <Input value={form.employeeId} onChange={(e) => set('employeeId', e.target.value)} placeholder="SESS-014" />
      </Field>
      <Field label="Date of joining">
        <Input type="date" value={form.dateOfJoining} onChange={(e) => set('dateOfJoining', e.target.value)} />
      </Field>
      <Field label="Designation">
        <Input value={form.designation} onChange={(e) => set('designation', e.target.value)} placeholder="Service Engineer" />
      </Field>
      <Field label="Department">
        <Input value={form.department} onChange={(e) => set('department', e.target.value)} placeholder="Service" />
      </Field>
      <Field label="Employment type">
        <Select value={form.employmentType} onChange={(e) => set('employmentType', e.target.value)}>
          <option value="">— Select —</option>
          {EMPLOYMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </Select>
      </Field>
      <Field label="Reporting manager">
        <Select value={form.reportingManagerId} onChange={(e) => set('reportingManagerId', e.target.value)}>
          <option value="">— None —</option>
          {(managers || [])
            .filter((m) => m.id !== selfId && m.isActive)
            .map((m) => <option key={m.id} value={m.id}>{m.fullName || m.username}</option>)}
        </Select>
      </Field>

      <SectionTitle>Personal</SectionTitle>
      <Field label="Date of birth">
        <Input type="date" value={form.dateOfBirth} onChange={(e) => set('dateOfBirth', e.target.value)} />
      </Field>
      <Field label="Blood group">
        <Select value={form.bloodGroup} onChange={(e) => set('bloodGroup', e.target.value)}>
          <option value="">— Select —</option>
          {BLOOD_GROUPS.map((b) => <option key={b} value={b}>{b}</option>)}
        </Select>
      </Field>
      <Field label="Emergency contact" hint="10-digit number.">
        <Input
          value={form.emergencyContact}
          onChange={(e) => set('emergencyContact', e.target.value.replace(/\D/g, '').slice(0, 10))}
          placeholder="9876543210"
          inputMode="numeric"
        />
      </Field>
      <div className="sm:col-span-1">
        <Field label="Address">
          <Input value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="Street, city, PIN" />
        </Field>
      </div>

      <SectionTitle>Statutory &amp; Bank</SectionTitle>
      <Field label="ESI number">
        <Input value={form.esiNumber} onChange={(e) => set('esiNumber', e.target.value)} />
      </Field>
      <Field label="EPF number">
        <Input value={form.epfNumber} onChange={(e) => set('epfNumber', e.target.value)} />
      </Field>
      <Field label="PAN number">
        <Input value={form.panNumber} onChange={(e) => set('panNumber', e.target.value.toUpperCase().slice(0, 10))} placeholder="ABCDE1234F" />
      </Field>
      <Field label="Salary / CTC (₹ per year)">
        <Input type="number" min="0" value={form.salaryCtc} onChange={(e) => set('salaryCtc', e.target.value)} placeholder="360000" />
      </Field>
      <Field label="Bank name">
        <Input value={form.bankName} onChange={(e) => set('bankName', e.target.value)} />
      </Field>
      <Field label="Bank account number">
        <Input value={form.bankAccount} onChange={(e) => set('bankAccount', e.target.value.replace(/\D/g, '').slice(0, 30))} inputMode="numeric" />
      </Field>
      <Field label="Bank IFSC">
        <Input value={form.bankIfsc} onChange={(e) => set('bankIfsc', e.target.value.toUpperCase().slice(0, 11))} placeholder="SBIN0001234" />
      </Field>
    </>
  );
}

/* --------------------------------------------------------- Create modal */
function CreateUserModal({ open, roles, users, onClose, onCreated }) {
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [roleName, setRoleName] = useState('');
  const [profile, setProfile] = useState(EMPTY_PROFILE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const setProf = (k, v) => setProfile((p) => ({ ...p, [k]: v }));

  // Reset the form each time the modal opens; default role to the first option.
  useEffect(() => {
    if (open) {
      setFullName('');
      setUsername('');
      setPhone('');
      setPassword('');
      setConfirm('');
      setShowPw(false);
      setRoleName(roles[0] || '');
      setProfile(EMPTY_PROFILE);
      setError('');
      setBusy(false);
    }
  }, [open, roles]);

  const canSubmit =
    fullName.trim() && username.trim() && password.length >= 6 && password === confirm &&
    roleName && (!phone || phone.length === 10) && !busy;

  const submit = async (e) => {
    e?.preventDefault();
    // Client-side validation before hitting the API.
    if (!fullName.trim() || !username.trim() || !roleName) {
      setError('All fields are required.');
      return;
    }
    if (phone && phone.length !== 10) {
      setError('Phone must be a 10-digit mobile number.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const created = await apiPost('/users', {
        username: username.trim(),
        fullName: fullName.trim(),
        phone: phone.trim(),
        password,
        roleName,
        ...profile,
        reportingManagerId: profile.reportingManagerId ? Number(profile.reportingManagerId) : null,
      });
      onCreated(created);
    } catch (err) {
      // 400 (bad input) / 409 (username exists / phone in use) messages surface here.
      setError(err.message || 'Could not create user.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onClose}
      title="Create User"
      width="max-w-3xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {busy ? (
              <>
                <Spinner className="h-4 w-4 text-current" />
                <span>Creating…</span>
              </>
            ) : (
              'Create user'
            )}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-2">
        {error && <div className="col-span-full"><ErrorNote>{error}</ErrorNote></div>}

        <SectionTitle>Account</SectionTitle>
        <Field label="Full name">
          <Input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Ilamparithi SDE"
            autoFocus
          />
        </Field>

        <Field label="Username">
          <Input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="ilamparithisde"
            autoComplete="off"
          />
        </Field>

        <Field label="Phone" hint="10-digit mobile used for OTP login on the employee app.">
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
            placeholder="9876543210"
            inputMode="numeric"
            autoComplete="off"
          />
        </Field>

        <Field label="Password" hint="Minimum 6 characters.">
          <PasswordInput
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            shown={showPw}
            onToggle={() => setShowPw((v) => !v)}
          />
        </Field>

        <Field
          label="Confirm password"
          hint={confirm && password !== confirm ? '✗ Passwords do not match' : confirm ? '✓ Passwords match' : 'Re-enter the same password.'}
        >
          <PasswordInput
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            shown={showPw}
            onToggle={() => setShowPw((v) => !v)}
          />
        </Field>

        <Field label="Role">
          <Select value={roleName} onChange={(e) => setRoleName(e.target.value)}>
            {roles.length === 0 && <option value="">No roles available</option>}
            {roles.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
        </Field>

        <ProfileFields form={profile} set={setProf} managers={users} selfId={null} />

        {/* Hidden submit so Enter submits the form. */}
        <button type="submit" className="hidden" disabled={!canSubmit} aria-hidden="true" />
      </form>
    </Modal>
  );
}

/* ----------------------------------------------------------- Edit modal */
function EditUserModal({ user, roles, users, onClose, onUpdated }) {
  const open = !!user;
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [roleName, setRoleName] = useState('');
  const [password, setPassword] = useState(''); // blank = keep current
  const [showResetPw, setShowResetPw] = useState(false);
  const [profile, setProfile] = useState(EMPTY_PROFILE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const setProf = (k, v) => setProfile((p) => ({ ...p, [k]: v }));

  // Prefill from the selected user whenever the modal opens.
  useEffect(() => {
    if (user) {
      setFullName(user.fullName || '');
      setUsername(user.username || '');
      setPhone(user.phone || '');
      setRoleName(user.roles?.[0] || roles[0] || '');
      setPassword('');
      setShowResetPw(false);
      setProfile(profileFromUser(user));
      setError('');
      setBusy(false);
    }
  }, [user, roles]);

  const canSubmit = username.trim() && roleName && (!phone || phone.length === 10) && !busy;

  const submit = async (e) => {
    e?.preventDefault();
    if (!username.trim()) {
      setError('Username is required.');
      return;
    }
    if (phone && phone.length !== 10) {
      setError('Phone must be a 10-digit mobile number.');
      return;
    }
    if (password && password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const body = {
        username: username.trim(),
        fullName: fullName.trim(),
        phone: phone.trim(),
        roleName,
        ...profile,
        reportingManagerId: profile.reportingManagerId ? Number(profile.reportingManagerId) : null,
      };
      if (password) body.password = password; // only send when resetting
      const updated = await apiPatch(`/users/${user.id}`, body);
      onUpdated(updated);
    } catch (err) {
      setError(err.message || 'Could not update user.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onClose}
      title="Edit User"
      width="max-w-3xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {busy ? (
              <>
                <Spinner className="h-4 w-4 text-current" />
                <span>Saving…</span>
              </>
            ) : (
              'Save changes'
            )}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-2">
        {error && <div className="col-span-full"><ErrorNote>{error}</ErrorNote></div>}

        <SectionTitle>Account</SectionTitle>
        <Field label="Full name">
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Ilamparithi SDE" autoFocus />
        </Field>

        <Field label="Username">
          <Input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" />
        </Field>

        <Field label="Phone" hint="10-digit mobile used for OTP login. Leave blank to clear.">
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
            placeholder="9876543210"
            inputMode="numeric"
          />
        </Field>

        <Field label="Role">
          <Select value={roleName} onChange={(e) => setRoleName(e.target.value)}>
            {roles.length === 0 && <option value="">No roles available</option>}
            {roles.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Reset password" hint="Leave blank to keep the current password.">
          <PasswordInput
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            shown={showResetPw}
            onToggle={() => setShowResetPw((v) => !v)}
          />
        </Field>
        <div /> {/* grid filler */}

        <ProfileFields form={profile} set={setProf} managers={users} selfId={user?.id ?? null} />

        <button type="submit" className="hidden" disabled={!canSubmit} aria-hidden="true" />
      </form>
    </Modal>
  );
}
