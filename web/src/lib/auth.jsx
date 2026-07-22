import { createContext, useContext, useMemo, useState } from 'react';
import { apiPost, getStoredAuth, setStoredAuth } from './api';

// The one role the backend actually authorizes for /admin and /users endpoints.
// (See backend: requireRole('Technical Director / Admin').)
export const ADMIN_ROLE = 'Technical Director / Admin';

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

  const value = useMemo(() => {
    const roles = auth?.roles || [];
    return {
      auth,
      roles,
      isAuthed: !!auth && !isExpired(auth),
      isAdmin: roles.includes(ADMIN_ROLE),
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
