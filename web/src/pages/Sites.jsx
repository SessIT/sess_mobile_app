import { useCallback, useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Circle, useMap, useMapEvents } from 'react-leaflet';

// Leaflet default marker icons for Vite bundling (CSS is imported once in main.jsx).
import L from 'leaflet';
import icon from 'leaflet/dist/images/marker-icon.png';
import icon2x from 'leaflet/dist/images/marker-icon-2x.png';
import shadow from 'leaflet/dist/images/marker-shadow.png';
L.Icon.Default.mergeOptions({ iconUrl: icon, iconRetinaUrl: icon2x, shadowUrl: shadow });

import { apiGet, apiPost, apiPatch, api } from '../lib/api';
import {
  Card,
  Button,
  Field,
  Input,
  Badge,
  Loading,
  EmptyState,
  ErrorNote,
  PageHeader,
  Modal,
  Spinner,
} from '../components/ui';
import { IconMapPin, IconPlus, IconEdit, IconTrash } from '../components/icons';

/* Parse "13.082700, 80.270700" (as copied from Google Maps) into { lat, lng }. */
function parseLatLng(text) {
  const m = String(text || '').trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = parseFloat(m[1]);
  const lng = parseFloat(m[2]);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

const mapsUrl = (s) => `https://www.google.com/maps?q=${s.lat},${s.lng}`;

/* Same clamp the backend applies, so the preview circle and the saved value
   always agree with what the admin typed (or shows them the corrected value). */
const RADIUS_MIN = 20;
const RADIUS_MAX = 5000;
const clampRadius = (v) => {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n) || n <= 0) return 100;
  return Math.min(Math.max(n, RADIUS_MIN), RADIUS_MAX);
};

/* Map helpers for the editor preview. Must live inside <MapContainer>. */
function Recenter({ lat, lng }) {
  const map = useMap();
  useEffect(() => { map.setView([lat, lng]); }, [lat, lng, map]);
  return null;
}
function ClickToSet({ onPick }) {
  useMapEvents({ click: (e) => onPick(e.latlng) });
  return null;
}

