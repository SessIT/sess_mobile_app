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
import { GradientHeader, BottomNav, Card, Chip, PrimaryButton, SectionLabel } from '../components/ui';
import { COLORS, GREEN_GRADIENT, RADIUS, SHADOW } from '../lib/theme';

const todayYMD = () => new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
const thisMonth = () => todayYMD().slice(0, 7);
const fmtT = (d) => d ? new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '--:--';
const fmtH = (h) => {
  const m = Math.round((h || 0) * 60);
  return `${Math.floor(m / 60)}h ${m % 60}m`;
};
const initials = (n) => (n || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
// Manual-entry time helpers (IST, +05:30)
const HM_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;
const isoToHM = (iso) => iso
  ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' })
  : '';
const hmToIso = (ymd, hm) => new Date(`${ymd}T${hm}:00+05:30`).toISOString();
const isoDateIST = (iso) => new Date(new Date(iso).getTime() + 5.5 * 3600000).toISOString().slice(0, 10);
const monthLabel = (ym) => new Date(ym + '-01T00:00:00').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const STATUS = {
  present: { label: 'Present', color: COLORS.green, bg: COLORS.greenSoft },
  leave: { label: 'Paid Leave', color: COLORS.purple, bg: COLORS.purpleSoft },
  absent: { label: 'Absent', color: COLORS.red, bg: COLORS.redSoft },
  weekoff: { label: 'Week Off', color: COLORS.faint, bg: '#F3F4F6' },
  holiday: { label: 'Holiday', color: COLORS.teal, bg: COLORS.tealSoft },
  future: { label: '—', color: '#D1D5DB', bg: '#FAFAFA' },
};
// True late (>= 09:41) shows orange; on-time and grace arrivals stay green (present).
const LATE_VIS = { label: 'Late', color: COLORS.orange, bg: COLORS.orangeSoft };
// Unknown statuses would otherwise read `.bg` off undefined and crash the month
// list, so fall back to the neutral "future" chip.
const dayVis = (d) => (d.status === 'present' && d.lateLevel === 'late' ? LATE_VIS : STATUS[d.status] || STATUS.future);

/* Correction requests — the dates come back as UTC-midnight @db.Date, the
 * requested punches as real timestamps, so they format in different zones. */
const CORR_FILTERS = ['pending', 'approved', 'rejected', 'all'];
const CORR_STATUS = {
  pending: { label: 'Pending', c: COLORS.orange, bg: COLORS.orangeSoft },
  approved: { label: 'Approved', c: COLORS.green, bg: COLORS.greenSoft },
  rejected: { label: 'Rejected', c: COLORS.red, bg: COLORS.redSoft },
  cancelled: { label: 'Cancelled', c: COLORS.sub, bg: '#F3F4F6' },
};
const prettyDate = (iso) =>
  new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
const fmtT12 = (d) => d
  ? new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })
  : '—';

