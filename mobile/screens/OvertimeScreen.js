import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, RefreshControl, Modal, TextInput, Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { Calendar } from 'react-native-calendars';
import { api } from '../lib/api';
import { GradientHeader, BottomNav, Card, Chip, PrimaryButton } from '../components/ui';
import { COLORS, RADIUS } from '../lib/theme';

const todayYMD = () => new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
const CUR_MONTH = todayYMD().slice(0, 7);
const prettyDate = (iso) =>
  new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
const fmtTime = (iso) =>
  new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
const fmtHrs = (h) => (h === Math.floor(h) ? `${h}` : h.toFixed(1)) + 'h';

// OT times are entered in 12-hour form (the client asked for AM/PM) but the API
// only ever sees 24-hour "HH:MM", so every edit round-trips through these.
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const to12parts = (hhmm) => {
  if (!HHMM.test(hhmm || '')) return { hour: '', minute: '', mer: 'PM' };
  const h = Number(hhmm.slice(0, 2));
  return { hour: String(h % 12 === 0 ? 12 : h % 12), minute: hhmm.slice(3), mer: h >= 12 ? 'PM' : 'AM' };
};
const to24 = (hour, minute, mer) => {
  const h = (Number(hour) % 12) + (mer === 'PM' ? 12 : 0); // 12 AM -> 00, 12 PM -> 12
  return `${String(h).padStart(2, '0')}:${minute.padStart(2, '0')}`;
};
const partsOk = (hour, minute) =>
  /^\d{1,2}$/.test(hour) && /^\d{1,2}$/.test(minute) &&
  Number(hour) >= 1 && Number(hour) <= 12 && Number(minute) <= 59;

const STATUS_STYLE = {
  pending: { c: COLORS.orange, soft: COLORS.orangeSoft, label: 'Pending' },
  approved: { c: COLORS.green, soft: COLORS.greenSoft, label: 'Approved' },
  rejected: { c: COLORS.red, soft: COLORS.redSoft, label: 'Rejected' },
  cancelled: { c: COLORS.sub, soft: '#F3F4F6', label: 'Cancelled' },
};

// Quick-pick OT slots shown in the request sheet.
const QUICK_SLOTS = [
  { label: '1h · 18:00–19:00', start: '18:00', end: '19:00' },
  { label: '2h · 18:00–20:00', start: '18:00', end: '20:00' },
  { label: '3h · 18:00–21:00', start: '18:00', end: '21:00' },
  { label: '4h · 09:00–13:00', start: '09:00', end: '13:00' },
];

