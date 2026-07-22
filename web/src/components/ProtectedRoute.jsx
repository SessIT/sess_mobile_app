import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { IconLock } from './icons';

// Guards the admin area. Not authed -> /login. Authed but not admin -> a clear
// "not authorized" notice (the backend would 403 these users anyway).
export default function ProtectedRoute() {
  const { isAuthed, isAdmin } = useAuth();
  const location = useLocation();

  if (!isAuthed) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-slate-400 shadow-card ring-1 ring-inset ring-slate-200">
          <IconLock className="h-8 w-8" />
        </div>
        <h1 className="text-xl font-bold text-slate-800">Admin access required</h1>
        <p className="max-w-sm text-sm text-slate-500">
          This console is for the Technical Director / Admin role. Your account is signed in but does
          not have admin permissions.
        </p>
        <a href="/login" className="mt-2 text-sm font-semibold text-brand-700 hover:underline">
          Sign in with a different account
        </a>
      </div>
    );
  }

  return <Outlet />;
}
