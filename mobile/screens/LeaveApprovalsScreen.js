import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, FlatList,
  ActivityIndicator, RefreshControl, Modal, TextInput, Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { Calendar } from 'react-native-calendars';
import { LinearGradient } from 'expo-linear-gradient';
import { api } from '../lib/api';
import { GradientHeader, BottomNav, Card, Chip , SheetOverlay} from '../components/ui';
import { COLORS, GREEN_GRADIENT, RADIUS } from '../lib/theme';

const todayYMD = () => new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
const CUR_YEAR = Number(todayYMD().slice(0, 4));
const prettyDate = (iso) =>
  new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
const rangeText = (a, b) => (a.slice(0, 10) === b.slice(0, 10) ? prettyDate(a) : `${prettyDate(a)} → ${prettyDate(b)}`);
const shortDate = (ymd) =>
  new Date(ymd + 'T00:00:00.000Z').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'UTC' });
const initials = (n) => (n || 'U').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
const TYPE_COLOR = { CL: '#2563EB', SL: COLORS.orange, PL: COLORS.green, CO: '#7C3AED' };
const STATUS_STYLE = {
  pending: { c: COLORS.orange, bg: COLORS.orangeSoft, label: 'Pending' },
  approved: { c: COLORS.green, bg: COLORS.greenSoft, label: 'Approved' },
  rejected: { c: COLORS.red, bg: COLORS.redSoft, label: 'Rejected' },
  cancelled: { c: COLORS.sub, bg: '#F3F4F6', label: 'Cancelled' },
};
const FILTERS = ['pending', 'approved', 'rejected', 'all'];

