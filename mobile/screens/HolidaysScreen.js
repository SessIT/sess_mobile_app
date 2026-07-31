import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { api } from '../lib/api';
import { GradientHeader, BottomNav, Card } from '../components/ui';
import { COLORS, RADIUS } from '../lib/theme';

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

      <GradientHeader
        title="Holidays"
        onBack={() => navigation.goBack()}
        right={<View style={{ width: 38 }} />}
      >
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
      </GradientHeader>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>
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
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />}
        >
          {holidays.map((h) => {
            const p = parts(h.date);
            const past = p.ymd < today;
            const isToday = p.ymd === today;
            const until = daysUntil(p.ymd);
            return (
              <Card key={h.id} style={[styles.card, past && styles.cardPast]}>
                <View style={[styles.dateBox, past && styles.dateBoxPast, isToday && styles.dateBoxToday]}>
                  <Text style={[styles.dateDay, isToday && { color: '#fff' }]}>{p.day}</Text>
                  <Text style={[styles.dateMon, isToday && { color: '#E0E7FF' }]}>{p.mon}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, past && { color: COLORS.sub }]} numberOfLines={2}>{h.name}</Text>
                  <Text style={styles.weekday}>{p.wd}</Text>
                </View>
                {isToday ? (
                  <View style={styles.todayPill}><Text style={styles.todayPillTxt}>Today</Text></View>
                ) : !past && until >= 0 ? (
                  <View style={styles.inPill}>
                    <Text style={styles.inPillTxt}>{until === 0 ? 'Today' : until === 1 ? 'Tomorrow' : `in ${until}d`}</Text>
                  </View>
                ) : null}
              </Card>
            );
          })}
          {mode === 'upcoming' && (
            <TouchableOpacity style={styles.fullBtn} onPress={() => setMode('all')}>
              <MaterialIcons name="calendar-month" size={18} color={COLORS.primary} />
              <Text style={styles.fullBtnTxt}>Show full {CURRENT_YEAR} list</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      )}

      <BottomNav navigation={navigation} active="profile" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },

  segment: {
    flexDirection: 'row', marginTop: 18, backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12, padding: 4,
  },
  segBtn: { flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: 'center' },
  segBtnOn: { backgroundColor: '#fff' },
  segTxt: { color: '#E0E7FF', fontWeight: '700', fontSize: 13 },
  segTxtOn: { color: COLORS.primary },

  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30 },
  emptyTitle: { marginTop: 14, fontSize: 16, fontWeight: '700', color: '#374151' },
  emptyHint: { marginTop: 6, fontSize: 13, color: COLORS.faint, textAlign: 'center' },

  list: { padding: 16, paddingBottom: 24 },
  card: { flexDirection: 'row', alignItems: 'center', padding: 12, marginBottom: 10, gap: 14 },
  cardPast: { opacity: 0.7 },
  dateBox: {
    width: 54, height: 58, borderRadius: 14, backgroundColor: COLORS.indigoSoft,
    justifyContent: 'center', alignItems: 'center',
  },
  dateBoxPast: { backgroundColor: '#F3F4F6' },
  dateBoxToday: { backgroundColor: COLORS.primary },
  dateDay: { fontSize: 22, fontWeight: '800', color: COLORS.primary },
  dateMon: { fontSize: 11, fontWeight: '700', color: COLORS.accent, textTransform: 'uppercase' },
  name: { fontSize: 15, fontWeight: '700', color: COLORS.ink },
  weekday: { fontSize: 12, color: COLORS.faint, marginTop: 2 },

  todayPill: { backgroundColor: COLORS.green, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  todayPillTxt: { color: '#fff', fontSize: 11, fontWeight: '800' },
  inPill: { backgroundColor: COLORS.indigoSoft, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  inPillTxt: { color: COLORS.primary, fontSize: 11, fontWeight: '700' },

  fullBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 6, borderWidth: 1.5, borderColor: '#C7D2FE', backgroundColor: COLORS.card,
    borderRadius: RADIUS.button, paddingVertical: 13,
  },
  fullBtnTxt: { color: COLORS.primary, fontWeight: '700', fontSize: 14 },
});
