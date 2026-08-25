import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  ActivityIndicator, RefreshControl, Modal, TextInput, Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { Calendar } from 'react-native-calendars';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { api } from '../lib/api';
import { GradientHeader, BottomNav, Chip, PrimaryButton , SheetOverlay} from '../components/ui';
import { COLORS, RADIUS, SHADOW } from '../lib/theme';

const GAP_MIN = 8; // 5-min capture interval → 8+ min illa-na gap flag

const todayYMD = () => {
  const d = new Date(Date.now() + 5.5 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
};
const fmtT = (d) => new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
const minsBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 60000);
const initials = (n) => (n || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
const prettyDate = (ymd) => {
  if (ymd === todayYMD()) return 'Today';
  return new Date(ymd + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

export default function TeamTrailScreen({ navigation }) {
  const [users, setUsers] = useState([]);
  const [selected, setSelected] = useState(null); // user object
  const [date, setDate] = useState(todayYMD());   // 'YYYY-MM-DD'
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [empModal, setEmpModal] = useState(false);
  const [calModal, setCalModal] = useState(false);
  const [search, setSearch] = useState('');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    api('/users')
      .then(u => { setUsers(u); if (u.length) setSelected(u[0]); })
      .catch(e => setError(e.message));
  }, []);

  const load = useCallback(async () => {
    if (!selected) return;
    setLoading(true);
    try {
      setError(null);
      setLogs(await api(`/location/user/${selected.id}?date=${date}`));
    } catch (e) { setError(e.message); setLogs([]); }
    finally { setLoading(false); setRefreshing(false); }
  }, [selected, date]);

  useEffect(() => { load(); }, [load]);

  /* ---------- rows: points + gap markers ---------- */
  const rows = [];
  logs.forEach((log, i) => {
    if (i > 0) {
      const gap = minsBetween(logs[i - 1].capturedAt, log.capturedAt);
      if (gap > GAP_MIN) rows.push({ type: 'gap', mins: gap, key: `g${i}` });
    }
    rows.push({
      type: 'point', log,
      recovered: minsBetween(log.capturedAt, log.createdAt) > 10,
      key: `p${log.id}`,
    });
  });
  const gapCount = rows.filter(r => r.type === 'gap').length;
  const susCount = logs.filter(l => l.suspicious).length;

  const filteredUsers = users.filter(u =>
    (u.username + ' ' + (u.fullName || '')).toLowerCase().includes(search.toLowerCase())
  );

  /* ---------- CSV export ---------- */
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const exportCsv = async () => {
    if (!logs.length || !selected) return;
    setExporting(true);
    try {
      const header = 'S.No,Captured Time,Latitude,Longitude,Accuracy(m),Address,Received At,Flag';
      const lines = logs.map((l, i) => [
        i + 1,
        new Date(l.capturedAt).toLocaleString('en-IN'),
        l.lat, l.lng, l.acc ?? '',
        esc(l.address),
        new Date(l.createdAt).toLocaleString('en-IN'),
        l.suspicious ? 'SUSPICIOUS' : 'OK',
      ].join(','));
      const csv = [
        `Employee:,${esc(selected.fullName || selected.username)}`,
        `Date:,${date}`,
        `Points:,${logs.length},Gaps:,${gapCount},Flags:,${susCount}`,
        '',
        header,
        ...lines,
      ].join('\n');

      const fname = `trail_${selected.username}_${date}.csv`;
      const file = new File(Paths.cache, fname);
      try { if (file.exists) file.delete(); } catch {}
      file.create();
      file.write(csv);

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: fname });
      } else {
        Alert.alert('Export ready', `Saved: ${fname}`);
      }
    } catch (e) {
      Alert.alert('Export failed', e.message);
    } finally { setExporting(false); }
  };

  /* ---------- renderers (timeline logic unchanged, chrome restyled) ---------- */
  const renderRow = ({ item: r, index }) => r.type === 'gap' ? (
    <View style={styles.gapRow}>
      <View style={styles.gapLine} />
      <View style={styles.gapBadge}>
        <MaterialIcons name="signal-wifi-off" size={13} color={COLORS.orange} />
        <Text style={styles.gapText}>Tracking gap • {r.mins} min (no data)</Text>
      </View>
      <View style={styles.gapLine} />
    </View>
  ) : (
    <View style={styles.pointRow}>
      <Text style={styles.pointTime}>{fmtT(r.log.capturedAt)}</Text>
      <View style={styles.dotCol}>
        <View style={[styles.dot, r.log.suspicious && { backgroundColor: COLORS.red }]} />
        {index < rows.length - 1 && <View style={styles.line} />}
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
              <MaterialIcons name="flag" size={11} color={COLORS.red} />
              <Text style={styles.susText}>time mismatch</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* ===== Header ===== */}
      <GradientHeader
        title="Team Trail"
        onBack={() => navigation.goBack()}
        right={
          <TouchableOpacity
            style={[styles.exportBtn, (!logs.length || exporting) && { opacity: 0.5 }]}
            disabled={!logs.length || exporting}
            onPress={exportCsv}
          >
            {exporting ? <ActivityIndicator color="#fff" size="small" /> : (
              <>
                <MaterialIcons name="file-download" size={17} color="#fff" />
                <Text style={styles.exportText}>Export</Text>
              </>
            )}
          </TouchableOpacity>
        }
      >
        {/* ===== Filters ===== */}
        <View style={styles.filterRow}>
          <TouchableOpacity style={[styles.filterField, { flex: 1.3 }]} onPress={() => { setSearch(''); setEmpModal(true); }}>
            <View style={styles.fAvatar}>
              <Text style={styles.fAvatarText}>{selected ? initials(selected.fullName || selected.username) : '?'}</Text>
            </View>
            <Text style={styles.filterText} numberOfLines={1}>
              {selected ? (selected.fullName || selected.username) : 'Select employee'}
            </Text>
            <MaterialIcons name="arrow-drop-down" size={22} color="#C7D2FE" />
          </TouchableOpacity>

          <TouchableOpacity style={[styles.filterField, { flex: 1 }]} onPress={() => setCalModal(true)}>
            <MaterialIcons name="calendar-month" size={18} color="#C7D2FE" />
            <Text style={styles.filterText} numberOfLines={1}>{prettyDate(date)}</Text>
            <MaterialIcons name="arrow-drop-down" size={22} color="#C7D2FE" />
          </TouchableOpacity>
        </View>
      </GradientHeader>

      {/* ===== Summary ===== */}
      {!loading && logs.length > 0 && (
        <View style={styles.summaryRow}>
          <Chip icon="place" text={`${logs.length} points`} />
          <Chip icon="schedule" text={`${fmtT(logs[0].capturedAt)} – ${fmtT(logs[logs.length - 1].capturedAt)}`} />
          {gapCount > 0 && <Chip icon="signal-wifi-off" text={`${gapCount} gaps`} color={COLORS.orange} soft={COLORS.orangeSoft} />}
          {susCount > 0 && <Chip icon="flag" text={`${susCount} flagged`} color={COLORS.red} soft={COLORS.redSoft} />}
        </View>
      )}

      {/* ===== List ===== */}
      {loading ? (
        <View style={{ flex: 1 }}>
          <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 40 }} />
        </View>
      ) : (
        <FlatList
          style={{ flex: 1 }}
          data={rows}
          keyExtractor={(r) => r.key}
          renderItem={renderRow}
          contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <MaterialIcons name="location-off" size={42} color="#D1D5DB" />
              <Text style={styles.emptyText}>{error || 'No tracking data for this day'}</Text>
            </View>
          }
        />
      )}

      {/* ===== Employee dropdown modal ===== */}
      <Modal visible={empModal} transparent animationType="slide">
        <SheetOverlay>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Select Employee</Text>
            <View style={styles.searchRow}>
              <MaterialIcons name="search" size={19} color={COLORS.sub} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search name or username…"
                placeholderTextColor={COLORS.faint}
                value={search}
                onChangeText={setSearch}
                autoFocus
              />
            </View>
            <FlatList
              data={filteredUsers}
              keyExtractor={(u) => String(u.id)}
              style={{ maxHeight: 380 }}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item: u }) => (
                <TouchableOpacity
                  style={[styles.empRow, selected?.id === u.id && styles.empRowActive]}
                  onPress={() => { setSelected(u); setEmpModal(false); }}
                >
                  <View style={styles.eAvatar}>
                    <Text style={styles.eAvatarText}>{initials(u.fullName || u.username)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.eName}>{u.fullName || u.username}</Text>
                    <Text style={styles.eSub}>@{u.username} • {(u.roles || []).join(', ')}</Text>
                  </View>
                  {selected?.id === u.id && <MaterialIcons name="check-circle" size={20} color={COLORS.green} />}
                </TouchableOpacity>
              )}
              ListEmptyComponent={<Text style={styles.emptyText}>No employees found</Text>}
            />
            <TouchableOpacity style={styles.sheetClose} onPress={() => setEmpModal(false)}>
              <Text style={styles.sheetCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </SheetOverlay>
      </Modal>

      {/* ===== Calendar modal ===== */}
      <Modal visible={calModal} transparent animationType="fade">
        <SheetOverlay center>
          <View style={styles.calCard}>
            <Text style={styles.sheetTitle}>Select Date</Text>
            <Calendar
              current={date}
              maxDate={todayYMD()}
              onDayPress={(d) => { setDate(d.dateString); setCalModal(false); }}
              markedDates={{ [date]: { selected: true, selectedColor: COLORS.primary } }}
              theme={{
                todayTextColor: COLORS.primary,
                arrowColor: COLORS.primary,
                textMonthFontWeight: '800',
                textDayFontWeight: '600',
              }}
            />
            <View style={styles.calBtnRow}>
              <PrimaryButton title="Today" style={{ flex: 1 }}
                onPress={() => { setDate(todayYMD()); setCalModal(false); }} />
              <TouchableOpacity style={[styles.sheetClose, { flex: 1, marginTop: 0 }]} onPress={() => setCalModal(false)}>
                <Text style={styles.sheetCloseText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </SheetOverlay>
      </Modal>

      <BottomNav navigation={navigation} active={null} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },

  /* header controls (inside GradientHeader) */
  exportBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)',
  },
  exportText: { color: '#fff', fontSize: 12.5, fontWeight: '800' },
  filterRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  filterField: {
    flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: 'rgba(255,255,255,0.13)',
    borderRadius: 14, paddingHorizontal: 10, height: 46, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
  },
  fAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.22)', justifyContent: 'center', alignItems: 'center' },
  fAvatarText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  filterText: { flex: 1, color: '#fff', fontSize: 13, fontWeight: '700' },

  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingTop: 12 },

  /* timeline */
  pointRow: { flexDirection: 'row', alignItems: 'flex-start' },
  pointTime: { width: 58, fontSize: 12.5, fontWeight: '700', color: '#374151', paddingTop: 2 },
  dotCol: { width: 22, alignItems: 'center' },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: COLORS.green, borderWidth: 2, borderColor: '#fff', elevation: 1, marginTop: 3 },
  line: { flex: 1, width: 2, backgroundColor: COLORS.line, marginVertical: 2, minHeight: 26 },
  pointCard: { flex: 1, backgroundColor: COLORS.card, borderRadius: 14, padding: 12, marginBottom: 10, ...SHADOW.card },
  pointAddr: { fontSize: 12.5, color: COLORS.ink, lineHeight: 17 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6, alignItems: 'center' },
  accText: { fontSize: 10.5, color: COLORS.faint, fontWeight: '600' },
  recBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#EFF6FF', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  recText: { fontSize: 10, color: '#2563EB', fontWeight: '600' },
  susBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: COLORS.redSoft, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  susText: { fontSize: 10, color: COLORS.red, fontWeight: '700' },
  gapRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 4, marginBottom: 10, paddingLeft: 58 },
  gapLine: { flex: 1, height: 1, backgroundColor: '#FDE68A' },
  gapBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.orangeSoft, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
  gapText: { fontSize: 10.5, color: COLORS.orange, fontWeight: '700' },

  empty: { alignItems: 'center', marginTop: 60, gap: 10 },
  emptyText: { color: COLORS.faint, fontSize: 14, textAlign: 'center' },

  /* modals */
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: COLORS.card, borderTopLeftRadius: RADIUS.sheet, borderTopRightRadius: RADIUS.sheet, padding: 18, paddingBottom: 26 },
  sheetHandle: { width: 42, height: 5, borderRadius: 3, backgroundColor: COLORS.line, alignSelf: 'center', marginBottom: 12 },
  sheetTitle: { fontSize: 16, fontWeight: '800', color: COLORS.ink, marginBottom: 12, textAlign: 'center' },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.field,
    borderWidth: 1, borderColor: COLORS.line, borderRadius: RADIUS.input, paddingHorizontal: 12, height: 46, marginBottom: 10,
  },
  searchInput: { flex: 1, fontSize: 14, color: COLORS.ink },
  empRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 12 },
  empRowActive: { backgroundColor: COLORS.indigoSoft },
  eAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: COLORS.indigoSoft, justifyContent: 'center', alignItems: 'center' },
  eAvatarText: { color: COLORS.primary, fontWeight: '800', fontSize: 13 },
  eName: { fontSize: 14, fontWeight: '700', color: COLORS.ink },
  eSub: { fontSize: 11, color: COLORS.faint, marginTop: 1 },
  sheetClose: {
    marginTop: 10, height: 52, borderRadius: RADIUS.button, borderWidth: 1.5,
    borderColor: COLORS.line, justifyContent: 'center', alignItems: 'center',
  },
  sheetCloseText: { color: '#374151', fontWeight: '700' },

  overlayCenter: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'center', padding: 20 },
  calCard: { backgroundColor: COLORS.card, borderRadius: RADIUS.sheet, padding: 16 },
  calBtnRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
});
