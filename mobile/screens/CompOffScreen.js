import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, RefreshControl, Modal, TextInput, Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { Calendar } from 'react-native-calendars';
import { api } from '../lib/api';
import { GradientHeader, BottomNav, Card, Chip, PrimaryButton , SheetOverlay} from '../components/ui';
import { COLORS, RADIUS } from '../lib/theme';

const todayYMD = () => new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
const CUR_YEAR = Number(todayYMD().slice(0, 4));
const prettyDate = (iso) =>
  new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
const fmtTime = (iso) =>
  new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });

const STATUS_STYLE = {
  pending: { c: COLORS.orange, soft: COLORS.orangeSoft, label: 'Pending' },
  approved: { c: COLORS.green, soft: COLORS.greenSoft, label: 'Approved' },
  rejected: { c: COLORS.red, soft: COLORS.redSoft, label: 'Rejected' },
  cancelled: { c: COLORS.sub, soft: '#F3F4F6', label: 'Cancelled' },
  revoked: { c: COLORS.red, soft: COLORS.redSoft, label: 'Revoked' },
};

// Punch record line under each credit — mirrors what the admin sees.
function PunchLine({ punch }) {
  if (!punch) return null;
  if (!punch.punched) {
    return (
      <View style={styles.punchRow}>
        <MaterialIcons name="error-outline" size={14} color={COLORS.red} />
        <Text style={[styles.punchText, { color: COLORS.red }]}>No punch in/out recorded that day</Text>
      </View>
    );
  }
  const ok = punch.fullDay;
  return (
    <View style={styles.punchRow}>
      <MaterialIcons name={ok ? 'check-circle' : 'warning-amber'} size={14} color={ok ? COLORS.green : COLORS.orange} />
      <Text style={[styles.punchText, { color: ok ? COLORS.green : COLORS.orange }]}>
        {fmtTime(punch.firstIn)} → {punch.lastOut ? fmtTime(punch.lastOut) : 'no punch-out'}
        {ok ? ' · full day' : ' · short of 9:30–6:30'}
      </Text>
    </View>
  );
}

