import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { cx } from './ui';
import {
  IconLayoutDashboard,
  IconUsers,
  IconCalendar,
  IconMap,
  IconGift,
  IconLogOut,
  IconChevronLeft,
} from './icons';

const NAV = [
  { to: '/', label: 'Dashboard', icon: IconLayoutDashboard, end: true },
  { to: '/users', label: 'User Management', icon: IconUsers },
  { to: '/attendance', label: 'Team Attendance', icon: IconCalendar },
  { to: '/trail', label: 'Team Trail', icon: IconMap },
  { to: '/holidays', label: 'Holidays', icon: IconGift },
];

const COLLAPSE_KEY = 'sess_sidebar_collapsed';

export default function Layout() {
  const { auth, logout } = useAuth();
  const navigate = useNavigate();

  // Collapsed state persists across reloads so the admin's preference sticks.
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
    } catch {
      /* ignore storage failures */
    }
  }, [collapsed]);

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
      {/* Sidebar (desktop) */}
      <aside
        className={cx(
          'sticky top-0 hidden h-screen flex-col overflow-hidden bg-gradient-to-b from-brand-900 via-brand-900 to-[#101a44] transition-[width] duration-300 ease-in-out md:flex',
          collapsed ? 'w-20' : 'w-64'
        )}
      >
        {/* Brand + collapse toggle */}
        <div
          className={cx(
            'flex shrink-0 gap-3 px-4 py-6',
            collapsed ? 'flex-col items-center' : 'items-center'
          )}
        >
          <div className="flex items-center justify-center w-10 h-10 text-lg font-extrabold text-white shrink-0 rounded-xl bg-white/10 ring-1 ring-inset ring-white/15">
            S
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold leading-tight text-white truncate">Sri Easwari Sceientific Solutions Pvt Ltd</p>
              {/* <p className="truncate text-[11px] text-brand-200/80">Attendance &amp; HR Console</p> */}
            </div>
          )}
          <button
            onClick={() => setCollapsed((c) => !c)}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
            className={cx(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-brand-200/80 ring-1 ring-inset ring-white/10 transition hover:bg-white/10 hover:text-white',
              collapsed ? '' : 'ml-auto'
            )}
          >
            <IconChevronLeft className={cx('h-5 w-5 transition-transform', collapsed && 'rotate-180')} />
          </button>
        </div>

        {!collapsed && (
          <p className="shrink-0 px-6 pb-2 pt-3 text-[10px] font-semibold uppercase tracking-widest text-brand-300/60">
            Menu
          </p>
        )}

        <nav className={cx('flex-1 space-y-1 overflow-y-auto py-2', collapsed ? 'px-2' : 'px-3')}>
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              title={collapsed ? label : undefined}
              className={({ isActive }) =>
                cx(
                  'group relative flex items-center rounded-xl text-sm font-medium transition',
                  collapsed ? 'justify-center px-0 py-3' : 'gap-3 px-3 py-2.5',
                  isActive
                    ? 'bg-white/10 text-white shadow-sm ring-1 ring-inset ring-white/10'
                    : 'text-brand-200/90 hover:bg-white/5 hover:text-white'
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={cx(
                      'absolute left-0 top-1/2 h-6 -translate-y-1/2 rounded-r-full bg-white transition-all',
                      isActive ? 'w-1 opacity-100' : 'w-0 opacity-0'
                    )}
                  />
                  <Icon className="w-5 h-5 shrink-0" />
                  {!collapsed && label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* User card + sign out (pinned to bottom) */}
        <div
          className={cx(
            'shrink-0 rounded-2xl bg-white/5 ring-1 ring-inset ring-white/10',
            collapsed ? 'mx-2 mb-3 mt-1 flex flex-col items-center gap-2 p-2' : 'm-3 p-3'
          )}
        >
          {collapsed ? (
            <>
              <div
                title={auth?.fullName || 'Admin'}
                className="flex items-center justify-center text-sm font-bold text-white rounded-full h-9 w-9 bg-gradient-to-br from-brand-400 to-brand-600 ring-2 ring-white/10"
              >
                {initials}
              </div>
              <button
                onClick={onLogout}
                title="Sign out"
                aria-label="Sign out"
                className="flex items-center justify-center transition border rounded-lg h-9 w-9 border-white/10 text-brand-100 hover:bg-white/10"
              >
                <IconLogOut className="w-4 h-4" />
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center text-sm font-bold text-white rounded-full h-9 w-9 bg-gradient-to-br from-brand-400 to-brand-600 ring-2 ring-white/10">
                  {initials}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{auth?.fullName || 'Admin'}</p>
                  <p className="truncate text-[11px] text-brand-200/70">{auth?.roles?.[0] || 'Administrator'}</p>
                </div>
              </div>
              <button
                onClick={onLogout}
                className="flex items-center justify-center w-full gap-2 px-3 py-2 mt-3 text-sm font-medium transition border rounded-lg border-white/10 text-brand-100 hover:bg-white/10"
              >
                <IconLogOut className="w-4 h-4" />
                Sign out
              </button>
            </>
          )}
        </div>
      </aside>

      {/* Main column */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Mobile top bar */}
        <header className="flex items-center justify-between px-4 py-3 bg-brand-900 md:hidden">
          <div className="flex items-center gap-2 text-white">
            <div className="flex items-center justify-center w-8 h-8 font-extrabold rounded-lg bg-white/10 ring-1 ring-inset ring-white/15">
              S
            </div>
            <span className="font-bold">SESS Admin</span>
          </div>
          <button onClick={onLogout} className="flex items-center gap-1.5 text-sm font-medium text-brand-100">
            <IconLogOut className="w-4 h-4" />
            Sign out
          </button>
        </header>

        {/* Mobile nav strip */}
        <nav className="flex gap-1 px-2 py-2 overflow-x-auto border-b border-slate-200 bg-white/80 backdrop-blur md:hidden">
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
              <Icon className="w-4 h-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        <main className="flex-1 p-4 overflow-y-auto sm:p-6 lg:p-8">
          <div className="mx-auto max-w-7xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
