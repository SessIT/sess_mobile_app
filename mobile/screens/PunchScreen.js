import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  Modal, Image, ScrollView, Alert,
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

/* ---------- Punch widget card (tappable) ---------- */
const PunchCard = ({ label, color, photo, time, address, late, active, onPress }) => (
  <TouchableOpacity
    style={[styles.pCard, !active && styles.pCardEmpty]}
    activeOpacity={active ? 0.85 : 1}
    onPress={active ? onPress : undefined}
  >
    <View style={[styles.pBar, { backgroundColor: active ? color : '#D1D5DB' }]} />
    <View style={styles.pHead}>
      <Text style={[styles.pLabel, { color: active ? color : '#9CA3AF' }]}>{label}</Text>
      {active && <MaterialIcons name="open-in-full" size={13} color="#9CA3AF" />}
    </View>
    {photo ? (
      <Image source={{ uri: photo }} style={styles.pPhoto} />
    ) : (
      <View style={[styles.pPhoto, styles.pPhotoEmpty]}>
        <MaterialIcons name="schedule" size={26} color="#C4C4C4" />
      </View>
    )}
    <View style={styles.pTimeRow}>
      <Text style={[styles.pTime, !active && { color: '#9CA3AF' }]}>{time}</Text>
      {late ? <View style={styles.lateBadge}><Text style={styles.lateText}>LATE</Text></View> : null}
    </View>
    <View style={styles.pAddrRow}>
      <MaterialIcons name="location-on" size={13} color={active ? '#6B7280' : '#C4C4C4'} />
      <Text style={styles.pAddr} numberOfLines={2}>{address || (active ? 'No address' : 'Waiting…')}</Text>
    </View>
  </TouchableOpacity>
);

