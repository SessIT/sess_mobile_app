import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, RefreshControl, Modal, TextInput, Switch, Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { Calendar } from 'react-native-calendars';
import { api } from '../lib/api';

const INDIGO = '#1E3A8A';
const GREEN = '#16A34A';
const RED = '#DC2626';
const AMBER = '#D97706';
const GREY = '#6B7280';

const todayYMD = () => new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
const CUR_YEAR = Number(todayYMD().slice(0, 4));
const prettyDate = (iso) =>
  new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
const rangeText = (a, b) => (a.slice(0, 10) === b.slice(0, 10) ? prettyDate(a) : `${prettyDate(a)} → ${prettyDate(b)}`);

const TYPE_COLOR = { CL: '#2563EB', SL: '#D97706', PL: '#16A34A' };
const STATUS_STYLE = {
  pending: { c: AMBER, bg: '#FEF3C7', label: 'Pending' },
  approved: { c: GREEN, bg: '#ECFDF5', label: 'Approved' },
  rejected: { c: RED, bg: '#FEE2E2', label: 'Rejected' },
  cancelled: { c: GREY, bg: '#F3F4F6', label: 'Cancelled' },
};

export default function LeaveScreen({ navigation }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api(`/leaves/my?year=${CUR_YEAR}`));
    } catch (e) { Alert.alert('Error', e.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => {
    const unsub = navigation.addListener('focus', load);
    return unsub;
  }, [navigation, load]);

  const cancel = (r) => {
    Alert.alert('Cancel leave', `Cancel your ${r.leaveType?.code} request (${rangeText(r.startDate, r.endDate)})?`, [
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes, cancel', style: 'destructive',
        onPress: async () => {
          try { await api(`/leaves/requests/${r.id}`, { method: 'DELETE' }); load(); }
          catch (e) { Alert.alert('Failed', e.message); }
        },
      },
    ]);
  };

  const balances = data?.balances || [];
  const requests = data?.requests || [];

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
            <Text style={styles.title}>My Leave</Text>
            <Text style={styles.subTitle}>{CUR_YEAR} • paid leave balance</Text>
          </View>
        </View>
      </LinearGradient>

      {loading ? (
        <ActivityIndicator size="large" color={INDIGO} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        >
          {/* Balance cards */}
          <View style={styles.balRow}>
            {balances.map((b) => (
              <View key={b.leaveTypeId} style={styles.balCard}>
                <View style={[styles.balTag, { backgroundColor: (TYPE_COLOR[b.code] || INDIGO) + '22' }]}>
                  <Text style={[styles.balTagText, { color: TYPE_COLOR[b.code] || INDIGO }]}>{b.code}</Text>
                </View>
                <Text style={styles.balAvail}>{b.available}</Text>
                <Text style={styles.balOf}>of {b.quota} left</Text>
                <View style={styles.balMetaRow}>
                  <Text style={styles.balMeta}>Used {b.used}</Text>
                  {b.pending > 0 && <Text style={[styles.balMeta, { color: AMBER }]}>• {b.pending} pending</Text>}
                </View>
              </View>
            ))}
          </View>

          <TouchableOpacity style={styles.applyBtn} activeOpacity={0.9} onPress={() => setApplyOpen(true)}>
            <LinearGradient colors={['#1E40AF', '#312E81']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.applyGrad}>
              <MaterialIcons name="add" size={20} color="#fff" />
              <Text style={styles.applyText}>Apply for Leave</Text>
            </LinearGradient>
          </TouchableOpacity>

          <Text style={styles.sectionTitle}>My Requests</Text>
          {requests.length === 0 ? (
            <View style={styles.empty}>
              <MaterialIcons name="beach-access" size={44} color="#CBD5E1" />
              <Text style={styles.emptyText}>No leave requests yet this year</Text>
            </View>
          ) : (
            requests.map((r) => {
              const st = STATUS_STYLE[r.status] || STATUS_STYLE.cancelled;
              return (
                <View key={r.id} style={styles.reqCard}>
                  <View style={[styles.reqType, { backgroundColor: (TYPE_COLOR[r.leaveType?.code] || INDIGO) + '18' }]}>
                    <Text style={[styles.reqTypeText, { color: TYPE_COLOR[r.leaveType?.code] || INDIGO }]}>{r.leaveType?.code}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.reqDates}>{rangeText(r.startDate, r.endDate)}</Text>
                    <Text style={styles.reqDays}>{r.days} day{r.days === 1 ? '' : 's'}{r.halfDay ? ' • half day' : ''}</Text>
                    {r.reason ? <Text style={styles.reqReason} numberOfLines={2}>{r.reason}</Text> : null}
                    {r.status === 'rejected' && r.reviewNote ? (
                      <Text style={styles.reqNote}>HR: {r.reviewNote}</Text>
                    ) : null}
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 6 }}>
                    <View style={[styles.stPill, { backgroundColor: st.bg }]}>
                      <Text style={[styles.stText, { color: st.c }]}>{st.label}</Text>
                    </View>
                    {r.status === 'pending' && (
                      <TouchableOpacity onPress={() => cancel(r)}>
                        <Text style={styles.cancelLink}>Cancel</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      <ApplyLeaveModal
        visible={applyOpen}
        types={balances}
        onClose={() => setApplyOpen(false)}
        onDone={() => { setApplyOpen(false); load(); }}
      />
    </View>
  );
}

/* ---------------- Apply modal ---------------- */
function ApplyLeaveModal({ visible, types, onClose, onDone }) {
  const [leaveTypeId, setLeaveTypeId] = useState(null);
  const [from, setFrom] = useState(todayYMD());
  const [to, setTo] = useState(todayYMD());
  const [halfDay, setHalfDay] = useState(false);
  const [reason, setReason] = useState('');
  const [picking, setPicking] = useState(null); // 'from' | 'to' | null
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      setLeaveTypeId(types[0]?.leaveTypeId ?? null);
      setFrom(todayYMD());
      setTo(todayYMD());
      setHalfDay(false);
      setReason('');
      setPicking(null);
      setBusy(false);
    }
  }, [visible, types]);

  const sameDay = from === to;

  const submit = async () => {
    if (!leaveTypeId) { Alert.alert('Select leave type'); return; }
    if (to < from) { Alert.alert('Invalid dates', 'End date must be on or after start date'); return; }
    if (!reason.trim()) { Alert.alert('Reason required', 'Please enter a reason for your leave.'); return; }
    setBusy(true);
    try {
      await api('/leaves/requests', {
        method: 'POST',
        body: JSON.stringify({
          leaveTypeId, startDate: from, endDate: to,
          halfDay: halfDay && sameDay, reason: reason.trim(),
        }),
      });
      Alert.alert('Applied ✅', 'Your leave request has been submitted for approval.');
      onDone();
    } catch (e) {
      Alert.alert('Could not apply', e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetOverlay}>
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Apply for Leave</Text>

          <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 460 }}>
            <Text style={styles.fieldLabel}>LEAVE TYPE</Text>
            <View style={styles.chipWrap}>
              {types.map((t) => (
                <TouchableOpacity key={t.leaveTypeId}
                  style={[styles.chip, leaveTypeId === t.leaveTypeId && styles.chipOn]}
                  onPress={() => setLeaveTypeId(t.leaveTypeId)}>
                  <Text style={[styles.chipText, leaveTypeId === t.leaveTypeId && styles.chipTextOn]}>
                    {t.code} · {t.available} left
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.dateRow}>
              <TouchableOpacity style={styles.dateField} onPress={() => setPicking('from')}>
                <Text style={styles.dateLabel}>FROM</Text>
                <Text style={styles.dateValue}>{prettyDate(from)}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.dateField} onPress={() => setPicking('to')}>
                <Text style={styles.dateLabel}>TO</Text>
                <Text style={styles.dateValue}>{prettyDate(to)}</Text>
              </TouchableOpacity>
            </View>

            {sameDay && (
              <View style={styles.halfRow}>
                <Text style={styles.halfLabel}>Half day</Text>
                <Switch value={halfDay} onValueChange={setHalfDay} trackColor={{ true: INDIGO }} />
              </View>
            )}

            <Text style={styles.fieldLabel}>REASON *</Text>
            <TextInput
              style={[styles.reasonInput, !reason.trim() && styles.reasonInputEmpty]}
              placeholder="Required — e.g. Family function"
              placeholderTextColor="#9CA3AF"
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
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>Submit</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Date picker */}
      <Modal visible={!!picking} transparent animationType="fade" onRequestClose={() => setPicking(null)}>
        <View style={styles.overlayCenter}>
          <View style={styles.calCard}>
            <Text style={styles.sheetTitle}>Select {picking === 'from' ? 'start' : 'end'} date</Text>
            <Calendar
              current={picking === 'from' ? from : to}
              minDate={picking === 'to' ? from : undefined}
              onDayPress={(d) => {
                if (picking === 'from') {
                  setFrom(d.dateString);
                  if (to < d.dateString) setTo(d.dateString);
                } else {
                  setTo(d.dateString);
                }
                setPicking(null);
              }}
              markedDates={{ [picking === 'from' ? from : to]: { selected: true, selectedColor: INDIGO } }}
              theme={{ todayTextColor: INDIGO, arrowColor: INDIGO, textMonthFontWeight: '800' }}
            />
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setPicking(null)}>
              <Text style={styles.cancelBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  header: { paddingTop: 52, paddingBottom: 16, paddingHorizontal: 18, borderBottomLeftRadius: 26, borderBottomRightRadius: 26, overflow: 'hidden', elevation: 6 },
  deco: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.07)' },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.14)', justifyContent: 'center', alignItems: 'center' },
  title: { color: '#fff', fontSize: 17, fontWeight: '800' },
  subTitle: { color: '#C7D2FE', fontSize: 11.5, marginTop: 1 },

  balRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  balCard: { flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 12, elevation: 1, shadowColor: '#1E3A8A', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } },
  balTag: { alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  balTagText: { fontSize: 11, fontWeight: '800' },
  balAvail: { fontSize: 26, fontWeight: '800', color: '#111827', marginTop: 8 },
  balOf: { fontSize: 11, color: '#9CA3AF', fontWeight: '600' },
  balMetaRow: { flexDirection: 'row', gap: 5, marginTop: 6, flexWrap: 'wrap' },
  balMeta: { fontSize: 10.5, color: GREY, fontWeight: '600' },

  applyBtn: { borderRadius: 16, overflow: 'hidden', marginBottom: 20, elevation: 3 },
  applyGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 15 },
  applyText: { color: '#fff', fontSize: 15, fontWeight: '800' },

  sectionTitle: { fontSize: 14, fontWeight: '800', color: '#374151', marginBottom: 10 },
  empty: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyText: { color: '#9CA3AF', fontSize: 13 },

  reqCard: { flexDirection: 'row', gap: 12, backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 10, elevation: 1 },
  reqType: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  reqTypeText: { fontSize: 13, fontWeight: '800' },
  reqDates: { fontSize: 14, fontWeight: '800', color: '#111827' },
  reqDays: { fontSize: 12, color: '#6B7280', fontWeight: '600', marginTop: 2 },
  reqReason: { fontSize: 12, color: '#9CA3AF', marginTop: 3 },
  reqNote: { fontSize: 11.5, color: RED, marginTop: 3, fontWeight: '600' },
  stPill: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  stText: { fontSize: 11, fontWeight: '800' },
  cancelLink: { fontSize: 12, color: RED, fontWeight: '700' },

  sheetOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 18, paddingBottom: 26 },
  sheetHandle: { width: 42, height: 5, borderRadius: 3, backgroundColor: '#E5E7EB', alignSelf: 'center', marginBottom: 12 },
  sheetTitle: { fontSize: 16, fontWeight: '800', color: '#111827', marginBottom: 12, textAlign: 'center' },
  fieldLabel: { fontSize: 10.5, fontWeight: '800', color: '#9CA3AF', letterSpacing: 0.6, marginTop: 10, marginBottom: 8 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#fff' },
  chipOn: { backgroundColor: INDIGO, borderColor: INDIGO },
  chipText: { fontSize: 12.5, color: '#374151', fontWeight: '700' },
  chipTextOn: { color: '#fff' },
  dateRow: { flexDirection: 'row', gap: 10, marginTop: 6 },
  dateField: { flex: 1, backgroundColor: '#F9FAFB', borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 12, padding: 12 },
  dateLabel: { fontSize: 10, fontWeight: '800', color: '#9CA3AF', letterSpacing: 0.5 },
  dateValue: { fontSize: 14, fontWeight: '700', color: '#111827', marginTop: 3 },
  halfRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingHorizontal: 4 },
  halfLabel: { fontSize: 13, fontWeight: '700', color: '#374151' },
  reasonInput: { backgroundColor: '#F9FAFB', borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 12, padding: 12, fontSize: 14, color: '#111827', minHeight: 60, textAlignVertical: 'top' },
  reasonInputEmpty: { borderColor: '#FCA5A5' },
  cancelBtn: { flex: 1, height: 50, borderRadius: 13, borderWidth: 1.5, borderColor: '#E5E7EB', justifyContent: 'center', alignItems: 'center', marginTop: 10 },
  cancelBtnText: { color: '#374151', fontWeight: '700' },
  submitBtn: { flex: 1, height: 50, borderRadius: 13, backgroundColor: INDIGO, justifyContent: 'center', alignItems: 'center' },
  submitBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  overlayCenter: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'center', padding: 20 },
  calCard: { backgroundColor: '#fff', borderRadius: 24, padding: 16 },
});
