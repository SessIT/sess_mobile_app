import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, RefreshControl, Modal, TextInput, Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { Calendar } from 'react-native-calendars';
import { api } from '../lib/api';
import { GradientHeader, BottomNav, Card, Chip, PrimaryButton, HeaderIconButton , SheetOverlay} from '../components/ui';
import { COLORS, RADIUS } from '../lib/theme';
import { getAuth } from '../lib/auth';

const ADMIN = 'Admin';

const CURRENT_YEAR = new Date(Date.now() + 5.5 * 3600000).getUTCFullYear();
const todayYMD = () => new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
// Same window the web console offers in its year dropdown.
const MIN_YEAR = CURRENT_YEAR - 1;
const MAX_YEAR = CURRENT_YEAR + 3;

// Holidays are date-only (@db.Date → UTC midnight); read the parts in UTC so the
// calendar day never shifts.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const parts = (iso) => {
  const d = new Date(iso);
  return { day: d.getUTCDate(), mon: MONTHS[d.getUTCMonth()], wd: WEEKDAYS[d.getUTCDay()], ymd: d.toISOString().slice(0, 10) };
};
const daysUntil = (ymd) => Math.round((new Date(ymd + 'T00:00:00Z') - new Date(todayYMD() + 'T00:00:00Z')) / 86400000);
const prettyDate = (ymd) =>
  new Date(ymd + 'T00:00:00Z').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });

