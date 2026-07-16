import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  Alert, Modal, Image, ScrollView,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { api, API_URL } from '../lib/api';

const INDIGO = '#1E3A8A';
const GREEN = '#16A34A';
const RED = '#DC2626';
const BASE = API_URL.replace('/api', '');

const fmtTime = (d) => d ? new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '--:--';

// coords → human address (free, on-device geocoder)
async function coordsToAddress(lat, lng) {
  try {
    const results = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    if (!results?.length) return null;
    const a = results[0];
    if (a.formattedAddress) return a.formattedAddress;
    const parts = [a.name, a.street, a.district, a.city, a.postalCode].filter(Boolean);
    return [...new Set(parts)].join(', ') || null;
  } catch { return null; }
}

const PunchCard = ({ label, color, photo, time, address, late, active }) => (
  <View style={[styles.pCard, !active && styles.pCardEmpty]}>
    <View style={[styles.pBar, { backgroundColor: active ? color : '#D1D5DB' }]} />
    <Text style={[styles.pLabel, { color: active ? color : '#9CA3AF' }]}>{label}</Text>
    {photo ? (
      <Image source={{ uri: photo }} style={styles.pPhoto} />
    ) : (
      <View style={[styles.pPhoto, styles.pPhotoEmpty]}>
        <MaterialIcons name="schedule" size={26} color="#9CA3AF" />
      </View>
    )}
    <View style={styles.pTimeRow}>
      <Text style={[styles.pTime, !active && { color: '#9CA3AF' }]}>{time}</Text>
      {late ? <View style={styles.lateBadge}><Text style={styles.lateText}>LATE</Text></View> : null}
    </View>
    <View style={styles.pAddrRow}>
      <MaterialIcons name="location-on" size={13} color={active ? '#6B7280' : '#C4C4C4'} />
      <Text style={styles.pAddr} numberOfLines={3}>{address || (active ? 'No location' : 'Waiting…')}</Text>
    </View>
  </View>
);

