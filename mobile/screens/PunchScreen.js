import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  Modal, Image, ScrollView, Alert, TextInput, Linking,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { api, API_URL } from '../lib/api';
import { startTracking, stopTracking, TRACK_INTERVAL_MIN, pendingCount } from '../lib/tracker';
import { GradientHeader, BottomNav, Card, Chip, PrimaryButton } from '../components/ui';
import { COLORS, GREEN_GRADIENT, RADIUS, SHADOW } from '../lib/theme';

const BASE = API_URL.replace('/api', '');

const fmtTime = (d) => d ? new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '--:--';
const fmtDuration = (h) => {
  if (h == null) return '--';
  const m = Math.round(h * 60);
  return `${Math.floor(m / 60)}h ${m % 60}m`;
};

const sessionLabel = (s, i) => {
  const name = (s.siteName || 'SESS').trim();
  if (name === 'SESS') return i === 0 ? 'SESS' : `SESS • ${i + 1}`;
  return `${name}`;
};

/* ---------- geofence helpers (mirror the backend) ---------- */
const ACC_BUFFER_CAP_M = 200; // cap the GPS-accuracy allowance
const haversineM = (lat1, lng1, lat2, lng2) => {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
};
const fmtDist = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);

export default function PunchScreen({ navigation }) {
  const [now, setNow] = useState(new Date());
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pendingPhoto, setPendingPhoto] = useState(null);
  const [capturedAt, setCapturedAt] = useState(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [locPermission, requestLocPermission] = Location.useForegroundPermissions();
  const prefetchRef = useRef({ coords: null, address: null, at: 0, promise: null });
  const [locReady, setLocReady] = useState(false);
  const [locError, setLocError] = useState(null); // human-readable location failure, or null
  const [sites, setSites] = useState(null); // authorized customer sites (null = loading)
  const [fix, setFix] = useState(null);     // latest GPS fix { lat, lng, acc } for the geofence check
  const [pending, setPending] = useState(0);
  const [locModal, setLocModal] = useState(false);
  const [detailModal, setDetailModal] = useState(null); // session object | null
  const [siteName, setSiteName] = useState('SESS');
  const cameraRef = useRef(null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const t = setInterval(async () => setPending(await pendingCount()), 5000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    try {
      const list = await api('/attendance/today');
      const arr = Array.isArray(list) ? list : [];
      setSessions(arr);
      const open = arr.find(s => !s.punchOutTime);
      if (open) startTracking(); else stopTracking();
    }
    catch (e) { Alert.alert('Error', e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Authorized sites for the punch geofence. On failure we leave the client
  // gate open ([]) — the backend still enforces it on every punch.
  useEffect(() => {
    api('/sites')
      .then((list) => setSites(Array.isArray(list) ? list : []))
      .catch(() => setSites([]));
  }, []);

  /* ---------- derived ---------- */
  const openSession = sessions.find(s => !s.punchOutTime) || null;
  const punchedIn = !!openSession;
  const totalHours = sessions.reduce((sum, s) => sum + (s.workingHours || 0), 0)
    + (openSession ? (now - new Date(openSession.punchInTime)) / 3600000 : 0);

  /* ---------- location prefetch (single-flight) ----------
   * Speed + resilience: check GPS is on, seed instantly from last-known so the
   * button unlocks fast, then refine with a fresh fix (10s cap). Any failure
   * sets a human-readable `locError` so the UI can show a Retry instead of
   * hanging on "Locating…" forever. */
  const prefetchLocation = useCallback(() => {
    if (!locPermission?.granted) return Promise.resolve(null);
    if (prefetchRef.current.promise) return prefetchRef.current.promise;
    const p = (async () => {
      try {
        const enabled = await Location.hasServicesEnabledAsync();
        if (!enabled) {
          prefetchRef.current.promise = null;
          setLocReady(false);
          setLocError('Location (GPS) is off. Turn it on, then retry.');
          return null;
        }

        // Fast path: last-known fix unlocks the button immediately.
        if (!prefetchRef.current.coords) {
          try {
            const last = await Location.getLastKnownPositionAsync();
            if (last) {
              prefetchRef.current = {
                coords: { lat: last.coords.latitude, lng: last.coords.longitude, acc: Math.round(last.coords.accuracy ?? 0) },
                // Use the fix's REAL timestamp: an old cached position must not
                // pass confirmPunch's 90s freshness gate as if it were fresh.
                address: null, at: last.timestamp ?? 0, promise: prefetchRef.current.promise,
              };
              setLocReady(true);
              setLocError(null);
              setFix(prefetchRef.current.coords);
            }
          } catch {}
        }

        // Accurate path: fresh fix, but don't wait forever.
        const loc = await Promise.race([
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000)),
        ]);
        const coords = {
          lat: loc.coords.latitude,
          lng: loc.coords.longitude,
          acc: Math.round(loc.coords.accuracy ?? 0),
        };
        let address = null;
        try {
          const r = await Location.reverseGeocodeAsync({ latitude: coords.lat, longitude: coords.lng });
          if (r?.length) {
            const a = r[0];
            address = a.formattedAddress || [a.name, a.district, a.city].filter(Boolean).join(', ');
          }
        } catch {}
        prefetchRef.current = { coords, address, at: Date.now(), promise: null };
        setLocReady(true);
        setLocError(null);
        setFix(coords);
        return prefetchRef.current;
      } catch {
        prefetchRef.current.promise = null;
        // If a last-known fix already unlocked us, keep it usable; only error when we have nothing.
        if (prefetchRef.current.coords) return prefetchRef.current;
        setLocReady(false);
        setLocError('Could not get your location. Move to an open area and retry.');
        return null;
      }
    })();
    prefetchRef.current.promise = p;
    return p;
  }, [locPermission?.granted]);

  useEffect(() => {
    if (locPermission?.granted) {
      prefetchLocation();
      const t = setInterval(prefetchLocation, 60 * 1000);
      return () => clearInterval(t);
    }
  }, [locPermission?.granted, prefetchLocation]);

  /* ---------- permissions: request, and re-ask on each tap ----------
   * If the OS has permanently blocked a permission (canAskAgain === false) it
   * won't show the dialog again — so we route the user to Settings instead of
   * silently doing nothing. */
  const requestAllPermissions = async () => {
    let cam = permission;
    if (!cam?.granted) cam = await requestPermission();
    let loc = locPermission;
    if (!loc?.granted) loc = await requestLocPermission();

    const camBlocked = cam && !cam.granted && cam.canAskAgain === false;
    const locBlocked = loc && !loc.granted && loc.canAskAgain === false;
    if (camBlocked || locBlocked) {
      Alert.alert(
        'Permission needed',
        'Camera and location access are required to punch in/out. Please enable them in Settings.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ]
      );
    } else if (loc?.granted) {
      setLocError(null);
      prefetchLocation();
    }
  };

  /* ---------- geofence: punch only inside an authorized customer site ----------
   * Mirrors the backend rule: within site radius + GPS accuracy (capped).
   * No sites configured => gate off. The backend re-checks every punch anyway. */
  const geo = useMemo(() => {
    if (!sites || sites.length === 0) return { active: false, match: null };
    if (!fix) return { active: true, waiting: true, match: null };
    const buffer = Math.min(Math.max(fix.acc || 0, 0), ACC_BUFFER_CAP_M);
    let match = null, matchDist = Infinity, nearest = null, nearestDist = Infinity;
    for (const s of sites) {
      const d = haversineM(fix.lat, fix.lng, s.lat, s.lng);
      if (d < nearestDist) { nearest = s; nearestDist = d; }
      if (d <= (s.radiusM || 100) + buffer && d < matchDist) { match = s; matchDist = d; }
    }
    return { active: true, match, matchDist, nearest, nearestDist };
  }, [sites, fix]);
  const geoBlocked = geo.active && !geo.waiting && !geo.match;

  // Main button: retry location on failure, re-check when outside the fence,
  // otherwise capture the selfie.
  const onPunchPress = () => {
    if (locError) { setLocError(null); prefetchLocation(); return; }
    if (geoBlocked) { prefetchLocation(); return; }
    capture();
  };

  /* ---------- capture (silent shutter) ---------- */
  const capture = async () => {
    if (!cameraRef.current) return;
    setBusy(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.3, base64: true, skipProcessing: true, shutterSound: false,
      });
      if (geo.match) setSiteName(geo.match.name); // auto-fill the matched site
      setPendingPhoto({ uri: photo.uri, base64: photo.base64 });
      setCapturedAt(new Date());
    } catch (e) {
      Alert.alert('Camera error', e.message);
    } finally { setBusy(false); }
  };

  /* ---------- confirm: strict location gate ---------- */
  const confirmPunch = async () => {
    // Geofence guard — the fix may have drifted since capture (60s refresh).
    if (geoBlocked) {
      setPendingPhoto(null);
      Alert.alert(
        'Wrong location',
        `You are not at an authorized customer site.${geo.nearest ? ` Nearest: ${geo.nearest.name} — ${fmtDist(geo.nearestDist)} away.` : ''} Please reach the proper customer site address.`
      );
      return;
    }
    setBusy(true);
    try {
      let coords = {}, address = null;
      let pf = prefetchRef.current;
      if (!(pf.coords && Date.now() - pf.at < 90 * 1000)) {
        const result = await Promise.race([
          prefetchLocation(),
          new Promise(r => setTimeout(() => r(null), 4000)),
        ]);
        pf = result || prefetchRef.current;
        if (!pf.coords) {
          try {
            const last = await Location.getLastKnownPositionAsync();
            if (last) pf = {
              coords: {
                lat: last.coords.latitude, lng: last.coords.longitude,
                acc: Math.round(last.coords.accuracy ?? 0),
              },
              address: null, at: last.timestamp ?? 0, // real fix age, not "now"
            };
          } catch {}
        }
      }
      if (!pf.coords) {
        setPendingPhoto(null);
        setLocModal(true); // NO LOCATION = NO PUNCH
        return;
      }
      coords = pf.coords; address = pf.address;

      const wasPunchIn = !punchedIn;
      const path = punchedIn ? '/attendance/punch-out' : '/attendance/punch-in';
      await api(path, {
        method: 'POST',
        body: JSON.stringify({
          ...coords, address,
          siteName: siteName.trim() || 'SESS',
          photoBase64: pendingPhoto.base64,
        }),
      });
      await load();
      setPendingPhoto(null);
      if (wasPunchIn) setSiteName('SESS'); // next punch-ku default reset
      prefetchLocation();
    } catch (e) {
      Alert.alert('Punch failed', e.message);
      load();
      setPendingPhoto(null);
    } finally { setBusy(false); }
  };

  /* ---------- detail popup data ---------- */
  const detailIdx = detailModal ? sessions.findIndex(s => s.id === detailModal.id) : -1;
  const detail = detailModal ? {
    label: sessionLabel(detailModal, Math.max(detailIdx, 0)),
    color: detailModal.punchOutTime ? COLORS.primary : COLORS.green,
    inPhoto: detailModal.punchInPhoto ? `${BASE}/${detailModal.punchInPhoto}` : null,
    outPhoto: detailModal.punchOutPhoto ? `${BASE}/${detailModal.punchOutPhoto}` : null,
    inTime: fmtTime(detailModal.punchInTime),
    outTime: fmtTime(detailModal.punchOutTime),
    dateStr: new Date(detailModal.punchInTime).toDateString(),
    inAddr: detailModal.punchInAddress
      || (detailModal.punchInLat ? `${detailModal.punchInLat.toFixed(4)}, ${detailModal.punchInLng.toFixed(4)}` : null),
    outAddr: detailModal.punchOutAddress
      || (detailModal.punchOutLat ? `${detailModal.punchOutLat.toFixed(4)}, ${detailModal.punchOutLng.toFixed(4)}` : null),
    inAcc: detailModal.punchInAcc, outAcc: detailModal.punchOutAcc,
    late: detailModal.isLate,
    dur: detailModal.punchOutTime ? fmtDuration(detailModal.workingHours) : 'In progress',
  } : null;

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* ===== Gradient hero header: title row + live clock ===== */}
      <GradientHeader
        title="Attendance"
        onBack={() => navigation.goBack()}
        right={punchedIn ? (
          <View style={styles.liveTag}>
            <View style={styles.liveDot} />
            <Text style={styles.liveTagText}>ON DUTY</Text>
          </View>
        ) : null}
      >
        <Text style={styles.clock}>{now.toLocaleTimeString('en-IN')}</Text>
        <Text style={styles.date}>{now.toDateString()}</Text>
      </GradientHeader>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {loading ? <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 40 }} /> : (!permission?.granted || !locPermission?.granted) ? (
          <Card style={styles.permCard}>
            <View style={styles.permIcon}>
              <MaterialIcons name="verified-user" size={30} color={COLORS.primary} />
            </View>
            <Text style={styles.permTitle}>Access Required</Text>
            <Text style={styles.permText}>
              Punch In/Out needs camera (selfie) + location (address). Without both, attendance can't be recorded.
            </Text>

            {/* Which permissions are still missing */}
            <View style={styles.permStatusRow}>
              <Chip
                text="Camera"
                icon={permission?.granted ? 'check-circle' : 'cancel'}
                color={permission?.granted ? COLORS.green : COLORS.red}
                soft={permission?.granted ? COLORS.greenSoft : COLORS.redSoft}
              />
              <Chip
                text="Location"
                icon={locPermission?.granted ? 'check-circle' : 'cancel'}
                color={locPermission?.granted ? COLORS.green : COLORS.red}
                soft={locPermission?.granted ? COLORS.greenSoft : COLORS.redSoft}
              />
            </View>

            <PrimaryButton
              title="Allow Access"
              icon="lock"
              onPress={requestAllPermissions}
              style={{ width: '100%', marginTop: 18 }}
            />
            <TouchableOpacity onPress={() => Linking.openSettings()} style={{ marginTop: 14 }}>
              <Text style={styles.permSettingsLink}>Already denied? Open device Settings</Text>
            </TouchableOpacity>
          </Card>
        ) : (
          <>
            {/* Big circular selfie preview with white ring */}
            <View style={styles.camRing}>
              <View style={styles.camWrap}>
                <CameraView ref={cameraRef} facing="front" style={{ flex: 1 }} />
              </View>
            </View>

            <View style={[styles.locChip, locError && styles.locChipError]}>
              <View style={[styles.locDot, { backgroundColor: locError ? COLORS.red : locReady ? COLORS.green : COLORS.orange }]} />
              <Text style={[styles.locChipText, locError && { color: COLORS.red }]} numberOfLines={2}>
                {locError
                  ? locError
                  : locReady
                    ? (prefetchRef.current.address ? prefetchRef.current.address.split(',').slice(0, 2).join(', ') : 'Location ready')
                    : 'Locating…'}
              </Text>
            </View>

            {/* Geofence status — matched site (green) or wrong-location error (red).
                Hidden while a location error is showing: a match computed from a
                dead fix must not contradict the red GPS-off chip. */}
            {geo.active && geo.match && !locError && (
              <View style={styles.geoOk}>
                <MaterialIcons name="check-circle" size={15} color={COLORS.green} />
                <Text style={styles.geoOkText} numberOfLines={1}>
                  {geo.match.name} • {fmtDist(geo.matchDist)} away
                </Text>
              </View>
            )}
            {geoBlocked && (
              <View style={styles.geoErr}>
                <MaterialIcons name="location-off" size={16} color={COLORS.red} />
                <Text style={styles.geoErrText}>
                  You are in the wrong location.
                  {geo.nearest ? ` Nearest site: ${geo.nearest.name} — ${fmtDist(geo.nearestDist)} away.` : ''}
                  {' '}Please reach the proper customer site address.
                </Text>
              </View>
            )}

            {(() => {
              const locating = !locReady && !locError;      // still trying, no error yet
              const disabled = busy || locating;            // block only while capturing or first fix pending
              const colors = locError || geoBlocked
                ? ['#F59E0B', '#D97706']                     // amber = retry / re-check
                : locating
                  ? ['#9CA3AF', '#9CA3AF']                   // grey = waiting
                  : punchedIn ? ['#EF4444', '#B91C1C'] : GREEN_GRADIENT;
              const icon = locError || geoBlocked ? 'refresh' : locating ? 'location-searching' : 'photo-camera';
              const label = locError ? 'RETRY LOCATION'
                : geoBlocked ? 'RE-CHECK LOCATION'
                : locating ? 'LOCATING…'
                : punchedIn ? 'PUNCH OUT' : 'PUNCH IN';
              return (
                <TouchableOpacity
                  style={[styles.punchBtn, disabled ? styles.punchBtnDisabled : null]}
                  onPress={onPunchPress}
                  disabled={disabled}
                  activeOpacity={0.85}
                >
                  <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.punchGrad}>
                    {busy && !pendingPhoto ? <ActivityIndicator color="#fff" /> : (
                      <>
                        <MaterialIcons name={icon} size={21} color="#fff" />
                        <Text style={styles.punchText}>{label}</Text>
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              );
            })()}
          </>
        )}

        {!loading && (
          <>
            {/* Day status pill — "Day not started" / live total */}
            <View style={styles.hoursPill}>
              <MaterialIcons name="timer" size={15} color={COLORS.primary} />
              <Text style={styles.hoursText}>
                {punchedIn
                  ? `${fmtDuration(totalHours)} today (live)`
                  : sessions.length
                    ? `${fmtDuration(totalHours)} today • ${sessions.length} session${sessions.length > 1 ? 's' : ''}`
                    : 'Day not started'}
              </Text>
            </View>

            {punchedIn && (
              <View style={styles.trackChip}>
                <View style={styles.trackDot} />
                <Text style={styles.trackText}>
                  Live tracking • every {TRACK_INTERVAL_MIN} min{pending > 0 ? ` • ${pending} pending ⏳` : ''}
                </Text>
              </View>
            )}

            {/* ===== Session timeline + travel gaps ===== */}
            {sessions.length > 0 && (
              <View style={{ width: '100%', marginTop: 16, gap: 10 }}>
                {sessions.map((s, i) => (
                  <React.Fragment key={s.id}>
                    {i > 0 && sessions[i - 1].punchOutTime && (
                      <View style={styles.travelRow}>
                        <MaterialIcons name="directions-car" size={14} color={COLORS.orange} />
                        <Text style={styles.travelText}>
                          Travel: {fmtDuration((new Date(s.punchInTime) - new Date(sessions[i - 1].punchOutTime)) / 3600000)}
                        </Text>
                      </View>
                    )}
                    <TouchableOpacity style={styles.sessCard} activeOpacity={0.85} onPress={() => setDetailModal(s)}>
                      <View style={[styles.sessBar, { backgroundColor: s.punchOutTime ? COLORS.faint : COLORS.green }]} />
                      <View style={styles.sessHead}>
                        <Text style={styles.sessLabel}>{sessionLabel(s, i)}</Text>
                        {s.isLate && <View style={styles.lateBadge}><Text style={styles.lateText}>LATE</Text></View>}
                        {!s.punchOutTime && <View style={styles.openPill}><Text style={styles.openPillText}>ACTIVE</Text></View>}
                        <MaterialIcons name="open-in-full" size={12} color="#C4C4C4" />
                      </View>
                      <View style={styles.sessTimeRow}>
                        <Text style={styles.sessTime}>{fmtTime(s.punchInTime)}</Text>
                        <MaterialIcons name="arrow-forward" size={13} color={COLORS.faint} />
                        <Text style={styles.sessTime}>{fmtTime(s.punchOutTime)}</Text>
                        <Text style={styles.sessDur}>
                          {s.punchOutTime
                            ? fmtDuration(s.workingHours)
                            : fmtDuration((now - new Date(s.punchInTime)) / 3600000) + ' •live'}
                        </Text>
                      </View>
                      <View style={styles.pAddrRow}>
                        <MaterialIcons name="location-on" size={13} color={COLORS.sub} />
                        <Text style={styles.pAddr} numberOfLines={1}>{s.punchInAddress || 'No address'}</Text>
                      </View>
                    </TouchableOpacity>
                  </React.Fragment>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* ===== POPUP 1: Confirm — white rounded-top bottom sheet ===== */}
      <Modal visible={!!pendingPhoto} transparent animationType="slide">
        <View style={styles.sheetWrap}>
          <View style={styles.sheet}>
            <View style={[styles.mHeadStrip, { backgroundColor: punchedIn ? COLORS.red : COLORS.green }]} />
            <Text style={styles.mTitle}>Confirm {punchedIn ? 'Punch Out' : 'Punch In'}</Text>
            <Text style={styles.mSub}>Verify pannitu confirm pannunga</Text>

            {pendingPhoto && (
              <View style={styles.previewFrame}>
                <Image source={{ uri: pendingPhoto.uri }} style={styles.preview} />
              </View>
            )}

            {!punchedIn && (
              <View style={styles.siteField}>
                <MaterialIcons name="business" size={16} color={COLORS.primary} />
                <TextInput
                  style={styles.siteInput}
                  // Live-sync: if the geofence match changes while this modal is
                  // open, show the current matched site, never a stale value.
                  value={geo.match ? geo.match.name : siteName}
                  onChangeText={setSiteName}
                  placeholder="Company / Site name"
                  placeholderTextColor={COLORS.faint}
                  maxLength={60}
                  editable={!geo.match} // matched site is authoritative
                />
                {geo.match ? (
                  <MaterialIcons name="verified" size={17} color={COLORS.green} />
                ) : siteName !== 'SESS' && (
                  <TouchableOpacity onPress={() => setSiteName('SESS')}>
                    <MaterialIcons name="restart-alt" size={17} color={COLORS.faint} />
                  </TouchableOpacity>
                )}
              </View>
            )}

            <View style={styles.mChipCol}>
              <View style={styles.mChip}>
                <MaterialIcons name="schedule" size={15} color={COLORS.primary} />
                <Text style={styles.mChipText}>
                  {capturedAt ? `${capturedAt.toLocaleTimeString('en-IN')} • ${capturedAt.toDateString()}` : ''}
                </Text>
              </View>
              <View style={styles.mChip}>
                <MaterialIcons name="location-on" size={15} color={locReady ? COLORS.green : COLORS.orange} />
                <Text style={styles.mChipText} numberOfLines={2}>
                  {prefetchRef.current.address || (locReady ? 'Coordinates captured' : 'Locating…')}
                </Text>
              </View>
            </View>

            <View style={styles.mBtnRow}>
              <TouchableOpacity style={styles.outlineBtn} disabled={busy} onPress={() => setPendingPhoto(null)}>
                <MaterialIcons name="refresh" size={17} color="#374151" />
                <Text style={styles.outlineText}>Retake</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ flex: 1 }} disabled={busy} activeOpacity={0.85} onPress={confirmPunch}>
                <LinearGradient
                  colors={punchedIn ? ['#EF4444', '#B91C1C'] : GREEN_GRADIENT}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={styles.fillBtn}
                >
                  {busy ? <ActivityIndicator color="#fff" /> : (
                    <>
                      <MaterialIcons name="check-circle" size={18} color="#fff" />
                      <Text style={styles.fillText}>Confirm</Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
            <Text style={styles.mNote}>Selfie • Time • Location will be recorded</Text>
          </View>
        </View>
      </Modal>

      {/* ===== POPUP 2: Location required ===== */}
      <Modal visible={locModal} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.mCard}>
            <View style={styles.alertIcon}>
              <MaterialIcons name="location-off" size={30} color={COLORS.red} />
            </View>
            <Text style={styles.mTitle}>Location Required</Text>
            <Text style={[styles.mSub, { textAlign: 'center', marginBottom: 18 }]}>
              {locError || 'Punch needs your location. Turn on GPS and try in an open area.'}
            </Text>
            <View style={styles.mBtnRow}>
              <TouchableOpacity style={styles.outlineBtn} onPress={() => setLocModal(false)}>
                <Text style={styles.outlineText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ flex: 1 }} activeOpacity={0.85}
                onPress={() => { setLocModal(false); setLocError(null); prefetchLocation(); }}>
                <LinearGradient colors={['#1E40AF', '#312E81']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fillBtn}>
                  <MaterialIcons name="my-location" size={17} color="#fff" />
                  <Text style={styles.fillText}>Retry</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
            <TouchableOpacity onPress={() => { setLocModal(false); Linking.openSettings(); }} style={{ marginTop: 12 }}>
              <Text style={styles.permSettingsLink}>Open device Settings</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ===== POPUP 3: Session detail ===== */}
      <Modal visible={!!detail} transparent animationType="slide">
        <View style={styles.overlay}>
          {detail && (
            <View style={styles.mCard}>
              <View style={[styles.mHeadStrip, { backgroundColor: detail.color }]} />
              <View style={styles.dHead}>
                <View style={[styles.dIconWrap, { backgroundColor: COLORS.indigoSoft }]}>
                  <MaterialIcons name="work" size={20} color={COLORS.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.mTitle}>{detail.label}</Text>
                  <Text style={styles.mSub}>{detail.dateStr} • {detail.dur}{detail.late ? ' • Late' : ''}</Text>
                </View>
                <TouchableOpacity style={styles.dClose} onPress={() => setDetailModal(null)}>
                  <MaterialIcons name="close" size={20} color={COLORS.sub} />
                </TouchableOpacity>
              </View>

              <View style={styles.photoPair}>
                <View style={styles.photoCol}>
                  <Text style={[styles.photoLabel, { color: COLORS.green }]}>IN • {detail.inTime}</Text>
                  {detail.inPhoto ? (
                    <Image source={{ uri: detail.inPhoto }} style={styles.photoBig} />
                  ) : (
                    <View style={[styles.photoBig, styles.photoEmpty]}>
                      <MaterialIcons name="no-photography" size={24} color="#C4C4C4" />
                    </View>
                  )}
                </View>
                <View style={styles.photoCol}>
                  <Text style={[styles.photoLabel, { color: COLORS.red }]}>OUT • {detail.outTime}</Text>
                  {detail.outPhoto ? (
                    <Image source={{ uri: detail.outPhoto }} style={styles.photoBig} />
                  ) : (
                    <View style={[styles.photoBig, styles.photoEmpty]}>
                      <MaterialIcons name="schedule" size={24} color="#C4C4C4" />
                    </View>
                  )}
                </View>
              </View>

              <View style={styles.dRow}>
                <MaterialIcons name="location-on" size={16} color={COLORS.green} />
                <Text style={styles.dRowText}>
                  {detail.inAddr || 'No address'}{detail.inAcc != null ? `  (±${Math.round(detail.inAcc)}m)` : ''}
                </Text>
              </View>
              {detail.outTime !== '--:--' && (
                <View style={styles.dRow}>
                  <MaterialIcons name="location-on" size={16} color={COLORS.red} />
                  <Text style={styles.dRowText}>
                    {detail.outAddr || 'No address'}{detail.outAcc != null ? `  (±${Math.round(detail.outAcc)}m)` : ''}
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>
      </Modal>

      <BottomNav navigation={navigation} active="punch" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },

  /* header hero */
  liveTag: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 14, paddingHorizontal: 9, paddingVertical: 4 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#4ADE80' },
  liveTagText: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  clock: { color: '#fff', fontSize: 36, fontWeight: '800', marginTop: 16, letterSpacing: 0.5 },
  date: { color: '#C7D2FE', fontSize: 13, marginTop: 2, fontWeight: '600' },

  body: { alignItems: 'center', padding: 20, paddingBottom: 32 },

  /* circular camera + white ring */
  camRing: { padding: 6, borderRadius: 131, backgroundColor: COLORS.card, ...SHADOW.raised, shadowColor: '#1E3A8A' },
  camWrap: { width: 250, height: 250, borderRadius: 125, overflow: 'hidden', backgroundColor: COLORS.line },

  locChip: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, backgroundColor: COLORS.card, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8, maxWidth: '92%', ...SHADOW.card },
  locChipError: { backgroundColor: '#FEF2F2' },
  locDot: { width: 7, height: 7, borderRadius: 4 },
  locChipText: { flexShrink: 1, fontSize: 12, color: '#374151', fontWeight: '700' },

  geoOk: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, backgroundColor: COLORS.greenSoft, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8, maxWidth: '92%', borderWidth: 1, borderColor: '#BBF7D0' },
  geoOkText: { flexShrink: 1, fontSize: 12, color: '#166534', fontWeight: '800' },
  geoErr: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, marginTop: 8, backgroundColor: '#FEF2F2', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9, maxWidth: '92%', borderWidth: 1, borderColor: '#FECACA' },
  geoErrText: { flex: 1, fontSize: 11.5, color: COLORS.red, fontWeight: '700', lineHeight: 16 },

  punchBtn: { marginTop: 16, borderRadius: 28, elevation: 3, width: '86%' },
  punchBtnDisabled: { elevation: 0 },
  punchGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 54, borderRadius: 28 },
  punchText: { color: '#fff', fontSize: 15.5, fontWeight: '800', letterSpacing: 0.5 },

  /* permission card (page 5) */
  permCard: { width: '100%', padding: 22, alignItems: 'center' },
  permIcon: { width: 62, height: 62, borderRadius: 31, backgroundColor: COLORS.indigoSoft, justifyContent: 'center', alignItems: 'center' },
  permTitle: { fontSize: 17, fontWeight: '800', color: COLORS.ink, marginTop: 12 },
  permText: { color: COLORS.sub, fontSize: 12.5, textAlign: 'center', marginTop: 6, lineHeight: 18 },
  permStatusRow: { flexDirection: 'row', gap: 12, marginTop: 14 },
  permSettingsLink: { fontSize: 12, color: COLORS.primary, fontWeight: '700', textDecorationLine: 'underline' },

  hoursPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.indigoSoft, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, marginTop: 18 },
  hoursText: { color: COLORS.primary, fontWeight: '700', fontSize: 13 },
  trackChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.greenSoft, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, marginTop: 8 },
  trackDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.green },
  trackText: { color: '#166534', fontSize: 12, fontWeight: '600' },

  travelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', backgroundColor: COLORS.orangeSoft, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 5 },
  travelText: { color: COLORS.orange, fontSize: 11.5, fontWeight: '800' },
  sessCard: { backgroundColor: COLORS.card, borderRadius: RADIUS.card, padding: 13, overflow: 'hidden', ...SHADOW.card },
  sessBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 4 },
  sessHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 },
  sessLabel: { fontSize: 12.5, fontWeight: '900', color: COLORS.ink, flex: 1 },
  openPill: { backgroundColor: COLORS.greenSoft, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  openPillText: { color: COLORS.green, fontSize: 9, fontWeight: '800' },
  sessTimeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 7 },
  sessTime: { fontSize: 15, fontWeight: '800', color: COLORS.ink },
  sessDur: { marginLeft: 'auto', color: COLORS.primary, fontSize: 11.5, fontWeight: '800', backgroundColor: COLORS.indigoSoft, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  lateBadge: { backgroundColor: COLORS.redSoft, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  lateText: { color: COLORS.red, fontSize: 9, fontWeight: '800' },
  pAddrRow: { flexDirection: 'row', gap: 4, marginTop: 6, alignItems: 'flex-start' },
  pAddr: { flex: 1, fontSize: 11, color: COLORS.sub, lineHeight: 15 },

  /* modals */
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.6)', justifyContent: 'center', padding: 22 },
  sheetWrap: { flex: 1, backgroundColor: 'rgba(15,23,42,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: COLORS.card, borderTopLeftRadius: RADIUS.sheet, borderTopRightRadius: RADIUS.sheet,
    padding: 20, paddingBottom: 30, alignItems: 'center', overflow: 'hidden', elevation: 10,
  },
  mCard: { backgroundColor: COLORS.card, borderRadius: RADIUS.sheet, padding: 20, alignItems: 'center', overflow: 'hidden', elevation: 8 },
  mHeadStrip: { position: 'absolute', top: 0, left: 0, right: 0, height: 5 },
  mTitle: { fontSize: 18, fontWeight: '800', color: COLORS.ink, marginTop: 6 },
  mSub: { fontSize: 12.5, color: COLORS.sub, marginTop: 3 },
  previewFrame: { padding: 4, borderRadius: 20, backgroundColor: '#F3F4F6', marginTop: 14 },
  preview: { width: 200, height: 200, borderRadius: 16, backgroundColor: COLORS.line },
  siteField: { flexDirection: 'row', alignItems: 'center', gap: 8, width: '100%', backgroundColor: COLORS.indigoSoft, borderWidth: 1.5, borderColor: '#E0E7FF', borderRadius: RADIUS.input, paddingHorizontal: 12, height: 48, marginTop: 14 },
  siteInput: { flex: 1, fontSize: 14, fontWeight: '700', color: COLORS.ink },
  mChipCol: { width: '100%', gap: 8, marginTop: 12 },
  mChip: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, backgroundColor: COLORS.field, borderRadius: RADIUS.input, borderWidth: 1, borderColor: '#F3F4F6', paddingHorizontal: 11, paddingVertical: 10 },
  mChipText: { flex: 1, fontSize: 12, color: '#374151', fontWeight: '600', lineHeight: 16 },
  mBtnRow: { flexDirection: 'row', gap: 10, width: '100%', marginTop: 16 },
  outlineBtn: { flex: 1, flexDirection: 'row', gap: 5, height: 48, borderRadius: RADIUS.button, borderWidth: 1.5, borderColor: COLORS.line, backgroundColor: COLORS.card, justifyContent: 'center', alignItems: 'center' },
  outlineText: { color: '#374151', fontWeight: '700' },
  fillBtn: { flexDirection: 'row', gap: 6, height: 48, borderRadius: RADIUS.button, justifyContent: 'center', alignItems: 'center' },
  fillText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  mNote: { fontSize: 10.5, color: COLORS.faint, marginTop: 12 },
  alertIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: COLORS.redSoft, justifyContent: 'center', alignItems: 'center', marginTop: 4 },

  /* session detail */
  dHead: { flexDirection: 'row', alignItems: 'center', gap: 10, width: '100%', marginTop: 4 },
  dIconWrap: { width: 38, height: 38, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  dClose: { marginLeft: 'auto', width: 34, height: 34, borderRadius: 17, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' },
  photoPair: { flexDirection: 'row', gap: 10, marginTop: 14, width: '100%' },
  photoCol: { flex: 1 },
  photoLabel: { fontSize: 10.5, fontWeight: '800', marginBottom: 6 },
  photoBig: { width: '100%', height: 150, borderRadius: 14, backgroundColor: COLORS.line },
  photoEmpty: { justifyContent: 'center', alignItems: 'center' },
  dRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, width: '100%', marginTop: 12, paddingHorizontal: 4 },
  dRowText: { flex: 1, fontSize: 13, color: '#374151', fontWeight: '600', lineHeight: 18 },
});