export default function HolidaysScreen({ navigation }) {
  // mode: 'upcoming' (default when opened from the widget) or 'all' (full year)
  const [mode, setMode] = useState('upcoming');
  const [year, setYear] = useState(CURRENT_YEAR);
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  // Bumped after an add/delete so the list refetches without changing filters.
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    // Roles live in the saved login payload, like ProfileMenuScreen reads them.
    getAuth().then(a => { if (alive) setIsAdmin((a?.roles || []).includes(ADMIN)); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const load = useCallback(async (m, y) => {
    setLoading(true);
    try {
      const res = m === 'all'
        ? await api(`/holidays?year=${y}`)
        : await api('/holidays/upcoming?limit=50');
      setHolidays(res.holidays || []);
    } catch {
      setHolidays([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(mode, year); }, [mode, year, tick, load]);

  const onRefresh = () => { setRefreshing(true); load(mode, year); };

  const today = todayYMD();
  const upcomingCount = holidays.filter(h => parts(h.date).ymd >= today).length;

  // Clamp rather than reject: a year that somehow landed outside the window
  // would otherwise have both arrows refuse to move and strand the screen.
  const clampYear = (y) => Math.min(MAX_YEAR, Math.max(MIN_YEAR, y));
  const shiftYear = (n) => setYear(clampYear(year + n));

  const removeHoliday = (h) => {
    Alert.alert('Delete holiday', `Remove “${h.name}” (${prettyDate(parts(h.date).ymd)})?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          setDeletingId(h.id);
          try {
            await api(`/holidays/${h.id}`, { method: 'DELETE' });
            setTick(t => t + 1);
          } catch (e) { Alert.alert('Delete failed', e.message); }
          finally { setDeletingId(null); }
        },
      },
    ]);
  };

  // A newly added holiday may belong to another year — jump there so it is visible.
  const onAdded = (ymd) => {
    setAddOpen(false);
    setYear(clampYear(Number(ymd.slice(0, 4))));
    setMode('all');
    setTick(t => t + 1);
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <GradientHeader
        title="Holidays"
        onBack={() => navigation.goBack()}
        right={isAdmin
          ? <HeaderIconButton icon="add" onPress={() => setAddOpen(true)} />
          : <View style={{ width: 38 }} />}
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
            <Text style={[styles.segTxt, mode === 'all' && styles.segTxtOn]}>Full list · {year}</Text>
          </TouchableOpacity>
        </View>

        {/* Admins can manage any year in the window; employees only ever see this one. */}
        {isAdmin && mode === 'all' && (
          <View style={styles.yearRow}>
            <TouchableOpacity
              onPress={() => shiftYear(-1)}
              disabled={year <= MIN_YEAR}
              style={[styles.yearArrow, year <= MIN_YEAR && { opacity: 0.3 }]}
            >
              <MaterialIcons name="chevron-left" size={22} color="#C7D2FE" />
            </TouchableOpacity>
            <Text style={styles.yearText}>{year}</Text>
            <TouchableOpacity
              onPress={() => shiftYear(1)}
              disabled={year >= MAX_YEAR}
              style={[styles.yearArrow, year >= MAX_YEAR && { opacity: 0.3 }]}
            >
              <MaterialIcons name="chevron-right" size={22} color="#C7D2FE" />
            </TouchableOpacity>
          </View>
        )}
      </GradientHeader>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>
      ) : holidays.length === 0 ? (
        <View style={styles.center}>
          <MaterialIcons name="celebration" size={54} color="#CBD5E1" />
          <Text style={styles.emptyTitle}>
            {mode === 'upcoming' ? 'No upcoming holidays' : `No holidays for ${year}`}
          </Text>
          <Text style={styles.emptyHint}>
            {isAdmin
              ? 'Tap + to add the first holiday of the year.'
              : 'Check back later — the HR team updates this list.'}
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />}
        >
          {isAdmin && mode === 'all' && (
            <View style={styles.countRow}>
              <Chip text={`${holidays.length} total`} />
              <Chip text={`${upcomingCount} upcoming`} color={COLORS.green} soft={COLORS.greenSoft} />
            </View>
          )}

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
                {isAdmin && (
                  <TouchableOpacity
                    style={styles.delBtn}
                    disabled={deletingId === h.id}
                    onPress={() => removeHoliday(h)}
                  >
                    {deletingId === h.id
                      ? <ActivityIndicator size="small" color={COLORS.red} />
                      : <MaterialIcons name="delete-outline" size={18} color={COLORS.red} />}
                  </TouchableOpacity>
                )}
              </Card>
            );
          })}
          {mode === 'upcoming' && (
            <TouchableOpacity style={styles.fullBtn} onPress={() => setMode('all')}>
              <MaterialIcons name="calendar-month" size={18} color={COLORS.primary} />
              <Text style={styles.fullBtnTxt}>Show full {year} list</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      )}

      {isAdmin && (
        <AddHolidayModal
          visible={addOpen}
          year={year}
          onClose={() => setAddOpen(false)}
          onSaved={onAdded}
        />
      )}

      <BottomNav navigation={navigation} active="profile" />
    </View>
  );
}

/* ---------------- Add holiday (admin) ---------------- */
function AddHolidayModal({ visible, year, onClose, onSaved }) {
  const [date, setDate] = useState(todayYMD());
  const [name, setName] = useState('');
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      // Start on today, or on 1 Jan when the list is showing a different year.
      setDate(year === CURRENT_YEAR ? todayYMD() : `${year}-01-01`);
      setName('');
      setPicking(false);
      setBusy(false);
    }
  }, [visible, year]);

  const submit = async () => {
    if (!name.trim()) { Alert.alert('Name required', 'Please enter the holiday name.'); return; }
    setBusy(true);
    try {
      await api('/holidays', { method: 'POST', body: JSON.stringify({ date, name: name.trim() }) });
      onSaved(date);
    } catch (e) {
      Alert.alert('Could not save', e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <SheetOverlay>
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Add Holiday</Text>

          <Text style={styles.fieldLabel}>DATE</Text>
          <TouchableOpacity style={styles.dateField} onPress={() => setPicking(true)}>
            <MaterialIcons name="event" size={18} color={COLORS.primary} />
            <Text style={styles.dateValue}>{prettyDate(date)}</Text>
            <MaterialIcons name="arrow-drop-down" size={22} color={COLORS.faint} />
          </TouchableOpacity>

          <Text style={styles.fieldLabel}>HOLIDAY NAME *</Text>
          <TextInput
            style={styles.nameInput}
            placeholder="e.g. Independence Day"
            placeholderTextColor={COLORS.faint}
            value={name}
            onChangeText={setName}
          />

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
            <TouchableOpacity style={[styles.sheetClose, { flex: 1, marginTop: 0 }]} onPress={onClose} disabled={busy}>
              <Text style={styles.sheetCloseText}>Cancel</Text>
            </TouchableOpacity>
            <PrimaryButton
              title="Save holiday"
              style={{ flex: 1 }}
              busy={busy}
              disabled={!name.trim()}
              onPress={submit}
            />
          </View>
        </View>
      </SheetOverlay>

      {/* Date picker */}
      <Modal visible={picking} transparent animationType="fade" onRequestClose={() => setPicking(false)}>
        <SheetOverlay center>
          <View style={styles.calCard}>
            <Text style={styles.sheetTitle}>Select date</Text>
            <Calendar
              current={date}
              minDate={`${MIN_YEAR}-01-01`}
              maxDate={`${MAX_YEAR}-12-31`}
              onDayPress={(d) => { setDate(d.dateString); setPicking(false); }}
              markedDates={{ [date]: { selected: true, selectedColor: COLORS.primary } }}
              theme={{ todayTextColor: COLORS.primary, arrowColor: COLORS.primary, textMonthFontWeight: '800' }}
            />
            <TouchableOpacity style={styles.sheetClose} onPress={() => setPicking(false)}>
              <Text style={styles.sheetCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </SheetOverlay>
      </Modal>
    </Modal>
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

  yearRow: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginTop: 10,
    backgroundColor: 'rgba(255,255,255,0.13)', borderRadius: 14, height: 40,
    paddingHorizontal: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
  },
  yearArrow: { paddingHorizontal: 4, paddingVertical: 4 },
  yearText: { minWidth: 60, textAlign: 'center', color: '#fff', fontSize: 13.5, fontWeight: '800' },

  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30 },
  emptyTitle: { marginTop: 14, fontSize: 16, fontWeight: '700', color: '#374151' },
  emptyHint: { marginTop: 6, fontSize: 13, color: COLORS.faint, textAlign: 'center' },

  list: { padding: 16, paddingBottom: 24 },
  countRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
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
  delBtn: {
    width: 34, height: 34, borderRadius: 11, backgroundColor: COLORS.redSoft,
    justifyContent: 'center', alignItems: 'center', marginLeft: -4,
  },

  fullBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 6, borderWidth: 1.5, borderColor: '#C7D2FE', backgroundColor: COLORS.card,
    borderRadius: RADIUS.button, paddingVertical: 13,
  },
  fullBtnTxt: { color: COLORS.primary, fontWeight: '700', fontSize: 14 },

  /* add sheet */
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: COLORS.card, borderTopLeftRadius: RADIUS.sheet, borderTopRightRadius: RADIUS.sheet,
    padding: 18, paddingBottom: 26,
  },
  sheetHandle: { width: 42, height: 5, borderRadius: 3, backgroundColor: COLORS.line, alignSelf: 'center', marginBottom: 12 },
  sheetTitle: { fontSize: 16, fontWeight: '800', color: COLORS.ink, marginBottom: 12, textAlign: 'center' },
  fieldLabel: { fontSize: 10.5, fontWeight: '800', color: COLORS.faint, letterSpacing: 0.6, marginTop: 10, marginBottom: 8 },
  dateField: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.field,
    borderWidth: 1.5, borderColor: COLORS.line, borderRadius: RADIUS.input, paddingHorizontal: 12, height: 50,
  },
  dateValue: { flex: 1, fontSize: 14, fontWeight: '700', color: COLORS.ink },
  nameInput: {
    backgroundColor: COLORS.field, borderWidth: 1.5, borderColor: COLORS.line, borderRadius: RADIUS.input,
    paddingHorizontal: 12, height: 50, fontSize: 14, color: COLORS.ink,
  },
  sheetClose: {
    marginTop: 10, height: 52, borderRadius: RADIUS.button, borderWidth: 1.5,
    borderColor: COLORS.line, justifyContent: 'center', alignItems: 'center',
  },
  sheetCloseText: { color: '#374151', fontWeight: '700' },
  overlayCenter: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'center', padding: 20 },
  calCard: { backgroundColor: COLORS.card, borderRadius: RADIUS.sheet, padding: 16 },
});