export default function LeaveApprovalsScreen({ navigation }) {
  const [filter, setFilter] = useState('pending');
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [users, setUsers] = useState([]);
  const [selected, setSelected] = useState(null); // null = All Employees
  const [from, setFrom] = useState(null);
  const [to, setTo] = useState(null);
  const [empModal, setEmpModal] = useState(false);
  const [search, setSearch] = useState('');
  const [picking, setPicking] = useState(null); // 'from' | 'to' | null

  useEffect(() => {
    api('/users').then(setUsers).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = [];
      // A picked range speaks for itself: the server builds the window from
      // whichever bounds arrive and stays open on the side left as "Any". Sending
      // a year alongside would clamp that open side back to one calendar year.
      if (!from && !to) qs.push(`year=${CUR_YEAR}`);
      if (filter !== 'all') qs.push(`status=${filter}`);
      if (selected) qs.push(`userId=${selected.id}`);
      if (from) qs.push(`from=${from}`);
      if (to) qs.push(`to=${to}`);
      const res = await api(`/leaves/requests?${qs.join('&')}`);
      setRequests(res.requests || []);
    } catch (e) { Alert.alert('Error', e.message); setRequests([]); }
    finally { setLoading(false); setRefreshing(false); }
  }, [filter, selected, from, to]);

  useEffect(() => { load(); }, [load]);

  const decide = (r, status) => {
    const go = async (reviewNote) => {
      setBusyId(r.id);
      try {
        await api(`/leaves/requests/${r.id}/decision`, {
          method: 'PATCH',
          body: JSON.stringify({ status, reviewNote: reviewNote || '' }),
        });
        load();
      } catch (e) { Alert.alert('Failed', e.message); }
      finally { setBusyId(null); }
    };
    if (status === 'approved') {
      Alert.alert('Approve leave', `Approve ${r.leaveType?.code} for ${r.user?.fullName || r.user?.username}?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Approve', onPress: () => go('') },
      ]);
    } else {
      Alert.alert('Reject leave', `Reject ${r.leaveType?.code} for ${r.user?.fullName || r.user?.username}?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reject', style: 'destructive', onPress: () => go('') },
      ]);
    }
  };

  const pendingCount = requests.filter((r) => r.status === 'pending').length;
  const hasFilters = !!selected || !!from || !!to;
  const clearFilters = () => { setSelected(null); setFrom(null); setTo(null); };
  const periodLabel = (from || to)
    ? `${from ? shortDate(from) : 'Any'} → ${to ? shortDate(to) : 'Any'}`
    : String(CUR_YEAR);
  const filteredUsers = users.filter((u) =>
    (u.username + ' ' + (u.fullName || '')).toLowerCase().includes(search.toLowerCase()));
  const pickedDate = picking === 'from' ? from : to;

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <GradientHeader
        title="Leave Approvals"
        subtitle={`${periodLabel} • ${pendingCount} pending`}
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
          <TouchableOpacity style={[styles.filterField, { flex: 1 }]} onPress={() => { setSearch(''); setEmpModal(true); }}>
            <MaterialIcons name="person" size={17} color="#C7D2FE" />
            <Text style={styles.filterText} numberOfLines={1}>
              {selected ? (selected.fullName || selected.username) : 'All Employees'}
            </Text>
            <MaterialIcons name="arrow-drop-down" size={22} color="#C7D2FE" />
          </TouchableOpacity>
        </View>

        <View style={styles.filterRow}>
          <TouchableOpacity style={[styles.filterField, { flex: 1 }]} onPress={() => setPicking('from')}>
            <MaterialIcons name="event" size={16} color="#C7D2FE" />
            <Text style={styles.filterText} numberOfLines={1}>From {from ? shortDate(from) : 'Any'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.filterField, { flex: 1 }]} onPress={() => setPicking('to')}>
            <MaterialIcons name="event" size={16} color="#C7D2FE" />
            <Text style={styles.filterText} numberOfLines={1}>To {to ? shortDate(to) : 'Any'}</Text>
          </TouchableOpacity>
        </View>

        {hasFilters && (
          <View style={styles.clearRow}>
            <TouchableOpacity style={styles.clearBtn} onPress={clearFilters}>
              <MaterialIcons name="close" size={13} color="#C7D2FE" />
              <Text style={styles.clearText}>Clear filters</Text>
            </TouchableOpacity>
          </View>
        )}
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
          {requests.length === 0 ? (
            <View style={styles.empty}>
              <MaterialIcons name="event-available" size={44} color="#CBD5E1" />
              <Text style={styles.emptyText}>
                No {filter === 'all' ? '' : filter} leave requests{hasFilters ? ' match these filters' : ''}
              </Text>
            </View>
          ) : (
            requests.map((r) => {
              const st = STATUS_STYLE[r.status] || STATUS_STYLE.cancelled;
              const busy = busyId === r.id;
              return (
                <Card key={r.id} style={styles.reqCard}>
                  <View style={styles.cardTop}>
                    <View style={[styles.typeTag, { backgroundColor: (TYPE_COLOR[r.leaveType?.code] || COLORS.primary) + '18' }]}>
                      <Text style={[styles.typeText, { color: TYPE_COLOR[r.leaveType?.code] || COLORS.primary }]}>{r.leaveType?.code}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name}>{r.user?.fullName || r.user?.username}</Text>
                      <Text style={styles.userSub}>@{r.user?.username}</Text>
                    </View>
                    <Chip text={st.label} color={st.c} soft={st.bg} />
                  </View>

                  <View style={styles.detailRow}>
                    <MaterialIcons name="event" size={15} color={COLORS.sub} />
                    <Text style={styles.detailText}>{rangeText(r.startDate, r.endDate)}</Text>
                    <View style={styles.daysPill}><Text style={styles.daysText}>{r.days} day{r.days === 1 ? '' : 's'}</Text></View>
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
        <SheetOverlay>
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
        </SheetOverlay>
      </Modal>

      {/* From / To date picker */}
      <Modal visible={!!picking} transparent animationType="fade" onRequestClose={() => setPicking(null)}>
        <SheetOverlay center>
          <View style={styles.calCard}>
            <Text style={styles.sheetTitle}>Select {picking === 'from' ? 'from' : 'to'} date</Text>
            <Calendar
              current={pickedDate || todayYMD()}
              minDate={picking === 'to' ? (from || undefined) : undefined}
              maxDate={picking === 'from' ? (to || undefined) : undefined}
              onDayPress={(d) => {
                if (picking === 'from') setFrom(d.dateString); else setTo(d.dateString);
                setPicking(null);
              }}
              markedDates={pickedDate ? { [pickedDate]: { selected: true, selectedColor: COLORS.primary } } : {}}
              theme={{ todayTextColor: COLORS.primary, arrowColor: COLORS.primary, textMonthFontWeight: '800', textDayFontWeight: '600' }}
            />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              <TouchableOpacity style={[styles.sheetClose, { flex: 1, marginTop: 0 }]}
                onPress={() => { if (picking === 'from') setFrom(null); else setTo(null); setPicking(null); }}>
                <Text style={styles.sheetCloseText}>Any date</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.sheetClose, { flex: 1, marginTop: 0 }]} onPress={() => setPicking(null)}>
                <Text style={styles.sheetCloseText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </SheetOverlay>
      </Modal>

      <BottomNav navigation={navigation} active={null} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },

  /* header controls (inside GradientHeader) */
  segment: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 12, padding: 4, marginTop: 14 },
  segBtn: { flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: 'center' },
  segBtnOn: { backgroundColor: '#fff' },
  segText: { color: '#E0E7FF', fontWeight: '700', fontSize: 11.5 },
  segTextOn: { color: COLORS.primary },
  filterRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  filterField: {
    flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.13)',
    borderRadius: 14, paddingHorizontal: 10, height: 44, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
  },
  filterText: { flex: 1, color: '#fff', fontSize: 12.5, fontWeight: '700' },
  clearRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 },
  clearBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: 2, paddingHorizontal: 4 },
  clearText: { color: '#C7D2FE', fontSize: 11.5, fontWeight: '800' },

  empty: { alignItems: 'center', paddingVertical: 50, gap: 10 },
  emptyText: { color: COLORS.faint, fontSize: 13 },

  reqCard: { padding: 14, marginBottom: 10 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  typeTag: { width: 42, height: 42, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  typeText: { fontSize: 13, fontWeight: '800' },
  name: { fontSize: 14, fontWeight: '800', color: COLORS.ink },
  userSub: { fontSize: 11.5, color: COLORS.faint, marginTop: 1 },

  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  detailText: { fontSize: 13, color: '#374151', fontWeight: '600' },
  daysPill: { backgroundColor: COLORS.indigoSoft, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, marginLeft: 4 },
  daysText: { fontSize: 11, color: COLORS.primary, fontWeight: '800' },
  reason: { fontSize: 12.5, color: COLORS.sub, marginTop: 8, fontStyle: 'italic' },

  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  actBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 46, borderRadius: RADIUS.button },
  rejectBtn: { flex: 1, borderWidth: 1.5, borderColor: '#FCA5A5', backgroundColor: '#FEF2F2' },
  actText: { fontSize: 13.5, fontWeight: '800' },

  /* filter modals */
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: COLORS.card, borderTopLeftRadius: RADIUS.sheet, borderTopRightRadius: RADIUS.sheet, padding: 18, paddingBottom: 26 },
  sheetHandle: { width: 42, height: 5, borderRadius: 3, backgroundColor: COLORS.line, alignSelf: 'center', marginBottom: 12 },
  sheetTitle: { fontSize: 16, fontWeight: '800', color: COLORS.ink, marginBottom: 12, textAlign: 'center' },
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
