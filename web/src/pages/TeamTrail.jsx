// TeamTrail — employee GPS location trail on a Leaflet map.
// Admin picks an employee + date; we plot every captured point (ordered asc by
// capturedAt) as a polyline with start/latest markers, plus a scrollable list.
// Employees only track between punch-in and punch-out, so an empty day is normal.

import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from 'react-leaflet';

// Fix Leaflet's default marker icons for bundlers (Vite). The CSS itself is
// already imported once in main.jsx — do NOT import it again here.
import L from 'leaflet';
import icon from 'leaflet/dist/images/marker-icon.png';
import icon2x from 'leaflet/dist/images/marker-icon-2x.png';
import shadow from 'leaflet/dist/images/marker-shadow.png';
L.Icon.Default.mergeOptions({ iconUrl: icon, iconRetinaUrl: icon2x, shadowUrl: shadow });

import { apiGet } from '../lib/api';
import { fmtTime, fmtDateTime, todayIST } from '../lib/format';
import {
  Card,
  CardBody,
  Button,
  Field,
  Select,
  Input,
  Badge,
  Loading,
  EmptyState,
  ErrorNote,
  PageHeader,
} from '../components/ui';
import { IconMap, IconMapPin } from '../components/icons';

// Geographic centre of India — the default view before any trail is loaded.
const INDIA_CENTER = [20.5937, 78.9629];
const INDIA_ZOOM = 5;

/**
 * Inner map child: whenever the set of points changes, pan/zoom the map to fit
 * them. Must live inside <MapContainer> so useMap() can reach the instance.
 */
function FitBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    const latlngs = points.map((p) => [p.lat, p.lng]);
    if (latlngs.length === 1) {
      map.setView(latlngs[0], 16);
    } else {
      map.fitBounds(latlngs, { padding: [40, 40] });
    }
  }, [points, map]);
  return null;
}

/** "±12 m" or "—" when accuracy is unknown. */
function fmtAcc(acc) {
  if (acc == null || Number.isNaN(Number(acc))) return '—';
  return `±${Math.round(Number(acc))} m`;
}

