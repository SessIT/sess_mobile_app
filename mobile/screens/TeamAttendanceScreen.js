import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, ScrollView,
  ActivityIndicator, RefreshControl, Modal, TextInput, Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { Calendar } from 'react-native-calendars';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { api } from '../lib/api';

const INDIGO = '#1E3A8A';
const GREEN = '#16A34A';
const RED = '#DC2626';
const AMBER = '#D97706';
const GREY = '#9CA3AF';

const todayYMD = () => new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
const thisMonth = () => todayYMD().slice(0, 7);
const fmtT = (d) => d ? new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '--:--';
const fmtH = (h) => {
  const m = Math.round((h || 0) * 60);
  return `${Math.floor(m / 60)}h ${m % 60}m`;
};
const initials = (n) => (n || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
const monthLabel = (ym) => new Date(ym + '-01T00:00:00').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const STATUS = {
  present: { label: 'Present', color: GREEN, bg: '#ECFDF5' },
  absent: { label: 'Absent', color: RED, bg: '#FEE2E2' },
  weekoff: { label: 'Week Off', color: GREY, bg: '#F3F4F6' },
  future: { label: '—', color: '#D1D5DB', bg: '#FAFAFA' },
};
// True late (>= 09:41) shows amber; on-time and grace arrivals stay green (present).
const LATE_VIS = { label: 'Late', color: AMBER, bg: '#FEF3C7' };
const dayVis = (d) => (d.status === 'present' && d.lateLevel === 'late' ? LATE_VIS : STATUS[d.status]);

export default function TeamAttendanceScreen({ navigation }) {
  const [mode, setMode] = useState('day'); // 'day' | 'month'
  const [users, setUsers] = useState([]);
  const [selected, setSelected] = useState(null); // null = All
  const [date, setDate] = useState(todayYMD());
  const [month, setMonth] = useState(thisMonth());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [empModal, setEmpModal] = useState(false);
  const [calModal, setCalModal] = useState(false);
  const [search, setSearch] = useState('');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    api('/users').then(setUsers).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setData(null); 
    try {
      if (mode === 'day') {
        setData(await api(`/attendance/admin/day?date=${date}`));
      } else {
        const q = selected ? `&userId=${selected.id}` : '';
        setData(await api(`/attendance/admin/month?month=${month}${q}`));
      }
    } catch (e) { Alert.alert('Error', e.message); setData(null); }
    finally { setLoading(false); setRefreshing(false); }
  }, [mode, date, month, selected]);

  useEffect(() => { load(); }, [load]);

  const shiftMonth = (n) => {
    const d = new Date(month + '-01T00:00:00');
    d.setMonth(d.getMonth() + n);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (ym <= thisMonth()) setMonth(ym);
  };

  const dayPresent = mode === 'day' && data?.present
    ? (selected ? data.present.filter(p => p.userId === selected.id) : data.present)
    : [];
  const dayAbsent = mode === 'day' && data?.absent
    ? (selected ? data.absent.filter(a => a.id === selected.id) : data.absent)
    : [];

  /* ---------- CSV export ---------- */
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const exportCsv = async () => {
    if (!data) return;
    setExporting(true);
    try {
      let lines = [], fname = '';
      if (mode === 'day') {
        fname = `attendance_day_${date}.csv`;
        lines = [
          `Date:,${date}`, `Present:,${data.present.length},Total:,${data.totalUsers}`, '',
          'Name,Username,Status,First In,Last Out,Sessions,Hours,Late,Sites',
          ...data.present.map(p => [esc(p.fullName || p.username), p.username, p.open ? 'ON DUTY' : 'Present',
            fmtT(p.firstIn), fmtT(p.lastOut), p.sessions, p.hours, p.late ? 'LATE' : '', esc(p.sites.join(' | '))].join(',')),
          ...data.absent.map(a => [esc(a.fullName || a.username), a.username, 'Absent', '', '', 0, 0, '', ''].join(',')),
        ];
      } else if (!selected) {
        fname = `attendance_${month}_all.csv`;
        lines = [
          `Month:,${monthLabel(month)}`, `Working days (so far):,${data.workingDaysSoFar}`, '',
          'Name,Username,Present,Absent,Late,Total Hours',
          ...data.summary.map(r => [esc(r.fullName || r.username), r.username, r.present, r.absent, r.late, r.hours].join(',')),
        ];
      } else {
        fname = `attendance_${month}_${selected.username}.csv`;
        lines = [
          `Employee:,${esc(selected.fullName || selected.username)}`, `Month:,${monthLabel(month)}`,
          `Present:,${data.stats.present},Absent:,${data.stats.absent},Late:,${data.stats.late},Hours:,${data.stats.hours}`, '',
          'Date,Weekday,Status,First In,Last Out,Sessions,Hours,Late,Sites',
          ...data.days.map(d => [d.date, WD[d.weekday], STATUS[d.status].label,
            fmtT(d.firstIn), fmtT(d.lastOut), d.sessions, d.hours, d.late ? 'LATE' : '', esc(d.sites.join(' | '))].join(',')),
        ];
      }
      const csv = lines.join('\n');
      const file = new File(Paths.cache, fname);
      try { if (file.exists) file.delete(); } catch {}
      file.create(); file.write(csv);
      if (await Sharing.isAvailableAsync())
        await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: fname });
      else Alert.alert('Export ready', fname);
    } catch (e) { Alert.alert('Export failed', e.message); }
    finally { setExporting(false); }
  };

  const filteredUsers = users.filter(u =>
    (u.username + ' ' + (u.fullName || '')).toLowerCase().includes(search.toLowerCase()));

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <LinearGradient colors={['#1E40AF', '#1E3A8A', '#312E81']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
        <View style={[styles.deco, { width: 150, height: 150, top: -55, right: -45 }]} />
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.title}>Team Attendance</Text>
          <TouchableOpacity style={[styles.exportBtn, (!data || exporting) && { opacity: 0.5 }]}
            disabled={!data || exporting} onPress={exportCsv}>
            {exporting ? <ActivityIndicator color="#fff" size="small" /> : (
              <><MaterialIcons name="file-download" size={17} color="#fff" /><Text style={styles.exportText}>Export</Text></>
            )}
          </TouchableOpacity>
        </View>

        {/* Mode toggle */}
        <View style={styles.segment}>
          {['day', 'month'].map(mv => (
            <TouchableOpacity key={mv} style={[styles.segBtn, mode === mv && styles.segBtnActive]}
              onPress={() => setMode(mv)}>
              <Text style={[styles.segText, mode === mv && styles.segTextActive]}>
                {mv === 'day' ? 'Day View' : 'Month View'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Filters */}
        <View style={styles.filterRow}>
          <TouchableOpacity style={[styles.filterField, { flex: 1.2 }]} onPress={() => { setSearch(''); setEmpModal(true); }}>
            <MaterialIcons name="person" size={17} color="#C7D2FE" />
            <Text style={styles.filterText} numberOfLines={1}>
              {selected ? (selected.fullName || selected.username) : 'All Employees'}
            </Text>
            <MaterialIcons name="arrow-drop-down" size={22} color="#C7D2FE" />
          </TouchableOpacity>

          {mode === 'day' ? (
            <TouchableOpacity style={[styles.filterField, { flex: 1 }]} onPress={() => setCalModal(true)}>
              <MaterialIcons name="calendar-month" size={17} color="#C7D2FE" />
              <Text style={styles.filterText}>{date === todayYMD() ? 'Today' : date}</Text>
            </TouchableOpacity>
          ) : (
            <View style={[styles.filterField, { flex: 1.1, paddingHorizontal: 4 }]}>
              <TouchableOpacity onPress={() => shiftMonth(-1)} style={{ padding: 4 }}>
                <MaterialIcons name="chevron-left" size={22} color="#C7D2FE" />
              </TouchableOpacity>
              <Text style={[styles.filterText, { textAlign: 'center' }]}>{monthLabel(month)}</Text>
              <TouchableOpacity onPress={() => shiftMonth(1)} disabled={month >= thisMonth()} style={{ padding: 4, opacity: month >= thisMonth() ? 0.3 : 1 }}>
                <MaterialIcons name="chevron-right" size={22} color="#C7D2FE" />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </LinearGradient>

      {loading ? <ActivityIndicator size="large" color={INDIGO} style={{ marginTop: 40 }} /> : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        >
          {/* ===== DAY VIEW ===== */}
          {mode === 'day' && data?.present && (
            <>
              <View style={styles.sumRow}>
                <View style={styles.sumPill}><Text style={styles.sumText}>✅ {data.present.length}/{data.totalUsers} present</Text></View>
                {data.present.filter(p => p.late).length > 0 &&
                  <View style={[styles.sumPill, { backgroundColor: '#FEE2E2' }]}><Text style={[styles.sumText, { color: RED }]}>⏰ {data.present.filter(p => p.late).length} late</Text></View>}
              </View>

              {dayPresent.map(p => (
                <View key={p.userId} style={styles.card}>
                  <View style={styles.avatar}><Text style={styles.avatarText}>{initials(p.fullName || p.username)}</Text></View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.nameRow}>
                      <Text style={styles.name}>{p.fullName || p.username}</Text>
                      {p.open && <View style={styles.onDuty}><View style={styles.onDot} /><Text style={styles.onText}>ON DUTY</Text></View>}
                      {p.late && <View style={styles.lateBadge}><Text style={styles.lateText}>LATE</Text></View>}
                    </View>
                    <Text style={styles.timeLine}>{fmtT(p.firstIn)} → {p.open ? 'now' : fmtT(p.lastOut)} • {p.sessions} session{p.sessions > 1 ? 's' : ''}</Text>
                    <View style={styles.siteRow}>
                      {p.sites.map(s => <View key={s} style={styles.siteChip}><Text style={styles.siteText}>{s === 'SESS' ? '🏢 SESS' : `🚗 ${s}`}</Text></View>)}
                    </View>
                  </View>
                  <View style={styles.hoursBox}><Text style={styles.hoursNum}>{fmtH(p.hours)}</Text></View>
                </View>
              ))}

              {dayAbsent.length > 0 && (
                <>
                  <Text style={styles.absentTitle}>Absent ({dayAbsent.length})</Text>
                  <View style={styles.absentWrap}>
                    {dayAbsent.map(a => (
                      <View key={a.id} style={styles.absentChip}>
                        <Text style={styles.absentText}>{a.fullName || a.username}</Text>
                      </View>
                    ))}
                  </View>
                </>
              )}
            </>
          )}

          {/* ===== MONTH VIEW — ALL ===== */}
          {mode === 'month' && data?.summary && !selected && (
            <>
              <Text style={styles.wdText}>Working days so far: {data.workingDaysSoFar} (Sundays = week off)</Text>
              {data.summary.map(r => (
                <TouchableOpacity key={r.userId} style={styles.card} activeOpacity={0.85}
                  onPress={() => setSelected(users.find(u => u.id === r.userId) || { id: r.userId, username: r.username, fullName: r.fullName })}>
                  <View style={styles.avatar}><Text style={styles.avatarText}>{initials(r.fullName || r.username)}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{r.fullName || r.username}</Text>
                    <View style={styles.gridRow}>
                      <Text style={[styles.gridStat, { color: GREEN }]}>P: {r.present}</Text>
                      <Text style={[styles.gridStat, { color: RED }]}>A: {r.absent}</Text>
                      <Text style={[styles.gridStat, { color: AMBER }]}>L: {r.late}</Text>
                      <Text style={[styles.gridStat, { color: INDIGO }]}>{fmtH(r.hours)}</Text>
                    </View>
                  </View>
                  <MaterialIcons name="chevron-right" size={22} color="#C4C4C4" />
                </TouchableOpacity>
              ))}
            </>
          )}

          {/* ===== MONTH VIEW — SINGLE EMPLOYEE ===== */}
          {mode === 'month' && data?.days && selected && (
            <>
              <View style={styles.statCard}>
                {[['Present', data.stats.present, GREEN], ['Absent', data.stats.absent, RED],
                  ['Late', data.stats.late, AMBER], ['Hours', fmtH(data.stats.hours), INDIGO]].map(([l, v, c]) => (
                  <View key={l} style={styles.statBox}>
                    <Text style={[styles.statNum, { color: c }]}>{v}</Text>
                    <Text style={styles.statLabel}>{l}</Text>
                  </View>
                ))}
              </View>

              {data.days.map(d => {
                const st = dayVis(d);
                return (
                  <View key={d.date} style={[styles.dayRow, d.status === 'future' && { opacity: 0.45 }]}>
                    <View style={[styles.dayBlock, { backgroundColor: st.bg }]}>
                      <Text style={[styles.dayNum, { color: st.color }]}>{d.date.slice(-2)}</Text>
                      <Text style={[styles.dayWd, { color: st.color }]}>{WD[d.weekday]}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={styles.nameRow}>
                        <View style={[styles.stChip, { backgroundColor: st.bg }]}>
                          <Text style={[styles.stText, { color: st.color }]}>{st.label}</Text>
                        </View>
                        {d.late && <View style={styles.lateBadge}><Text style={styles.lateText}>LATE</Text></View>}
                      </View>
                      {d.status === 'present' && (
                        <>
                          <Text style={styles.timeLine}>{fmtT(d.firstIn)} → {fmtT(d.lastOut)} • {d.sessions} session{d.sessions > 1 ? 's' : ''}</Text>
                          {d.sites.length > 0 && (
                            <Text style={styles.siteLine} numberOfLines={1}>
                              {d.sites.map(s => s === 'SESS' ? '🏢SESS' : `🚗${s}`).join('  ')}
                            </Text>
                          )}
                        </>
                      )}
                    </View>
                    {d.status === 'present' && <View style={styles.hoursBox}><Text style={styles.hoursNum}>{fmtH(d.hours)}</Text></View>}
                  </View>
                );
              })}
            </>
          )}
        </ScrollView>
      )}

      {/* Employee dropdown */}
      <Modal visible={empModal} transparent animationType="slide">
        <View style={styles.sheetOverlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Select Employee</Text>
            <View style={styles.searchRow}>
              <MaterialIcons name="search" size={19} color="#6B7280" />
              <TextInput style={styles.searchInput} placeholder="Search…" placeholderTextColor="#9CA3AF"
                value={search} onChangeText={setSearch} autoFocus />
            </View>
            <TouchableOpacity style={[styles.empRow, !selected && styles.empRowActive]}
              onPress={() => { setSelected(null); setEmpModal(false); }}>
              <View style={styles.eAvatar}><MaterialIcons name="groups" size={19} color={INDIGO} /></View>
              <Text style={styles.eName}>All Employees</Text>
              {!selected && <MaterialIcons name="check-circle" size={20} color={GREEN} style={{ marginLeft: 'auto' }} />}
            </TouchableOpacity>
            <FlatList
              data={filteredUsers}
              keyExtractor={(u) => String(u.id)}
              style={{ maxHeight: 330 }}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item: u }) => (
                <TouchableOpacity style={[styles.empRow, selected?.id === u.id && styles.empRowActive]}
                  onPress={() => { setSelected(u); setEmpModal(false); }}>
                  <View style={styles.eAvatar}><Text style={styles.eAvatarText}>{initials(u.fullName || u.username)}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.eName}>{u.fullName || u.username}</Text>
                    <Text style={styles.eSub}>@{u.username}</Text>
                  </View>
                  {selected?.id === u.id && <MaterialIcons name="check-circle" size={20} color={GREEN} />}
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity style={styles.sheetClose} onPress={() => setEmpModal(false)}>
              <Text style={styles.sheetCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Calendar (day mode) */}
      <Modal visible={calModal} transparent animationType="fade">
        <View style={styles.overlayCenter}>
          <View style={styles.calCard}>
            <Text style={styles.sheetTitle}>Select Date</Text>
            <Calendar
              current={date}
              maxDate={todayYMD()}
              onDayPress={(d) => { setDate(d.dateString); setCalModal(false); }}
              markedDates={{ [date]: { selected: true, selectedColor: INDIGO } }}
              theme={{ todayTextColor: INDIGO, arrowColor: INDIGO, textMonthFontWeight: '800', textDayFontWeight: '600' }}
            />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              <TouchableOpacity style={styles.todayBtn} onPress={() => { setDate(todayYMD()); setCalModal(false); }}>
                <Text style={styles.todayText}>Today</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.sheetClose} onPress={() => setCalModal(false)}>
                <Text style={styles.sheetCloseText}>Close</Text>
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
  header: { paddingTop: 52, paddingBottom: 16, paddingHorizontal: 16, borderBottomLeftRadius: 26, borderBottomRightRadius: 26, overflow: 'hidden', elevation: 6 },
  deco: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.07)' },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.14)', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  title: { color: '#fff', fontSize: 17, fontWeight: '700', flex: 1 },
  exportBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)' },
  exportText: { color: '#fff', fontSize: 12.5, fontWeight: '800' },
  segment: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 13, padding: 4, marginTop: 14 },
  segBtn: { flex: 1, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  segBtnActive: { backgroundColor: '#fff' },
  segText: { color: '#C7D2FE', fontSize: 13, fontWeight: '700' },
  segTextActive: { color: INDIGO },
  filterRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  filterField: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.13)', borderRadius: 14, paddingHorizontal: 10, height: 44, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
  filterText: { flex: 1, color: '#fff', fontSize: 12.5, fontWeight: '700' },

  sumRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  sumPill: { backgroundColor: '#EEF2FF', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 },
  sumText: { fontSize: 11.5, fontWeight: '700', color: INDIGO },

  card: { flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: '#fff', borderRadius: 16, padding: 12, marginBottom: 10, elevation: 1 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#E0E7FF', justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: INDIGO, fontWeight: '800', fontSize: 13 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  name: { fontSize: 14, fontWeight: '800', color: '#111827' },
  onDuty: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#ECFDF5', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  onDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: GREEN },
  onText: { color: GREEN, fontSize: 8.5, fontWeight: '800' },
  lateBadge: { backgroundColor: '#FEE2E2', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  lateText: { color: RED, fontSize: 8.5, fontWeight: '800' },
  timeLine: { fontSize: 12, color: '#6B7280', marginTop: 3, fontWeight: '600' },
  siteRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 5 },
  siteChip: { backgroundColor: '#EEF2FF', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  siteText: { fontSize: 10, color: INDIGO, fontWeight: '700' },
  siteLine: { fontSize: 10.5, color: INDIGO, fontWeight: '700', marginTop: 3 },
  hoursBox: { backgroundColor: '#EEF2FF', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 5 },
  hoursNum: { color: INDIGO, fontSize: 11.5, fontWeight: '800' },

  absentTitle: { fontSize: 13, fontWeight: '800', color: '#6B7280', marginTop: 8, marginBottom: 8 },
  absentWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  absentChip: { backgroundColor: '#FEE2E2', borderRadius: 12, paddingHorizontal: 11, paddingVertical: 6 },
  absentText: { color: RED, fontSize: 12, fontWeight: '700' },

  wdText: { fontSize: 11.5, color: '#9CA3AF', fontWeight: '600', marginBottom: 10 },
  gridRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
  gridStat: { fontSize: 12, fontWeight: '800' },

  statCard: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 16, paddingVertical: 12, marginBottom: 12, elevation: 1 },
  statBox: { flex: 1, alignItems: 'center' },
  statNum: { fontSize: 16, fontWeight: '800' },
  statLabel: { fontSize: 10.5, color: '#9CA3AF', fontWeight: '700', marginTop: 2 },

  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: '#fff', borderRadius: 14, padding: 10, marginBottom: 8, elevation: 1 },
  dayBlock: { width: 44, height: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  dayNum: { fontSize: 16, fontWeight: '800' },
  dayWd: { fontSize: 9, fontWeight: '700' },
  stChip: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  stText: { fontSize: 10, fontWeight: '800' },

  sheetOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 18, paddingBottom: 26 },
  sheetHandle: { width: 42, height: 5, borderRadius: 3, backgroundColor: '#E5E7EB', alignSelf: 'center', marginBottom: 12 },
  sheetTitle: { fontSize: 16, fontWeight: '800', color: '#111827', marginBottom: 12, textAlign: 'center' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 12, height: 46, marginBottom: 10 },
  searchInput: { flex: 1, fontSize: 14, color: '#111827' },
  empRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 12 },
  empRowActive: { backgroundColor: '#EEF2FF' },
  eAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center' },
  eAvatarText: { color: INDIGO, fontWeight: '800', fontSize: 13 },
  eName: { fontSize: 14, fontWeight: '700', color: '#111827' },
  eSub: { fontSize: 11, color: '#9CA3AF', marginTop: 1 },
  sheetClose: { marginTop: 10, height: 46, borderRadius: 13, borderWidth: 1.5, borderColor: '#E5E7EB', justifyContent: 'center', alignItems: 'center', flex: 1 },
  sheetCloseText: { color: '#374151', fontWeight: '700' },
  overlayCenter: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'center', padding: 20 },
  calCard: { backgroundColor: '#fff', borderRadius: 24, padding: 16 },
  todayBtn: { flex: 1, height: 46, borderRadius: 13, backgroundColor: INDIGO, justifyContent: 'center', alignItems: 'center' },
  todayText: { color: '#fff', fontWeight: '800' },
});