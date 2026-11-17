import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { apiGet, apiPost, getStoredAuth, setStoredAuth } from './api';

// The role that can do everything. Other roles get the areas ticked for them
// in Roles & Permissions (backend: lib/permissions.js).
export const ADMIN_ROLE = 'Admin';

const AuthContext = createContext(null);

function isExpired(auth) {
  if (!auth?.expiresAt) return false;
  return new Date(auth.expiresAt).getTime() <= Date.now();
}

export function AuthProvider({ children }) {
  const [auth, setAuthState] = useState(() => {
    const stored = getStoredAuth();
    return stored && !isExpired(stored) ? stored : null;
  });

  // Persist to localStorage SYNCHRONOUSLY (not via useEffect) so the token is
  // available to api() the instant login resolves — before navigation triggers
  // the first authenticated fetch. Doing this in an effect caused a race where
  // the Dashboard's fetch ran before the token was written, got a 401, and the
  // 401 handler bounced the user straight back to /login.
  const setAuth = (next) => {
    setStoredAuth(next);
    setAuthState(next);
  };

  const login = async (username, password) => {
    const data = await apiPost('/auth/login', { username, password });
    setAuth(data);
    return data;
  };

  const logout = () => setAuth(null);

  // Roles / permissions can change after login — refresh them from the server
  // once per load so the menu matches what the API will actually allow.
  const token = auth?.accessToken;
  useEffect(() => {
    if (!token) return;
    apiGet('/me').then((me) => {
      const cur = getStoredAuth();
      if (!cur || cur.accessToken !== token) return;
      setAuth({ ...cur, roles: me.roles, permissions: me.permissions, isManager: me.isManager });
    }).catch(() => {});
  }, [token]);

  const value = useMemo(() => {
    const roles = auth?.roles || [];
    const isAdmin = roles.includes(ADMIN_ROLE);
    const perms = auth?.permissions || [];
    return {
      auth,
      roles,
      isAuthed: !!auth && !isExpired(auth),
      isAdmin,
      perms,
      // May this user open admin area `perm`? ('admin' = the Admin role itself.)
      can: (perm) => isAdmin || (perm !== 'admin' && perms.includes(perm)),
      // Reporting managers (anyone with direct reports) get the team pages.
      isManager: !!auth?.isManager,
      login,
      logout,
    };
  }, [auth]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
