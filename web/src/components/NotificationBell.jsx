import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet, apiPost } from '../lib/api';
import { cx } from './ui';

// The server stores the MOBILE screen to open; map it to the console's route.
const WEB_ROUTE = {
  TeamApprovals: '/team-approvals',
  LeaveApprovals: '/leaves',
  OtApprovals: '/overtime',
  CompOffApprovals: '/compoff',
  ExpenseApprovals: '/expenses',
  TeamAttendance: '/attendance',
  Helpdesk: '/helpdesk',
  Exits: '/exits',
  Announcements: '/announcements',
  Recruitment: '/recruitment',
  Interviews: '/recruitment',
};

const timeAgo = (iso) => {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const h = Math.round(mins / 60);
  return h < 24 ? `${h}h` : new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
};

const POLL_MS = 60000;

/* Bell + dropdown of the signed-in admin's / manager's updates (new requests,
 * manager approvals). `panelClass` positions the dropdown for where the bell
 * sits (sidebar vs. mobile top bar). */
export default function NotificationBell({ panelClass = 'left-full bottom-0 ml-3', dark = true }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef(null);
  const navigate = useNavigate();

  const load = useCallback(() => {
    apiGet('/notifications').then((r) => { setItems(r.items || []); setUnread(r.unread || 0); }).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const openItem = (n) => {
    if (!n.readAt) {
      apiPost('/notifications/read', { ids: [n.id] }).catch(() => {});
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)));
      setUnread((u) => Math.max(0, u - 1));
    }
    const to = WEB_ROUTE[n.data?.screen];
    setOpen(false);
    if (to) navigate(to);
  };

  const markAll = () => {
    apiPost('/notifications/read', { all: true }).catch(() => {});
    setItems((prev) => prev.map((x) => ({ ...x, readAt: x.readAt || new Date().toISOString() })));
    setUnread(0);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); if (!open) load(); }}
        title="Notifications"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        className={cx(
          'relative flex h-9 w-9 items-center justify-center rounded-lg transition',
          dark ? 'border border-white/10 text-brand-100 hover:bg-white/10' : 'text-slate-600 hover:bg-slate-100',
        )}
      >
        <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 01-3.46 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className={cx('absolute z-50 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white text-left shadow-xl', panelClass)}>
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
            <span className="text-sm font-semibold text-slate-800">Notifications</span>
            {unread > 0 && (
              <button type="button" onClick={markAll} className="text-xs font-semibold text-brand-700 hover:underline">
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-400">No notifications yet.</p>
            ) : items.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => openItem(n)}
                className={cx('flex w-full gap-3 border-b border-slate-50 px-4 py-3 text-left hover:bg-slate-50', !n.readAt && 'bg-brand-50/40')}
              >
                <span className={cx('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : 'bg-brand-600')} />
                <span className="min-w-0 flex-1">
                  <span className={cx('block text-sm text-slate-800', !n.readAt && 'font-semibold')}>{n.title}</span>
                  {n.body && <span className="block truncate text-xs text-slate-500">{n.body}</span>}
                </span>
                <span className="shrink-0 text-[11px] text-slate-400">{timeAgo(n.createdAt)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
