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
import { IconUserPlus, IconUserCircle, IconSearch, IconEdit } from '../components/icons';

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
        onClose={() => setCreateOpen(false)}
        onCreated={onCreated}
      />

      <EditUserModal
        user={editUser}
        roles={roles}
        onClose={() => setEditUser(null)}
        onUpdated={onUpdated}
      />
    </div>
  );
}

/* --------------------------------------------------------- Create modal */
function CreateUserModal({ open, roles, onClose, onCreated }) {
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [roleName, setRoleName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Reset the form each time the modal opens; default role to the first option.
  useEffect(() => {
    if (open) {
      setFullName('');
      setUsername('');
      setPassword('');
      setRoleName(roles[0] || '');
      setError('');
      setBusy(false);
    }
  }, [open, roles]);

  const canSubmit =
    fullName.trim() && username.trim() && password.length >= 6 && roleName && !busy;

  const submit = async (e) => {
    e?.preventDefault();
    // Client-side validation before hitting the API.
    if (!fullName.trim() || !username.trim() || !roleName) {
      setError('All fields are required.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const created = await apiPost('/users', {
        username: username.trim(),
        fullName: fullName.trim(),
        password,
        roleName,
      });
      onCreated(created);
    } catch (err) {
      // 400 (bad input) / 409 (username exists) messages surface here.
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
      <form onSubmit={submit} className="space-y-4">
        {error && <ErrorNote>{error}</ErrorNote>}

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

        <Field label="Password" hint="Minimum 6 characters.">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
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

        {/* Hidden submit so Enter submits the form. */}
        <button type="submit" className="hidden" disabled={!canSubmit} aria-hidden="true" />
      </form>
    </Modal>
  );
}

/* ----------------------------------------------------------- Edit modal */
function EditUserModal({ user, roles, onClose, onUpdated }) {
  const open = !!user;
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [roleName, setRoleName] = useState('');
  const [password, setPassword] = useState(''); // blank = keep current
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Prefill from the selected user whenever the modal opens.
  useEffect(() => {
    if (user) {
      setFullName(user.fullName || '');
      setUsername(user.username || '');
      setPhone(user.phone || '');
      setRoleName(user.roles?.[0] || roles[0] || '');
      setPassword('');
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
      <form onSubmit={submit} className="space-y-4">
        {error && <ErrorNote>{error}</ErrorNote>}

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
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
          />
        </Field>

        <button type="submit" className="hidden" disabled={!canSubmit} aria-hidden="true" />
      </form>
    </Modal>
  );
}