export default function CompOffScreen({ navigation }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api(`/compoff/my?year=${CUR_YEAR}`));
    } catch (e) { Alert.alert('Error', e.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => {
    const unsub = navigation.addListener('focus', load);
    return unsub;
  }, [navigation, load]);

  const cancel = (r) => {
    Alert.alert('Cancel request', `Cancel your comp-off request for ${prettyDate(r.workDate)}?`, [
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes, cancel', style: 'destructive',
        onPress: async () => {
          try { await api(`/compoff/requests/${r.id}`, { method: 'DELETE' }); load(); }
          catch (e) { Alert.alert('Failed', e.message); }
        },
      },
    ]);
  };

  const balance = data?.balance || { earned: 0, used: 0, pending: 0, available: 0 };
  const requests = data?.requests || [];

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <GradientHeader
        title="Comp-Off"
        subtitle="Worked a week-off or holiday? Earn a leave for it"
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
          {/* Balance cards */}
          <View style={styles.balRow}>
            <Card style={styles.balCard}>
              <Text style={[styles.balLabel, { color: COLORS.accent }]}>EARNED</Text>
              <Text style={styles.balValue}>{balance.earned}</Text>
              <Text style={styles.balSub}>credits · {CUR_YEAR}</Text>
            </Card>
            <Card style={styles.balCard}>
              <Text style={[styles.balLabel, { color: COLORS.orange }]}>USED</Text>
              <Text style={styles.balValue}>{balance.used + balance.pending}</Text>
              <Text style={styles.balSub}>{balance.pending > 0 ? `${balance.pending} pending` : 'leave taken'}</Text>
            </Card>
            <Card style={styles.balCard}>
              <Text style={[styles.balLabel, { color: COLORS.green }]}>AVAILABLE</Text>
              <Text style={styles.balValue}>{balance.available}</Text>
              <Text style={styles.balSub}>to use as leave</Text>
            </Card>
          </View>

          <PrimaryButton
            title="Request Comp-Off Credit"
            icon="add-task"
            onPress={() => setRequestOpen(true)}
            style={{ marginBottom: 8 }}
          />
          <Text style={styles.helpText}>
            Approved credits appear as CO balance in My Leave — apply there to take the day off.
            You must have punched in/out on the worked day (full day is 9:30 AM – 6:30 PM).
          </Text>

          <Text style={styles.sectionTitle}>My Credits · {CUR_YEAR}</Text>
          {requests.length === 0 ? (
            <View style={styles.empty}>
              <MaterialIcons name="redeem" size={44} color="#CBD5E1" />
              <Text style={styles.emptyText}>No comp-off requests yet</Text>
            </View>
          ) : (
            requests.map((r) => {
              const st = STATUS_STYLE[r.status] || STATUS_STYLE.cancelled;
              return (
                <Card key={r.id} style={styles.reqCard}>
                  <View style={[styles.reqIcon, { backgroundColor: st.soft }]}>
                    <MaterialIcons name="redeem" size={20} color={st.c} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.reqDate}>{prettyDate(r.workDate)}</Text>
                    {r.reason ? <Text style={styles.reqReason} numberOfLines={2}>{r.reason}</Text> : null}
                    <PunchLine punch={r.punch} />
                    {(r.status === 'rejected' || r.status === 'revoked') && r.reviewNote ? (
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

      <RequestCompOffModal
        visible={requestOpen}
        onClose={() => setRequestOpen(false)}
        onDone={() => { setRequestOpen(false); load(); }}
      />

      <BottomNav navigation={navigation} active="profile" />
    </View>
  );
}

/* ---------------- Request sheet ---------------- */
function RequestCompOffModal({ visible, onClose, onDone }) {
  const [workDate, setWorkDate] = useState(todayYMD());
  const [reason, setReason] = useState('');
  const [holidays, setHolidays] = useState([]);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      setWorkDate(todayYMD());
      setReason('');
      setPicking(false);
      setBusy(false);
      api(`/holidays?year=${CUR_YEAR}`)
        .then((r) => setHolidays((r.holidays || []).map((h) => new Date(h.date).toISOString().slice(0, 10))))
        .catch(() => {});
    }
  }, [visible]);

  // Mark selectable days: Sundays + holidays (comp-off only applies to those).
  const markedDates = useMemo(() => {
    const marks = {};
    for (const h of holidays) marks[h] = { marked: true, dotColor: COLORS.orange };
    marks[workDate] = { ...(marks[workDate] || {}), selected: true, selectedColor: COLORS.primary };
    return marks;
  }, [holidays, workDate]);

  const submit = async () => {
    setBusy(true);
    try {
      await api('/compoff/requests', {
        method: 'POST',
        body: JSON.stringify({ workDate, reason: reason.trim() }),
      });
      Alert.alert('Requested ✅', 'Your comp-off request has been sent. Once approved, 1 day is added to your CO leave balance.');
      onDone();
    } catch (e) {
      Alert.alert('Could not request', e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <SheetOverlay>
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Request Comp-Off Credit</Text>

          <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 460 }}>
            <Text style={styles.fieldLabel}>DAY YOU WORKED (WEEK-OFF / HOLIDAY)</Text>
            <TouchableOpacity style={styles.dateField} onPress={() => setPicking(true)}>
              <MaterialIcons name="event" size={18} color={COLORS.primary} />
              <Text style={styles.dateValue}>{prettyDate(workDate)}</Text>
              <MaterialIcons name="expand-more" size={20} color={COLORS.faint} style={{ marginLeft: 'auto' }} />
            </TouchableOpacity>
            <Text style={styles.hint}>
              Only a Sunday or a company holiday you actually worked (punched in/out) qualifies.
            </Text>

            <Text style={styles.fieldLabel}>WHAT WORK DID YOU DO?</Text>
            <TextInput
              style={styles.reasonInput}
              placeholder="e.g. Emergency breakdown support at Client X"
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
              style={[styles.submitBtn, busy && { opacity: 0.5 }]}
              onPress={submit}
              disabled={busy}
            >
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>Send Request</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </SheetOverlay>

      {/* Date picker — Sundays/holidays only is enforced server-side; dots mark holidays */}
      <Modal visible={picking} transparent animationType="fade" onRequestClose={() => setPicking(false)}>
        <SheetOverlay center>
          <View style={styles.calCard}>
            <Text style={styles.sheetTitle}>Which day did you work?</Text>
            <Calendar
              current={workDate}
              maxDate={todayYMD()}
              onDayPress={(d) => { setWorkDate(d.dateString); setPicking(false); }}
              markedDates={markedDates}
              theme={{ todayTextColor: COLORS.primary, arrowColor: COLORS.primary, textMonthFontWeight: '800' }}
            />
            <View style={styles.legendRow}>
              <View style={[styles.legendDot, { backgroundColor: COLORS.orange }]} />
              <Text style={styles.legendText}>Company holiday</Text>
            </View>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setPicking(false)}>
              <Text style={styles.cancelBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </SheetOverlay>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },

  balRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  balCard: { flex: 1, padding: 12 },
  balLabel: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.4 },
  balValue: { fontSize: 26, fontWeight: '800', color: COLORS.ink, marginTop: 6 },
  balSub: { fontSize: 10.5, color: COLORS.faint, fontWeight: '600' },

  helpText: { fontSize: 11.5, color: COLORS.sub, lineHeight: 16, marginBottom: 18, paddingHorizontal: 4 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: COLORS.ink, marginBottom: 10 },
  empty: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyText: { color: COLORS.faint, fontSize: 13 },

  reqCard: { flexDirection: 'row', gap: 12, padding: 14, marginBottom: 10 },
  reqIcon: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  reqDate: { fontSize: 14, fontWeight: '800', color: COLORS.ink },
  reqReason: { fontSize: 12, color: COLORS.faint, marginTop: 3 },
  reqNote: { fontSize: 11.5, color: COLORS.red, marginTop: 3, fontWeight: '600' },
  cancelLink: { fontSize: 12, color: COLORS.red, fontWeight: '700' },
  punchRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  punchText: { fontSize: 11.5, fontWeight: '700' },

  /* sheet */
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: COLORS.card, borderTopLeftRadius: RADIUS.sheet, borderTopRightRadius: RADIUS.sheet,
    padding: 18, paddingBottom: 26,
  },
  sheetHandle: { width: 42, height: 5, borderRadius: 3, backgroundColor: COLORS.line, alignSelf: 'center', marginBottom: 12 },
  sheetTitle: { fontSize: 16, fontWeight: '800', color: COLORS.ink, marginBottom: 12, textAlign: 'center' },
  fieldLabel: { fontSize: 10.5, fontWeight: '800', color: COLORS.faint, letterSpacing: 0.6, marginTop: 12, marginBottom: 8 },
  hint: { fontSize: 11, color: COLORS.faint, marginTop: 8, lineHeight: 15 },

  dateField: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.field, borderWidth: 1.5, borderColor: COLORS.line,
    borderRadius: RADIUS.input, padding: 13,
  },
  dateValue: { fontSize: 14, fontWeight: '700', color: COLORS.ink },
  legendRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10, paddingHorizontal: 4 },
  legendDot: { width: 10, height: 10, borderRadius: 5, marginRight: 6 },
  legendText: { fontSize: 11.5, color: COLORS.sub, fontWeight: '600' },

  reasonInput: {
    backgroundColor: COLORS.field, borderWidth: 1.5, borderColor: COLORS.line, borderRadius: RADIUS.input,
    padding: 12, fontSize: 14, color: COLORS.ink, minHeight: 64, textAlignVertical: 'top',
  },
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
