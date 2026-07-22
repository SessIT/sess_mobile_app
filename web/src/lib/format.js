// Formatting helpers. The backend stores UTC instants but the business runs in
// IST, so we always render times/dates in Asia/Kolkata to match the mobile app.

const TZ = 'Asia/Kolkata';

/** "09:32 AM" */
export function fmtTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TZ,
  });
}

/** "22 Jul 2026" */
export function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: TZ,
  });
}

/** "22 Jul, 09:32 AM" */
export function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: TZ })}, ${fmtTime(iso)}`;
}

/** Hours as "7.5 h" (accepts number). */
export function fmtHours(h) {
  if (h == null || Number.isNaN(h)) return '—';
  return `${Math.round(h * 100) / 100} h`;
}

/** Today's date in IST as YYYY-MM-DD (for <input type="date"> and API params). */
export function todayIST() {
  return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

/** Current month in IST as YYYY-MM. */
export function monthIST() {
  return todayIST().slice(0, 7);
}

/** Short weekday label from a 0..6 index (0 = Sunday). */
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
