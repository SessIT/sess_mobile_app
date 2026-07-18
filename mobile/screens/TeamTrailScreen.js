import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { api } from '../lib/api';

const INDIGO = '#1E3A8A';
const AMBER = '#D97706';
const RED = '#DC2626';
const GAP_MIN = 20; // 15-min interval → 20+ min gap = flag (⚡ 1-min test-ku 3 vachukalam)

const toYMD = (d) => new Date(d.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
const fmtT = (d) => new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
const minsBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 60000);
const initials = (n) => (n || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

export default function TeamTrailScreen({ navigation }) {
  const [users, setUsers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [date, setDate] = useState(new Date());
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api('/users')
      .then(u => { setUsers(u); if (u.length) setSelected(u[0].id); })
      .catch(e => setError(e.message));
  }, []);

  const load = useCallback(async () => {
    if (!selected) return;
    try {
      setError(null);
      setLogs(await api(`/location/user/${selected}?date=${toYMD(date)}`));
    } catch (e) { setError(e.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, [selected, date]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  const isToday = toYMD(date) === toYMD(new Date());
  const shiftDay = (n) => setDate(new Date(date.getTime() + n * 86400000));

  // rows: point + gap markers
  const rows = [];
  logs.forEach((log, i) => {
    if (i > 0) {
      const gap = minsBetween(logs[i - 1].capturedAt, log.capturedAt);
      if (gap > GAP_MIN) rows.push({ type: 'gap', mins: gap, key: `g${i}` });
    }
    const recovered = minsBetween(log.capturedAt, log.createdAt) > 10;
    rows.push({ type: 'point', log, recovered, key: `p${log.id}` });
  });

  const gapCount = rows.filter(r => r.type === 'gap').length;
  const susCount = logs.filter(l => l.suspicious).length;

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginRight: 12 }}>
          <MaterialIcons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>Team Trail</Text>
      </View>

      {/* Employee chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={{ maxHeight: 66 }} contentContainerStyle={styles.chipScroll}>
        {users.map(u => (
          <TouchableOpacity key={u.id}
            style={[styles.empChip, selected === u.id && styles.empChipActive]}
            onPress={() => setSelected(u.id)}>
            <View style={[styles.empAvatar, selected === u.id && { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
              <Text style={[styles.empAvatarText, selected === u.id && { color: '#fff' }]}>
                {initials(u.fullName || u.username)}
              </Text>
            </View>
            <Text style={[styles.empName, selected === u.id && { color: '#fff' }]} numberOfLines={1}>
              {(u.fullName || u.username).split(' ')[0]}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Date nav */}
      <View style={styles.dateRow}>
        <TouchableOpacity onPress={() => shiftDay(-1)} style={styles.dateArrow}>
          <MaterialIcons name="chevron-left" size={24} color={INDIGO} />
        </TouchableOpacity>
        <View style={{ alignItems: 'center' }}>
          <Text style={styles.dateText}>{isToday ? 'Today' : date.toDateString()}</Text>
          <Text style={styles.dateSub}>{toYMD(date)}</Text>
        </View>
        <TouchableOpacity onPress={() => shiftDay(1)} disabled={isToday}
          style={[styles.dateArrow, isToday && { opacity: 0.3 }]}>
          <MaterialIcons name="chevron-right" size={24} color={INDIGO} />
        </TouchableOpacity>
      </View>

      {/* Summary */}
      {!loading && logs.length > 0 && (
        <View style={styles.summaryRow}>
          <View style={styles.sumPill}><Text style={styles.sumText}>{logs.length} points</Text></View>
          <View style={styles.sumPill}><Text style={styles.sumText}>{fmtT(logs[0].capturedAt)} – {fmtT(logs[logs.length - 1].capturedAt)}</Text></View>
          {gapCount > 0 && <View style={[styles.sumPill, { backgroundColor: '#FEF3C7' }]}><Text style={[styles.sumText, { color: AMBER }]}>⚠ {gapCount} gaps</Text></View>}
          {susCount > 0 && <View style={[styles.sumPill, { backgroundColor: '#FEE2E2' }]}><Text style={[styles.sumText, { color: RED }]}>🚩 {susCount}</Text></View>}
        </View>
      )}

      {loading ? (
        <ActivityIndicator size="large" color={INDIGO} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        >
          {error && <Text style={styles.error}>{error}</Text>}
          {!error && rows.length === 0 && (
            <View style={styles.empty}>
              <MaterialIcons name="location-off" size={42} color="#D1D5DB" />
              <Text style={styles.emptyText}>No tracking data for this day</Text>
            </View>
          )}

          {rows.map((r, idx) => r.type === 'gap' ? (
            <View key={r.key} style={styles.gapRow}>
              <View style={styles.gapLine} />
              <View style={styles.gapBadge}>
                <MaterialIcons name="signal-wifi-off" size={13} color={AMBER} />
                <Text style={styles.gapText}>No location for ~{r.mins} min</Text>
              </View>
              <View style={styles.gapLine} />
            </View>
          ) : (
            <View key={r.key} style={styles.pointRow}>
              <Text style={styles.pointTime}>{fmtT(r.log.capturedAt)}</Text>
              <View style={styles.dotCol}>
                <View style={[styles.dot, r.log.suspicious && { backgroundColor: RED }]} />
                {idx < rows.length - 1 && <View style={styles.line} />}
              </View>
              <View style={styles.pointCard}>
                <Text style={styles.pointAddr}>
                  {r.log.address || `${r.log.lat.toFixed(5)}, ${r.log.lng.toFixed(5)}`}
                </Text>
                <View style={styles.badgeRow}>
                  {r.log.acc != null && <Text style={styles.accText}>±{Math.round(r.log.acc)}m</Text>}
                  {r.recovered && (
                    <View style={styles.recBadge}>
                      <MaterialIcons name="inventory-2" size={11} color="#2563EB" />
                      <Text style={styles.recText}>offline · sent {fmtT(r.log.createdAt)}</Text>
                    </View>
                  )}
                  {r.log.suspicious && (
                    <View style={styles.susBadge}>
                      <MaterialIcons name="flag" size={11} color={RED} />
                      <Text style={styles.susText}>time mismatch</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  header: { backgroundColor: INDIGO, paddingTop: 56, paddingBottom: 16, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' },
  title: { color: '#fff', fontSize: 18, fontWeight: '600' },
  chipScroll: { paddingHorizontal: 14, paddingVertical: 12, gap: 8 },
  empChip: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#fff', borderRadius: 22, paddingLeft: 5, paddingRight: 13, height: 42, elevation: 1, borderWidth: 1, borderColor: '#E5E7EB' },
  empChipActive: { backgroundColor: INDIGO, borderColor: INDIGO },
  empAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center' },
  empAvatarText: { color: INDIGO, fontWeight: '800', fontSize: 12 },
  empName: { fontSize: 13, fontWeight: '600', color: '#374151', maxWidth: 90 },
  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', marginHorizontal: 16, borderRadius: 14, paddingHorizontal: 8, paddingVertical: 8, elevation: 1 },
  dateArrow: { padding: 6 },
  dateText: { fontSize: 15, fontWeight: '700', color: '#111827' },
  dateSub: { fontSize: 11, color: '#9CA3AF' },
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  sumPill: { backgroundColor: '#EEF2FF', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 },
  sumText: { fontSize: 11.5, fontWeight: '700', color: INDIGO },
  pointRow: { flexDirection: 'row', alignItems: 'flex-start' },
  pointTime: { width: 58, fontSize: 12.5, fontWeight: '700', color: '#374151', paddingTop: 2 },
  dotCol: { width: 22, alignItems: 'center' },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#16A34A', borderWidth: 2, borderColor: '#fff', elevation: 1, marginTop: 3 },
  line: { flex: 1, width: 2, backgroundColor: '#E5E7EB', marginVertical: 2, minHeight: 30 },
  pointCard: { flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 11, marginBottom: 12, elevation: 1 },
  pointAddr: { fontSize: 12.5, color: '#111827', lineHeight: 17 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6, alignItems: 'center' },
  accText: { fontSize: 10.5, color: '#9CA3AF', fontWeight: '600' },
  recBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#EFF6FF', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  recText: { fontSize: 10, color: '#2563EB', fontWeight: '600' },
  susBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#FEE2E2', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  susText: { fontSize: 10, color: RED, fontWeight: '700' },
  gapRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 4, marginBottom: 12, paddingLeft: 58 },
  gapLine: { flex: 1, height: 1, backgroundColor: '#FDE68A' },
  gapBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FEF3C7', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
  gapText: { fontSize: 10.5, color: AMBER, fontWeight: '700' },
  error: { color: RED, textAlign: 'center', marginTop: 20 },
  empty: { alignItems: 'center', marginTop: 60, gap: 10 },
  emptyText: { color: '#9CA3AF', fontSize: 14 },
});