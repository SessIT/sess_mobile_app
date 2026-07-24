import { useEffect, useMemo, useRef, useState } from 'react';
import { apiGet, apiPost, api } from '../lib/api';
import { todayIST, WEEKDAYS } from '../lib/format';
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
import { IconPlus, IconUpload, IconTrash, IconGift } from '../components/icons';

const CURRENT_YEAR = Number(todayIST().slice(0, 4));
// A small span around the current year for the year picker.
const YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - 1 + i);

// "15 Aug 2026" from a Date/ISO — rendered in UTC because holidays are date-only
// (@db.Date → UTC midnight); using local/IST could shift the day.
const fmtHolidayDate = (iso) =>
  new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
const weekdayOf = (iso) => WEEKDAYS[new Date(iso).getUTCDay()];
const isPast = (iso) => new Date(iso).toISOString().slice(0, 10) < todayIST();

// Holiday calendar — admins add holidays manually or import an Excel/CSV file.
export default function Holidays() {
  const [year, setYear] = useState(CURRENT_YEAR);
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const load = async (y) => {
    setLoading(true);
    setError('');
    try {
      const res = await apiGet(`/holidays?year=${y}`);
      setHolidays(Array.isArray(res.holidays) ? res.holidays : []);
    } catch (err) {
      setError(err.message || 'Failed to load holidays');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(year);
  }, [year]);

  const remove = async (h) => {
    if (!window.confirm(`Delete "${h.name}" (${fmtHolidayDate(h.date)})?`)) return;
    setDeletingId(h.id);
    setError('');
    try {
      await api(`/holidays/${h.id}`, { method: 'DELETE' });
      setHolidays((prev) => prev.filter((x) => x.id !== h.id));
    } catch (err) {
      setError(err.message || 'Could not delete holiday');
    } finally {
      setDeletingId(null);
    }
  };

  const upcomingCount = useMemo(() => holidays.filter((h) => !isPast(h.date)).length, [holidays]);

  return (
    <div>
      <PageHeader
        title="Holidays"
        subtitle="Company holiday calendar — visible to every employee"
        actions={
          <>
            <Button variant="secondary" onClick={() => setImportOpen(true)}>
              <IconUpload className="h-4 w-4" />
              Import Excel
            </Button>
            <Button onClick={() => setAddOpen(true)}>
              <IconPlus className="h-4 w-4" />
              Add Holiday
            </Button>
          </>
        }
      />

      {error && (
        <div className="mb-4">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}

      <div className="mb-4 flex items-center gap-3">
        <Field label="Year">
          <Select value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-40">
            {YEARS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        </Field>
        {!loading && holidays.length > 0 && (
          <div className="mt-6 flex gap-2">
            <Badge tone="blue">{holidays.length} total</Badge>
            <Badge tone="green">{upcomingCount} upcoming</Badge>
          </div>
        )}
      </div>

      <Card>
        {loading ? (
          <Loading label="Loading holidays…" />
        ) : holidays.length === 0 ? (
          <EmptyState
            title={`No holidays for ${year}`}
            hint="Add one manually or import an Excel file to get started."
            icon={<IconGift />}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-3 font-semibold">Date</th>
                  <th className="px-5 py-3 font-semibold">Day</th>
                  <th className="px-5 py-3 font-semibold">Holiday</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {holidays.map((h) => {
                  const past = isPast(h.date);
                  const busy = deletingId === h.id;
                  return (
                    <tr key={h.id} className={past ? 'text-slate-400 hover:bg-slate-50' : 'hover:bg-slate-50'}>
                      <td className="px-5 py-3 font-semibold text-slate-800">{fmtHolidayDate(h.date)}</td>
                      <td className="px-5 py-3 text-slate-600">{weekdayOf(h.date)}</td>
                      <td className="px-5 py-3 font-medium text-slate-700">{h.name}</td>
                      <td className="px-5 py-3">
                        {past ? <Badge tone="gray">Past</Badge> : <Badge tone="green">Upcoming</Badge>}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Button size="sm" variant="danger" disabled={busy} onClick={() => remove(h)}>
                          {busy ? <Spinner className="h-4 w-4 text-current" /> : <IconTrash className="h-4 w-4" />}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <AddHolidayModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSaved={(h) => {
          setAddOpen(false);
          // Reflect immediately if it belongs to the year on screen.
          if (new Date(h.date).getUTCFullYear() === year) {
            setHolidays((prev) =>
              [...prev.filter((x) => x.id !== h.id), h].sort((a, b) => new Date(a.date) - new Date(b.date))
            );
          }
        }}
      />

      <ImportHolidaysModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => {
          setImportOpen(false);
          load(year);
        }}
      />
    </div>
  );
}

/* --------------------------------------------------------- Add modal */
function AddHolidayModal({ open, onClose, onSaved }) {
  const [date, setDate] = useState(todayIST());
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setDate(todayIST());
      setName('');
      setError('');
      setBusy(false);
    }
  }, [open]);

  const canSubmit = date && name.trim() && !busy;

  const submit = async (e) => {
    e?.preventDefault();
    if (!date || !name.trim()) {
      setError('Date and holiday name are required.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const saved = await apiPost('/holidays', { date, name: name.trim() });
      onSaved(saved);
    } catch (err) {
      setError(err.message || 'Could not save holiday.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onClose}
      title="Add Holiday"
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
              'Save holiday'
            )}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {error && <ErrorNote>{error}</ErrorNote>}
        <Field label="Date">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} autoFocus />
        </Field>
        <Field label="Holiday name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Independence Day" />
        </Field>
        <button type="submit" className="hidden" aria-hidden="true" />
      </form>
    </Modal>
  );
}

/* --------------------------------------------------------- Import modal */
// Accepts an .xlsx/.xls/.csv file with two columns — a "date" column and a
// "holiday name" column (headers are matched loosely). Parsing happens here in
// the browser; only the cleaned rows are sent to the backend.
function ImportHolidaysModal({ open, onClose, onImported }) {
  const [rows, setRows] = useState([]); // [{ date, name }]
  const [skipped, setSkipped] = useState(0);
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  useEffect(() => {
    if (open) {
      setRows([]);
      setSkipped(0);
      setFileName('');
      setError('');
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }, [open]);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setError('');
    try {
      // Loaded on demand so the app boots even if `xlsx` isn't installed yet.
      const XLSX = await import('xlsx');
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array', cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json(ws, { defval: '' });
      const parsed = [];
      let bad = 0;
      for (const r of raw) {
        // Match columns loosely: any header containing "date" / "name" or "holiday".
        const keys = Object.keys(r);
        const dateKey = keys.find((k) => /date/i.test(k)) || keys[0];
        const nameKey = keys.find((k) => /name|holiday|occasion|festival/i.test(k)) || keys[1];
        const date = toYmd(r[dateKey]);
        const name = String(r[nameKey] ?? '').trim();
        if (!date || !name) { bad++; continue; }
        parsed.push({ date, name });
      }
      if (parsed.length === 0) {
        setError('No valid rows found. Expect a "Date" column and a "Holiday Name" column.');
        setRows([]);
        setSkipped(bad);
        return;
      }
      setRows(parsed);
      setSkipped(bad);
    } catch (err) {
      setError('Could not read that file. Please upload a valid .xlsx or .csv.');
      setRows([]);
    }
  };

  const submit = async () => {
    if (rows.length === 0) return;
    setBusy(true);
    setError('');
    try {
      const res = await apiPost('/holidays/import', { holidays: rows });
      onImported(res);
    } catch (err) {
      setError(err.message || 'Import failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onClose}
      title="Import Holidays from Excel"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={rows.length === 0 || busy}>
            {busy ? (
              <>
                <Spinner className="h-4 w-4 text-current" />
                <span>Importing…</span>
              </>
            ) : (
              `Import ${rows.length || ''} holiday${rows.length === 1 ? '' : 's'}`.trim()
            )}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <ErrorNote>{error}</ErrorNote>}

        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
          File should have a header row with a <b>Date</b> column (e.g. 2026-08-15) and a{' '}
          <b>Holiday Name</b> column. <code>.xlsx</code>, <code>.xls</code> and <code>.csv</code> are supported.
        </div>

        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-white px-4 py-8 text-center transition hover:border-brand-400 hover:bg-brand-50/40">
          <IconUpload className="h-6 w-6 text-brand-600" />
          <span className="text-sm font-semibold text-slate-700">
            {fileName || 'Choose an Excel / CSV file'}
          </span>
          <span className="text-xs text-slate-400">Click to browse</span>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={onFile}
          />
        </label>

        {(rows.length > 0 || skipped > 0) && (
          <div className="flex items-center gap-2">
            <Badge tone="green">{rows.length} ready</Badge>
            {skipped > 0 && <Badge tone="amber">{skipped} skipped</Badge>}
          </div>
        )}

        {rows.length > 0 && (
          <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-slate-50">
                <tr className="text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-2 font-semibold">Date</th>
                  <th className="px-4 py-2 font-semibold">Holiday</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2 text-slate-700">{fmtHolidayDate(r.date + 'T00:00:00Z')}</td>
                    <td className="px-4 py-2 text-slate-600">{r.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  );
}

/* Normalise a spreadsheet cell into a 'YYYY-MM-DD' string, or '' if unusable.
 * Handles: JS Date objects (cellDates), ISO strings, and dd/mm/yyyy or dd-mm-yyyy. */
function toYmd(v) {
  if (v == null || v === '') return '';
  if (v instanceof Date && !isNaN(v)) {
    // cellDates gives a Date at local midnight; read the calendar parts directly.
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/); // dd/mm/yyyy or dd-mm-yyyy
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const parsed = new Date(s);
  if (!isNaN(parsed)) return parsed.toISOString().slice(0, 10);
  return '';
}
