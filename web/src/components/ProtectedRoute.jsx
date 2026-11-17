import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { NAV } from './nav';
import { IconLock } from './icons';

// Guards the console. Not authed -> /login. Admins, users whose role has any
// admin-area permission, and reporting managers get in; anyone else gets a
// clear "not authorized" notice (the backend would 403 them anyway).
export default function ProtectedRoute() {
  const { isAuthed, isAdmin, isManager, perms } = useAuth();
  const location = useLocation();

  if (!isAuthed) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (!isAdmin && !isManager && perms.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-slate-400 shadow-card ring-1 ring-inset ring-slate-200">
          <IconLock className="h-8 w-8" />
        </div>
        <h1 className="text-xl font-bold text-slate-800">No console access</h1>
        <p className="max-w-sm text-sm text-slate-500">
          Your account is signed in but your role has no admin areas and no team reports to you.
          Use the mobile app for your own attendance and requests, or ask an Admin for access.
        </p>
        <a href="/login" className="mt-2 text-sm font-semibold text-brand-700 hover:underline">
          Sign in with a different account
        </a>
      </div>
    );
  }

  return <Outlet />;
}

// The first page this user may open — where a forbidden URL sends them.
export function useHomePath() {
  const { can, isManager } = useAuth();
  const first = NAV.find((n) => (n.who === 'manager' ? isManager : n.who === 'all' ? false : can(n.perm)));
  return first?.to || (isManager ? '/my-team' : '/chat');
}

// Nested route guard for one admin area.
export function PermRoute({ perm }) {
  const { can } = useAuth();
  const home = useHomePath();
  return can(perm) ? <Outlet /> : <Navigate to={home} replace />;
}

// Back-compat: admin-only pages.
export function AdminRoute() {
  return <PermRoute perm="admin" />;
}
