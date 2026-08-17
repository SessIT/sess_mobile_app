import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, FlatList,
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
const thisMonth = () => todayYMD().slice(0, 7);
const monthLabel = (ym) => new Date(ym + '-01T00:00:00').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
const prettyDate = (iso) =>
  new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
const fmtTime = (iso) =>
  new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
const fmtHrs = (h) => (h === Math.floor(h) ? `${h}` : h.toFixed(1)) + 'h';
const initials = (n) => (n || 'U').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();

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
  const [users, setUsers] = useState([]);
  const [selected, setSelected] = useState(null); // null = All Employees
  const [month, setMonth] = useState(thisMonth()); // at mount, not module load — the app outlives the month
  const [empModal, setEmpModal] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api('/users').then(setUsers).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = filter === 'all' ? '' : `&status=${filter}`;
      const who = selected ? `&userId=${selected.id}` : '';
      const res = await api(`/ot/requests?month=${month}${q}${who}`);
      setRequests(res.requests || []);
    } catch (e) { Alert.alert('Error', e.message); setRequests([]); }
    finally { setLoading(false); setRefreshing(false); }
  }, [filter, selected, month]);

  useEffect(() => { load(); }, [load]);

  const shiftMonth = (n) => {
    const d = new Date(month + '-01T00:00:00');
    d.setMonth(d.getMonth() + n);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (ym <= thisMonth()) setMonth(ym);
  };

  const filteredUsers = users.filter((u) =>
    (u.username + ' ' + (u.fullName || '')).toLowerCase().includes(search.toLowerCase()));

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
        subtitle={`${monthLabel(month)} • ${pendingCount} pending`}
        onBack={() => navigation.goBack()}
      >
        <View style={styles.segment}>
          {FILTERS.map((f) => (
            <TouchableOpacity key={f} style={[styles.segBtn, filter === f && styles.segBtnOn]} onPress={() => setFilter(f)}>
              <Text style={[styles.segText, filter === f && styles.segTextOn]}>{f[0].toUpperCase() + f.slice(1)}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.filterRow}>
          <TouchableOpacity style={[styles.filterField, { flex: 1.2 }]} onPress={() => { setSearch(''); setEmpModal(true); }}>
            <MaterialIcons name="person" size={17} color="#C7D2FE" />
            <Text style={styles.filterText} numberOfLines={1}>
              {selected ? (selected.fullName || selected.username) : 'All Employees'}
            </Text>
            <MaterialIcons name="arrow-drop-down" size={22} color="#C7D2FE" />
          </TouchableOpacity>

          <View style={[styles.filterField, { flex: 1.1, paddingHorizontal: 4 }]}>
            <TouchableOpacity onPress={() => shiftMonth(-1)} style={{ padding: 4 }}>
              <MaterialIcons name="chevron-left" size={22} color="#C7D2FE" />
            </TouchableOpacity>
            <Text style={[styles.filterText, { textAlign: 'center' }]} numberOfLines={1}>{monthLabel(month)}</Text>
            <TouchableOpacity onPress={() => shiftMonth(1)} disabled={month >= thisMonth()}
              style={{ padding: 4, opacity: month >= thisMonth() ? 0.3 : 1 }}>
              <MaterialIcons name="chevron-right" size={22} color="#C7D2FE" />
            </TouchableOpacity>
          </View>
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

      {/* Employee dropdown */}
      <Modal visible={empModal} transparent animationType="slide" onRequestClose={() => setEmpModal(false)}>
        <View style={styles.sheetOverlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Select Employee</Text>
            <View style={styles.searchRow}>
              <MaterialIcons name="search" size={19} color={COLORS.sub} />
              <TextInput style={styles.searchInput} placeholder="Search…" placeholderTextColor={COLORS.faint}
                value={search} onChangeText={setSearch} autoFocus />
            </View>
            <TouchableOpacity style={[styles.empRow, !selected && styles.empRowActive]}
              onPress={() => { setSelected(null); setEmpModal(false); }}>
              <View style={styles.eAvatar}><MaterialIcons name="groups" size={19} color={COLORS.primary} /></View>
              <Text style={styles.eName}>All Employees</Text>
              {!selected && <MaterialIcons name="check-circle" size={20} color={COLORS.green} style={{ marginLeft: 'auto' }} />}
            </TouchableOpacity>
            <FlatList
              data={filteredUsers}
              keyExtractor={(u) => String(u.id)}
              style={{ maxHeight: 330 }}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item: u }) => (
                <TouchableOpacity style={[styles.empRow, selected?.id === u.id && styles.empRowActive]}
                  onPress={() => { setSelected(u); setEmpModal(false); }}>
                  <View style={styles.eAvatar}><Text style={styles.eAvatarText}>{initials(u.fullName || u.username)}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.eName}>{u.fullName || u.username}</Text>
                    <Text style={styles.eSub}>@{u.username}</Text>
                  </View>
                  {selected?.id === u.id && <MaterialIcons name="check-circle" size={20} color={COLORS.green} />}
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity style={styles.sheetClose} onPress={() => setEmpModal(false)}>
              <Text style={styles.sheetCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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

  const canSubmit = selected.size > 0 && reason.trim() && !busy;

  const submit = async () => {
    if (!HHMM.test(start) || !HHMM.test(end)) {
      Alert.alert('Invalid time', 'Enter an hour (1–12), minutes (00–59) and AM/PM for both start and end.');
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
              <TimeField12 label="START" value={start} onChange={setStart} />
              <TimeField12 label="END" value={end} onChange={setEnd} />
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

/* ---------------- 12-hour time entry (hour · minute · AM/PM) ---------------- */
// `value` is a 24-hour "HH:MM" string; onChange gets '' while the parts are
// incomplete so the caller's existing HHMM guards reject a half-typed time.
function TimeField12({ label, value, onChange }) {
  const [p, setP] = useState(() => to12parts(value));

  // Re-sync when the value changes from outside (sheet reset).
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

  segment: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 12, padding: 4, marginTop: 14 },
  segBtn: { flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: 'center' },
  segBtnOn: { backgroundColor: '#fff' },
  segText: { color: '#E0E7FF', fontWeight: '700', fontSize: 11.5 },
  segTextOn: { color: COLORS.primary },

  filterRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  filterField: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.13)',
    borderRadius: 14, paddingHorizontal: 10, height: 44, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
  },
  filterText: { flex: 1, color: '#fff', fontSize: 12.5, fontWeight: '700' },

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

  /* employee filter sheet */
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.field,
    borderWidth: 1, borderColor: COLORS.line, borderRadius: RADIUS.input, paddingHorizontal: 12, height: 46, marginBottom: 10,
  },
  searchInput: { flex: 1, fontSize: 14, color: COLORS.ink },
  empRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 12 },
  empRowActive: { backgroundColor: COLORS.indigoSoft },
  eAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: COLORS.indigoSoft, justifyContent: 'center', alignItems: 'center' },
  eAvatarText: { color: COLORS.primary, fontWeight: '800', fontSize: 13 },
  eName: { fontSize: 14, fontWeight: '700', color: COLORS.ink },
  eSub: { fontSize: 11, color: COLORS.faint, marginTop: 1 },
  sheetClose: {
    marginTop: 10, height: 52, borderRadius: RADIUS.button, borderWidth: 1.5,
    borderColor: COLORS.line, justifyContent: 'center', alignItems: 'center',
  },
  sheetCloseText: { color: '#374151', fontWeight: '700' },
  overlayCenter: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'center', padding: 20 },
  calCard: { backgroundColor: COLORS.card, borderRadius: RADIUS.sheet, padding: 16 },
});
