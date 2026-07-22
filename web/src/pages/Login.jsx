import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth, ADMIN_ROLE } from '../lib/auth';
import { Button, ErrorNote, Field, Input } from '../components/ui';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/';

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setBusy(true);
    setError('');
    try {
      const data = await login(username.trim(), password);
      if (!data.roles?.includes(ADMIN_ROLE)) {
        setError('This account is not an admin. Use the mobile app for employee login.');
        return;
      }
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message || 'Sign in failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* Brand panel */}
      <div className="relative hidden flex-1 flex-col justify-between overflow-hidden bg-gradient-to-br from-brand-900 via-brand-900 to-[#101a44] p-12 text-white lg:flex">
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-brand-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-brand-400/10 blur-3xl" />
        <div className="relative z-10 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-xl font-extrabold ring-1 ring-inset ring-white/15">
            S
          </div>
          <span className="text-lg font-bold">SESS Admin Console</span>
        </div>
        <div className="relative z-10">
          <h1 className="text-4xl font-extrabold leading-tight tracking-tight">
            Attendance, people &amp; location — <span className="text-brand-300">in one place.</span>
          </h1>
          <p className="mt-4 max-w-md text-brand-200/90">
            Manage employees, review daily attendance with punch photos, and trace field location
            trails. Employees punch from the mobile app; admins run everything from here.
          </p>
        </div>
        <p className="relative z-10 text-xs text-brand-300/80">© {new Date().getFullYear()} SESS. Internal use only.</p>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center lg:hidden">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-brand-800 text-xl font-extrabold text-white">
              S
            </div>
            <h1 className="mt-3 text-xl font-bold text-slate-800">SESS Admin Console</h1>
          </div>

          <h2 className="text-2xl font-bold text-slate-800">Welcome back</h2>
          <p className="mt-1 text-sm text-slate-500">Sign in with your admin username &amp; password.</p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <Field label="Username">
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                autoFocus
                autoComplete="username"
              />
            </Field>

            <Field label="Password">
              <div className="relative">
                <Input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="pr-16"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute inset-y-0 right-2 my-auto h-6 rounded px-2 text-xs font-semibold text-slate-500 hover:bg-slate-100"
                >
                  {showPw ? 'Hide' : 'Show'}
                </button>
              </div>
            </Field>

            {error && <ErrorNote>{error}</ErrorNote>}

            <Button type="submit" size="lg" className="w-full" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          <p className="mt-6 text-center text-xs text-slate-400">
            Employees don't sign in here — they use OTP login in the mobile app.
          </p>
        </div>
      </div>
    </div>
  );
}