export default function OvertimeScreen({ navigation }) {
  const [month, setMonth] = useState(CUR_MONTH);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);

  const load = useCallback(async (m = month) => {
    try {
      setData(await api(`/ot/my?month=${m}`));
    } catch (e) { Alert.alert('Error', e.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, [month]);

  useEffect(() => {
    const unsub = navigation.addListener('focus', () => load());
    return unsub;
  }, [navigation, load]);

  useEffect(() => { load(month); }, [month]); // eslint-disable-line react-hooks/exhaustive-deps

  const cancel = (r) => {
    Alert.alert('Cancel OT request', `Cancel your OT request for ${prettyDate(r.date)}?`, [
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes, cancel', style: 'destructive',
        onPress: async () => {
          try { await api(`/ot/requests/${r.id}`, { method: 'DELETE' }); load(); }
          catch (e) { Alert.alert('Failed', e.message); }
        },
      },
    ]);
  };

  const totals = data?.totals || { approvedHours: 0, pendingHours: 0 };
  const requests = data?.requests || [];

  // OT calendar — approved days in green, pending in orange.
  const markedDates = useMemo(() => {
    const marks = {};
    for (const [ymd, info] of Object.entries(data?.calendar || {})) {
      const st = STATUS_STYLE[info.status] || STATUS_STYLE.pending;
      marks[ymd] = { selected: true, selectedColor: st.c, selectedTextColor: '#fff' };
    }
    return marks;
  }, [data]);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <GradientHeader
        title="My Overtime"
        subtitle="Request OT before you start the work"
        onBack={() => navigation.goBack()}
      />

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={{ flex: 1 }} />
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        >
          {/* Month totals */}
          <View style={styles.balRow}>
            <Card style={styles.balCard}>
              <View style={[styles.balTag, { backgroundColor: COLORS.greenSoft }]}>
                <MaterialIcons name="verified" size={13} color={COLORS.green} />
                <Text style={[styles.balTagText, { color: COLORS.green }]}>APPROVED</Text>
              </View>
              <Text style={styles.balValue}>{fmtHrs(totals.approvedHours)}</Text>
              <Text style={styles.balSub}>OT this month</Text>
            </Card>
            <Card style={styles.balCard}>
              <View style={[styles.balTag, { backgroundColor: COLORS.orangeSoft }]}>
                <MaterialIcons name="hourglass-top" size={13} color={COLORS.orange} />
                <Text style={[styles.balTagText, { color: COLORS.orange }]}>PENDING</Text>
              </View>
              <Text style={styles.balValue}>{fmtHrs(totals.pendingHours)}</Text>
              <Text style={styles.balSub}>awaiting approval</Text>
            </Card>
          </View>

          <PrimaryButton
            title="Request Overtime"
            icon="more-time"
            onPress={() => setRequestOpen(true)}
            style={{ marginBottom: 20 }}
          />

          {/* OT calendar */}
          <Text style={styles.sectionTitle}>OT Calendar</Text>
          <Card style={{ padding: 6, marginBottom: 8 }}>
            <Calendar
              current={`${month}-01`}
              onMonthChange={(m) => setMonth(m.dateString.slice(0, 7))}
              markedDates={markedDates}
              theme={{ todayTextColor: COLORS.primary, arrowColor: COLORS.primary, textMonthFontWeight: '800' }}
            />
          </Card>
          <View style={styles.legendRow}>
            <View style={[styles.legendDot, { backgroundColor: COLORS.green }]} />
            <Text style={styles.legendText}>Approved OT</Text>
            <View style={[styles.legendDot, { backgroundColor: COLORS.orange, marginLeft: 14 }]} />
            <Text style={styles.legendText}>Pending approval</Text>
          </View>

          <Text style={styles.sectionTitle}>My Requests · {month}</Text>
          {requests.length === 0 ? (
            <View style={styles.empty}>
              <MaterialIcons name="more-time" size={44} color="#CBD5E1" />
              <Text style={styles.emptyText}>No OT requests this month</Text>
            </View>
          ) : (
            requests.map((r) => {
              const st = STATUS_STYLE[r.status] || STATUS_STYLE.cancelled;
              return (
                <Card key={r.id} style={styles.reqCard}>
                  <View style={[styles.reqIcon, { backgroundColor: st.soft }]}>
                    <MaterialIcons name="schedule" size={20} color={st.c} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.reqDate}>{prettyDate(r.date)}</Text>
                    <Text style={styles.reqTime}>
                      {fmtTime(r.startTime)} → {fmtTime(r.endTime)} · {fmtHrs(r.hours)}
                    </Text>
                    {r.reason ? <Text style={styles.reqReason} numberOfLines={2}>{r.reason}</Text> : null}
                    {r.source === 'admin' && <Text style={styles.adminTag}>Added by admin</Text>}
                    {r.status === 'rejected' && r.reviewNote ? (
                      <Text style={styles.reqNote}>Admin: {r.reviewNote}</Text>
                    ) : null}
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 6 }}>
                    <Chip text={st.label} color={st.c} soft={st.soft} />
                    {r.status === 'pending' && (
                      <TouchableOpacity onPress={() => cancel(r)}>
                        <Text style={styles.cancelLink}>Cancel</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </Card>
              );
            })
          )}
        </ScrollView>
      )}

      <RequestOtModal
        visible={requestOpen}
        onClose={() => setRequestOpen(false)}
        onDone={() => { setRequestOpen(false); load(); }}
      />

      <BottomNav navigation={navigation} active="profile" />
    </View>
  );
}