export default function TeamAttendanceScreen({ navigation }) {
  const [mode, setMode] = useState('day'); // 'day' | 'month' | 'corrections'
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

  // Attendance editing (admin)
  const [manage, setManage] = useState(null);            // user whose sessions we're managing
  const [manageDate, setManageDate] = useState(todayYMD()); // the day being managed
  const [manageSessions, setManageSessions] = useState([]);
  const [manageLoading, setManageLoading] = useState(false);
  const [editor, setEditor] = useState(null);            // session editor modal state
  const [savingEditor, setSavingEditor] = useState(false);

  // Correction requests (admin review of employee-raised punch fixes)
  const [corrFilter, setCorrFilter] = useState('pending');
  // Corrections default to the day being corrected == today; widen via the pills.
  const [corrFrom, setCorrFrom] = useState(todayYMD());
  const [corrTo, setCorrTo] = useState(todayYMD());
  const [corrCal, setCorrCal] = useState(null); // 'from' | 'to' while picking
  const [corrections, setCorrections] = useState([]);
  const [corrPending, setCorrPending] = useState(0);
  const [corrBusyId, setCorrBusyId] = useState(null);

  useEffect(() => {
    api('/users').then(setUsers).catch(() => {});
  }, []);

  // The segment badge must stay right even when the tab is filtered to
  // approved/rejected, or never opened at all — so count it separately.
  const loadPendingCount = useCallback(async () => {
    try {
      const res = await api('/attendance/admin/corrections?status=pending');
      setCorrPending((res.requests || []).length);
    } catch { /* badge only — never block the screen on it */ }
  }, []);

  useEffect(() => { loadPendingCount(); }, [loadPendingCount]);

  const load = useCallback(async () => {
    setLoading(true);
    setData(null);
    try {
      if (mode === 'corrections') {
        const qs = [];
        if (corrFilter !== 'all') qs.push(`status=${corrFilter}`);
        if (corrFrom) qs.push(`from=${corrFrom}`);
        if (corrTo) qs.push(`to=${corrTo}`);
        const res = await api(`/attendance/admin/corrections${qs.length ? `?${qs.join('&')}` : ''}`);
        setCorrections(res.requests || []);
        // The badge counts every pending correction, not just the ones inside
        // the window — otherwise the default "today" filter hides the queue.
        loadPendingCount();
      } else if (mode === 'day') {
        setData(await api(`/attendance/admin/day?date=${date}`));
      } else {
        const q = selected ? `&userId=${selected.id}` : '';
        setData(await api(`/attendance/admin/month?month=${month}${q}`));
      }
    } catch (e) { Alert.alert('Error', e.message); setData(null); setCorrections([]); }
    finally { setLoading(false); setRefreshing(false); }
  }, [mode, date, month, selected, corrFilter, corrFrom, corrTo, loadPendingCount]);

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
        // On a company holiday nobody was expected in, so the non-punchers are
        // HOLIDAY, not absentees.
        const offStatus = data.holiday ? 'HOLIDAY' : 'Absent';
        lines = [
          `Date:,${date}`, `Present:,${data.present.length},Total:,${data.totalUsers}`,
          ...(data.holiday ? [`Holiday:,${esc(data.holiday.name)}`] : []), '',
          'Name,Username,Status,First In,Last Out,Sessions,Hours,Late,Sites',
          ...data.present.map(p => [esc(p.fullName || p.username), p.username, p.open ? 'ON DUTY' : 'Present',
            fmtT(p.firstIn), fmtT(p.lastOut), p.sessions, p.hours, p.late ? 'LATE' : '', esc(p.sites.join(' | '))].join(',')),
          ...data.absent.map(a => [esc(a.fullName || a.username), a.username, offStatus, '', '', 0, 0, '', ''].join(',')),
        ];
      } else if (!selected) {
        fname = `attendance_${month}_all.csv`;
        lines = [
          `Month:,${monthLabel(month)}`,
          `Working days (so far):,${data.workingDaysSoFar}`,
          `Required hours:,${data.requiredHours} (${data.hoursPerDay || 8}h/day)`, '',
          'Name,Username,Present,Leave,Absent,Late,Required Hours,Worked Hours',
          ...data.summary.map(r => [esc(r.fullName || r.username), r.username, r.present, r.leave ?? 0, r.absent, r.late, r.requiredHours ?? data.requiredHours, r.hours].join(',')),
        ];
      } else {
        fname = `attendance_${month}_${selected.username}.csv`;
        lines = [
          `Employee:,${esc(selected.fullName || selected.username)}`, `Month:,${monthLabel(month)}`,
          `Present:,${data.stats.present},Leave:,${data.stats.leave ?? 0},Absent:,${data.stats.absent},Late:,${data.stats.late}`,
          `Required Hours:,${data.requiredHours},Worked Hours:,${data.stats.hours}`, '',
          'Date,Weekday,Status,First In,Last Out,Sessions,Hours,Late,Sites',
          ...data.days.map(d => [d.date, WD[d.weekday],
            d.status === 'holiday' ? 'HOLIDAY' : (STATUS[d.status]?.label ?? d.status),
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

  /* ---------- Attendance editing ---------- */
  // Open the per-employee session manager for a given day (defaults to the
  // day-view date; month view passes the tapped day's date).
  const openManage = async (user, mDate = date) => {
    setManage(user);
    setManageDate(mDate);
    setManageLoading(true);
    setManageSessions([]);
    try {
      const res = await api(`/attendance/admin/day-sessions?date=${mDate}&userId=${user.id}`);
      setManageSessions(res.sessions || []);
    } catch (e) { Alert.alert('Error', e.message); }
    finally { setManageLoading(false); }
  };

  const refreshManage = async (user, mDate = manageDate) => {
    try {
      const res = await api(`/attendance/admin/day-sessions?date=${mDate}&userId=${user.id}`);
      setManageSessions(res.sessions || []);
    } catch {}
  };

  // Editor for a new or existing session.
  const openCreate = (user, cDate = date) => setEditor({
    mode: 'create', userId: user.id, userName: user.fullName || user.username,
    date: cDate, inTime: '09:30', outTime: '18:00', site: 'SESS',
  });
  const openEdit = (s, user) => setEditor({
    mode: 'edit', sessionId: s.id, userId: user.id, userName: user.fullName || user.username,
    date: isoDateIST(s.punchInTime),
    inTime: isoToHM(s.punchInTime), outTime: s.punchOutTime ? isoToHM(s.punchOutTime) : '',
    site: s.siteName || 'SESS',
  });

  const saveEditor = async () => {
    const e = editor;
    if (!HM_RE.test(e.inTime)) { Alert.alert('Invalid time', 'Punch-in must be HH:MM (24h), e.g. 09:30'); return; }
    if (e.outTime && !HM_RE.test(e.outTime)) { Alert.alert('Invalid time', 'Punch-out must be HH:MM (24h) or blank'); return; }
    if (e.outTime && e.outTime <= e.inTime) { Alert.alert('Invalid time', 'Punch-out must be after punch-in'); return; }
    setSavingEditor(true);
    try {
      const body = {
        punchInTime: hmToIso(e.date, e.inTime),
        punchOutTime: e.outTime ? hmToIso(e.date, e.outTime) : null,
        siteName: (e.site || 'SESS').trim(),
      };
      if (e.mode === 'edit') {
        await api(`/attendance/admin/session/${e.sessionId}`, { method: 'PATCH', body: JSON.stringify(body) });
      } else {
        await api('/attendance/admin/session', { method: 'POST', body: JSON.stringify({ userId: e.userId, ...body }) });
      }
      setEditor(null);
      if (manage) await refreshManage(manage);
      load();
    } catch (err) { Alert.alert('Save failed', err.message); }
    finally { setSavingEditor(false); }
  };

  const deleteSession = (s, user) => {
    Alert.alert('Delete session', 'Remove this punch session?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await api(`/attendance/admin/session/${s.id}`, { method: 'DELETE' });
            if (user && manage) await refreshManage(user);
            load();
          } catch (err) { Alert.alert('Delete failed', err.message); }
        },
      },
    ]);
  };

  /* ---------- Correction requests ---------- */
  // Approving is not just a status flip: the server applies the requested
  // punches to that day's sessions, so confirm who/when before sending.
  const decideCorrection = (r, status) => {
    const who = r.user?.fullName || r.user?.username;
    const when = prettyDate(r.date);
    const go = async () => {
      setCorrBusyId(r.id);
      try {
        await api(`/attendance/admin/corrections/${r.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status, reviewNote: '' }),
        });
        load();
      } catch (e) { Alert.alert('Failed', e.message); }
      finally { setCorrBusyId(null); }
    };
    if (status === 'approved') {
      Alert.alert('Approve correction', `Apply the corrected punches for ${who} on ${when}?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Approve', onPress: go },
      ]);
    } else {
      Alert.alert('Reject correction', `Reject the correction for ${who} on ${when}?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reject', style: 'destructive', onPress: go },
      ]);
    }
  };

  const filteredUsers = users.filter(u =>
    (u.username + ' ' + (u.fullName || '')).toLowerCase().includes(search.toLowerCase()));

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <GradientHeader
        title="Team Attendance"
        onBack={() => navigation.goBack()}
        right={
          <TouchableOpacity style={[styles.exportBtn, (!data || exporting) && { opacity: 0.5 }]}
            disabled={!data || exporting} onPress={exportCsv}>
            {exporting ? <ActivityIndicator color="#fff" size="small" /> : (
              <><MaterialIcons name="file-download" size={17} color="#fff" /><Text style={styles.exportText}>Export</Text></>
            )}
          </TouchableOpacity>
        }
      >
        {/* Mode toggle */}
        <View style={styles.segment}>
          {['day', 'month', 'corrections'].map(mv => (
            <TouchableOpacity key={mv} style={[styles.segBtn, mode === mv && styles.segBtnActive]}
              onPress={() => setMode(mv)}>
              <View style={styles.segInner}>
                <Text style={[styles.segText, mode === mv && styles.segTextActive]}>
                  {mv === 'day' ? 'Day View' : mv === 'month' ? 'Month View' : 'Corrections'}
                </Text>
                {mv === 'corrections' && corrPending > 0 && (
                  <View style={styles.segBadge}><Text style={styles.segBadgeText}>{corrPending}</Text></View>
                )}
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Filters — day/month pick an employee + period, corrections pick a status */}
        {mode === 'corrections' ? (
          <>
            <View style={[styles.segment, styles.statusSeg]}>
              {CORR_FILTERS.map(f => (
                <TouchableOpacity key={f} style={[styles.segBtn, styles.statusBtn, corrFilter === f && styles.segBtnActive]}
                  onPress={() => setCorrFilter(f)}>
                  <Text style={[styles.segText, styles.statusText, corrFilter === f && styles.segTextActive]}>
                    {f[0].toUpperCase() + f.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* From / To on the day being corrected. */}
            <View style={styles.filterRow}>
              <TouchableOpacity style={[styles.filterField, { flex: 1 }]} onPress={() => setCorrCal('from')}>
                <MaterialIcons name="event" size={16} color="#C7D2FE" />
                <Text style={styles.filterText} numberOfLines={1}>
                  {corrFrom ? (corrFrom === todayYMD() ? 'Today' : corrFrom) : 'Any'}
                </Text>
              </TouchableOpacity>
              <MaterialIcons name="arrow-forward" size={16} color="#C7D2FE" style={{ alignSelf: 'center' }} />
              <TouchableOpacity style={[styles.filterField, { flex: 1 }]} onPress={() => setCorrCal('to')}>
                <MaterialIcons name="event" size={16} color="#C7D2FE" />
                <Text style={styles.filterText} numberOfLines={1}>
                  {corrTo ? (corrTo === todayYMD() ? 'Today' : corrTo) : 'Any'}
                </Text>
              </TouchableOpacity>
              {(corrFrom || corrTo) && (
                <TouchableOpacity style={styles.clearDates} onPress={() => { setCorrFrom(null); setCorrTo(null); }}>
                  <MaterialIcons name="close" size={15} color="#C7D2FE" />
                  <Text style={styles.clearDatesText}>All dates</Text>
                </TouchableOpacity>
              )}
            </View>
          </>
        ) : (
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
        )}
      </GradientHeader>

      {loading ? (
        <View style={{ flex: 1 }}>
          <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 40 }} />
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        >
          {/* ===== DAY VIEW ===== */}
          {mode === 'day' && data?.present && (
            <>
              {/* A company holiday explains an otherwise alarming all-absent list. */}
              {data.holiday && (
                <View style={styles.holidayBanner}>
                  <MaterialIcons name="celebration" size={18} color={COLORS.teal} />
                  <Text style={styles.holidayText} numberOfLines={2}>
                    {data.holiday.name} · company holiday
                  </Text>
                </View>
              )}

              <View style={styles.sumRow}>
                <Chip icon="check-circle" text={`${data.present.length}/${data.totalUsers} Present`}
                  color={COLORS.green} soft={COLORS.greenSoft} />
                {data.present.filter(p => p.late).length > 0 &&
                  <Chip icon="schedule" text={`${data.present.filter(p => p.late).length} Late`}
                    color={COLORS.orange} soft={COLORS.orangeSoft} />}
              </View>

              {dayPresent.map(p => (
                <TouchableOpacity key={p.userId} style={styles.rowCard} activeOpacity={0.85}
                  onPress={() => openManage({ id: p.userId, username: p.username, fullName: p.fullName })}>
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
                  <MaterialIcons name="edit" size={16} color={COLORS.faint} style={{ marginLeft: 2 }} />
                </TouchableOpacity>
              ))}

              {dayAbsent.length > 0 && (() => {
                // On a company holiday nobody is absent — they are simply off, so
                // the heading and the chips drop the alarming red. Membership and
                // counts are untouched; this matches the web console.
                const off = !!data.holiday;
                return (
                  <>
                    <SectionLabel text={`${off ? 'OFF FOR THE HOLIDAY' : 'ABSENT'} (${dayAbsent.length})`}
                      right={<Text style={styles.hint} numberOfLines={1}>
                        {off ? 'tap if they worked' : 'tap to add attendance'}
                      </Text>} />
                    <View style={styles.absentWrap}>
                      {dayAbsent.map(a => (
                        <TouchableOpacity key={a.id} style={[styles.absentChip, off && styles.offChip]} activeOpacity={0.8}
                          onPress={() => openCreate(a)}>
                          <MaterialIcons name="add" size={14} color={off ? COLORS.teal : COLORS.red} />
                          <Text style={[styles.absentText, off && styles.offText]}>{a.fullName || a.username}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                );
              })()}
            </>
          )}

          {/* ===== MONTH VIEW — ALL ===== */}
          {mode === 'month' && data?.summary && !selected && (
            <>
              <Text style={styles.wdText}>
                Working days so far: {data.workingDaysSoFar} · Required: {fmtH(data.requiredHours)}
                {data.hoursPerDay ? ` (${data.hoursPerDay}h/day)` : ''}
              </Text>
              {data.summary.map(r => (
                <TouchableOpacity key={r.userId} style={styles.rowCard} activeOpacity={0.85}
                  onPress={() => setSelected(users.find(u => u.id === r.userId) || { id: r.userId, username: r.username, fullName: r.fullName })}>
                  <View style={styles.avatar}><Text style={styles.avatarText}>{initials(r.fullName || r.username)}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{r.fullName || r.username}</Text>
                    <View style={styles.gridRow}>
                      <Text style={[styles.gridStat, { color: COLORS.green }]}>P {r.present}</Text>
                      <Text style={[styles.gridStat, { color: COLORS.purple }]}>Lv {r.leave ?? 0}</Text>
                      <Text style={[styles.gridStat, { color: COLORS.red }]}>A {r.absent}</Text>
                      <Text style={[styles.gridStat, { color: COLORS.orange }]}>L {r.late}</Text>
                      {/* Worked hours vs the (leave-adjusted) target: orange if short, green if met. */}
                      <Text style={[styles.gridStat, { color: r.hours < (r.requiredHours ?? 0) ? COLORS.orange : COLORS.green }]}>
                        {fmtH(r.hours)}
                      </Text>
                    </View>
                  </View>
                  <MaterialIcons name="chevron-right" size={22} color={COLORS.faint} />
                </TouchableOpacity>
              ))}
            </>
          )}

          {/* ===== MONTH VIEW — SINGLE EMPLOYEE ===== */}
          {mode === 'month' && data?.days && selected && (
            <>
              {/* Stat tiles (page-11 style) */}
              <View style={styles.statRow}>
                {[
                  { l: 'PRESENT', v: data.stats.present, c: COLORS.green, s: COLORS.greenSoft, i: 'check-circle' },
                  { l: 'LATE', v: data.stats.late, c: COLORS.orange, s: COLORS.orangeSoft, i: 'schedule' },
                  { l: 'LEAVE', v: data.stats.leave ?? 0, c: COLORS.purple, s: COLORS.purpleSoft, i: 'beach-access' },
                  { l: 'ABSENT', v: data.stats.absent, c: COLORS.red, s: COLORS.redSoft, i: 'cancel' },
                ].map(t => (
                  <Card key={t.l} style={styles.statTile}>
                    <View style={[styles.statIcon, { backgroundColor: t.s }]}>
                      <MaterialIcons name={t.i} size={17} color={t.c} />
                    </View>
                    <Text style={[styles.statNum, { color: t.c }]}>{t.v}</Text>
                    <Text style={styles.statLabel}>{t.l}</Text>
                  </Card>
                ))}
              </View>

              {/* Required vs worked hours for the period */}
              {(() => {
                const req = data.requiredHours || 0;
                const worked = data.stats.hours || 0;
                const pct = req > 0 ? Math.min(100, Math.round((worked / req) * 100)) : 0;
                const met = worked >= req;
                return (
                  <Card style={styles.hoursCard}>
                    <View style={styles.hoursCardRow}>
                      <View>
                        <Text style={styles.hoursCardLabel}>REQUIRED</Text>
                        <Text style={styles.hoursCardReq}>{fmtH(req)}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={styles.hoursCardLabel}>WORKED</Text>
                        <Text style={[styles.hoursCardWorked, { color: met ? COLORS.green : COLORS.orange }]}>{fmtH(worked)}</Text>
                      </View>
                    </View>
                    <View style={styles.barTrack}>
                      <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: met ? COLORS.green : COLORS.primary }]} />
                    </View>
                    <Text style={styles.hoursCardSub}>
                      {req > 0 ? `${pct}% of target` : 'No working days yet'} · {data.workingDaysSoFar} days × {data.hoursPerDay || 8}h
                    </Text>
                  </Card>
                );
              })()}

              <SectionLabel text="DAILY BREAKDOWN" style={{ marginTop: 4 }} />
              <Text style={styles.editHint}>Tap any day to fix punches (e.g. missing punch-out)</Text>
              {data.days.map(d => {
                const st = dayVis(d);
                const editable = d.status !== 'future';
                return (
                  <TouchableOpacity key={d.date} activeOpacity={editable ? 0.85 : 1}
                    disabled={!editable}
                    onPress={() => editable && openManage(selected, d.date)}
                    style={[styles.dayRow, d.status === 'future' && { opacity: 0.45 }]}>
                    <View style={[styles.dayBlock, { backgroundColor: st.bg }]}>
                      <Text style={[styles.dayNum, { color: st.color }]}>{d.date.slice(-2)}</Text>
                      <Text style={[styles.dayWd, { color: st.color }]}>{WD[d.weekday]}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={styles.nameRow}>
                        <Chip text={st.label} color={st.color} soft={st.bg} />
                        {d.late && <View style={styles.lateBadge}><Text style={styles.lateText}>LATE</Text></View>}
                        {/* Name the holiday — also on a worked one, where the row
                            reads 'Present' and would otherwise hide the reason. */}
                        {d.holidayName && (
                          <Text style={styles.holidayName} numberOfLines={1}>{d.holidayName}</Text>
                        )}
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
                    {editable && <MaterialIcons name="edit" size={15} color={COLORS.faint} style={{ marginLeft: 4 }} />}
                  </TouchableOpacity>
                );
              })}
            </>
          )}

          {/* ===== CORRECTIONS ===== */}
          {mode === 'corrections' && (
            corrections.length === 0 ? (
              <View style={styles.empty}>
                <MaterialIcons name="fact-check" size={44} color="#CBD5E1" />
                <Text style={styles.emptyText}>
                  No {corrFilter === 'all' ? '' : corrFilter} correction requests
                  {corrFrom || corrTo ? ' in this date range' : ''}
                </Text>
                {/* A correction is usually raised for an EARLIER day, so the
                    default "today" window hides most of the queue. Say so. */}
                {(corrFrom || corrTo) && corrPending > 0 && (
                  <TouchableOpacity style={styles.emptyHint} onPress={() => { setCorrFrom(null); setCorrTo(null); }}>
                    <MaterialIcons name="history" size={15} color={COLORS.primary} />
                    <Text style={styles.emptyHintText}>
                      {corrPending} pending on other dates — show all
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              corrections.map(r => {
                const st = CORR_STATUS[r.status] || CORR_STATUS.cancelled;
                const busy = corrBusyId === r.id;
                return (
                  <Card key={r.id} style={styles.reqCard}>
                    <View style={styles.cardTop}>
                      <View style={styles.avatar}>
                        <Text style={styles.avatarText}>{initials(r.user?.fullName || r.user?.username)}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.name}>{r.user?.fullName || r.user?.username}</Text>
                        <Text style={styles.eSub}>@{r.user?.username}</Text>
                      </View>
                      <Chip text={st.label} color={st.c} soft={st.bg} />
                    </View>

                    <View style={styles.corrRow}>
                      <MaterialIcons name="event" size={15} color={COLORS.sub} />
                      <Text style={styles.corrText}>{prettyDate(r.date)}</Text>
                    </View>
                    <View style={styles.corrRow}>
                      <MaterialIcons name="schedule" size={15} color={COLORS.sub} />
                      <Text style={styles.corrText}>{fmtT12(r.requestedIn)} → {fmtT12(r.requestedOut)}</Text>
                    </View>
                    {r.reason ? <Text style={styles.reason}>“{r.reason}”</Text> : null}
                    {r.status !== 'pending' && r.reviewedBy ? (
                      <Text style={styles.reviewLine}>
                        {st.label} by {r.reviewedBy.fullName || r.reviewedBy.username}
                        {r.reviewNote ? ` • ${r.reviewNote}` : ''}
                      </Text>
                    ) : null}

                    {r.status === 'pending' && (
                      <View style={styles.actions}>
                        <TouchableOpacity style={[styles.actBtn, styles.rejectBtn, busy && { opacity: 0.5 }]}
                          disabled={busy} onPress={() => decideCorrection(r, 'rejected')}>
                          <MaterialIcons name="close" size={17} color={COLORS.red} />
                          <Text style={[styles.actText, { color: COLORS.red }]}>Reject</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={{ flex: 1 }} activeOpacity={0.85}
                          disabled={busy} onPress={() => decideCorrection(r, 'approved')}>
                          <LinearGradient colors={GREEN_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                            style={[styles.actBtn, busy && { opacity: 0.75 }]}>
                            {busy ? <ActivityIndicator color="#fff" size="small" /> : (
                              <>
                                <MaterialIcons name="check" size={17} color="#fff" />
                                <Text style={[styles.actText, { color: '#fff' }]}>Approve</Text>
                              </>
                            )}
                          </LinearGradient>
                        </TouchableOpacity>
                      </View>
                    )}
                  </Card>
                );
              })
            )
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
              <MaterialIcons name="search" size={19} color={COLORS.sub} />
              <TextInput style={styles.searchInput} placeholder="Search…" placeholderTextColor={COLORS.faint}
                value={search} onChangeText={setSearch} autoFocus />
            </View>
            <TouchableOpacity style={[styles.empRow, !selected && styles.empRowActive]}
              onPress={() => { setSelected(null); setEmpModal(false); }}>
              <View style={styles.eAvatar}><MaterialIcons name="groups" size={19} color={COLORS.primary} /></View>
              <Text style={styles.eName}>All Employees</Text>
              {!selected && <MaterialIcons name="check-circle" size={20} color={COLORS.green} style={{ marginLeft: 'auto' }} />}
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
                  {selected?.id === u.id && <MaterialIcons name="check-circle" size={20} color={COLORS.green} />}
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity style={styles.sheetClose} onPress={() => setEmpModal(false)}>
              <Text style={styles.sheetCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Calendar (corrections from/to) */}
      <Modal visible={!!corrCal} transparent animationType="fade" onRequestClose={() => setCorrCal(null)}>
        <View style={styles.overlayCenter}>
          <View style={styles.calCard}>
            <Text style={styles.sheetTitle}>{corrCal === 'to' ? 'To Date' : 'From Date'}</Text>
            <Calendar
              current={(corrCal === 'to' ? corrTo : corrFrom) || todayYMD()}
              maxDate={todayYMD()}
              onDayPress={(d) => {
                if (corrCal === 'to') {
                  setCorrTo(d.dateString);
                  if (corrFrom && d.dateString < corrFrom) setCorrFrom(d.dateString);
                } else {
                  setCorrFrom(d.dateString);
                  if (corrTo && d.dateString > corrTo) setCorrTo(d.dateString);
                }
                setCorrCal(null);
              }}
              markedDates={{
                ...(corrFrom ? { [corrFrom]: { selected: true, selectedColor: COLORS.primary } } : {}),
                ...(corrTo ? { [corrTo]: { selected: true, selectedColor: COLORS.primary } } : {}),
              }}
              theme={{ todayTextColor: COLORS.primary, arrowColor: COLORS.primary, textMonthFontWeight: '800', textDayFontWeight: '600' }}
            />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              <PrimaryButton title="Today" style={{ flex: 1 }}
                onPress={() => { if (corrCal === 'to') setCorrTo(todayYMD()); else setCorrFrom(todayYMD()); setCorrCal(null); }} />
              <TouchableOpacity style={[styles.sheetClose, { flex: 1, marginTop: 0 }]}
                onPress={() => { if (corrCal === 'to') setCorrTo(null); else setCorrFrom(null); setCorrCal(null); }}>
                <Text style={styles.sheetCloseText}>Any date</Text>
              </TouchableOpacity>
            </View>
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
              markedDates={{ [date]: { selected: true, selectedColor: COLORS.primary } }}
              theme={{ todayTextColor: COLORS.primary, arrowColor: COLORS.primary, textMonthFontWeight: '800', textDayFontWeight: '600' }}
            />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              <PrimaryButton title="Today" style={{ flex: 1 }}
                onPress={() => { setDate(todayYMD()); setCalModal(false); }} />
              <TouchableOpacity style={[styles.sheetClose, { flex: 1, marginTop: 0 }]} onPress={() => setCalModal(false)}>
                <Text style={styles.sheetCloseText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Manage sessions for one employee */}
      <Modal visible={!!manage} transparent animationType="slide" onRequestClose={() => setManage(null)}>
        <View style={styles.sheetOverlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>{manage?.fullName || manage?.username}</Text>
            <Text style={styles.manageSub}>{manageDate} • {manageSessions.length} session{manageSessions.length === 1 ? '' : 's'}</Text>

            {manageLoading ? (
              <ActivityIndicator color={COLORS.primary} style={{ marginVertical: 20 }} />
            ) : (
              <ScrollView style={{ maxHeight: 320 }}>
                {manageSessions.length === 0 && (
                  <Text style={styles.manageEmpty}>No sessions on this day.</Text>
                )}
                {manageSessions.map(s => (
                  <View key={s.id} style={styles.mSessionRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.mSessionTime}>
                        {fmtT(s.punchInTime)} → {s.punchOutTime ? fmtT(s.punchOutTime) : 'Open'}
                      </Text>
                      <Text style={styles.mSessionSite}>{s.siteName || 'SESS'}{s.workingHours != null ? ` • ${fmtH(s.workingHours)}` : ''}</Text>
                    </View>
                    <TouchableOpacity style={styles.mIconBtn} onPress={() => openEdit(s, manage)}>
                      <MaterialIcons name="edit" size={18} color={COLORS.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.mIconBtn} onPress={() => deleteSession(s, manage)}>
                      <MaterialIcons name="delete-outline" size={18} color={COLORS.red} />
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            )}

            <PrimaryButton title="Add session" icon="add" style={{ marginTop: 6 }}
              onPress={() => openCreate(manage, manageDate)} />
            <TouchableOpacity style={styles.sheetClose} onPress={() => setManage(null)}>
              <Text style={styles.sheetCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Session editor (create / edit) */}
      <Modal visible={!!editor} transparent animationType="fade" onRequestClose={() => setEditor(null)}>
        <View style={styles.overlayCenter}>
          <View style={styles.calCard}>
            <Text style={styles.sheetTitle}>{editor?.mode === 'edit' ? 'Edit Attendance' : 'Add Attendance'}</Text>
            <Text style={styles.manageSub}>{editor?.userName} • {editor?.date}</Text>

            <Text style={styles.editorLabel}>PUNCH IN (HH:MM, 24h)</Text>
            <TextInput
              style={styles.editorInput} placeholder="09:30" placeholderTextColor={COLORS.faint}
              keyboardType="numbers-and-punctuation" maxLength={5}
              value={editor?.inTime} onChangeText={(t) => setEditor(e => ({ ...e, inTime: t }))}
            />

            <Text style={styles.editorLabel}>PUNCH OUT (blank = still open)</Text>
            <TextInput
              style={styles.editorInput} placeholder="18:00" placeholderTextColor={COLORS.faint}
              keyboardType="numbers-and-punctuation" maxLength={5}
              value={editor?.outTime} onChangeText={(t) => setEditor(e => ({ ...e, outTime: t }))}
            />

            <Text style={styles.editorLabel}>SITE</Text>
            <TextInput
              style={styles.editorInput} placeholder="SESS" placeholderTextColor={COLORS.faint}
              value={editor?.site} onChangeText={(t) => setEditor(e => ({ ...e, site: t }))}
            />

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <TouchableOpacity style={[styles.sheetClose, { flex: 1, marginTop: 0 }]} onPress={() => setEditor(null)} disabled={savingEditor}>
                <Text style={styles.sheetCloseText}>Cancel</Text>
              </TouchableOpacity>
              <PrimaryButton title="Save" style={{ flex: 1 }} busy={savingEditor} onPress={saveEditor} />
            </View>
          </View>
        </View>
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
  segment: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 13, padding: 4, marginTop: 14 },
  segBtn: { flex: 1, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  segBtnActive: { backgroundColor: '#fff' },
  segText: { color: '#C7D2FE', fontSize: 13, fontWeight: '700' },
  segTextActive: { color: COLORS.primary },
  segInner: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  segBadge: {
    minWidth: 17, height: 17, borderRadius: 9, paddingHorizontal: 4,
    backgroundColor: COLORS.orange, justifyContent: 'center', alignItems: 'center',
  },
  segBadgeText: { color: '#fff', fontSize: 9.5, fontWeight: '800' },
  statusSeg: { marginTop: 10 },
  statusBtn: { height: 32 },
  statusText: { fontSize: 11.5 },
  filterRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  filterField: {
    flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.13)',
    borderRadius: 14, paddingHorizontal: 10, height: 44, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
  },
  filterText: { flex: 1, color: '#fff', fontSize: 12.5, fontWeight: '700' },

  sumRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },

  holidayBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.tealSoft,
    borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12,
  },
  holidayText: { flex: 1, color: COLORS.teal, fontSize: 12.5, fontWeight: '800' },

  rowCard: {
    flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: COLORS.card,
    borderRadius: RADIUS.card, padding: 14, marginBottom: 10, ...SHADOW.card,
  },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#E0E7FF', justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: COLORS.primary, fontWeight: '800', fontSize: 13 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  name: { fontSize: 14, fontWeight: '800', color: COLORS.ink },
  onDuty: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.greenSoft, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  onDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.green },
  onText: { color: COLORS.green, fontSize: 8.5, fontWeight: '800' },
  lateBadge: { backgroundColor: COLORS.orangeSoft, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  lateText: { color: COLORS.orange, fontSize: 8.5, fontWeight: '800' },
  timeLine: { fontSize: 12, color: COLORS.sub, marginTop: 3, fontWeight: '600' },
  siteRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 5 },
  siteChip: { backgroundColor: COLORS.indigoSoft, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  siteText: { fontSize: 10, color: COLORS.primary, fontWeight: '700' },
  siteLine: { fontSize: 10.5, color: COLORS.primary, fontWeight: '700', marginTop: 3 },
  hoursBox: { backgroundColor: COLORS.indigoSoft, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 5 },
  hoursNum: { color: COLORS.primary, fontSize: 11.5, fontWeight: '800' },

  // flexShrink so the longer "OFF FOR THE HOLIDAY (n)" heading cannot push this
  // out of the row on a narrow phone (SectionLabel is a plain space-between row).
  hint: { flexShrink: 1, fontSize: 10.5, color: COLORS.faint, fontWeight: '600', fontStyle: 'italic' },
  absentWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  absentChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.redSoft, borderRadius: 12, paddingHorizontal: 11, paddingVertical: 6 },
  absentText: { color: COLORS.red, fontSize: 12, fontWeight: '700' },
  offChip: { backgroundColor: COLORS.tealSoft },
  offText: { color: COLORS.teal },

  wdText: { fontSize: 11.5, color: COLORS.faint, fontWeight: '600', marginBottom: 10 },
  gridRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  gridStat: { fontSize: 12, fontWeight: '800' },

  /* month single view — stat tiles + hours card */
  statRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  statTile: { flex: 1, alignItems: 'center', paddingVertical: 12, paddingHorizontal: 4 },
  statIcon: { width: 34, height: 34, borderRadius: 11, justifyContent: 'center', alignItems: 'center', marginBottom: 6 },
  statNum: { fontSize: 17, fontWeight: '800' },
  statLabel: { fontSize: 9.5, color: COLORS.faint, fontWeight: '800', marginTop: 2, letterSpacing: 0.4 },

  hoursCard: { marginBottom: 12 },
  hoursCardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  hoursCardLabel: { fontSize: 9.5, color: COLORS.faint, fontWeight: '800', letterSpacing: 0.6 },
  hoursCardReq: { fontSize: 18, fontWeight: '800', color: '#374151', marginTop: 2 },
  hoursCardWorked: { fontSize: 18, fontWeight: '800', marginTop: 2 },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: COLORS.indigoSoft, marginTop: 10, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
  hoursCardSub: { fontSize: 11, color: COLORS.faint, fontWeight: '600', marginTop: 7 },
  editHint: { fontSize: 11, color: COLORS.faint, fontWeight: '600', marginBottom: 8, fontStyle: 'italic' },

  dayRow: {
    flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: COLORS.card,
    borderRadius: 14, padding: 10, marginBottom: 8, ...SHADOW.card,
  },
  dayBlock: { width: 44, height: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  dayNum: { fontSize: 16, fontWeight: '800' },
  dayWd: { fontSize: 9, fontWeight: '700' },
  holidayName: { flexShrink: 1, fontSize: 10.5, color: COLORS.faint, fontWeight: '700' },

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

  manageSub: { fontSize: 12, color: COLORS.faint, fontWeight: '600', textAlign: 'center', marginTop: -6, marginBottom: 10 },
  manageEmpty: { fontSize: 13, color: COLORS.faint, textAlign: 'center', paddingVertical: 20 },
  mSessionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.field, borderRadius: RADIUS.input, padding: 12, marginBottom: 8 },
  mSessionTime: { fontSize: 14, fontWeight: '800', color: COLORS.ink },
  mSessionSite: { fontSize: 11.5, color: COLORS.sub, fontWeight: '600', marginTop: 2 },
  mIconBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: COLORS.indigoSoft, justifyContent: 'center', alignItems: 'center' },
  editorLabel: { fontSize: 10.5, fontWeight: '800', color: COLORS.faint, letterSpacing: 0.6, marginTop: 12, marginBottom: 6 },
  editorInput: {
    backgroundColor: COLORS.field, borderWidth: 1.5, borderColor: COLORS.line,
    borderRadius: RADIUS.input, paddingHorizontal: 12, height: 48, fontSize: 15, color: COLORS.ink, fontWeight: '600',
  },

  /* corrections tab */
  clearDates: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 8, paddingVertical: 7, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  clearDatesText: { color: '#C7D2FE', fontSize: 11, fontWeight: '700' },
  emptyHint: {
    flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12,
    backgroundColor: COLORS.indigoSoft,
  },
  emptyHintText: { color: COLORS.primary, fontSize: 12, fontWeight: '700' },
  empty: { alignItems: 'center', paddingVertical: 50, gap: 10 },
  emptyText: { color: COLORS.faint, fontSize: 13 },
  reqCard: { padding: 14, marginBottom: 10 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  corrRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  corrText: { fontSize: 13, color: '#374151', fontWeight: '600' },
  reason: { fontSize: 12.5, color: COLORS.sub, marginTop: 8, fontStyle: 'italic' },
  reviewLine: { fontSize: 11.5, color: COLORS.faint, fontWeight: '600', marginTop: 8 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  actBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 46, borderRadius: RADIUS.button },
  rejectBtn: { flex: 1, borderWidth: 1.5, borderColor: '#FCA5A5', backgroundColor: '#FEF2F2' },
  actText: { fontSize: 13.5, fontWeight: '800' },
});