export default function PunchScreen({ navigation }) {
  const [now, setNow] = useState(new Date());
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pendingPhoto, setPendingPhoto] = useState(null);
  const [capturedAt, setCapturedAt] = useState(null);
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef(null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    try { setSession(await api('/attendance/today')); }
    catch (e) { Alert.alert('Error', e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const fmtDuration = (hoursDecimal) => {
  if (hoursDecimal == null) return '--';
  const totalMins = Math.round(hoursDecimal * 60);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return `${h}h ${m}m`;
};

  const punchedIn = !!(session && !session.punchOutTime);
  const done = !!(session && session.punchOutTime);
  // const liveHours = punchedIn ? ((now - new Date(session.punchInTime)) / 3600000).toFixed(2) : null;
  const liveHours = punchedIn ? (now - new Date(session.punchInTime)) / 3600000 : null;
  const capture = async () => {
    if (!cameraRef.current) return;
    setBusy(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.3, base64: true, skipProcessing: true,
      });
      setPendingPhoto({ uri: photo.uri, base64: photo.base64 });
      setCapturedAt(new Date());
    } catch (e) {
      Alert.alert('Camera error', e.message);
    } finally { setBusy(false); }
  };

  const confirmPunch = async () => {
    setBusy(true);
    try {
      let coords = {};
      let address = null;
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        coords = {
          lat: loc.coords.latitude,
          lng: loc.coords.longitude,
          acc: Math.round(loc.coords.accuracy),
        };
        address = await coordsToAddress(coords.lat, coords.lng);
      }
      const path = punchedIn ? '/attendance/punch-out' : '/attendance/punch-in';
      const s = await api(path, {
        method: 'POST',
        body: JSON.stringify({ ...coords, address, photoBase64: pendingPhoto.base64 }),
      });
      setSession(s);
      setPendingPhoto(null);
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

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginRight: 12 }}>
          <MaterialIcons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>Attendance</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={styles.clock}>{now.toLocaleTimeString('en-IN')}</Text>
        <Text style={styles.date}>{now.toDateString()}</Text>

        {loading ? <ActivityIndicator size="large" color={INDIGO} style={{ marginTop: 40 }} /> : done ? (
          <View style={[styles.camWrap, styles.doneCircle]}>
            <MaterialIcons name="check-circle" size={60} color="#fff" />
            <Text style={styles.doneText}>DAY DONE</Text>
          </View>
        ) : !permission?.granted ? (
          <View style={[styles.camWrap, styles.permBox]}>
            <MaterialIcons name="no-photography" size={40} color="#6B7280" />
            <Text style={styles.permText}>Could you please give access to your camera?</Text>
            <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
              <Text style={styles.permBtnText}>Allow Camera</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={styles.camWrap}>
              <CameraView ref={cameraRef} facing="front" style={{ flex: 1 }} />
            </View>
            <TouchableOpacity
              style={[styles.punchBtn, { backgroundColor: punchedIn ? RED : GREEN }, busy && { opacity: 0.7 }]}
              onPress={capture}
              disabled={busy}
              activeOpacity={0.85}
            >
              {busy && !pendingPhoto ? <ActivityIndicator color="#fff" /> : (
                <>
                  <MaterialIcons name="photo-camera" size={22} color="#fff" />
                  <Text style={styles.punchText}>{punchedIn ? 'PUNCH OUT' : 'PUNCH IN'}</Text>
                </>
              )}
            </TouchableOpacity>
          </>
        )}

        {!loading && (
          <>
            <View style={styles.hoursPill}>
              <MaterialIcons name="timer" size={16} color={INDIGO} />
              <Text style={styles.hoursText}>
                {done ? `${fmtDuration(session.workingHours)} worked` : punchedIn ? `${fmtDuration(liveHours)} (live)` : 'Day not started'}
              </Text>
            </View>

            <View style={styles.widgetRow}>
              <PunchCard
                label="PUNCH IN"
                color={GREEN}
                active={!!session}
                photo={session?.punchInPhoto ? `${BASE}/${session.punchInPhoto}` : null}
                time={fmtTime(session?.punchInTime)}
                address={inAddr}
                late={session?.isLate}
              />
              <PunchCard
                label="PUNCH OUT"
                color={RED}
                active={done}
                photo={session?.punchOutPhoto ? `${BASE}/${session.punchOutPhoto}` : null}
                time={fmtTime(session?.punchOutTime)}
                address={outAddr}
              />
            </View>
          </>
        )}
      </ScrollView>

      <Modal visible={!!pendingPhoto} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>Confirm {punchedIn ? 'Punch Out' : 'Punch In'}</Text>
            {pendingPhoto && <Image source={{ uri: pendingPhoto.uri }} style={styles.preview} />}
            <Text style={styles.confirmTime}>{capturedAt ? capturedAt.toLocaleTimeString('en-IN') : ''}</Text>
            <Text style={styles.confirmDate}>{capturedAt ? capturedAt.toDateString() : ''}</Text>
            <View style={styles.confirmBtnRow}>
              <TouchableOpacity style={styles.cancelBtn} disabled={busy} onPress={() => setPendingPhoto(null)}>
                <Text style={styles.cancelText}>Retake</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmBtn, { backgroundColor: punchedIn ? RED : GREEN }, busy && { opacity: 0.7 }]}
                disabled={busy} onPress={confirmPunch}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.confirmBtnText}>Confirm</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  header: { backgroundColor: INDIGO, paddingTop: 56, paddingBottom: 16, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' },
  title: { color: '#fff', fontSize: 18, fontWeight: '600' },
  body: { alignItems: 'center', padding: 20, paddingBottom: 40 },
  clock: { fontSize: 36, fontWeight: '700', color: '#111827', marginTop: 4 },
  date: { fontSize: 13, color: '#6B7280', marginBottom: 16 },
  camWrap: { width: 200, height: 200, borderRadius: 100, overflow: 'hidden', borderWidth: 4, borderColor: INDIGO, elevation: 4, backgroundColor: '#E5E7EB' },
  doneCircle: { backgroundColor: '#9CA3AF', justifyContent: 'center', alignItems: 'center', borderColor: '#9CA3AF' },
  doneText: { color: '#fff', fontWeight: '700', marginTop: 6, fontSize: 15 },
  permBox: { justifyContent: 'center', alignItems: 'center', padding: 16, borderColor: '#D1D5DB' },
  permText: { color: '#6B7280', fontSize: 12, textAlign: 'center', marginTop: 8 },
  permBtn: { marginTop: 10, backgroundColor: INDIGO, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  permBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  punchBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 50, borderRadius: 25, paddingHorizontal: 30, marginTop: 14, elevation: 3 },
  punchText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  hoursPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#EEF2FF', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, marginTop: 18 },
  hoursText: { color: INDIGO, fontWeight: '700', fontSize: 13 },
  widgetRow: { flexDirection: 'row', gap: 12, marginTop: 14, width: '100%' },
  pCard: { flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 12, elevation: 1, overflow: 'hidden' },
  pCardEmpty: { opacity: 0.85 },
  pBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 4 },
  pLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5, marginTop: 4 },
  pPhoto: { width: '100%', height: 110, borderRadius: 12, marginTop: 8, backgroundColor: '#E5E7EB' },
  pPhotoEmpty: { justifyContent: 'center', alignItems: 'center' },
  pTimeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  pTime: { fontSize: 18, fontWeight: '700', color: '#111827' },
  lateBadge: { backgroundColor: '#FEE2E2', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  lateText: { color: RED, fontSize: 9, fontWeight: '700' },
  pAddrRow: { flexDirection: 'row', gap: 4, marginTop: 6, alignItems: 'flex-start' },
  pAddr: { flex: 1, fontSize: 11, color: '#6B7280', lineHeight: 15 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 24 },
  confirmCard: { backgroundColor: '#fff', borderRadius: 20, padding: 20, alignItems: 'center' },
  confirmTitle: { fontSize: 17, fontWeight: '700', color: '#111827', marginBottom: 14 },
  preview: { width: 200, height: 200, borderRadius: 16, backgroundColor: '#E5E7EB' },
  confirmTime: { fontSize: 30, fontWeight: '700', color: '#111827', marginTop: 14 },
  confirmDate: { fontSize: 13, color: '#6B7280', marginBottom: 18 },
  confirmBtnRow: { flexDirection: 'row', gap: 12, width: '100%' },
  cancelBtn: { flex: 1, height: 48, borderRadius: 12, borderWidth: 1, borderColor: '#D1D5DB', justifyContent: 'center', alignItems: 'center' },
  cancelText: { color: '#374151', fontWeight: '600' },
  confirmBtn: { flex: 1, height: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  confirmBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});