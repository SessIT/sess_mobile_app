import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Image, RefreshControl, Dimensions,
  Modal, TextInput, Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { Calendar } from 'react-native-calendars';
import { api, API_URL } from '../lib/api';
import { GradientHeader, HeaderIconButton, BottomNav, Card, Chip , SheetOverlay} from '../components/ui';
import { COLORS, RADIUS, SHADOW } from '../lib/theme';

const { width } = Dimensions.get('window');
const BASE = API_URL.replace('/api', '');

const todayYMD = () => new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
const thisMonth = () => todayYMD().slice(0, 7);
const lastDayOfMonth = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); // day 0 of the next month
};
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

/* Correction-request helpers: "HH:MM" (24h, IST) -> ISO instant on a date. */
const HM_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;
const hmToIso = (ymd, hm) => new Date(`${ymd}T${hm}:00+05:30`).toISOString();

export default function MyAttendanceScreen({ navigation }) {
  const [month, setMonth] = useState(thisMonth());
  const [date, setDate] = useState(todayYMD());
  const [monthData, setMonthData] = useState(null);
  const [daySessions, setDaySessions] = useState([]);
  const [dayHoliday, setDayHoliday] = useState(null);
  const [monthLoading, setMonthLoading] = useState(true);
  const [dayLoading, setDayLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Attendance correction requests (raise for a missed punch)
  const [corrections, setCorrections] = useState([]);
  const [corrModal, setCorrModal] = useState(false);
  const [corrIn, setCorrIn] = useState('');
  const [corrOut, setCorrOut] = useState('');
  const [corrReason, setCorrReason] = useState('');
  const [corrBusy, setCorrBusy] = useState(false);

  const loadCorrections = useCallback(async () => {
    try {
      const res = await api('/attendance/corrections/my');
      setCorrections(res.requests || []);
    } catch { setCorrections([]); }
  }, []);

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
      setDayHoliday(res.holiday || null);
    } catch { setDaySessions([]); setDayHoliday(null); }
    finally { setDayLoading(false); }
  }, [date]);

  useEffect(() => { loadMonth(); }, [loadMonth]);
  useEffect(() => { loadDay(); }, [loadDay]);

  // Paging the grid must not strand the selection in a month we no longer hold
  // data for — pull it into the visible month (its last elapsed day).
  useEffect(() => {
    if (date.slice(0, 7) === month) return;
    const last = lastDayOfMonth(month);
    setDate(last > todayYMD() ? todayYMD() : last);
  }, [month, date]);

  useEffect(() => {
    const unsub = navigation.addListener('focus', () => { loadMonth(); loadDay(); loadCorrections(); });
    return unsub;
  }, [navigation, loadMonth, loadDay, loadCorrections]);

  useEffect(() => { loadCorrections(); }, [loadCorrections]);

  // Correction already raised for the selected date?
  const dateCorrection = corrections.find(
    (c) => String(c.date).slice(0, 10) === date && (c.status === 'pending' || c.status === 'approved')
  );

  const openCorrection = () => {
    setCorrIn('');
    setCorrOut('');
    setCorrReason('');
    setCorrBusy(false);
    setCorrModal(true);
  };

  const submitCorrection = async () => {
    if (corrIn && !HM_RE.test(corrIn)) { Alert.alert('Invalid time', 'Punch-in must be HH:MM (24h), e.g. 09:30'); return; }
    if (corrOut && !HM_RE.test(corrOut)) { Alert.alert('Invalid time', 'Punch-out must be HH:MM (24h), e.g. 18:00'); return; }
    if (!corrIn && !corrOut) { Alert.alert('Missing time', 'Enter the correct punch-in and/or punch-out time.'); return; }
    if (corrIn && corrOut && corrOut <= corrIn) { Alert.alert('Invalid time', 'Punch-out must be after punch-in.'); return; }
    if (!corrReason.trim()) { Alert.alert('Reason required', 'Please explain what went wrong (e.g. forgot to punch out).'); return; }
    setCorrBusy(true);
    try {
      await api('/attendance/corrections', {
        method: 'POST',
        body: JSON.stringify({
          date,
          requestedIn: corrIn ? hmToIso(date, corrIn) : null,
          requestedOut: corrOut ? hmToIso(date, corrOut) : null,
          reason: corrReason.trim(),
        }),
      });
      setCorrModal(false);
      loadCorrections();
      Alert.alert('Request sent ✅', 'Your correction request has been sent to HR for approval.');
    } catch (e) { Alert.alert('Could not send', e.message); }
    finally { setCorrBusy(false); }
  };

  const stats = monthData?.stats || { present: 0, late: 0, leave: 0, absent: 0, weekoff: 0, holiday: 0, hours: 0 };
  const requiredHrs = monthData?.requiredHours ?? 0;

  const markedDates = useMemo(() => {
    const marks = {};
    if (monthData?.days) {
      for (const d of monthData.days) {
        if (d.status === 'future') continue;
        let bg = null, txt = '#fff';
        if (d.status === 'present') bg = d.lateLevel === 'late' ? COLORS.orange : COLORS.green;
        else if (d.status === 'holiday') bg = COLORS.teal;
        else if (d.status === 'leave') bg = COLORS.purple;
        else if (d.status === 'absent') bg = COLORS.red;
        else if (d.status === 'weekoff') { bg = COLORS.line; txt = COLORS.sub; }
        if (bg) {
          marks[d.date] = {
            customStyles: {
              container: {
                backgroundColor: bg,
                borderRadius: 10,
                elevation: bg !== COLORS.line ? 3 : 0,
                shadowColor: bg !== COLORS.line ? bg : 'transparent',
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
    // Selected day always gets the indigo outline (defaults to today).
    const existing = marks[date]?.customStyles;
    marks[date] = {
      customStyles: {
        container: {
          ...(existing?.container || { borderRadius: 10 }),
          borderWidth: 2,
          borderColor: COLORS.primary,
          elevation: 5,
          shadowColor: COLORS.primary,
          shadowOffset: { width: 0, height: 3 },
          shadowOpacity: 0.3,
          shadowRadius: 4,
        },
        text: existing?.text || { color: COLORS.primary, fontWeight: '800' },
      },
    };
    return marks;
  }, [monthData, date]);

  const dayStatus = monthData?.days ? monthData.days.find(d => d.date === date) || null : null;
  const dayLate = isLateLevel(lateLevelOf(daySessions[0]?.punchInTime));
  // The month grid carries holidayName for every day (even a worked one), but it
  // lags a month change by one fetch — /my-day answers for the selected date itself.
  const holidayName = dayStatus?.holidayName || dayHoliday?.name || null;
  // A day nobody was rostered for. Working one is what comp-off exists for, so
  // the correction flow stays open here — only its wording changes.
  const isOffDay = dayStatus?.status === 'weekoff' || dayStatus?.status === 'holiday';

  // Quick month stats — white tiles under the header
  const CountBox = ({ label, value, color, soft, icon }) => (
    <View style={styles.countBox}>
      <View style={[styles.countIcon, { backgroundColor: soft }]}>
        <MaterialIcons name={icon} size={20} color={color} />
      </View>
      <Text style={[styles.countValue, { color }]}>{value}</Text>
      <Text style={styles.countLabel}>{label}</Text>
    </View>
  );

  const SessionCard = ({ s, isFirst }) => (
    <Card style={styles.sessCard}>
      <View style={styles.sessHead}>
        <View style={styles.sessIconWrap}>
          <MaterialIcons
            name={(s.siteName || 'SESS') === 'SESS' ? 'business' : 'directions-car'}
            size={16} color="#fff"
          />
        </View>
        <Text style={styles.sessSite}>{s.siteName || 'SESS'}</Text>
        {isFirst && dayLate && <Chip text="LATE" color={COLORS.orange} soft={COLORS.orangeSoft} />}
        <Chip
          text={s.punchOutTime ? fmtH(s.workingHours) : 'On duty'}
          color={COLORS.primary} soft={COLORS.indigoSoft}
        />
      </View>

      <View style={styles.photoPair}>
        <View style={styles.photoCol}>
          <View style={styles.timeLabel}>
            <View style={[styles.timeDot, { backgroundColor: COLORS.green }]} />
            <Text style={[styles.photoLabel, { color: COLORS.green }]}>IN  {fmtT(s.punchInTime)}</Text>
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
            <View style={[styles.timeDot, { backgroundColor: COLORS.red }]} />
            <Text style={[styles.photoLabel, { color: COLORS.red }]}>OUT  {fmtT(s.punchOutTime)}</Text>
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
          <MaterialIcons name="location-on" size={14} color={COLORS.green} />
          <Text style={styles.addrText} numberOfLines={2}>{s.punchInAddress}</Text>
        </View>
      ) : null}
      {s.punchOutAddress ? (
        <View style={styles.addrRow}>
          <MaterialIcons name="location-on" size={14} color={COLORS.red} />
          <Text style={styles.addrText} numberOfLines={2}>{s.punchOutAddress}</Text>
        </View>
      ) : null}
    </Card>
  );

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <GradientHeader
        title="My Attendance"
        subtitle={`Effort: ${fmtH(stats.hours)} / ${fmtH(requiredHrs)} required`}
        onBack={() => navigation.goBack()}
        right={<HeaderIconButton icon="more-vert" size={20} />}
      />

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 28 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); loadMonth(); loadDay(); }}
            colors={[COLORS.primary]}
            tintColor={COLORS.primary}
          />
        }
      >
        {/* Month stat tiles */}
        <View style={styles.countGrid}>
          <CountBox label="Present" value={stats.present} color={COLORS.green} soft={COLORS.greenSoft} icon="check-circle" />
          <CountBox label="Late" value={stats.late} color={COLORS.orange} soft={COLORS.orangeSoft} icon="access-time" />
          <CountBox label="Leave" value={stats.leave ?? 0} color={COLORS.purple} soft={COLORS.purpleSoft} icon="beach-access" />
          <CountBox label="Absent" value={stats.absent} color={COLORS.red} soft={COLORS.redSoft} icon="cancel" />
        </View>

        {/* Centered section label between thin lines, per design page 11 */}
        <View style={styles.sectionDivider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>MONTHLY OVERVIEW</Text>
          <View style={styles.dividerLine} />
        </View>

        <Card style={styles.calCard}>
          {monthLoading && <ActivityIndicator size="small" color={COLORS.primary} style={{ marginVertical: 10 }} />}
          {/* `initialDate` is the only month prop this version of
            * react-native-calendars re-reads after mount (`current` seeds the
            * initial state only), so it — not the selected day — is what keeps
            * the grid on the month whose data is loaded. */}
          <Calendar
            initialDate={`${month}-01`}
            maxDate={todayYMD()}
            disableArrowRight={month >= thisMonth()}
            markingType="custom"
            markedDates={markedDates}
            onDayPress={(d) => setDate(d.dateString)}
            onMonthChange={(m) => {
              const ym = `${m.year}-${String(m.month).padStart(2, '0')}`;
              if (ym <= thisMonth()) setMonth(ym);
            }}
            theme={{
              todayTextColor: COLORS.primary,
              arrowColor: COLORS.primary,
              textMonthFontWeight: '800',
              textDayFontWeight: '600',
              textDayHeaderFontWeight: '700',
              textDayFontSize: 15,
              textMonthFontSize: 17,
              textDayHeaderFontSize: 12,
              backgroundColor: COLORS.card,
              calendarBackground: COLORS.card,
            }}
          />

          <View style={styles.legendRow}>
            {[
              ['Present', COLORS.green],
              ['Late', COLORS.orange],
              ['Leave', COLORS.purple],
              ['Absent', COLORS.red],
              ['Holiday', COLORS.teal],
              ['Week Off', '#C4C4C4'],
            ].map(([l, c]) => (
              <View key={l} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: c }]} />
                <Text style={styles.legendText}>{l}</Text>
              </View>
            ))}
          </View>
        </Card>

        {/* Selected date detail */}
        <View style={styles.dateSection}>
          <Card style={styles.dateHeadRow}>
            <View style={styles.dateIconWrap}>
              <MaterialIcons name="event" size={18} color="#fff" />
            </View>
            <Text style={styles.dateHeadText}>{prettyDate(date)}</Text>
            {dayStatus?.status && (
              <Chip
                text={dayStatus.status === 'present' ? 'Present' :
                  dayStatus.status === 'holiday' ? 'Holiday' :
                  dayStatus.status === 'leave' ? 'Paid Leave' :
                  dayStatus.status === 'absent' ? 'Absent' :
                  dayStatus.status === 'weekoff' ? 'Week Off' : 'Upcoming'}
                color={dayStatus.status === 'present' ? COLORS.green :
                  dayStatus.status === 'holiday' ? COLORS.teal :
                  dayStatus.status === 'leave' ? COLORS.purple :
                  dayStatus.status === 'absent' ? COLORS.red : COLORS.sub}
                soft={dayStatus.status === 'present' ? COLORS.greenSoft :
                  dayStatus.status === 'holiday' ? COLORS.tealSoft :
                  dayStatus.status === 'leave' ? COLORS.purpleSoft :
                  dayStatus.status === 'absent' ? COLORS.redSoft : COLORS.line}
              />
            )}
          </Card>

          {/* Name the holiday when the day's own status hides it: a worked holiday
            * reads "Present", and a holiday falling on a Sunday reads "Week Off".
            * The holiday empty-state card below already carries the name itself. */}
          {holidayName && dayStatus?.status !== 'holiday' && (
            <View style={styles.holidayNote}>
              <MaterialIcons name="celebration" size={14} color={COLORS.teal} />
              <Text style={styles.holidayNoteText} numberOfLines={2}>{holidayName} · company holiday</Text>
            </View>
          )}

          {dayLoading ? (
            <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 30 }} />
          ) : daySessions.length > 0 ? (
            daySessions.map((s, i) => <SessionCard key={s.id} s={s} isFirst={i === 0} />)
          ) : (
            <Card style={styles.infoCard}>
              <View style={[styles.infoIconWrap, {
                backgroundColor: dayStatus?.status === 'holiday' ? COLORS.tealSoft :
                  dayStatus?.status === 'leave' ? COLORS.purpleSoft :
                  dayStatus?.status === 'weekoff' ? '#F3F4F6' :
                  dayStatus?.status === 'future' ? COLORS.indigoSoft : COLORS.redSoft,
              }]}>
                <MaterialIcons
                  name={dayStatus?.status === 'holiday' ? 'celebration' : dayStatus?.status === 'leave' ? 'beach-access' : dayStatus?.status === 'weekoff' ? 'weekend' : dayStatus?.status === 'future' ? 'schedule' : 'person-off'}
                  size={32}
                  color={dayStatus?.status === 'holiday' ? COLORS.teal : dayStatus?.status === 'leave' ? COLORS.purple : dayStatus?.status === 'weekoff' ? COLORS.sub : dayStatus?.status === 'future' ? COLORS.sub : COLORS.red}
                />
              </View>
              <Text style={styles.infoTitle}>
                {dayStatus?.status === 'holiday' ? (holidayName || 'Company Holiday')
                  : dayStatus?.status === 'leave' ? 'Paid Leave'
                  : dayStatus?.status === 'weekoff' ? 'Week Off'
                  : dayStatus?.status === 'future' ? 'Upcoming Date'
                  : 'Absent'}
              </Text>
              <Text style={styles.infoSub}>
                {dayStatus?.status === 'holiday' ? 'Company holiday — not counted in your required hours 🎉'
                  : dayStatus?.status === 'leave' ? 'Approved paid leave — counted in your effort hours'
                  : dayStatus?.status === 'weekoff' ? 'Enjoy your day off! 🎉'
                  : dayStatus?.status === 'future' ? 'Attendance will be recorded on this day'
                  : 'No attendance records found for this date'}
              </Text>
            </Card>
          )}

          {/* Attendance correction — raise a fix for a missed punch. Offered on a
            * week off / company holiday too: comp-off is credited for exactly
            * those days, and compoff.js refuses a claim with no punch record, so
            * this is the only self-serve way in after a forgotten punch.
            * Future dates are still excluded — the backend rejects them anyway. */}
          {!dayLoading && date <= todayYMD() && dayStatus?.status !== 'future' && (
            dateCorrection ? (
              <View style={[styles.corrStatus, {
                backgroundColor: dateCorrection.status === 'approved' ? COLORS.greenSoft : COLORS.orangeSoft,
              }]}>
                <MaterialIcons
                  name={dateCorrection.status === 'approved' ? 'check-circle' : 'hourglass-top'}
                  size={16}
                  color={dateCorrection.status === 'approved' ? COLORS.green : COLORS.orange}
                />
                <Text style={[styles.corrStatusText, { color: dateCorrection.status === 'approved' ? '#166534' : '#92400E' }]}>
                  Correction {dateCorrection.status === 'approved' ? 'approved' : 'pending with HR'} for this day
                </Text>
              </View>
            ) : (
              <TouchableOpacity style={styles.corrBtn} activeOpacity={0.85} onPress={openCorrection}>
                <MaterialIcons name={isOffDay ? 'event-available' : 'build-circle'} size={18} color={COLORS.primary} />
                <Text style={styles.corrBtnText}>
                  {isOffDay ? 'Worked this day? Add attendance' : 'Missed a punch? Request correction'}
                </Text>
              </TouchableOpacity>
            )
          )}
        </View>
      </ScrollView>

      {/* Correction request modal */}
      <Modal visible={corrModal} transparent animationType="fade" onRequestClose={() => setCorrModal(false)}>
        <SheetOverlay center>
          <View style={styles.corrCard}>
            <Text style={styles.corrTitle}>{isOffDay ? 'Add Attendance' : 'Attendance Correction'}</Text>
            <Text style={styles.corrSub}>{prettyDate(date)}</Text>
            {/* On a non-working day there is nothing to "correct" — say what the
              * request is actually for, and why it is worth raising. */}
            {isOffDay && (
              <Text style={styles.corrHint}>
                {holidayName || 'Week off'} — enter the hours you worked. Once HR approves,
                the punch record exists and you can claim comp-off for the day.
              </Text>
            )}

            <Text style={styles.corrLabel}>
              {isOffDay ? 'PUNCH-IN (HH:MM, 24h)' : 'CORRECT PUNCH-IN (HH:MM, 24h — blank to keep)'}
            </Text>
            <TextInput
              style={styles.corrInput} placeholder="09:30" placeholderTextColor={COLORS.faint}
              keyboardType="numbers-and-punctuation" maxLength={5}
              value={corrIn} onChangeText={setCorrIn}
            />

            <Text style={styles.corrLabel}>{isOffDay ? 'PUNCH-OUT' : 'CORRECT PUNCH-OUT (blank to keep)'}</Text>
            <TextInput
              style={styles.corrInput} placeholder="18:00" placeholderTextColor={COLORS.faint}
              keyboardType="numbers-and-punctuation" maxLength={5}
              value={corrOut} onChangeText={setCorrOut}
            />

            <Text style={styles.corrLabel}>REASON *</Text>
            <TextInput
              style={[styles.corrInput, { height: 70, textAlignVertical: 'top', paddingTop: 10 }, !corrReason.trim() && { borderColor: '#FCA5A5' }]}
              placeholder={isOffDay ? 'e.g. Worked the holiday at the client site, forgot to punch in' : 'e.g. Forgot to punch out while leaving site'}
              placeholderTextColor={COLORS.faint}
              multiline maxLength={500}
              value={corrReason} onChangeText={setCorrReason}
            />

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <TouchableOpacity style={styles.corrCancel} disabled={corrBusy} onPress={() => setCorrModal(false)}>
                <Text style={styles.corrCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.corrSubmit, (corrBusy || !corrReason.trim()) && { opacity: 0.5 }]}
                disabled={corrBusy || !corrReason.trim()}
                onPress={submitCorrection}
              >
                {corrBusy ? <ActivityIndicator color="#fff" /> : <Text style={styles.corrSubmitText}>Send to HR</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </SheetOverlay>
      </Modal>

      <BottomNav navigation={navigation} active="profile" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },

  /* stat tiles */
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
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 12,
    alignItems: 'center',
    ...SHADOW.card,
  },
  countIcon: {
    width: 36, height: 36, borderRadius: 10,
    justifyContent: 'center', alignItems: 'center', marginBottom: 6,
  },
  countValue: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  countLabel: {
    fontSize: 10, color: COLORS.sub, fontWeight: '700', marginTop: 2,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },

  /* centered section divider */
  sectionDivider: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 12 },
  dividerLine: { flex: 1, height: 1, backgroundColor: COLORS.line },
  dividerText: { fontSize: 12, color: COLORS.sub, fontWeight: '800', letterSpacing: 1 },

  /* calendar */
  calCard: { padding: 12, marginBottom: 16 },
  legendRow: {
    // Six statuses no longer fit one line on a 360dp phone — wrap and keep the
    // rows visually separated instead of letting the row overflow the card.
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center',
    columnGap: 12, rowGap: 8,
    paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#F3F4F6', marginTop: 4,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 11, color: COLORS.sub, fontWeight: '600' },

  /* attendance correction */
  corrBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 14,
    backgroundColor: COLORS.indigoSoft, borderRadius: 13, paddingVertical: 13,
    borderWidth: 1.5, borderColor: '#E0E7FF',
  },
  corrBtnText: { color: COLORS.primary, fontSize: 13.5, fontWeight: '800' },
  corrStatus: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    marginTop: 14, borderRadius: 13, paddingVertical: 12,
  },
  corrStatusText: { fontSize: 12.5, fontWeight: '800' },
  corrOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'center', padding: 22 },
  corrCard: { backgroundColor: COLORS.card, borderRadius: RADIUS.sheet, padding: 20 },
  corrTitle: { fontSize: 17, fontWeight: '800', color: COLORS.ink, textAlign: 'center' },
  corrSub: { fontSize: 12, color: COLORS.sub, textAlign: 'center', marginTop: 3, marginBottom: 6 },
  corrHint: {
    fontSize: 11.5, color: COLORS.teal, fontWeight: '600', lineHeight: 16, textAlign: 'center',
    backgroundColor: COLORS.tealSoft, borderRadius: 10, padding: 9, marginTop: 4,
  },
  corrLabel: { fontSize: 10.5, fontWeight: '800', color: COLORS.faint, letterSpacing: 0.6, marginTop: 12, marginBottom: 6 },
  corrInput: {
    backgroundColor: COLORS.field, borderWidth: 1.5, borderColor: COLORS.line,
    borderRadius: RADIUS.input, paddingHorizontal: 12, height: 48,
    fontSize: 15, color: COLORS.ink, fontWeight: '600',
  },
  corrCancel: {
    flex: 1, height: 48, borderRadius: RADIUS.input, borderWidth: 1.5, borderColor: COLORS.line,
    justifyContent: 'center', alignItems: 'center',
  },
  corrCancelText: { color: '#374151', fontWeight: '700' },
  corrSubmit: {
    flex: 1, height: 48, borderRadius: RADIUS.input, backgroundColor: COLORS.primary,
    justifyContent: 'center', alignItems: 'center',
  },
  corrSubmitText: { color: '#fff', fontWeight: '800' },

  /* selected date detail */
  dateSection: { marginTop: 4 },
  dateHeadRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 12, marginBottom: 12,
  },
  dateIconWrap: {
    width: 32, height: 32, borderRadius: 10, backgroundColor: COLORS.primary,
    justifyContent: 'center', alignItems: 'center',
  },
  dateHeadText: { fontSize: 14, fontWeight: '800', color: COLORS.ink, flex: 1 },

  holidayNote: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    backgroundColor: COLORS.tealSoft, borderRadius: 11,
    paddingHorizontal: 10, paddingVertical: 6, marginTop: -2, marginBottom: 12,
  },
  holidayNoteText: { flexShrink: 1, color: COLORS.teal, fontSize: 11.5, fontWeight: '800' },

  sessCard: { padding: 14, marginBottom: 12 },
  sessHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  sessIconWrap: {
    width: 28, height: 28, borderRadius: 8, backgroundColor: COLORS.primary,
    justifyContent: 'center', alignItems: 'center',
  },
  sessSite: { fontSize: 13, fontWeight: '800', color: COLORS.ink, flex: 1 },
  photoPair: { flexDirection: 'row', gap: 12, marginTop: 4 },
  photoCol: { flex: 1 },
  timeLabel: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  timeDot: { width: 6, height: 6, borderRadius: 3 },
  photoLabel: { fontSize: 11, fontWeight: '800' },
  photo: {
    width: '100%', height: 120, borderRadius: 12, backgroundColor: COLORS.field,
    borderWidth: 1, borderColor: COLORS.line,
  },
  photoEmpty: { justifyContent: 'center', alignItems: 'center' },
  addrRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#F3F4F6',
  },
  addrText: { flex: 1, fontSize: 11.5, color: COLORS.sub, lineHeight: 15 },

  infoCard: { padding: 28, alignItems: 'center', gap: 10 },
  infoIconWrap: {
    width: 60, height: 60, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center', marginBottom: 4,
  },
  infoTitle: { fontSize: 16, fontWeight: '800', color: COLORS.ink },
  infoSub: { fontSize: 12.5, color: COLORS.faint, textAlign: 'center', lineHeight: 18 },
});