export default function TeamTrail() {
  // Employee dropdown source.
  const [users, setUsers] = useState([]);
  const [usersErr, setUsersErr] = useState('');

  // Controls.
  const [userId, setUserId] = useState('');
  const [date, setDate] = useState(todayIST());
  // Bumped by the "Load trail" button to force a re-fetch of the same user/date.
  const [reloadKey, setReloadKey] = useState(0);

  // Trail data + async state.
  const [points, setPoints] = useState([]);
  const [loaded, setLoaded] = useState(false); // has a trail fetch completed?
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Load the employee list once on mount.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const list = await apiGet('/users');
        if (!alive) return;
        const sorted = [...list].sort((a, b) =>
          (a.fullName || a.username).localeCompare(b.fullName || b.username)
        );
        setUsers(sorted);
      } catch (err) {
        if (alive) setUsersErr(err.message || 'Failed to load employees');
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Fetch the trail. Auto-runs whenever the user or date changes, and re-runs
  // when the "Load trail" button bumps reloadKey (manual refresh).
  useEffect(() => {
    if (!userId || !date) {
      setPoints([]);
      setLoaded(false);
      return;
    }
    let alive = true;
    setLoading(true);
    setError('');
    (async () => {
      try {
        const data = await apiGet(`/location/user/${userId}?date=${date}`);
        if (!alive) return;
        // Keep only points with usable coordinates; API already sorts ascending.
        const clean = (Array.isArray(data) ? data : []).filter(
          (p) => p.lat != null && p.lng != null
        );
        setPoints(clean);
        setLoaded(true);
      } catch (err) {
        if (alive) {
          setError(err.message || 'Failed to load location trail');
          setPoints([]);
          setLoaded(false);
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [userId, date, reloadKey]);

  const positions = useMemo(() => points.map((p) => [p.lat, p.lng]), [points]);
  const start = points[0];
  const latest = points.length > 1 ? points[points.length - 1] : null;

  const selectedUser = users.find((u) => String(u.id) === String(userId));

  return (
    <div className="mx-auto w-full max-w-6xl overflow-x-hidden px-4 py-6">
      <PageHeader
        title="Team Trail"
        subtitle="Trace an employee's field location trail for a chosen day."
        actions={
          selectedUser && loaded && points.length > 0 ? (
            <Badge tone="blue">{points.length} points</Badge>
          ) : null
        }
      />

      {/* Controls */}
      <Card className="mb-6">
        <CardBody className="flex flex-wrap items-end gap-4">
          <div className="min-w-[14rem] flex-1">
            <Field label="Employee">
              <Select value={userId} onChange={(e) => setUserId(e.target.value)}>
                <option value="">Select employee…</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName || u.username}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="min-w-[10rem]">
            <Field label="Date">
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </div>

          <Button
            variant="primary"
            disabled={!userId || !date || loading}
            onClick={() => setReloadKey((k) => k + 1)}
          >
            {loading ? 'Loading…' : 'Load trail'}
          </Button>
        </CardBody>
      </Card>

      {usersErr && (
        <div className="mb-4">
          <ErrorNote>{usersErr}</ErrorNote>
        </div>
      )}

      {/* Main content: 4 states (prompt / loading / error / empty / data) */}
      {!userId ? (
        <Card>
          <CardBody>
            <EmptyState
              icon={<IconMap />}
              title="Pick an employee to begin"
              hint="Choose an employee and a date to plot their location trail."
            />
          </CardBody>
        </Card>
      ) : loading ? (
        <Card>
          <CardBody>
            <Loading label="Loading trail…" />
          </CardBody>
        </Card>
      ) : error ? (
        <ErrorNote>{error}</ErrorNote>
      ) : loaded && points.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              icon={<IconMapPin />}
              title="No location points for this day"
              hint="Tracking only runs between punch-in and punch-out, so quiet days are normal."
            />
          </CardBody>
        </Card>
      ) : points.length > 0 ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Map */}
          <Card className="overflow-hidden lg:col-span-2">
            <MapContainer
              center={positions[0] || INDIA_CENTER}
              zoom={positions.length ? 15 : INDIA_ZOOM}
              scrollWheelZoom
              style={{ height: '70vh', width: '100%' }}
            >
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution="&copy; OpenStreetMap contributors"
              />

              {positions.length > 1 && (
                <Polyline
                  positions={positions}
                  pathOptions={{ color: '#1E3A8A', weight: 4, opacity: 0.8 }}
                />
              )}

              {start && (
                <Marker position={[start.lat, start.lng]}>
                  <Popup>
                    <div className="text-xs">
                      <p className="font-semibold text-slate-700">
                        Start · {fmtDateTime(start.capturedAt)}
                      </p>
                      {start.address && <p className="mt-1 text-slate-600">{start.address}</p>}
                      <p className="mt-1 text-slate-400">Accuracy {fmtAcc(start.acc)}</p>
                    </div>
                  </Popup>
                </Marker>
              )}

              {latest && (
                <Marker position={[latest.lat, latest.lng]}>
                  <Popup>
                    <div className="text-xs">
                      <p className="font-semibold text-slate-700">
                        Latest · {fmtDateTime(latest.capturedAt)}
                      </p>
                      {latest.address && <p className="mt-1 text-slate-600">{latest.address}</p>}
                      <p className="mt-1 text-slate-400">Accuracy {fmtAcc(latest.acc)}</p>
                    </div>
                  </Popup>
                </Marker>
              )}

              <FitBounds points={points} />
            </MapContainer>
          </Card>

          {/* Points list */}
          <Card className="min-w-0 lg:col-span-1">
            <CardBody className="border-b border-slate-100 py-3">
              <p className="text-sm font-semibold text-slate-700">
                {selectedUser?.fullName || selectedUser?.username || 'Employee'}
              </p>
              <p className="text-xs text-slate-400">{points.length} location points</p>
            </CardBody>
            <div className="max-h-[calc(70vh-4rem)] overflow-y-auto">
              <ol className="divide-y divide-slate-100">
                {points.map((p, i) => (
                  <li key={p.id ?? i} className="flex items-start gap-3 px-4 py-3">
                    <span className="mt-0.5 inline-flex h-6 w-6 flex-none items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-slate-700">{fmtTime(p.capturedAt)}</p>
                      <p className="mt-0.5 break-words text-xs text-slate-500">
                        {p.address || `${Number(p.lat).toFixed(5)}, ${Number(p.lng).toFixed(5)}`}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-400">Accuracy {fmtAcc(p.acc)}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
