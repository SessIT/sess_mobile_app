import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import {
  IconLayoutDashboard,
  IconUsers,
  IconCalendar,
  IconMap,
  IconLogOut,
} from './icons';

const NAV = [
  { to: '/', label: 'Dashboard', icon: IconLayoutDashboard, end: true },
  { to: '/users', label: 'User Management', icon: IconUsers },
  { to: '/attendance', label: 'Team Attendance', icon: IconCalendar },
  { to: '/trail', label: 'Team Trail', icon: IconMap },
];

export default function Layout() {
  const { auth, logout } = useAuth();
  const navigate = useNavigate();

  const onLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const initials = (auth?.fullName || 'A')
    .split(' ')
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="hidden w-64 flex-col bg-gradient-to-b from-brand-900 via-brand-900 to-[#101a44] md:flex">
        <div className="flex items-center gap-3 px-6 py-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-lg font-extrabold text-white ring-1 ring-inset ring-white/15">
            S
          </div>
          <div>
            <p className="text-sm font-bold leading-tight text-white">SESS Admin</p>
            <p className="text-[11px] text-brand-200/80">Attendance &amp; HR Console</p>
          </div>
        </div>

        <p className="px-6 pb-2 pt-3 text-[10px] font-semibold uppercase tracking-widest text-brand-300/60">
          Menu
        </p>
        <nav className="flex-1 space-y-1 px-3">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                [
                  'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition',
                  isActive
                    ? 'bg-white/10 text-white shadow-sm ring-1 ring-inset ring-white/10'
                    : 'text-brand-200/90 hover:bg-white/5 hover:text-white',
                ].join(' ')
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={[
                      'absolute left-0 top-1/2 h-6 -translate-y-1/2 rounded-r-full bg-white transition-all',
                      isActive ? 'w-1 opacity-100' : 'w-0 opacity-0',
                    ].join(' ')}
                  />
                  <Icon className="h-5 w-5 shrink-0" />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="m-3 rounded-2xl bg-white/5 p-3 ring-1 ring-inset ring-white/10">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-sm font-bold text-white ring-2 ring-white/10">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">{auth?.fullName || 'Admin'}</p>
              <p className="truncate text-[11px] text-brand-200/70">{auth?.roles?.[0] || 'Administrator'}</p>
            </div>
          </div>
          <button
            onClick={onLogout}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm font-medium text-brand-100 transition hover:bg-white/10"
          >
            <IconLogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="flex items-center justify-between bg-brand-900 px-4 py-3 md:hidden">
          <div className="flex items-center gap-2 text-white">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 font-extrabold ring-1 ring-inset ring-white/15">
              S
            </div>
            <span className="font-bold">SESS Admin</span>
          </div>
          <button onClick={onLogout} className="flex items-center gap-1.5 text-sm font-medium text-brand-100">
            <IconLogOut className="h-4 w-4" />
            Sign out
          </button>
        </header>

        {/* Mobile nav strip */}
        <nav className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-white/80 px-2 py-2 backdrop-blur md:hidden">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                [
                  'flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold',
                  isActive ? 'bg-brand-100 text-brand-800' : 'text-slate-500',
                ].join(' ')
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-7xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
