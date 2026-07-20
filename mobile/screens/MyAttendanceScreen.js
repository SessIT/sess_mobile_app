import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Image, RefreshControl,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { Calendar } from 'react-native-calendars';
import { api, API_URL } from '../lib/api';

const INDIGO = '#1E3A8A';
const GREEN = '#16A34A';
const RED = '#DC2626';
const AMBER = '#D97706';
const GREY = '#6B7280';
const BASE = API_URL.replace('/api', '');

const todayYMD = () => new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
const thisMonth = () => todayYMD().slice(0, 7);
const fmtT = (d) => d ? new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '--:--';
const fmtH = (h) => {
  const m = Math.round((h || 0) * 60);
  return `${Math.floor(m / 60)}h ${m % 60}m`;
};
const prettyDate = (ymd) =>
  new Date(ymd + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

export default function MyAttendanceScreen({ navigation }) {
  const [month, setMonth] = useState(thisMonth());
  const [date, setDate] = useState(todayYMD());
  const [monthData, setMonthData] = useState(null);
  const [daySessions, setDaySessions] = useState([]);
  const [monthLoading, setMonthLoading] = useState(true);
  const [dayLoading, setDayLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadMonth = useCallback(async () => {
    setMonthLoading(true);
    try { setMonthData(await api(`/attendance/my-month?month=${month}`)); }
    catch { setMonthData(null); }
    finally { setMonthLoading(false); setRefreshing(false); }
  }, [month]);

  const loadDay = useCallback(async () => {
    setDayLoading(true);
    try {
      const res = await api(`/attendance/my-day?date=${date}`);
      setDaySessions(res.sessions || []);
    } catch { setDaySessions([]); }
    finally { setDayLoading(false); }
  }, [date]);

  useEffect(() => { loadMonth(); }, [loadMonth]);
  useEffect(() => { loadDay(); }, [loadDay]);

  // Refresh when returning to this screen (for example after a new punch)
  useEffect(() => {
    const unsub = navigation.addListener('focus', () => { loadMonth(); loadDay(); });
    return unsub;
  }, [navigation, loadMonth, loadDay]);

  const stats = monthData?.stats || { present: 0, late: 0, absent: 0, weekoff: 0, hours: 0 };

  /* Calendar day colors driven by the month breakdown */
  const markedDates = useMemo(() => {
    const marks = {};
    if (monthData?.days) {
      for (const d of monthData.days) {
        if (d.status === 'future') continue;
        let bg = null, txt = '#fff';
        if (d.late) bg = AMBER;
        else if (d.status === 'present') bg = GREEN;
        else if (d.status === 'absent') bg = RED;
        else if (d.status === 'weekoff') { bg = '#E5E7EB'; txt = GREY; }
        if (bg) {
          marks[d.date] = {
            customStyles: {
              container: { backgroundColor: bg, borderRadius: 8 },
              text: { color: txt, fontWeight: '700' },
            },
          };
        }
      }
    }
    const existing = marks[date]?.customStyles;
    marks[date] = {
      customStyles: {
        container: { ...(existing?.container || { borderRadius: 8 }), borderWidth: 2, borderColor: INDIGO },
        text: existing?.text || { color: INDIGO, fontWeight: '800' },
      },
    };
    return marks;
  }, [monthData, date]);

  const dayStatus = monthData?.days ? monthData.days.find(d => d.date === date) || null : null;

  const SessionCard = ({ s }) => (
    <View style={styles.sessCard}>
      <View style={styles.sessHead}>
        <MaterialIcons
          name={(s.siteName || 'SESS') === 'SESS' ? 'business' : 'directions-car'}
          size={16} color={INDIGO}
        />
        <Text style={styles.sessSite}>{s.siteName || 'SESS'}</Text>
        {s.isLate && <View style={styles.lateBadge}><Text style={styles.lateText}>LATE</Text></View>}
        <View style={styles.hoursPill}>
          <Text style={styles.hoursPillText}>{s.punchOutTime ? fmtH(s.workingHours) : 'On duty'}</Text>
        </View>
      </View>

      <View style={styles.photoPair}>
        <View style={styles.photoCol}>
          <Text style={[styles.photoLabel, { color: GREEN }]}>IN  {fmtT(s.punchInTime)}</Text>
          {s.punchInPhoto ? (
            <Image source={{ uri: `${BASE}/${s.punchInPhoto}` }} style={styles.photo} />
          ) : (
            <View style={[styles.photo, styles.photoEmpty]}>
              <MaterialIcons name="no-photography" size={22} color="#C4C4C4" />
            </View>
          )}
        </View>
        <View style={styles.photoCol}>
          <Text style={[styles.photoLabel, { color: RED }]}>OUT  {fmtT(s.punchOutTime)}</Text>
          {s.punchOutPhoto ? (
            <Image source={{ uri: `${BASE}/${s.punchOutPhoto}` }} style={styles.photo} />
          ) : (
            <View style={[styles.photo, styles.photoEmpty]}>
              <MaterialIcons name="schedule" size={22} color="#C4C4C4" />
            </View>
          )}
        </View>
      </View>

      {s.punchInAddress ? (
        <View style={styles.addrRow}>
          <MaterialIcons name="location-on" size={14} color={GREEN} />
          <Text style={styles.addrText} numberOfLines={2}>{s.punchInAddress}</Text>
        </View>
      ) : null}
      {s.punchOutAddress ? (
        <View style={styles.addrRow}>
          <MaterialIcons name="location-on" size={14} color={RED} />
          <Text style={styles.addrText} numberOfLines={2}>{s.punchOutAddress}</Text>
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <LinearGradient colors={['#1E40AF', '#1E3A8A', '#312E81']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
        <View style={[styles.deco, { width: 150, height: 150, top: -55, right: -45 }]} />
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>My Attendance</Text>
            <Text style={styles.subTitle}>Total worked this month: {fmtH(stats.hours)}</Text>
          </View>
        </View>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadMonth(); loadDay(); }} />}
      >
        {/* Monthly stat cards. Late days are not counted as present. */}
        <View style={styles.statRow}>
          <View style={[styles.statCard, { borderTopColor: GREEN }]}>
            <Text style={[styles.statNum, { color: GREEN }]}>{stats.present}</Text>
            <Text style={styles.statLabel}>Present</Text>
          </View>
          <View style={[styles.statCard, { borderTopColor: AMBER }]}>
            <Text style={[styles.statNum, { color: AMBER }]}>{stats.late}</Text>
            <Text style={styles.statLabel}>Late</Text>
          </View>
          <View style={[styles.statCard, { borderTopColor: RED }]}>
            <Text style={[styles.statNum, { color: RED }]}>{stats.absent}</Text>
            <Text style={styles.statLabel}>Absent</Text>
          </View>
          <View style={[styles.statCard, { borderTopColor: '#9CA3AF' }]}>
            <Text style={[styles.statNum, { color: GREY }]}>{stats.weekoff}</Text>
            <Text style={styles.statLabel}>Week Off</Text>
          </View>
        </View>
        <Text style={styles.statHint}>Late arrivals are counted separately, not as present</Text>

        {/* Calendar with day status colors */}
        <View style={styles.calCard}>
          {monthLoading && <ActivityIndicator size="small" color={INDIGO} style={{ marginBottom: 6 }} />}
          <Calendar
            key={month}
            current={date}
            maxDate={todayYMD()}
            markingType="custom"
            markedDates={markedDates}
            onDayPress={(d) => setDate(d.dateString)}
            onMonthChange={(m) => {
              const ym = `${m.year}-${String(m.month).padStart(2, '0')}`;
              if (ym <= thisMonth()) setMonth(ym);
            }}
            theme={{
              todayTextColor: INDIGO,
              arrowColor: INDIGO,
              textMonthFontWeight: '800',
              textDayFontWeight: '600',
              textDayHeaderFontWeight: '700',
            }}
          />
          <View style={styles.legendRow}>
            {[['Present', GREEN], ['Late', AMBER], ['Absent', RED], ['Week Off', '#C4C4C4']].map(([l, c]) => (
              <View key={l} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: c }]} />
                <Text style={styles.legendText}>{l}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Selected date detail */}
        <View style={styles.dateHeadRow}>
          <MaterialIcons name="event" size={17} color={INDIGO} />
          <Text style={styles.dateHeadText}>{prettyDate(date)}</Text>
        </View>

        {dayLoading ? (
          <ActivityIndicator size="large" color={INDIGO} style={{ marginTop: 20 }} />
        ) : daySessions.length > 0 ? (
          daySessions.map(s => <SessionCard key={s.id} s={s} />)
        ) : (
          <View style={styles.infoCard}>
            <MaterialIcons
              name={dayStatus?.status === 'weekoff' ? 'weekend' : dayStatus?.status === 'future' ? 'schedule' : 'person-off'}
              size={30}
              color={dayStatus?.status === 'weekoff' ? GREY : dayStatus?.status === 'future' ? '#C4C4C4' : RED}
            />
            <Text style={styles.infoTitle}>
              {dayStatus?.status === 'weekoff' ? 'Week Off (Sunday)'
                : dayStatus?.status === 'future' ? 'Upcoming date'
                : 'Absent'}
            </Text>
            <Text style={styles.infoSub}>
              {dayStatus?.status === 'weekoff' ? 'No attendance expected on this day'
                : dayStatus?.status === 'future' ? 'Attendance not recorded yet'
                : 'No punch records found for this date'}
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  header: { paddingTop: 52, paddingBottom: 18, paddingHorizontal: 18, borderBottomLeftRadius: 26, borderBottomRightRadius: 26, overflow: 'hidden', elevation: 6 },
  deco: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.07)' },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.14)', justifyContent: 'center', alignItems: 'center' },
  title: { color: '#fff', fontSize: 17, fontWeight: '800' },
  subTitle: { color: '#C7D2FE', fontSize: 11.5, marginTop: 2 },

  statRow: { flexDirection: 'row', gap: 8 },
  statCard: { flex: 1, backgroundColor: '#fff', borderRadius: 14, paddingVertical: 12, alignItems: 'center', borderTopWidth: 3, elevation: 1 },
  statNum: { fontSize: 18, fontWeight: '800' },
  statLabel: { fontSize: 10, color: GREY, fontWeight: '700', marginTop: 2 },
  statHint: { fontSize: 10.5, color: '#9CA3AF', marginTop: 8, marginBottom: 12, textAlign: 'center' },

  calCard: { backgroundColor: '#fff', borderRadius: 18, padding: 8, elevation: 1, marginBottom: 14 },
  legendRow: { flexDirection: 'row', justifyContent: 'center', gap: 14, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 9, height: 9, borderRadius: 3 },
  legendText: { fontSize: 10.5, color: GREY, fontWeight: '700' },

  dateHeadRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 10 },
  dateHeadText: { fontSize: 14, fontWeight: '800', color: '#111827' },

  sessCard: { backgroundColor: '#fff', borderRadius: 16, padding: 12, marginBottom: 10, elevation: 1 },
  sessHead: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  sessSite: { fontSize: 13, fontWeight: '800', color: '#111827', flex: 1 },
  lateBadge: { backgroundColor: '#FEF3C7', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  lateText: { color: AMBER, fontSize: 9, fontWeight: '800' },
  hoursPill: { backgroundColor: '#EEF2FF', borderRadius: 9, paddingHorizontal: 8, paddingVertical: 3 },
  hoursPillText: { color: INDIGO, fontSize: 11, fontWeight: '800' },
  photoPair: { flexDirection: 'row', gap: 10, marginTop: 10 },
  photoCol: { flex: 1 },
  photoLabel: { fontSize: 10.5, fontWeight: '800', marginBottom: 5 },
  photo: { width: '100%', height: 130, borderRadius: 12, backgroundColor: '#E5E7EB' },
  photoEmpty: { justifyContent: 'center', alignItems: 'center' },
  addrRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 8 },
  addrText: { flex: 1, fontSize: 11.5, color: GREY, lineHeight: 15 },

  infoCard: { backgroundColor: '#fff', borderRadius: 16, padding: 24, alignItems: 'center', gap: 6, elevation: 1 },
  infoTitle: { fontSize: 15, fontWeight: '800', color: '#111827' },
  infoSub: { fontSize: 12, color: '#9CA3AF', textAlign: 'center' },
});