export default function PunchScreen({ navigation }) {
  const [now, setNow] = useState(new Date());
  const [session, setSession] = useState(null);
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
  const [detailModal, setDetailModal] = useState(null); // 'in' | 'out' | null
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
      const s = await api('/attendance/today');
      setSession(s);
      if (s && !s.punchOutTime) startTracking(); else stopTracking();
    }
    catch (e) { Alert.alert('Error', e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

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

  const punchedIn = !!(session && !session.punchOutTime);
  const done = !!(session && session.punchOutTime);
  const liveHours = punchedIn ? (now - new Date(session.punchInTime)) / 3600000 : null;

  useEffect(() => {
    if (locPermission?.granted && !done) {
      prefetchLocation();
      const t = setInterval(prefetchLocation, 60 * 1000);
      return () => clearInterval(t);
    }
  }, [locPermission?.granted, done, prefetchLocation]);

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
        setLocModal(true); // premium popup — NO LOCATION = NO PUNCH
        return;
      }
      coords = pf.coords; address = pf.address;

      const path = punchedIn ? '/attendance/punch-out' : '/attendance/punch-in';
      const s = await api(path, {
        method: 'POST',
        body: JSON.stringify({ ...coords, address, photoBase64: pendingPhoto.base64 }),
      });
      setSession(s);
      if (!s.punchOutTime) startTracking(); else stopTracking();
      setPendingPhoto(null);
      prefetchLocation();
    } catch (e) {
      Alert.alert('Punch failed', e.message);
      load();
      setPendingPhoto(null);
    } finally { setBusy(false); }
  };

  const inAddr = session?.punchInAddress
    || (session?.punchInLat ? `${session.punchInLat.toFixed(4)}, ${session.punchInLng.toFixed(4)}` : null);
  const outAddr = session?.punchOutAddress
    || (session?.punchOutLat ? `${session.punchOutLat.toFixed(4)}, ${session.punchOutLng.toFixed(4)}` : null);

  const detail = detailModal === 'in' ? {
    label: 'Punch In', color: GREEN, icon: 'login',
    photo: session?.punchInPhoto ? `${BASE}/${session.punchInPhoto}` : null,
    time: fmtTime(session?.punchInTime),
    dateStr: session?.punchInTime ? new Date(session.punchInTime).toDateString() : '',
    address: inAddr, acc: session?.punchInAcc, late: session?.isLate,
  } : detailModal === 'out' ? {
    label: 'Punch Out', color: RED, icon: 'logout',
    photo: session?.punchOutPhoto ? `${BASE}/${session.punchOutPhoto}` : null,
    time: fmtTime(session?.punchOutTime),
    dateStr: session?.punchOutTime ? new Date(session.punchOutTime).toDateString() : '',
    address: outAddr, acc: session?.punchOutAcc, late: false,
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
        {loading ? <ActivityIndicator size="large" color={INDIGO} style={{ marginTop: 40 }} /> : done ? (
          <View style={styles.doneWrap}>
            <View style={styles.doneCircle}>
              <MaterialIcons name="task-alt" size={54} color="#fff" />
            </View>
            <Text style={styles.doneTitle}>Day Completed</Text>
            <Text style={styles.doneSub}>{fmtDuration(session.workingHours)} worked today</Text>
          </View>
        ) : (!permission?.granted || !locPermission?.granted) ? (
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
                {done ? `${fmtDuration(session.workingHours)} worked` : punchedIn ? `${fmtDuration(liveHours)} (live)` : 'Day not started'}
              </Text>
            </View>

            {punchedIn && (
              <View style={styles.trackChip}>
                <View style={styles.trackDot} />
                <Text style={styles.trackText}>
                  Live tracking {pending > 0 ? ` • ${pending} pending ⏳` : ''}
                </Text>
              </View>
            )}

            <View style={styles.widgetRow}>
              <PunchCard
                label="PUNCH IN" color={GREEN} active={!!session}
                photo={session?.punchInPhoto ? `${BASE}/${session.punchInPhoto}` : null}
                time={fmtTime(session?.punchInTime)}
                address={inAddr} late={session?.isLate}
                onPress={() => setDetailModal('in')}
              />
              <PunchCard
                label="PUNCH OUT" color={RED} active={done}
                photo={session?.punchOutPhoto ? `${BASE}/${session.punchOutPhoto}` : null}
                time={fmtTime(session?.punchOutTime)}
                address={outAddr}
                onPress={() => setDetailModal('out')}
              />
            </View>
          </>
        )}
      </ScrollView>

      {/* ===== POPUP 1: Confirm (premium) ===== */}
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

      {/* ===== POPUP 2: Location required (premium) ===== */}
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

      {/* ===== POPUP 3: Widget detail (NEW) ===== */}
      <Modal visible={!!detail} transparent animationType="slide">
        <View style={styles.overlay}>
          {detail && (
            <View style={styles.mCard}>
              <View style={[styles.mHeadStrip, { backgroundColor: detail.color }]} />
              <View style={styles.dHead}>
                <View style={[styles.dIconWrap, { backgroundColor: detail.color + '15' }]}>
                  <MaterialIcons name={detail.icon} size={20} color={detail.color} />
                </View>
                <Text style={styles.mTitle}>{detail.label} Details</Text>
                <TouchableOpacity style={styles.dClose} onPress={() => setDetailModal(null)}>
                  <MaterialIcons name="close" size={20} color="#6B7280" />
                </TouchableOpacity>
              </View>

              {detail.photo ? (
                <Image source={{ uri: detail.photo }} style={styles.dPhoto} />
              ) : (
                <View style={[styles.dPhoto, styles.pPhotoEmpty]}>
                  <MaterialIcons name="no-photography" size={30} color="#C4C4C4" />
                </View>
              )}

              <View style={styles.dRow}>
                <MaterialIcons name="schedule" size={17} color={INDIGO} />
                <Text style={styles.dRowText}>{detail.time} • {detail.dateStr}</Text>
                {detail.late ? <View style={styles.lateBadge}><Text style={styles.lateText}>LATE</Text></View> : null}
              </View>
              <View style={styles.dRow}>
                <MaterialIcons name="location-on" size={17} color={GREEN} />
                <Text style={styles.dRowText}>{detail.address || 'No address captured'}</Text>
              </View>
              {detail.acc != null && (
                <View style={styles.dRow}>
                  <MaterialIcons name="gps-fixed" size={17} color="#6B7280" />
                  <Text style={styles.dRowText}>Accuracy: ±{Math.round(detail.acc)} meters</Text>
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

  doneWrap: { alignItems: 'center', marginTop: 6 },
  doneCircle: { width: 120, height: 120, borderRadius: 60, backgroundColor: '#9CA3AF', justifyContent: 'center', alignItems: 'center', elevation: 3 },
  doneTitle: { fontSize: 18, fontWeight: '800', color: '#111827', marginTop: 12 },
  doneSub: { fontSize: 13, color: '#6B7280', marginTop: 2 },

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

  widgetRow: { flexDirection: 'row', gap: 12, marginTop: 16, width: '100%' },
  pCard: { flex: 1, backgroundColor: '#fff', borderRadius: 18, padding: 12, elevation: 2, overflow: 'hidden', shadowColor: '#1E3A8A', shadowOpacity: 0.07, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  pCardEmpty: { opacity: 0.85 },
  pBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 4 },
  pHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  pLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  pPhoto: { width: '100%', height: 108, borderRadius: 12, marginTop: 8, backgroundColor: '#E5E7EB' },
  pPhotoEmpty: { justifyContent: 'center', alignItems: 'center' },
  pTimeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  pTime: { fontSize: 18, fontWeight: '800', color: '#111827' },
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
  dPhoto: { width: '100%', height: 240, borderRadius: 16, marginTop: 14, backgroundColor: '#E5E7EB' },
  dRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, width: '100%', marginTop: 12, paddingHorizontal: 4 },
  dRowText: { flex: 1, fontSize: 13, color: '#374151', fontWeight: '600', lineHeight: 18 },
});