// Customer Sites — authorized punch-in/out locations. Employees can only punch
// within a site's radius (+ GPS accuracy buffer), enforced by the backend.
export default function Sites() {
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editor, setEditor] = useState(null); // null | {} (new) | site (edit)
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    apiGet('/sites?all=1')
      .then((list) => setSites(Array.isArray(list) ? list : []))
      .catch((e) => setError(e.message || 'Failed to load sites'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleActive = async (s) => {
    setBusyId(s.id);
    setError('');
    try {
      const updated = await apiPatch(`/sites/${s.id}`, { isActive: !s.isActive });
      setSites((prev) => prev.map((x) => (x.id === s.id ? updated : x)));
    } catch (e) {
      setError(e.message || 'Could not update site');
    } finally {
      // Only clear if it is still OUR id — another row's action may be in flight.
      setBusyId((prev) => (prev === s.id ? null : prev));
    }
  };

  const remove = async (s) => {
    if (!window.confirm(`Delete site "${s.name}"? Employees will no longer be able to punch there.`)) return;
    setBusyId(s.id);
    setError('');
    try {
      await api(`/sites/${s.id}`, { method: 'DELETE' });
      setSites((prev) => prev.filter((x) => x.id !== s.id));
    } catch (e) {
      setError(e.message || 'Could not delete site');
    } finally {
      setBusyId((prev) => (prev === s.id ? null : prev));
    }
  };

  const activeCount = sites.filter((s) => s.isActive).length;

  return (
    <div>
      <PageHeader
        title="Customer Sites"
        subtitle="Authorized punch-in/out locations — employees can only punch within a site's radius."
        actions={
          <Button onClick={() => setEditor({})}>
            <IconPlus className="h-4 w-4" />
            Add Site
          </Button>
        }
      />

      {error && (
        <div className="mb-4">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}

      {!loading && sites.length > 0 && (
        <div className="mb-4 flex gap-2">
          <Badge tone="blue">{sites.length} sites</Badge>
          <Badge tone="green">{activeCount} active</Badge>
          {activeCount === 0 && (
            <Badge tone="amber">Geofence OFF — no active sites, punching allowed anywhere</Badge>
          )}
        </div>
      )}

      <Card>
        {loading ? (
          <Loading label="Loading sites…" />
        ) : sites.length === 0 ? (
          <EmptyState
            title="No sites yet"
            hint="Add your first customer site. Until at least one active site exists, employees can punch from anywhere."
            icon={<IconMapPin />}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-3 font-semibold">Site</th>
                  <th className="px-5 py-3 font-semibold">Coordinates</th>
                  <th className="px-5 py-3 text-center font-semibold">Radius</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sites.map((s) => {
                  const busy = busyId === s.id;
                  return (
                    <tr key={s.id} className="hover:bg-slate-50">
                      <td className="px-5 py-3">
                        <p className="font-semibold text-slate-800">{s.name}</p>
                        {s.address && <p className="max-w-[18rem] truncate text-xs text-slate-400">{s.address}</p>}
                      </td>
                      <td className="px-5 py-3">
                        <a
                          href={mapsUrl(s)}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-xs text-brand-700 underline-offset-2 hover:underline"
                          title="Open in Google Maps"
                        >
                          {s.lat.toFixed(5)}, {s.lng.toFixed(5)}
                        </a>
                      </td>
                      <td className="px-5 py-3 text-center tabular-nums text-slate-600">{s.radiusM} m</td>
                      <td className="px-5 py-3">
                        {s.isActive ? <Badge tone="green">Active</Badge> : <Badge tone="gray">Inactive</Badge>}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <Button size="sm" variant="secondary" onClick={() => setEditor(s)} title="Edit site">
                            <IconEdit className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant={s.isActive ? 'danger' : 'success'}
                            disabled={busy}
                            onClick={() => toggleActive(s)}
                          >
                            {busy ? <Spinner className="h-4 w-4 text-current" /> : s.isActive ? 'Deactivate' : 'Activate'}
                          </Button>
                          <Button size="sm" variant="danger" disabled={busy} onClick={() => remove(s)} title="Delete site">
                            <IconTrash className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <SiteEditorModal
        editor={editor}
        onClose={() => setEditor(null)}
        onSaved={() => { setEditor(null); load(); }}
      />
    </div>
  );
}

/* ------------------------------------------------------ Add / Edit modal */
function SiteEditorModal({ editor, onClose, onSaved }) {
  const open = editor !== null;
  const isEdit = !!editor?.id;

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [coords, setCoords] = useState(''); // "lat, lng" paste field
  const [radius, setRadius] = useState('100');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Location search (geocoding via our backend proxy)
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState('');
  const [picked, setPicked] = useState(null); // last picked query — suppresses re-search

  useEffect(() => {
    if (editor !== null) {
      setName(editor.name || '');
      setAddress(editor.address || '');
      setCoords(editor.id ? `${editor.lat}, ${editor.lng}` : '');
      setRadius(String(editor.radiusM ?? 100));
      setError('');
      setBusy(false);
      setQuery('');
      setResults([]);
      setSearching(false);
      setSearchErr('');
      setPicked(null);
    }
  }, [editor]);

  // Debounced search-as-you-type. `stale` guards against a slow earlier request
  // resolving after a newer one and overwriting fresher results.
  useEffect(() => {
    if (editor === null) return;
    const q = query.trim();
    if (q.length < 3 || q === picked) { setResults([]); setSearching(false); setSearchErr(''); return; }
    let stale = false;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const r = await apiGet(`/geo/search?q=${encodeURIComponent(q)}`);
        if (stale) return;
        const list = r.results || [];
        setResults(list);
        setSearchErr(list.length === 0
          ? 'No match found — try a nearby area or landmark, or paste coordinates from Google Maps below.'
          : '');
      } catch (err) {
        if (stale) return;
        setResults([]);
        setSearchErr(err.message || 'Search unavailable — paste coordinates from Google Maps below.');
      } finally {
        if (!stale) setSearching(false);
      }
    }, 450);
    return () => { stale = true; clearTimeout(t); };
  }, [query, picked, editor]);

  const pickResult = (r) => {
    setCoords(`${r.lat.toFixed(6)}, ${r.lng.toFixed(6)}`);
    if (!name.trim()) setName(r.name.slice(0, 80));
    if (!address.trim()) setAddress(String(r.displayName || '').slice(0, 200));
    setQuery(r.name);
    setPicked(r.name);
    setResults([]);
    setSearchErr('');
  };

  const parsed = parseLatLng(coords);
  const canSubmit = name.trim() && parsed && !busy;

  const submit = async (e) => {
    e?.preventDefault();
    if (!name.trim()) { setError('Site name is required.'); return; }
    if (!parsed) { setError('Paste valid coordinates as "latitude, longitude" — e.g. 13.082700, 80.270700'); return; }
    setBusy(true);
    setError('');
    try {
      const body = {
        name: name.trim(),
        address: address.trim(),
        lat: parsed.lat,
        lng: parsed.lng,
        radiusM: clampRadius(radius),
      };
      if (isEdit) await apiPatch(`/sites/${editor.id}`, body);
      else await apiPost('/sites', body);
      onSaved();
    } catch (err) {
      setError(err.message || 'Could not save the site.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onClose}
      title={isEdit ? 'Edit Site' : 'Add Customer Site'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {busy ? (
              <>
                <Spinner className="h-4 w-4 text-current" />
                <span>Saving…</span>
              </>
            ) : (
              isEdit ? 'Save changes' : 'Add site'
            )}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {error && <ErrorNote>{error}</ErrorNote>}

        {/* Location search — type an area/landmark and pick a result */}
        <Field label="Search location" hint="Type the area or landmark — e.g. “Iyyappanthangal, Chennai”. Pick a result to auto-fill everything.">
          <div className="relative">
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                // Editing after a pick re-arms the search for that text.
                if (picked !== null && e.target.value !== picked) setPicked(null);
              }}
              // Enter here means "search", never "save the site".
              onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
              placeholder="Search area, landmark or address…"
              autoFocus
            />
            {searching && (
              <Spinner className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-500" />
            )}
          </div>
        </Field>

        {results.length > 0 && (
          <div className="max-h-44 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200 shadow-sm">
            {results.map((r, i) => (
              <button
                type="button"
                key={i}
                onClick={() => pickResult(r)}
                className="block w-full px-3 py-2 text-left transition hover:bg-brand-50"
              >
                <span className="text-sm font-medium text-slate-700">{r.name}</span>
                <span className="block truncate text-xs text-slate-400">{r.displayName}</span>
              </button>
            ))}
          </div>
        )}
        {searchErr && <p className="text-xs text-amber-600">{searchErr}</p>}

        <Field label="Site / customer name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ABC Industries — Pune" />
        </Field>

        <Field label="Address" hint="Optional, for reference.">
          <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Plot 12, MIDC, Pune" />
        </Field>

        <Field
          label="Coordinates"
          hint={parsed
            ? `✓ Lat ${parsed.lat}, Lng ${parsed.lng}`
            : 'Auto-filled by search — or paste "latitude, longitude" from Google Maps (right-click the spot → copy coordinates).'}
        >
          <Input
            value={coords}
            onChange={(e) => setCoords(e.target.value)}
            placeholder="18.520430, 73.856743"
            className={coords && !parsed ? 'border-red-300' : ''}
          />
        </Field>

        {/* Live map preview — click to fine-tune the pin; circle = punch radius */}
        {parsed && (
          <div>
            <div className="overflow-hidden rounded-xl border border-slate-200" style={{ height: 220 }}>
              <MapContainer
                center={[parsed.lat, parsed.lng]}
                zoom={16}
                scrollWheelZoom
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution="&copy; OpenStreetMap contributors"
                />
                <Marker position={[parsed.lat, parsed.lng]} />
                <Circle
                  center={[parsed.lat, parsed.lng]}
                  radius={clampRadius(radius)}
                  pathOptions={{ color: '#1E3A8A', fillOpacity: 0.08 }}
                />
                <Recenter lat={parsed.lat} lng={parsed.lng} />
                <ClickToSet onPick={(ll) => setCoords(`${ll.lat.toFixed(6)}, ${ll.lng.toFixed(6)}`)} />
              </MapContainer>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Click anywhere on the map to fine-tune the exact spot. The circle is the punch-in radius.
            </p>
          </div>
        )}

        <Field
          label="Radius (meters)"
          hint={`Punch allowed within this distance + the phone's GPS accuracy. Allowed ${RADIUS_MIN}–${RADIUS_MAX} m — use a larger radius for big factory campuses.`}
        >
          <Input
            type="number"
            min={RADIUS_MIN}
            max={RADIUS_MAX}
            step="10"
            value={radius}
            onChange={(e) => setRadius(e.target.value)}
            // Snap to the allowed range on blur so the saved value never
            // silently differs from what the admin sees.
            onBlur={(e) => setRadius(String(clampRadius(e.target.value)))}
            className="w-32"
          />
        </Field>

        {parsed && (
          <a
            href={`https://www.google.com/maps?q=${parsed.lat},${parsed.lng}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 underline-offset-2 hover:underline"
          >
            <IconMapPin className="h-3.5 w-3.5" />
            Preview this point in Google Maps
          </a>
        )}

        <button type="submit" className="hidden" disabled={!canSubmit} aria-hidden="true" />
      </form>
    </Modal>
  );
}
