import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Image, RefreshControl, Dimensions,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { Calendar } from 'react-native-calendars';
import { api, API_URL } from '../lib/api';

const { width } = Dimensions.get('window');

const INDIGO = '#1E3A8A';
const GREEN = '#16A34A';
const RED = '#DC2626';
const AMBER = '#D97706';
const GREY = '#6B7280';
const LIGHT_GREY = '#F3F4F6';
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

/* Arrival policy (IST) — mirrors the backend:
 *   <= 09:30 ontime · 09:31–09:40 grace (present + LATE) · >= 09:41 late (amber + LATE) */
const lateLevelOf = (firstIn) => {
  if (!firstIn) return null;
  const ist = new Date(new Date(firstIn).getTime() + 5.5 * 3600000);
  const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  if (mins <= 9 * 60 + 30) return 'ontime';
  if (mins <= 9 * 60 + 40) return 'grace';
  return 'late';
};
const isLateLevel = (lvl) => lvl === 'grace' || lvl === 'late';

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

  useEffect(() => {
    const unsub = navigation.addListener('focus', () => { loadMonth(); loadDay(); });
    return unsub;
  }, [navigation, loadMonth, loadDay]);

  const stats = monthData?.stats || { present: 0, late: 0, absent: 0, weekoff: 0, hours: 0 };

  const markedDates = useMemo(() => {
    const marks = {};
    if (monthData?.days) {
      for (const d of monthData.days) {
        if (d.status === 'future') continue;
        let bg = null, txt = '#fff';
        if (d.status === 'present') bg = d.lateLevel === 'late' ? AMBER : GREEN;
        else if (d.status === 'absent') bg = RED;
        else if (d.status === 'weekoff') { bg = '#E5E7EB'; txt = GREY; }
        if (bg) {
          marks[d.date] = {
            customStyles: {
              container: { 
                backgroundColor: bg, 
                borderRadius: 8,
                elevation: bg !== '#E5E7EB' ? 3 : 0,
                shadowColor: bg !== '#E5E7EB' ? bg : 'transparent',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.2,
                shadowRadius: 3,
              },
              text: { color: txt, fontWeight: '700' },
            },
          };
        }
      }
    }
    const existing = marks[date]?.customStyles;
    marks[date] = {
      customStyles: {
        container: { 
          ...(existing?.container || { borderRadius: 8 }), 
          borderWidth: 2, 
          borderColor: INDIGO,
          elevation: 5,
          shadowColor: INDIGO,
          shadowOffset: { width: 0, height: 3 },
          shadowOpacity: 0.3,
          shadowRadius: 4,
        },
        text: existing?.text || { color: INDIGO, fontWeight: '800' },
      },
    };
    return marks;
  }, [monthData, date]);

  const dayStatus = monthData?.days ? monthData.days.find(d => d.date === date) || null : null;
  const dayLate = isLateLevel(lateLevelOf(daySessions[0]?.punchInTime));

  // Count boxes for quick stats
  const CountBox = ({ label, value, color, icon }) => (
    <View style={styles.countBox}>
      <View style={[styles.countIcon, { backgroundColor: color + '15' }]}>
        <MaterialIcons name={icon} size={20} color={color} />
      </View>
      <Text style={[styles.countValue, { color }]}>{value}</Text>
      <Text style={styles.countLabel}>{label}</Text>
    </View>
  );

  const SessionCard = ({ s, isFirst }) => (
    <View style={styles.sessCard}>
      <LinearGradient
        colors={['#ffffff', '#fafafa']}
        style={styles.sessGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.sessHead}>
          <View style={styles.sessIconWrap}>
            <MaterialIcons
              name={(s.siteName || 'SESS') === 'SESS' ? 'business' : 'directions-car'}
              size={16} color="#fff"
            />
          </View>
          <Text style={styles.sessSite}>{s.siteName || 'SESS'}</Text>
          {isFirst && dayLate && <View style={styles.lateBadge}><Text style={styles.lateText}>LATE</Text></View>}
          <View style={styles.hoursPill}>
            <Text style={styles.hoursPillText}>{s.punchOutTime ? fmtH(s.workingHours) : 'On duty'}</Text>
          </View>
        </View>

        <View style={styles.photoPair}>
          <View style={styles.photoCol}>
            <View style={styles.timeLabel}>
              <View style={[styles.timeDot, { backgroundColor: GREEN }]} />
              <Text style={[styles.photoLabel, { color: GREEN }]}>IN  {fmtT(s.punchInTime)}</Text>
            </View>
            {s.punchInPhoto ? (
              <Image source={{ uri: `${BASE}/${s.punchInPhoto}` }} style={styles.photo} />
            ) : (
              <View style={[styles.photo, styles.photoEmpty]}>
                <MaterialIcons name="no-photography" size={28} color="#D1D5DB" />
              </View>
            )}
          </View>
          <View style={styles.photoCol}>
            <View style={styles.timeLabel}>
              <View style={[styles.timeDot, { backgroundColor: RED }]} />
              <Text style={[styles.photoLabel, { color: RED }]}>OUT  {fmtT(s.punchOutTime)}</Text>
            </View>
            {s.punchOutPhoto ? (
              <Image source={{ uri: `${BASE}/${s.punchOutPhoto}` }} style={styles.photo} />
            ) : (
              <View style={[styles.photo, styles.photoEmpty]}>
                <MaterialIcons name="schedule" size={28} color="#D1D5DB" />
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
      </LinearGradient>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <LinearGradient 
        colors={['#1E40AF', '#1E3A8A', '#312E81']} 
        start={{ x: 0, y: 0 }} 
        end={{ x: 1, y: 1 }} 
        style={styles.header}
      >
        <View style={[styles.deco, { width: 200, height: 200, top: -70, right: -60 }]} />
        <View style={[styles.deco, { width: 120, height: 120, bottom: -40, left: -30 }]} />
        
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>My Attendance</Text>
            <Text style={styles.subTitle}>Total worked this month: {fmtH(stats.hours)}</Text>
          </View>
          <TouchableOpacity style={styles.moreBtn}>
            <MaterialIcons name="more-vert" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={() => { setRefreshing(true); loadMonth(); loadDay(); }} 
            colors={[INDIGO]}
            tintColor={INDIGO}
          />
        }
      >
        {/* Premium Count Boxes */}
        <View style={styles.countGrid}>
          <CountBox label="Present" value={stats.present} color={GREEN} icon="check-circle" />
          <CountBox label="Late" value={stats.late} color={AMBER} icon="access-time" />
          <CountBox label="Absent" value={stats.absent} color={RED} icon="cancel" />
          <CountBox label="Week Off" value={stats.weekoff} color={GREY} icon="weekend" />
        </View>

        <View style={styles.statDivider}>
          <View style={styles.statDividerLine} />
          <Text style={styles.statDividerText}>Monthly Overview</Text>
          <View style={styles.statDividerLine} />
        </View>

        {/* Calendar with premium styling */}
        <View style={styles.calCard}>
          {monthLoading && <ActivityIndicator size="small" color={INDIGO} style={{ marginVertical: 10 }} />}
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
              textDayFontSize: 15,
              textMonthFontSize: 17,
              textDayHeaderFontSize: 12,
              backgroundColor: '#ffffff',
              calendarBackground: '#ffffff',
            }}
          />
          
          <View style={styles.legendRow}>
            {[
              ['Present', GREEN, '✓'],
              ['Late', AMBER, '⏰'],
              ['Absent', RED, '✗'],
              ['Week Off', '#C4C4C4', '⊙']
            ].map(([l, c, icon]) => (
              <View key={l} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: c }]} />
                <Text style={styles.legendText}>{l}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Selected date detail with premium styling */}
        <View style={styles.dateSection}>
          <View style={styles.dateHeadRow}>
            <View style={styles.dateIconWrap}>
              <MaterialIcons name="event" size={18} color="#fff" />
            </View>
            <Text style={styles.dateHeadText}>{prettyDate(date)}</Text>
            {dayStatus?.status && (
              <View style={[styles.statusPill, 
                { backgroundColor: dayStatus.status === 'present' ? GREEN : 
                   dayStatus.status === 'absent' ? RED : 
                   dayStatus.status === 'weekoff' ? GREY : '#C4C4C4' }
              ]}>
                <Text style={styles.statusPillText}>
                  {dayStatus.status === 'present' ? 'Present' :
                   dayStatus.status === 'absent' ? 'Absent' :
                   dayStatus.status === 'weekoff' ? 'Week Off' : 'Upcoming'}
                </Text>
              </View>
            )}
          </View>

          {dayLoading ? (
            <ActivityIndicator size="large" color={INDIGO} style={{ marginTop: 30 }} />
          ) : daySessions.length > 0 ? (
            daySessions.map((s, i) => <SessionCard key={s.id} s={s} isFirst={i === 0} />)
          ) : (
            <View style={styles.infoCard}>
              <LinearGradient
                colors={['#FEF3C7', '#FDE68A']}
                style={styles.infoIconWrap}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <MaterialIcons
                  name={dayStatus?.status === 'weekoff' ? 'weekend' : dayStatus?.status === 'future' ? 'schedule' : 'person-off'}
                  size={32}
                  color={dayStatus?.status === 'weekoff' ? GREY : dayStatus?.status === 'future' ? '#6B7280' : RED}
                />
              </LinearGradient>
              <Text style={styles.infoTitle}>
                {dayStatus?.status === 'weekoff' ? 'Week Off'
                  : dayStatus?.status === 'future' ? 'Upcoming Date'
                  : 'Absent'}
              </Text>
              <Text style={styles.infoSub}>
                {dayStatus?.status === 'weekoff' ? 'Enjoy your day off! 🎉'
                  : dayStatus?.status === 'future' ? 'Attendance will be recorded on this day'
                  : 'No attendance records found for this date'}
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  
  header: { 
    paddingTop: 52, 
    paddingBottom: 22, 
    paddingHorizontal: 18, 
    borderBottomLeftRadius: 28, 
    borderBottomRightRadius: 28, 
    overflow: 'hidden', 
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  deco: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.06)' },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn: { 
    width: 40, 
    height: 40, 
    borderRadius: 20, 
    backgroundColor: 'rgba(255,255,255,0.15)', 
    justifyContent: 'center', 
    alignItems: 'center',
    backdropFilter: 'blur(10px)',
  },
  moreBtn: { 
    width: 40, 
    height: 40, 
    borderRadius: 20, 
    backgroundColor: 'rgba(255,255,255,0.1)', 
    justifyContent: 'center', 
    alignItems: 'center',
  },
  title: { color: '#fff', fontSize: 20, fontWeight: '800', letterSpacing: 0.5 },
  subTitle: { color: '#C7D2FE', fontSize: 12, marginTop: 2, opacity: 0.9 },

  countGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 20,
    gap: 8,
  },
  countBox: {
    flex: 1,
    minWidth: (width - 48) / 4 - 8,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 12,
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  countIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  countValue: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  countLabel: {
    fontSize: 10,
    color: GREY,
    fontWeight: '700',
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  statDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  statDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E5E7EB',
  },
  statDividerText: {
    fontSize: 13,
    color: GREY,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },

  calCard: { 
    backgroundColor: '#fff', 
    borderRadius: 20, 
    padding: 12, 
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  legendRow: { 
    flexDirection: 'row', 
    justifyContent: 'center', 
    gap: 16, 
    paddingVertical: 10, 
    borderTopWidth: 1, 
    borderTopColor: '#F3F4F6',
    marginTop: 4,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 10, height: 10, borderRadius: 4 },
  legendText: { fontSize: 11, color: GREY, fontWeight: '600' },

  dateSection: {
    marginTop: 4,
  },
  dateHeadRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 10, 
    marginBottom: 12,
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  dateIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: INDIGO,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dateHeadText: { 
    fontSize: 14, 
    fontWeight: '800', 
    color: '#111827',
    flex: 1,
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusPillText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  sessCard: { 
    marginBottom: 12,
    borderRadius: 18,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  sessGradient: {
    borderRadius: 18,
    padding: 14,
  },
  sessHead: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 8,
    marginBottom: 8,
  },
  sessIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: INDIGO,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sessSite: { 
    fontSize: 13, 
    fontWeight: '800', 
    color: '#111827', 
    flex: 1,
  },
  lateBadge: { 
    backgroundColor: '#FEF3C7', 
    borderRadius: 8, 
    paddingHorizontal: 8, 
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#FCD34D',
  },
  lateText: { 
    color: AMBER, 
    fontSize: 9, 
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  hoursPill: { 
    backgroundColor: '#EEF2FF', 
    borderRadius: 10, 
    paddingHorizontal: 10, 
    paddingVertical: 4,
  },
  hoursPillText: { 
    color: INDIGO, 
    fontSize: 11, 
    fontWeight: '800',
  },
  photoPair: { 
    flexDirection: 'row', 
    gap: 12, 
    marginTop: 4,
  },
  photoCol: { 
    flex: 1,
  },
  timeLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  timeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  photoLabel: { 
    fontSize: 11, 
    fontWeight: '800', 
  },
  photo: { 
    width: '100%', 
    height: 120, 
    borderRadius: 12, 
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  photoEmpty: { 
    justifyContent: 'center', 
    alignItems: 'center',
  },
  addrRow: { 
    flexDirection: 'row', 
    alignItems: 'flex-start', 
    gap: 6, 
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  addrText: { 
    flex: 1, 
    fontSize: 11.5, 
    color: GREY, 
    lineHeight: 15,
  },

  infoCard: { 
    backgroundColor: '#fff', 
    borderRadius: 20, 
    padding: 28, 
    alignItems: 'center', 
    gap: 10,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  infoIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  infoTitle: { 
    fontSize: 16, 
    fontWeight: '800', 
    color: '#111827',
  },
  infoSub: { 
    fontSize: 12.5, 
    color: '#9CA3AF', 
    textAlign: 'center',
    lineHeight: 18,
  },
});