/* ---------------- Request OT sheet ---------------- */
function RequestOtModal({ visible, onClose, onDone }) {
  const [date, setDate] = useState(todayYMD());
  const [start, setStart] = useState('18:00');
  const [end, setEnd] = useState('20:00');
  const [reason, setReason] = useState('');
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      setDate(todayYMD());
      setStart('18:00');
      setEnd('20:00');
      setReason('');
      setPicking(false);
      setBusy(false);
    }
  }, [visible]);

  const hoursPreview = (() => {
    if (!HHMM.test(start) || !HHMM.test(end)) return null;
    const s = Number(start.slice(0, 2)) * 60 + Number(start.slice(3));
    let e = Number(end.slice(0, 2)) * 60 + Number(end.slice(3));
    if (e <= s) e += 24 * 60; // crosses midnight
    return Math.round(((e - s) / 60) * 100) / 100;
  })();

  const submit = async () => {
    if (!HHMM.test(start) || !HHMM.test(end)) {
      Alert.alert('Invalid time', 'Enter an hour (1–12), minutes (00–59) and AM/PM for both start and end.');
      return;
    }
    if (!reason.trim()) {
      Alert.alert('Work details required', 'Describe the work you are going to do during OT.');
      return;
    }
    setBusy(true);
    try {
      await api('/ot/requests', {
        method: 'POST',
        body: JSON.stringify({ date, startTime: start, endTime: end, reason: reason.trim() }),
      });
      Alert.alert('Requested ✅', 'Your OT request has been sent for approval. It will appear on your OT calendar once approved.');
      onDone();
    } catch (e) {
      Alert.alert('Could not request', e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetOverlay}>
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Request Overtime</Text>

          <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 470 }}>
            <Text style={styles.fieldLabel}>OT DATE</Text>
            <TouchableOpacity style={styles.dateField} onPress={() => setPicking(true)}>
              <MaterialIcons name="event" size={18} color={COLORS.primary} />
              <Text style={styles.dateValue}>{prettyDate(date)}</Text>
              <MaterialIcons name="expand-more" size={20} color={COLORS.faint} style={{ marginLeft: 'auto' }} />
            </TouchableOpacity>

            <Text style={styles.fieldLabel}>QUICK PICK</Text>
            <View style={styles.slotWrap}>
              {QUICK_SLOTS.map((s) => {
                const on = start === s.start && end === s.end;
                return (
                  <TouchableOpacity key={s.label}
                    style={[styles.slotChip, on && styles.slotChipOn]}
                    onPress={() => { setStart(s.start); setEnd(s.end); }}>
                    <Text style={[styles.slotChipText, on && styles.slotChipTextOn]}>{s.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.timeRow}>
              <TimeField12 label="START" value={start} onChange={setStart} />
              <TimeField12 label="END" value={end} onChange={setEnd} />
            </View>
            {hoursPreview != null && (
              <View style={styles.hoursPill}>
                <MaterialIcons name="timer" size={14} color={COLORS.primary} />
                <Text style={styles.hoursPillText}>{fmtHrs(hoursPreview)} of overtime</Text>
              </View>
            )}

            <Text style={styles.fieldLabel}>WHAT WORK WILL YOU DO? *</Text>
            <TextInput
              style={[styles.reasonInput, !reason.trim() && styles.reasonInputEmpty]}
              placeholder="Required — e.g. Finish site inspection report for Client X"
              placeholderTextColor={COLORS.faint}
              value={reason}
              onChangeText={setReason}
              multiline
            />
          </ScrollView>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={busy}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.submitBtn, (busy || !reason.trim()) && { opacity: 0.5 }]}
              onPress={submit}
              disabled={busy || !reason.trim()}
            >
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>Send Request</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Date picker */}
      <Modal visible={picking} transparent animationType="fade" onRequestClose={() => setPicking(false)}>
        <View style={styles.overlayCenter}>
          <View style={styles.calCard}>
            <Text style={styles.sheetTitle}>Select OT date</Text>
            <Calendar
              current={date}
              minDate={todayYMD()}
              onDayPress={(d) => { setDate(d.dateString); setPicking(false); }}
              markedDates={{ [date]: { selected: true, selectedColor: COLORS.primary } }}
              theme={{ todayTextColor: COLORS.primary, arrowColor: COLORS.primary, textMonthFontWeight: '800' }}
            />
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setPicking(false)}>
              <Text style={styles.cancelBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </Modal>
  );
}

