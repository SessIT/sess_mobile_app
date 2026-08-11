import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, RefreshControl, Alert, Modal, TextInput,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { Calendar } from 'react-native-calendars';
import { api } from '../lib/api';
import { GradientHeader, BottomNav, Card, Chip, PrimaryButton } from '../components/ui';
import { COLORS, GREEN_GRADIENT, RADIUS } from '../lib/theme';

const todayYMD = () => new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
const CUR_MONTH = todayYMD().slice(0, 7);
const prettyDate = (iso) =>
  new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
const fmtTime = (iso) =>
  new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
const fmtHrs = (h) => (h === Math.floor(h) ? `${h}` : h.toFixed(1)) + 'h';

const STATUS_STYLE = {
  pending: { c: COLORS.orange, bg: COLORS.orangeSoft, label: 'Pending' },
  approved: { c: COLORS.green, bg: COLORS.greenSoft, label: 'Approved' },
  rejected: { c: COLORS.red, bg: COLORS.redSoft, label: 'Rejected' },
  cancelled: { c: COLORS.sub, bg: '#F3F4F6', label: 'Cancelled' },
};
const FILTERS = ['pending', 'approved', 'rejected', 'all'];

export default function OtApprovalsScreen({ navigation }) {
  const [filter, setFilter] = useState('pending');
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = filter === 'all' ? '' : `&status=${filter}`;
      const res = await api(`/ot/requests?month=${CUR_MONTH}${q}`);
      setRequests(res.requests || []);
    } catch (e) { Alert.alert('Error', e.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const decide = (r, status) => {
    const go = async () => {
      setBusyId(r.id);
      try {
        await api(`/ot/requests/${r.id}/decision`, {
          method: 'PATCH',
          body: JSON.stringify({ status, reviewNote: '' }),
        });
        load();
      } catch (e) { Alert.alert('Failed', e.message); }
      finally { setBusyId(null); }
    };
    const who = r.user?.fullName || r.user?.username;
    Alert.alert(
      status === 'approved' ? 'Approve OT' : 'Reject OT',
      `${status === 'approved' ? 'Approve' : 'Reject'} ${fmtHrs(r.hours)} OT on ${prettyDate(r.date)} for ${who}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: status === 'approved' ? 'Approve' : 'Reject',
          style: status === 'approved' ? 'default' : 'destructive',
          onPress: go,
        },
      ],
    );
  };

  const pendingCount = requests.filter((r) => r.status === 'pending').length;

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <GradientHeader
        title="OT Approvals"
        subtitle={`${CUR_MONTH} • ${pendingCount} pending`}
        onBack={() => navigation.goBack()}
      >
        <View style={styles.segment}>
          {FILTERS.map((f) => (
            <TouchableOpacity key={f} style={[styles.segBtn, filter === f && styles.segBtnOn]} onPress={() => setFilter(f)}>
              <Text style={[styles.segText, filter === f && styles.segTextOn]}>{f[0].toUpperCase() + f.slice(1)}</Text>
            </TouchableOpacity>
          ))}
        </View>
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
          <PrimaryButton
            title="Add OT for Employees"
            icon="group-add"
            onPress={() => setAddOpen(true)}
            style={{ marginBottom: 16 }}
          />

          {requests.length === 0 ? (
            <View style={styles.empty}>
              <MaterialIcons name="more-time" size={44} color="#CBD5E1" />
              <Text style={styles.emptyText}>No {filter === 'all' ? '' : filter} OT requests</Text>
            </View>
          ) : (
            requests.map((r) => {
              const st = STATUS_STYLE[r.status] || STATUS_STYLE.cancelled;
              const busy = busyId === r.id;
              return (
                <Card key={r.id} style={styles.reqCard}>
                  <View style={styles.cardTop}>
                    <View style={[styles.typeTag, { backgroundColor: st.bg }]}>
                      <MaterialIcons name="schedule" size={20} color={st.c} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name}>{r.user?.fullName || r.user?.username}</Text>
                      <Text style={styles.userSub}>@{r.user?.username}{r.source === 'admin' ? ' · added by admin' : ''}</Text>
                    </View>
                    <Chip text={st.label} color={st.c} soft={st.bg} />
                  </View>

                  <View style={styles.detailRow}>
                    <MaterialIcons name="event" size={15} color={COLORS.sub} />
                    <Text style={styles.detailText}>{prettyDate(r.date)}</Text>
                    <MaterialIcons name="schedule" size={15} color={COLORS.sub} style={{ marginLeft: 8 }} />
                    <Text style={styles.detailText}>{fmtTime(r.startTime)} → {fmtTime(r.endTime)}</Text>
                    <View style={styles.hoursPill}><Text style={styles.hoursText}>{fmtHrs(r.hours)}</Text></View>
                  </View>
                  {r.reason ? <Text style={styles.reason}>“{r.reason}”</Text> : null}

                  {r.status === 'pending' && (
                    <View style={styles.actions}>
                      <TouchableOpacity style={[styles.actBtn, styles.rejectBtn]} disabled={busy} onPress={() => decide(r, 'rejected')}>
                        <MaterialIcons name="close" size={17} color={COLORS.red} />
                        <Text style={[styles.actText, { color: COLORS.red }]}>Reject</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={{ flex: 1 }} activeOpacity={0.85} disabled={busy} onPress={() => decide(r, 'approved')}>
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
          )}
        </ScrollView>
      )}

      <AddOtModal
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        onDone={() => { setAddOpen(false); load(); }}
      />

      <BottomNav navigation={navigation} active={null} />
    </View>
  );
}

/* ---------------- Add OT (individual or group) ---------------- */
function AddOtModal({ visible, onClose, onDone }) {
  const [users, setUsers] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [date, setDate] = useState(todayYMD());
  const [start, setStart] = useState('18:00');
  const [end, setEnd] = useState('20:00');
  const [reason, setReason] = useState('');
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      setSelected(new Set());
      setDate(todayYMD());
      setStart('18:00');
      setEnd('20:00');
      setReason('');
      setPicking(false);
      setBusy(false);
      api('/users')
        .then((list) => setUsers((list || []).filter((u) => u.isActive)))
        .catch((e) => Alert.alert('Error', e.message));
    }
  }, [visible]);

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const allSelected = users.length > 0 && selected.size === users.length;
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(users.map((u) => u.id)));

  const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
  const canSubmit = selected.size > 0 && reason.trim() && !busy;

  const submit = async () => {
    if (!HHMM.test(start) || !HHMM.test(end)) {
      Alert.alert('Invalid time', 'Enter times as HH:MM (24-hour), e.g. 18:30');
      return;
    }
    setBusy(true);
    try {
      const res = await api('/ot/grant', {
        method: 'POST',
        body: JSON.stringify({
          userIds: [...selected], date, startTime: start, endTime: end, reason: reason.trim(),
        }),
      });
      const made = res.created?.length || 0;
      const skipped = res.skipped || [];
      let msg = `OT added for ${made} employee${made === 1 ? '' : 's'}.`;
      if (skipped.length) msg += `\nSkipped (already have OT that day): ${skipped.map((s) => s.name).join(', ')}`;
      Alert.alert('OT Added ✅', msg);
      onDone();
    } catch (e) {
      Alert.alert('Could not add OT', e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetOverlay}>
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Add OT · individual or group</Text>

          <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 480 }}>
            <View style={styles.empRowHead}>
              <Text style={styles.fieldLabel}>EMPLOYEES · {selected.size} selected</Text>
              <TouchableOpacity onPress={toggleAll}>
                <Text style={styles.selAllLink}>{allSelected ? 'Clear all' : 'Select all'}</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.empWrap}>
              {users.map((u) => {
                const on = selected.has(u.id);
                return (
                  <TouchableOpacity key={u.id}
                    style={[styles.empChip, on && styles.empChipOn]}
                    onPress={() => toggle(u.id)}>
                    {on && <MaterialIcons name="check" size={13} color="#fff" />}
                    <Text style={[styles.empChipText, on && styles.empChipTextOn]} numberOfLines={1}>
                      {u.fullName || u.username}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.fieldLabel}>OT DATE</Text>
            <TouchableOpacity style={styles.dateField} onPress={() => setPicking(true)}>
              <MaterialIcons name="event" size={18} color={COLORS.primary} />
              <Text style={styles.dateValue}>{prettyDate(date)}</Text>
              <MaterialIcons name="expand-more" size={20} color={COLORS.faint} style={{ marginLeft: 'auto' }} />
            </TouchableOpacity>

            <View style={styles.timeRow}>
              <View style={styles.timeField}>
                <Text style={styles.dateLabel}>START (HH:MM)</Text>
                <TextInput style={styles.timeInput} value={start} onChangeText={setStart}
                  placeholder="18:00" placeholderTextColor={COLORS.faint}
                  keyboardType="numbers-and-punctuation" maxLength={5} />
              </View>
              <View style={styles.timeField}>
                <Text style={styles.dateLabel}>END (HH:MM)</Text>
                <TextInput style={styles.timeInput} value={end} onChangeText={setEnd}
                  placeholder="20:00" placeholderTextColor={COLORS.faint}
                  keyboardType="numbers-and-punctuation" maxLength={5} />
              </View>
            </View>

            <Text style={styles.fieldLabel}>OT WORK / REASON *</Text>
            <TextInput
              style={[styles.reasonInput, !reason.trim() && styles.reasonInputEmpty]}
              placeholder="Required — e.g. Urgent dispatch for Client X"
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
              style={[styles.submitBtn, !canSubmit && { opacity: 0.5 }]}
              onPress={submit}
              disabled={!canSubmit}
            >
              {busy ? <ActivityIndicator color="#fff" /> : (
                <Text style={styles.submitBtnText}>Add OT ({selected.size})</Text>
              )}
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },

  segment: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 12, padding: 4, marginTop: 14 },
  segBtn: { flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: 'center' },
  segBtnOn: { backgroundColor: '#fff' },
  segText: { color: '#E0E7FF', fontWeight: '700', fontSize: 11.5 },
  segTextOn: { color: COLORS.primary },

  empty: { alignItems: 'center', paddingVertical: 50, gap: 10 },
  emptyText: { color: COLORS.faint, fontSize: 13 },

  reqCard: { padding: 14, marginBottom: 10 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  typeTag: { width: 42, height: 42, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  name: { fontSize: 14, fontWeight: '800', color: COLORS.ink },
  userSub: { fontSize: 11.5, color: COLORS.faint, marginTop: 1 },

  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, flexWrap: 'wrap' },
  detailText: { fontSize: 12.5, color: '#374151', fontWeight: '600' },
  hoursPill: { backgroundColor: COLORS.indigoSoft, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, marginLeft: 4 },
  hoursText: { fontSize: 11, color: COLORS.primary, fontWeight: '800' },
  reason: { fontSize: 12.5, color: COLORS.sub, marginTop: 8, fontStyle: 'italic' },

  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  actBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 46, borderRadius: RADIUS.button },
  rejectBtn: { flex: 1, borderWidth: 1.5, borderColor: '#FCA5A5', backgroundColor: '#FEF2F2' },
  actText: { fontSize: 13.5, fontWeight: '800' },

  /* add-OT sheet */
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: COLORS.card, borderTopLeftRadius: RADIUS.sheet, borderTopRightRadius: RADIUS.sheet,
    padding: 18, paddingBottom: 26,
  },
  sheetHandle: { width: 42, height: 5, borderRadius: 3, backgroundColor: COLORS.line, alignSelf: 'center', marginBottom: 12 },
  sheetTitle: { fontSize: 16, fontWeight: '800', color: COLORS.ink, marginBottom: 12, textAlign: 'center' },
  fieldLabel: { fontSize: 10.5, fontWeight: '800', color: COLORS.faint, letterSpacing: 0.6, marginTop: 12, marginBottom: 8 },

  empRowHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  selAllLink: { fontSize: 12, color: COLORS.primary, fontWeight: '800', marginTop: 12 },
  empWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  empChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1.5, borderColor: COLORS.line, borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 8, backgroundColor: COLORS.card, maxWidth: '48%',
  },
  empChipOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  empChipText: { fontSize: 12, color: '#374151', fontWeight: '700' },
  empChipTextOn: { color: '#fff' },

  dateField: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.field, borderWidth: 1.5, borderColor: COLORS.line,
    borderRadius: RADIUS.input, padding: 13,
  },
  dateLabel: { fontSize: 10, fontWeight: '800', color: COLORS.faint, letterSpacing: 0.5 },
  dateValue: { fontSize: 14, fontWeight: '700', color: COLORS.ink },
  timeRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  timeField: {
    flex: 1, backgroundColor: COLORS.field, borderWidth: 1.5, borderColor: COLORS.line,
    borderRadius: RADIUS.input, padding: 12,
  },
  timeInput: { fontSize: 16, fontWeight: '700', color: COLORS.ink, marginTop: 3, padding: 0 },

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
