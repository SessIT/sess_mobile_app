import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  Modal, Image, ScrollView, Alert, TextInput,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { api, API_URL } from '../lib/api';
import { startTracking, stopTracking, TRACK_INTERVAL_MIN, pendingCount } from '../lib/tracker';

const INDIGO = '#1E3A8A';
const GREEN = '#16A34A';
const RED = '#DC2626';
const AMBER = '#D97706';
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

  /* ---------- derived ---------- */
  const openSession = sessions.find(s => !s.punchOutTime) || null;
  const punchedIn = !!openSession;
  const totalHours = sessions.reduce((sum, s) => sum + (s.workingHours || 0), 0)
    + (openSession ? (now - new Date(openSession.punchInTime)) / 3600000 : 0);

  /* ---------- location prefetch (single-flight) ---------- */
  const prefetchLocation = useCallback(() => {
    if (!locPermission?.granted) return Promise.resolve(null);
    if (prefetchRef.current.promise) return prefetchRef.current.promise;
    const p = (async () => {
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const coords = {
          lat: loc.coords.latitude,
          lng: loc.coords.longitude,
          acc: Math.round(loc.coords.accuracy),
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
        return prefetchRef.current;
      } catch {
        prefetchRef.current.promise = null;
        setLocReady(false);
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

  /* ---------- capture (silent shutter) ---------- */
  const capture = async () => {
    if (!cameraRef.current) return;
    setBusy(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.3, base64: true, skipProcessing: true, shutterSound: false,
      });
      setPendingPhoto({ uri: photo.uri, base64: photo.base64 });
      setCapturedAt(new Date());
    } catch (e) {
      Alert.alert('Camera error', e.message);
    } finally { setBusy(false); }
  };

  /* ---------- confirm: strict location gate ---------- */
  const confirmPunch = async () => {
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
              address: null, at: Date.now(),
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
    color: detailModal.punchOutTime ? INDIGO : GREEN,
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

      {/* ===== Gradient hero header ===== */}
      <LinearGradient
        colors={['#1E40AF', '#1E3A8A', '#312E81']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <View style={[styles.deco, { width: 170, height: 170, top: -60, right: -50 }]} />
        <View style={[styles.deco, { width: 100, height: 100, bottom: -35, left: -25 }]} />
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.title}>Attendance</Text>
          {punchedIn && (
            <View style={styles.liveTag}>
              <View style={styles.liveDot} />
              <Text style={styles.liveTagText}>ON DUTY</Text>
            </View>
          )}
        </View>
        <Text style={styles.clock}>{now.toLocaleTimeString('en-IN')}</Text>
        <Text style={styles.date}>{now.toDateString()}</Text>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {loading ? <ActivityIndicator size="large" color={INDIGO} style={{ marginTop: 40 }} /> : (!permission?.granted || !locPermission?.granted) ? (
          <View style={styles.permCard}>
            <View style={styles.permIcon}>
              <MaterialIcons name="verified-user" size={30} color={INDIGO} />
            </View>
            <Text style={styles.permTitle}>One-time Setup</Text>
            <Text style={styles.permText}>
              Attendance proof-ku camera (selfie) + location (address) access venum
            </Text>
            <TouchableOpacity style={styles.permBtn} activeOpacity={0.85}
              onPress={async () => { await requestPermission(); await requestLocPermission(); }}>
              <MaterialIcons name="lock-open" size={17} color="#fff" />
              <Text style={styles.permBtnText}>Allow Access</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={styles.camRing}>
              <View style={styles.camWrap}>
                <CameraView ref={cameraRef} facing="front" style={{ flex: 1 }} />
              </View>
            </View>

            <View style={styles.locChip}>
              <View style={[styles.locDot, { backgroundColor: locReady ? GREEN : AMBER }]} />
              <Text style={styles.locChipText}>
                {locReady ? (prefetchRef.current.address ? prefetchRef.current.address.split(',').slice(0, 2).join(', ') : 'Location ready') : 'Locating…'}
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.punchBtn, busy || !locReady ? styles.punchBtnDisabled : null]}
              onPress={capture}
              disabled={busy || !locReady}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={!locReady ? ['#9CA3AF', '#9CA3AF'] : punchedIn ? ['#EF4444', '#B91C1C'] : ['#22C55E', '#15803D']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={styles.punchGrad}
              >
                {busy && !pendingPhoto ? <ActivityIndicator color="#fff" /> : (
                  <>
                    <MaterialIcons name={locReady ? 'photo-camera' : 'location-searching'} size={21} color="#fff" />
                    <Text style={styles.punchText}>
                      {!locReady ? 'WAITING FOR LOCATION…' : punchedIn ? 'PUNCH OUT' : 'PUNCH IN'}
                    </Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </>
        )}

        {!loading && (
          <>
            <View style={styles.hoursPill}>
              <MaterialIcons name="timer" size={15} color={INDIGO} />
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
                        <MaterialIcons name="directions-car" size={14} color={AMBER} />
                        <Text style={styles.travelText}>
                          Travel: {fmtDuration((new Date(s.punchInTime) - new Date(sessions[i - 1].punchOutTime)) / 3600000)}
                        </Text>
                      </View>
                    )}
                    <TouchableOpacity style={styles.sessCard} activeOpacity={0.85} onPress={() => setDetailModal(s)}>
                      <View style={[styles.sessBar, { backgroundColor: s.punchOutTime ? '#9CA3AF' : GREEN }]} />
                      <View style={styles.sessHead}>
                        <Text style={styles.sessLabel}>{sessionLabel(s, i)}</Text>
                        {s.isLate && <View style={styles.lateBadge}><Text style={styles.lateText}>LATE</Text></View>}
                        {!s.punchOutTime && <View style={styles.openPill}><Text style={styles.openPillText}>ACTIVE</Text></View>}
                        <MaterialIcons name="open-in-full" size={12} color="#C4C4C4" />
                      </View>
                      <View style={styles.sessTimeRow}>
                        <Text style={styles.sessTime}>{fmtTime(s.punchInTime)}</Text>
                        <MaterialIcons name="arrow-forward" size={13} color="#9CA3AF" />
                        <Text style={styles.sessTime}>{fmtTime(s.punchOutTime)}</Text>
                        <Text style={styles.sessDur}>
                          {s.punchOutTime
                            ? fmtDuration(s.workingHours)
                            : fmtDuration((now - new Date(s.punchInTime)) / 3600000) + ' •live'}
                        </Text>
                      </View>
                      <View style={styles.pAddrRow}>
                        <MaterialIcons name="location-on" size={13} color="#6B7280" />
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

      {/* ===== POPUP 1: Confirm ===== */}
      <Modal visible={!!pendingPhoto} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.mCard}>
            <View style={[styles.mHeadStrip, { backgroundColor: punchedIn ? RED : GREEN }]} />
            <Text style={styles.mTitle}>Confirm {punchedIn ? 'Punch Out' : 'Punch In'}</Text>
            <Text style={styles.mSub}>Verify pannitu confirm pannunga</Text>

            {pendingPhoto && (
              <View style={styles.previewFrame}>
                <Image source={{ uri: pendingPhoto.uri }} style={styles.preview} />
              </View>
            )}

            {!punchedIn && (
              <View style={styles.siteField}>
                <MaterialIcons name="business" size={16} color={INDIGO} />
                <TextInput
                  style={styles.siteInput}
                  value={siteName}
                  onChangeText={setSiteName}
                  placeholder="Company / Site name"
                  placeholderTextColor="#9CA3AF"
                  maxLength={60}
                />
                {siteName !== 'SESS' && (
                  <TouchableOpacity onPress={() => setSiteName('SESS')}>
                    <MaterialIcons name="restart-alt" size={17} color="#9CA3AF" />
                  </TouchableOpacity>
                )}
              </View>
            )}

            <View style={styles.mChipCol}>
              <View style={styles.mChip}>
                <MaterialIcons name="schedule" size={15} color={INDIGO} />
                <Text style={styles.mChipText}>
                  {capturedAt ? `${capturedAt.toLocaleTimeString('en-IN')} • ${capturedAt.toDateString()}` : ''}
                </Text>
              </View>
              <View style={styles.mChip}>
                <MaterialIcons name="location-on" size={15} color={locReady ? GREEN : AMBER} />
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
                  colors={punchedIn ? ['#EF4444', '#B91C1C'] : ['#22C55E', '#15803D']}
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
              <MaterialIcons name="location-off" size={30} color={RED} />
            </View>
            <Text style={styles.mTitle}>Location Required</Text>
            <Text style={[styles.mSub, { textAlign: 'center', marginBottom: 18 }]}>
              Punch panna location capture aaganum.{'\n'}GPS on pannitu open area-la try pannunga.
            </Text>
            <View style={styles.mBtnRow}>
              <TouchableOpacity style={styles.outlineBtn} onPress={() => setLocModal(false)}>
                <Text style={styles.outlineText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ flex: 1 }} activeOpacity={0.85}
                onPress={() => { setLocModal(false); prefetchLocation(); }}>
                <LinearGradient colors={['#1E40AF', '#312E81']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fillBtn}>
                  <MaterialIcons name="my-location" size={17} color="#fff" />
                  <Text style={styles.fillText}>Retry</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
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
                <View style={[styles.dIconWrap, { backgroundColor: '#EEF2FF' }]}>
                  <MaterialIcons name="work" size={20} color={INDIGO} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.mTitle}>{detail.label}</Text>
                  <Text style={styles.mSub}>{detail.dateStr} • {detail.dur}{detail.late ? ' • Late' : ''}</Text>
                </View>
                <TouchableOpacity style={styles.dClose} onPress={() => setDetailModal(null)}>
                  <MaterialIcons name="close" size={20} color="#6B7280" />
                </TouchableOpacity>
              </View>

              <View style={styles.photoPair}>
                <View style={styles.photoCol}>
                  <Text style={[styles.photoLabel, { color: GREEN }]}>IN • {detail.inTime}</Text>
                  {detail.inPhoto ? (
                    <Image source={{ uri: detail.inPhoto }} style={styles.photoBig} />
                  ) : (
                    <View style={[styles.photoBig, styles.photoEmpty]}>
                      <MaterialIcons name="no-photography" size={24} color="#C4C4C4" />
                    </View>
                  )}
                </View>
                <View style={styles.photoCol}>
                  <Text style={[styles.photoLabel, { color: RED }]}>OUT • {detail.outTime}</Text>
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
                <MaterialIcons name="location-on" size={16} color={GREEN} />
                <Text style={styles.dRowText}>
                  {detail.inAddr || 'No address'}{detail.inAcc != null ? `  (±${Math.round(detail.inAcc)}m)` : ''}
                </Text>
              </View>
              {detail.outTime !== '--:--' && (
                <View style={styles.dRow}>
                  <MaterialIcons name="location-on" size={16} color={RED} />
                  <Text style={styles.dRowText}>
                    {detail.outAddr || 'No address'}{detail.outAcc != null ? `  (±${Math.round(detail.outAcc)}m)` : ''}
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },

  header: { paddingTop: 52, paddingBottom: 22, paddingHorizontal: 18, borderBottomLeftRadius: 26, borderBottomRightRadius: 26, overflow: 'hidden', elevation: 6 },
  deco: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.07)' },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.14)', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  title: { color: '#fff', fontSize: 17, fontWeight: '700', flex: 1 },
  liveTag: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 14, paddingHorizontal: 9, paddingVertical: 4 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#4ADE80' },
  liveTagText: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  clock: { color: '#fff', fontSize: 34, fontWeight: '800', marginTop: 14, letterSpacing: 0.5 },
  date: { color: '#C7D2FE', fontSize: 13, marginTop: 2 },

  body: { alignItems: 'center', padding: 20, paddingBottom: 40 },

  camRing: { padding: 5, borderRadius: 110, backgroundColor: '#fff', elevation: 5, shadowColor: INDIGO, shadowOpacity: 0.15, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  camWrap: { width: 190, height: 190, borderRadius: 95, overflow: 'hidden', backgroundColor: '#E5E7EB' },

  locChip: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, backgroundColor: '#fff', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, elevation: 1, maxWidth: '92%' },
  locDot: { width: 7, height: 7, borderRadius: 4 },
  locChipText: { fontSize: 11.5, color: '#374151', fontWeight: '600' },

  punchBtn: { marginTop: 14, borderRadius: 27, elevation: 3, width: '78%' },
  punchBtnDisabled: { elevation: 0 },
  punchGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52, borderRadius: 27 },
  punchText: { color: '#fff', fontSize: 15, fontWeight: '800', letterSpacing: 0.4 },

  permCard: { width: '100%', backgroundColor: '#fff', borderRadius: 20, padding: 22, alignItems: 'center', elevation: 2 },
  permIcon: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center' },
  permTitle: { fontSize: 16, fontWeight: '800', color: '#111827', marginTop: 10 },
  permText: { color: '#6B7280', fontSize: 12.5, textAlign: 'center', marginTop: 6, lineHeight: 18 },
  permBtn: { flexDirection: 'row', gap: 7, alignItems: 'center', marginTop: 16, backgroundColor: INDIGO, borderRadius: 13, paddingHorizontal: 22, paddingVertical: 12, elevation: 2 },
  permBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  hoursPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#EEF2FF', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, marginTop: 18 },
  hoursText: { color: INDIGO, fontWeight: '700', fontSize: 13 },
  trackChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#ECFDF5', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, marginTop: 8 },
  trackDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: GREEN },
  trackText: { color: '#166534', fontSize: 12, fontWeight: '600' },

  travelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', backgroundColor: '#FEF3C7', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 5 },
  travelText: { color: AMBER, fontSize: 11.5, fontWeight: '800' },
  sessCard: { backgroundColor: '#fff', borderRadius: 16, padding: 12, elevation: 1, overflow: 'hidden', shadowColor: '#1E3A8A', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } },
  sessBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 4 },
  sessHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 },
  sessLabel: { fontSize: 12.5, fontWeight: '900', color: '#111827', flex: 1 },
  openPill: { backgroundColor: '#ECFDF5', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  openPillText: { color: GREEN, fontSize: 9, fontWeight: '800' },
  sessTimeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 7 },
  sessTime: { fontSize: 15, fontWeight: '800', color: '#111827' },
  sessDur: { marginLeft: 'auto', color: INDIGO, fontSize: 11.5, fontWeight: '800', backgroundColor: '#EEF2FF', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  lateBadge: { backgroundColor: '#FEE2E2', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  lateText: { color: RED, fontSize: 9, fontWeight: '800' },
  pAddrRow: { flexDirection: 'row', gap: 4, marginTop: 6, alignItems: 'flex-start' },
  pAddr: { flex: 1, fontSize: 11, color: '#6B7280', lineHeight: 15 },

  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.6)', justifyContent: 'center', padding: 22 },
  mCard: { backgroundColor: '#fff', borderRadius: 24, padding: 20, alignItems: 'center', overflow: 'hidden', elevation: 8 },
  mHeadStrip: { position: 'absolute', top: 0, left: 0, right: 0, height: 5 },
  mTitle: { fontSize: 18, fontWeight: '800', color: '#111827', marginTop: 6 },
  mSub: { fontSize: 12.5, color: '#6B7280', marginTop: 3 },
  previewFrame: { padding: 4, borderRadius: 20, backgroundColor: '#F3F4F6', marginTop: 14 },
  preview: { width: 190, height: 190, borderRadius: 16, backgroundColor: '#E5E7EB' },
  siteField: { flexDirection: 'row', alignItems: 'center', gap: 8, width: '100%', backgroundColor: '#F9FAFB', borderWidth: 1.5, borderColor: '#E0E7FF', borderRadius: 12, paddingHorizontal: 12, height: 48, marginTop: 14 },
  siteInput: { flex: 1, fontSize: 14, fontWeight: '700', color: '#111827' },
  mChipCol: { width: '100%', gap: 8, marginTop: 14 },
  mChip: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, backgroundColor: '#F9FAFB', borderRadius: 12, borderWidth: 1, borderColor: '#F3F4F6', paddingHorizontal: 11, paddingVertical: 9 },
  mChipText: { flex: 1, fontSize: 12, color: '#374151', fontWeight: '600', lineHeight: 16 },
  mBtnRow: { flexDirection: 'row', gap: 10, width: '100%', marginTop: 16 },
  outlineBtn: { flex: 1, flexDirection: 'row', gap: 5, height: 48, borderRadius: 13, borderWidth: 1.5, borderColor: '#E5E7EB', justifyContent: 'center', alignItems: 'center' },
  outlineText: { color: '#374151', fontWeight: '700' },
  fillBtn: { flexDirection: 'row', gap: 6, height: 48, borderRadius: 13, justifyContent: 'center', alignItems: 'center' },
  fillText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  mNote: { fontSize: 10.5, color: '#9CA3AF', marginTop: 12 },
  alertIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#FEE2E2', justifyContent: 'center', alignItems: 'center', marginTop: 4 },

  dHead: { flexDirection: 'row', alignItems: 'center', gap: 10, width: '100%', marginTop: 4 },
  dIconWrap: { width: 38, height: 38, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  dClose: { marginLeft: 'auto', width: 34, height: 34, borderRadius: 17, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' },
  photoPair: { flexDirection: 'row', gap: 10, marginTop: 14, width: '100%' },
  photoCol: { flex: 1 },
  photoLabel: { fontSize: 10.5, fontWeight: '800', marginBottom: 6 },
  photoBig: { width: '100%', height: 150, borderRadius: 14, backgroundColor: '#E5E7EB' },
  photoEmpty: { justifyContent: 'center', alignItems: 'center' },
  dRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, width: '100%', marginTop: 12, paddingHorizontal: 4 },
  dRowText: { flex: 1, fontSize: 13, color: '#374151', fontWeight: '600', lineHeight: 18 },
});