/* ---------------- 12-hour time entry (hour · minute · AM/PM) ---------------- */
// `value` is a 24-hour "HH:MM" string; onChange gets '' while the parts are
// incomplete so the caller's existing HHMM guards reject a half-typed time.
function TimeField12({ label, value, onChange }) {
  const [p, setP] = useState(() => to12parts(value));

  // Re-sync when the value changes from outside (quick picks, sheet reset).
  useEffect(() => {
    if (!HHMM.test(value || '')) return;
    if (partsOk(p.hour, p.minute) && to24(p.hour, p.minute, p.mer) === value) return;
    setP(to12parts(value));
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (next) => {
    setP(next);
    onChange(partsOk(next.hour, next.minute) ? to24(next.hour, next.minute, next.mer) : '');
  };
  const bad = !partsOk(p.hour, p.minute);

  return (
    <View style={[styles.timeField, bad && styles.timeFieldBad]}>
      <Text style={styles.dateLabel}>{label}</Text>
      <View style={styles.timeInputRow}>
        <TextInput
          style={styles.timeNum}
          value={p.hour}
          onChangeText={(t) => set({ ...p, hour: t.replace(/\D/g, '') })}
          placeholder="6"
          placeholderTextColor={COLORS.faint}
          keyboardType="number-pad"
          maxLength={2}
        />
        <Text style={styles.timeColon}>:</Text>
        <TextInput
          style={styles.timeNum}
          value={p.minute}
          onChangeText={(t) => set({ ...p, minute: t.replace(/\D/g, '') })}
          onBlur={() => { if (p.minute.length === 1) set({ ...p, minute: `0${p.minute}` }); }}
          placeholder="00"
          placeholderTextColor={COLORS.faint}
          keyboardType="number-pad"
          maxLength={2}
        />
        <View style={styles.merSeg}>
          {['AM', 'PM'].map((ap) => (
            <TouchableOpacity key={ap}
              style={[styles.merBtn, p.mer === ap && styles.merBtnOn]}
              onPress={() => set({ ...p, mer: ap })}>
              <Text style={[styles.merText, p.mer === ap && styles.merTextOn]}>{ap}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },

  balRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  balCard: { flex: 1, padding: 14 },
  balTag: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  balTagText: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.4 },
  balValue: { fontSize: 26, fontWeight: '800', color: COLORS.ink, marginTop: 8 },
  balSub: { fontSize: 11, color: COLORS.faint, fontWeight: '600' },

  sectionTitle: { fontSize: 15, fontWeight: '800', color: COLORS.ink, marginBottom: 10, marginTop: 4 },
  legendRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 18, paddingHorizontal: 4 },
  legendDot: { width: 10, height: 10, borderRadius: 5, marginRight: 6 },
  legendText: { fontSize: 11.5, color: COLORS.sub, fontWeight: '600' },

  empty: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyText: { color: COLORS.faint, fontSize: 13 },

  reqCard: { flexDirection: 'row', gap: 12, padding: 14, marginBottom: 10 },
  reqIcon: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  reqDate: { fontSize: 14, fontWeight: '800', color: COLORS.ink },
  reqTime: { fontSize: 12, color: COLORS.sub, fontWeight: '700', marginTop: 2 },
  reqReason: { fontSize: 12, color: COLORS.faint, marginTop: 3 },
  adminTag: { fontSize: 10.5, color: COLORS.accent, fontWeight: '800', marginTop: 3 },
  reqNote: { fontSize: 11.5, color: COLORS.red, marginTop: 3, fontWeight: '600' },
  cancelLink: { fontSize: 12, color: COLORS.red, fontWeight: '700' },

  /* request sheet */
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: COLORS.card, borderTopLeftRadius: RADIUS.sheet, borderTopRightRadius: RADIUS.sheet,
    padding: 18, paddingBottom: 26,
  },
  sheetHandle: { width: 42, height: 5, borderRadius: 3, backgroundColor: COLORS.line, alignSelf: 'center', marginBottom: 12 },
  sheetTitle: { fontSize: 16, fontWeight: '800', color: COLORS.ink, marginBottom: 12, textAlign: 'center' },
  fieldLabel: { fontSize: 10.5, fontWeight: '800', color: COLORS.faint, letterSpacing: 0.6, marginTop: 12, marginBottom: 8 },

  dateField: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.field, borderWidth: 1.5, borderColor: COLORS.line,
    borderRadius: RADIUS.input, padding: 13,
  },
  dateLabel: { fontSize: 10, fontWeight: '800', color: COLORS.faint, letterSpacing: 0.5 },
  dateValue: { fontSize: 14, fontWeight: '700', color: COLORS.ink },

  slotWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slotChip: {
    borderWidth: 1.5, borderColor: COLORS.line, borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 8, backgroundColor: COLORS.card,
  },
  slotChipOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  slotChipText: { fontSize: 12, color: '#374151', fontWeight: '700' },
  slotChipTextOn: { color: '#fff' },

  timeRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  timeField: {
    flex: 1, backgroundColor: COLORS.field, borderWidth: 1.5, borderColor: COLORS.line,
    borderRadius: RADIUS.input, padding: 12,
  },
  timeFieldBad: { borderColor: '#FCA5A5' },
  timeInputRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  timeNum: { width: 22, fontSize: 15, fontWeight: '700', color: COLORS.ink, padding: 0, textAlign: 'center' },
  timeColon: { fontSize: 15, fontWeight: '700', color: COLORS.ink, marginHorizontal: 1 },
  merSeg: {
    flexDirection: 'row', marginLeft: 'auto', borderRadius: 8, overflow: 'hidden',
    borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.field,
  },
  merBtn: { paddingHorizontal: 6, paddingVertical: 4 },
  merBtnOn: { backgroundColor: COLORS.primary },
  merText: { fontSize: 10, fontWeight: '800', color: COLORS.sub },
  merTextOn: { color: '#fff' },
  hoursPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start',
    backgroundColor: COLORS.indigoSoft, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, marginTop: 10,
  },
  hoursPillText: { fontSize: 12, color: COLORS.primary, fontWeight: '800' },

  reasonInput: {
    backgroundColor: COLORS.field, borderWidth: 1.5, borderColor: COLORS.line, borderRadius: RADIUS.input,
    padding: 12, fontSize: 14, color: COLORS.ink, minHeight: 64, textAlignVertical: 'top',
  },
  reasonInputEmpty: { borderColor: '#FCA5A5' },
  cancelBtn: {
    flex: 1, height: 50, borderRadius: 13, borderWidth: 1.5, borderColor: COLORS.line,
    justifyContent: 'center', alignItems: 'center', marginTop: 10,
  },
  cancelBtnText: { color: '#374151', fontWeight: '700' },
  submitBtn: { flex: 1, height: 50, borderRadius: 13, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center', marginTop: 10 },
  submitBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  overlayCenter: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'center', padding: 20 },
  calCard: { backgroundColor: COLORS.card, borderRadius: RADIUS.sheet, padding: 16 },
});
