import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { api } from '../lib/api';

const INDIGO = '#1E3A8A';
const GREEN = '#16A34A';
const GREY = '#6B7280';

const CURRENT_YEAR = new Date(Date.now() + 5.5 * 3600000).getUTCFullYear();
const todayYMD = () => new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);

// Holidays are date-only (@db.Date → UTC midnight); read the parts in UTC so the
// calendar day never shifts.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const parts = (iso) => {
  const d = new Date(iso);
  return { day: d.getUTCDate(), mon: MONTHS[d.getUTCMonth()], wd: WEEKDAYS[d.getUTCDay()], ymd: d.toISOString().slice(0, 10) };
};
const daysUntil = (ymd) => Math.round((new Date(ymd + 'T00:00:00Z') - new Date(todayYMD() + 'T00:00:00Z')) / 86400000);

export default function HolidaysScreen({ navigation }) {
  // mode: 'upcoming' (default when opened from the widget) or 'all' (full year)
  const [mode, setMode] = useState('upcoming');
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (m) => {
    setLoading(true);
    try {
      const res = m === 'all'
        ? await api(`/holidays?year=${CURRENT_YEAR}`)
        : await api('/holidays/upcoming?limit=50');
      setHolidays(res.holidays || []);
    } catch {
      setHolidays([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(mode); }, [mode, load]);

  const onRefresh = () => { setRefreshing(true); load(mode); };

  const today = todayYMD();

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <LinearGradient colors={['#1E40AF', '#1E3A8A', '#312E81']} style={styles.header}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Holidays</Text>
          <View style={{ width: 38 }} />
        </View>

        {/* Upcoming / Full year toggle */}
        <View style={styles.segment}>
          <TouchableOpacity
            style={[styles.segBtn, mode === 'upcoming' && styles.segBtnOn]}
            onPress={() => setMode('upcoming')}
          >
            <Text style={[styles.segTxt, mode === 'upcoming' && styles.segTxtOn]}>Upcoming</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segBtn, mode === 'all' && styles.segBtnOn]}
            onPress={() => setMode('all')}
          >
            <Text style={[styles.segTxt, mode === 'all' && styles.segTxtOn]}>Full list · {CURRENT_YEAR}</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={INDIGO} /></View>
      ) : holidays.length === 0 ? (
        <View style={styles.center}>
          <MaterialIcons name="celebration" size={54} color="#CBD5E1" />
          <Text style={styles.emptyTitle}>
            {mode === 'upcoming' ? 'No upcoming holidays' : `No holidays for ${CURRENT_YEAR}`}
          </Text>
          <Text style={styles.emptyHint}>Check back later — the HR team updates this list.</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[INDIGO]} />}
        >
          {holidays.map((h) => {
            const p = parts(h.date);
            const past = p.ymd < today;
            const isToday = p.ymd === today;
            const until = daysUntil(p.ymd);
            return (
              <View key={h.id} style={[styles.card, past && styles.cardPast]}>
                <View style={[styles.dateBox, past && styles.dateBoxPast, isToday && styles.dateBoxToday]}>
                  <Text style={[styles.dateDay, isToday && { color: '#fff' }]}>{p.day}</Text>
                  <Text style={[styles.dateMon, isToday && { color: '#E0E7FF' }]}>{p.mon}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, past && { color: GREY }]} numberOfLines={2}>{h.name}</Text>
                  <Text style={styles.weekday}>{p.wd}</Text>
                </View>
                {isToday ? (
                  <View style={styles.todayPill}><Text style={styles.todayPillTxt}>Today</Text></View>
                ) : !past && until >= 0 ? (
                  <View style={styles.inPill}>
                    <Text style={styles.inPillTxt}>{until === 0 ? 'Today' : until === 1 ? 'Tomorrow' : `in ${until}d`}</Text>
                  </View>
                ) : null}
              </View>
            );
          })}
          {mode === 'upcoming' && (
            <TouchableOpacity style={styles.fullBtn} onPress={() => setMode('all')}>
              <MaterialIcons name="calendar-month" size={18} color={INDIGO} />
              <Text style={styles.fullBtnTxt}>Show full {CURRENT_YEAR} list</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },

  header: {
    paddingTop: 54, paddingBottom: 18, paddingHorizontal: 16,
    borderBottomLeftRadius: 24, borderBottomRightRadius: 24, elevation: 6,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.14)',
    justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '800' },

  segment: {
    flexDirection: 'row', marginTop: 18, backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12, padding: 4,
  },
  segBtn: { flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: 'center' },
  segBtnOn: { backgroundColor: '#fff' },
  segTxt: { color: '#E0E7FF', fontWeight: '700', fontSize: 13 },
  segTxtOn: { color: INDIGO },

  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30 },
  emptyTitle: { marginTop: 14, fontSize: 16, fontWeight: '700', color: '#374151' },
  emptyHint: { marginTop: 6, fontSize: 13, color: '#9CA3AF', textAlign: 'center' },

  list: { padding: 16, paddingBottom: 30 },
  card: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    borderRadius: 16, padding: 12, marginBottom: 10, gap: 14,
    elevation: 2, shadowColor: '#1E3A8A', shadowOpacity: 0.07, shadowRadius: 7, shadowOffset: { width: 0, height: 3 },
  },
  cardPast: { opacity: 0.7 },
  dateBox: {
    width: 54, height: 58, borderRadius: 14, backgroundColor: '#EEF2FF',
    justifyContent: 'center', alignItems: 'center',
  },
  dateBoxPast: { backgroundColor: '#F3F4F6' },
  dateBoxToday: { backgroundColor: INDIGO },
  dateDay: { fontSize: 22, fontWeight: '800', color: INDIGO },
  dateMon: { fontSize: 11, fontWeight: '700', color: '#6366F1', textTransform: 'uppercase' },
  name: { fontSize: 15, fontWeight: '700', color: '#111827' },
  weekday: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },

  todayPill: { backgroundColor: GREEN, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  todayPillTxt: { color: '#fff', fontSize: 11, fontWeight: '800' },
  inPill: { backgroundColor: '#EEF2FF', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  inPillTxt: { color: INDIGO, fontSize: 11, fontWeight: '700' },

  fullBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 6, borderWidth: 1.5, borderColor: '#C7D2FE', backgroundColor: '#fff',
    borderRadius: 14, paddingVertical: 13,
  },
  fullBtnTxt: { color: INDIGO, fontWeight: '700', fontSize: 14 },
});
