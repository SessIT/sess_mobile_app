import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Modal, Image,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { api, API_URL } from '../lib/api';

const INDIGO = '#1E3A8A';
const GREEN = '#16A34A';
const RED = '#DC2626';
const BASE = API_URL.replace('/api', '');

const fmtT = (d) => d ? new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '--:--';
const fmtDuration = (h) => {
  if (h == null) return '--';
  const m = Math.round(h * 60);
  return `${Math.floor(m / 60)}h ${m % 60}m`;
};
const dayNum = (d) => new Date(d).getDate();
const weekday = (d) => new Date(d).toLocaleDateString('en-IN', { weekday: 'short' });
const monthYr = (d) => new Date(d).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
const isToday = (d) => new Date(d).toDateString() === new Date().toDateString();

export default function MyAttendanceScreen({ navigation }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [detail, setDetail] = useState(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setSessions(await api('/attendance/my?days=30'));
    } catch (e) { setError(e.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => {
    const unsub = navigation.addListener('focus', load);
    return unsub;
  }, [navigation, load]);

  // Summary (loaded 30-day window)
  const presentDays = sessions.length;
  const totalHours = sessions.reduce((s, x) => s + (x.workingHours || 0), 0);
  const lateCount = sessions.filter(x => x.isLate).length;

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <LinearGradient
        colors={['#1E40AF', '#1E3A8A', '#312E81']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <View style={[styles.deco, { width: 160, height: 160, top: -55, right: -45 }]} />
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.title}>My Attendance</Text>
        </View>

        <View style={styles.statRow}>
          <View style={styles.statBox}>
            <Text style={styles.statNum}>{presentDays}</Text>
            <Text style={styles.statLabel}>Days</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={styles.statNum}>{fmtDuration(totalHours)}</Text>
            <Text style={styles.statLabel}>Worked</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={[styles.statNum, lateCount > 0 && { color: '#FCA5A5' }]}>{lateCount}</Text>
            <Text style={styles.statLabel}>Late</Text>
          </View>
        </View>
        <Text style={styles.statHint}>Last 30 days</Text>
      </LinearGradient>

      {loading ? (
        <ActivityIndicator size="large" color={INDIGO} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        >
          {error && <Text style={styles.error}>{error}</Text>}
          {!error && sessions.length === 0 && (
            <View style={styles.empty}>
              <MaterialIcons name="event-busy" size={44} color="#D1D5DB" />
              <Text style={styles.emptyText}>No attendance records yet</Text>
            </View>
          )}

          {sessions.map(s => {
            const open = !s.punchOutTime;
            return (
              <TouchableOpacity key={s.id} style={styles.card} activeOpacity={0.85} onPress={() => setDetail(s)}>
                <View style={[styles.dateBlock, isToday(s.punchInTime) && { backgroundColor: INDIGO }]}>
                  <Text style={[styles.dateNum, isToday(s.punchInTime) && { color: '#fff' }]}>{dayNum(s.punchInTime)}</Text>
                  <Text style={[styles.dateWk, isToday(s.punchInTime) && { color: '#C7D2FE' }]}>{weekday(s.punchInTime)}</Text>
                </View>

                <View style={{ flex: 1 }}>
                  <View style={styles.timeRow}>
                    <MaterialIcons name="login" size={14} color={GREEN} />
                    <Text style={styles.timeText}>{fmtT(s.punchInTime)}</Text>
                    <MaterialIcons name="arrow-forward" size={12} color="#9CA3AF" />
                    <MaterialIcons name="logout" size={14} color={open ? '#9CA3AF' : RED} />
                    <Text style={[styles.timeText, open && { color: '#9CA3AF' }]}>{fmtT(s.punchOutTime)}</Text>
                    {s.isLate && <View style={styles.lateBadge}><Text style={styles.lateText}>LATE</Text></View>}
                  </View>
                  <View style={styles.addrRow}>
                    <MaterialIcons name="location-on" size={12} color="#9CA3AF" />
                    <Text style={styles.addrText} numberOfLines={1}>
                      {s.punchInAddress || (s.punchInLat ? `${s.punchInLat.toFixed(4)}, ${s.punchInLng.toFixed(4)}` : 'No address')}
                    </Text>
                  </View>
                </View>

                <View style={styles.durCol}>
                  {open ? (
                    <View style={styles.openPill}><Text style={styles.openText}>In progress</Text></View>
                  ) : (
                    <View style={styles.durPill}><Text style={styles.durText}>{fmtDuration(s.workingHours)}</Text></View>
                  )}
                  <Text style={styles.monthText}>{monthYr(s.punchInTime)}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* Detail popup */}
      <Modal visible={!!detail} transparent animationType="slide">
        <View style={styles.overlay}>
          {detail && (
            <View style={styles.mCard}>
              <View style={styles.mHead}>
                <View style={styles.mDateBlock}>
                  <Text style={styles.mDateNum}>{dayNum(detail.punchInTime)}</Text>
                  <Text style={styles.mDateWk}>{weekday(detail.punchInTime)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.mTitle}>{new Date(detail.punchInTime).toDateString()}</Text>
                  <Text style={styles.mSub}>
                    {detail.punchOutTime ? `${fmtDuration(detail.workingHours)} worked` : 'In progress'}
                    {detail.isLate ? ' • Late arrival' : ''}
                  </Text>
                </View>
                <TouchableOpacity style={styles.mClose} onPress={() => setDetail(null)}>
                  <MaterialIcons name="close" size={20} color="#6B7280" />
                </TouchableOpacity>
              </View>

              <View style={styles.photoPair}>
                <View style={styles.photoCol}>
                  <Text style={[styles.photoLabel, { color: GREEN }]}>IN • {fmtT(detail.punchInTime)}</Text>
                  {detail.punchInPhoto ? (
                    <Image source={{ uri: `${BASE}/${detail.punchInPhoto}` }} style={styles.photoBig} />
                  ) : (
                    <View style={[styles.photoBig, styles.photoEmpty]}>
                      <MaterialIcons name="no-photography" size={24} color="#C4C4C4" />
                    </View>
                  )}
                </View>
                <View style={styles.photoCol}>
                  <Text style={[styles.photoLabel, { color: RED }]}>OUT • {fmtT(detail.punchOutTime)}</Text>
                  {detail.punchOutPhoto ? (
                    <Image source={{ uri: `${BASE}/${detail.punchOutPhoto}` }} style={styles.photoBig} />
                  ) : (
                    <View style={[styles.photoBig, styles.photoEmpty]}>
                      <MaterialIcons name="schedule" size={24} color="#C4C4C4" />
                    </View>
                  )}
                </View>
              </View>

              <View style={styles.dRow}>
                <MaterialIcons name="location-on" size={16} color={GREEN} />
                <Text style={styles.dRowText}>{detail.punchInAddress || 'No address (in)'}</Text>
              </View>
              {detail.punchOutTime && (
                <View style={styles.dRow}>
                  <MaterialIcons name="location-on" size={16} color={RED} />
                  <Text style={styles.dRowText}>{detail.punchOutAddress || 'No address (out)'}</Text>
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
  header: { paddingTop: 52, paddingBottom: 18, paddingHorizontal: 18, borderBottomLeftRadius: 26, borderBottomRightRadius: 26, overflow: 'hidden', elevation: 6 },
  deco: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.07)' },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.14)', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  title: { color: '#fff', fontSize: 17, fontWeight: '700' },
  statRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 18, marginTop: 16, paddingVertical: 12 },
  statBox: { flex: 1, alignItems: 'center' },
  statNum: { color: '#fff', fontSize: 19, fontWeight: '800' },
  statLabel: { color: '#C7D2FE', fontSize: 11, marginTop: 2, fontWeight: '600' },
  statDivider: { width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.2)' },
  statHint: { color: 'rgba(199,210,254,0.7)', fontSize: 10.5, textAlign: 'center', marginTop: 8 },

  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 16, padding: 12, marginBottom: 10, elevation: 1, shadowColor: '#1E3A8A', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } },
  dateBlock: { width: 48, height: 52, borderRadius: 13, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center' },
  dateNum: { fontSize: 18, fontWeight: '800', color: INDIGO },
  dateWk: { fontSize: 10, fontWeight: '700', color: '#6B7280', marginTop: 1 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  timeText: { fontSize: 13.5, fontWeight: '700', color: '#111827' },
  lateBadge: { backgroundColor: '#FEE2E2', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2, marginLeft: 2 },
  lateText: { color: RED, fontSize: 8.5, fontWeight: '800' },
  addrRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5 },
  addrText: { flex: 1, fontSize: 11, color: '#9CA3AF' },
  durCol: { alignItems: 'flex-end', gap: 5 },
  durPill: { backgroundColor: '#EEF2FF', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
  durText: { color: INDIGO, fontSize: 11.5, fontWeight: '800' },
  openPill: { backgroundColor: '#ECFDF5', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
  openText: { color: GREEN, fontSize: 10.5, fontWeight: '800' },
  monthText: { fontSize: 9.5, color: '#C4C4C4', fontWeight: '600' },

  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.6)', justifyContent: 'center', padding: 22 },
  mCard: { backgroundColor: '#fff', borderRadius: 24, padding: 18, elevation: 8 },
  mHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  mDateBlock: { width: 46, height: 50, borderRadius: 12, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center' },
  mDateNum: { fontSize: 17, fontWeight: '800', color: INDIGO },
  mDateWk: { fontSize: 9.5, fontWeight: '700', color: '#6B7280' },
  mTitle: { fontSize: 15, fontWeight: '800', color: '#111827' },
  mSub: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  mClose: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' },
  photoPair: { flexDirection: 'row', gap: 10, marginTop: 14 },
  photoCol: { flex: 1 },
  photoLabel: { fontSize: 10.5, fontWeight: '800', marginBottom: 6 },
  photoBig: { width: '100%', height: 150, borderRadius: 14, backgroundColor: '#E5E7EB' },
  photoEmpty: { justifyContent: 'center', alignItems: 'center' },
  dRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 12 },
  dRowText: { flex: 1, fontSize: 12.5, color: '#374151', fontWeight: '600', lineHeight: 17 },

  error: { color: RED, textAlign: 'center', marginTop: 20 },
  empty: { alignItems: 'center', marginTop: 60, gap: 10 },
  emptyText: { color: '#9CA3AF', fontSize: 14 },
});