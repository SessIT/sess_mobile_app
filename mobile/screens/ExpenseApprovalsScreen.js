import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, FlatList, Image,
  ActivityIndicator, RefreshControl, Modal, TextInput, Alert, Linking,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { Calendar } from 'react-native-calendars';
import { api, API_URL } from '../lib/api';
import { GradientHeader, BottomNav, Card, Chip } from '../components/ui';
import { COLORS, GREEN_GRADIENT, RADIUS } from '../lib/theme';
import { useKeyboard } from '../lib/useKeyboard';

const BASE = API_URL.replace('/api', '');

const todayYMD = () => new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
const thisMonth = () => todayYMD().slice(0, 7);
const monthLabel = (ym) => new Date(ym + '-01T00:00:00').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
const shortDate = (ymd) =>
  new Date(ymd + 'T00:00:00.000Z').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'UTC' });
const prettyDate = (iso) =>
  new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
const initials = (n) => (n || 'U').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();

const TYPE_ICON = {
  'Travel': 'flight',
  'Food & Meals': 'restaurant',
  'Office Supplies': 'work',
  'Client Entertainment': 'groups',
  'Stationery': 'edit',
  'Other': 'more-horiz',
};
const iconFor = (t) => TYPE_ICON[t] || 'receipt-long';

// A bill may be a PDF (the web console accepts those) and <Image> draws nothing
// for one, so the extension decides between a thumbnail and a file chip.
const isPdfBill = (p) => /\.pdf$/i.test(p || '');

// A claim can carry several bills. `bills` is the current shape; `billPath` is
// still read so a row from an older payload still renders its one attachment.
const billsOf = (r) => (Array.isArray(r.bills) && r.bills.length ? r.bills : [r.billPath].filter(Boolean));

const STATUS_STYLE = {
  pending: { c: COLORS.orange, bg: COLORS.orangeSoft, label: 'Pending' },
  approved: { c: COLORS.green, bg: COLORS.greenSoft, label: 'Approved' },
  rejected: { c: COLORS.red, bg: COLORS.redSoft, label: 'Rejected' },
  cancelled: { c: COLORS.sub, bg: '#F3F4F6', label: 'Cancelled' },
};
const FILTERS = ['pending', 'approved', 'rejected', 'all'];

export default function ExpenseApprovalsScreen({ navigation }) {
  const [filter, setFilter] = useState('pending');
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [users, setUsers] = useState([]);
  const [selected, setSelected] = useState(null); // null = All Employees
  const [month, setMonth] = useState(null);       // null = every month
  // Day-wise window. It stands in for the month on the server, so the two are
  // kept mutually exclusive here rather than leaving a filter shown but unused.
  const [from, setFrom] = useState(null);
  const [to, setTo] = useState(null);
  const [picking, setPicking] = useState(null);  // 'from' | 'to' | null
  const [empModal, setEmpModal] = useState(false);
  const [search, setSearch] = useState('');
  const [viewBill, setViewBill] = useState(null); // full-screen bill URL
  const [decision, setDecision] = useState(null); // { r, status } while the note is typed
  const [note, setNote] = useState('');
  // Both prompts below are Modals with a TextInput, so they take the same
  // bottom-spacing rule as the chat/notes composers — see lib/useKeyboard.
  const kb = useKeyboard();

  useEffect(() => {
    api('/users').then(setUsers).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = [];
      if (filter !== 'all') qs.push(`status=${filter}`);
      if (selected) qs.push(`userId=${selected.id}`);
      // A picked day range replaces the month outright — sending both would let
      // the month clamp a window the reviewer deliberately opened.
      if (from || to) {
        if (from) qs.push(`from=${from}`);
        if (to) qs.push(`to=${to}`);
      } else if (month) qs.push(`month=${month}`);
      const res = await api(`/expenses/requests${qs.length ? `?${qs.join('&')}` : ''}`);
      setRequests(res.requests || []);
    } catch (e) { Alert.alert('Error', e.message); setRequests([]); }
    finally { setLoading(false); setRefreshing(false); }
  }, [filter, selected, month, from, to]);

  useEffect(() => { load(); }, [load]);

  // From "All Months" either arrow lands on the current month rather than
  // jumping to a period the reviewer never chose.
  const shiftMonth = (n) => {
    // The month and the day range are two ways to say the same thing, so
    // reaching for one puts the other away.
    setFrom(null); setTo(null);
    if (!month) { setMonth(thisMonth()); return; }
    const d = new Date(month + '-01T00:00:00');
    d.setMonth(d.getMonth() + n);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (ym <= thisMonth()) setMonth(ym);
  };

  const decide = (r, status) => { setNote(''); setDecision({ r, status }); };

  // The in-app viewer only knows how to draw images, so a PDF bill is handed to
  // whatever the reviewer's phone uses to read PDFs.
  const openBill = (billPath) => {
    const url = `${BASE}/${billPath}`;
    if (isPdfBill(billPath)) {
      Linking.openURL(url).catch(() => Alert.alert('Cannot open', 'No app on this phone can open a PDF bill.'));
      return;
    }
    setViewBill(url);
  };

  const sendDecision = async () => {
    const { r, status } = decision;
    const reviewNote = note.trim();
    setDecision(null);
    setBusyId(r.id);
    try {
      await api(`/expenses/requests/${r.id}/decision`, {
        method: 'PATCH',
        body: JSON.stringify({ status, reviewNote }),
      });
      load();
    } catch (e) { Alert.alert('Failed', e.message); }
    finally { setBusyId(null); }
  };

  const pendingCount = requests.filter((r) => r.status === 'pending').length;
  const hasFilters = !!selected || !!month || !!from || !!to;
  const clearFilters = () => { setSelected(null); setMonth(null); setFrom(null); setTo(null); };
  const pickedDate = picking === 'from' ? from : to;
  // What the header says it is showing, in the reviewer's own terms.
  const periodLabel = from || to
    ? `${from ? shortDate(from) : 'Any'} → ${to ? shortDate(to) : 'Any'}`
    : month ? monthLabel(month) : 'All months';
  const pickDay = (ymd) => {
    setMonth(null); // a day range supersedes the month
    if (picking === 'from') setFrom(ymd); else setTo(ymd);
    setPicking(null);
  };
  const filteredUsers = users.filter((u) =>
    (u.username + ' ' + (u.fullName || '')).toLowerCase().includes(search.toLowerCase()));

  const approving = decision?.status === 'approved';
  const decisionWho = decision ? (decision.r.user?.fullName || decision.r.user?.username) : '';

  return (
    <View style={styles.container} onLayout={kb.onLayout}>
      <StatusBar style="light" />

      <GradientHeader
        title="Expense Approvals"
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
          <TouchableOpacity style={[styles.filterField, { flex: 1.2 }]} onPress={() => { setSearch(''); setEmpModal(true); }}>
            <MaterialIcons name="person" size={17} color="#C7D2FE" />
            <Text style={styles.filterText} numberOfLines={1}>
              {selected ? (selected.fullName || selected.username) : 'All Employees'}
            </Text>
            <MaterialIcons name="arrow-drop-down" size={22} color="#C7D2FE" />
          </TouchableOpacity>

          {/* Dimmed while a day range is driving the list — the month is not
              what is being shown, so it must not look like it is. */}
          <View style={[styles.filterField, { flex: 1.1, paddingHorizontal: 4 }, (from || to) && { opacity: 0.45 }]}>
            <TouchableOpacity onPress={() => shiftMonth(-1)} style={{ padding: 4 }}>
              <MaterialIcons name="chevron-left" size={22} color="#C7D2FE" />
            </TouchableOpacity>
            <TouchableOpacity style={{ flex: 1 }} onPress={() => { setFrom(null); setTo(null); setMonth(month ? null : thisMonth()); }}>
              <Text style={[styles.filterText, { textAlign: 'center' }]} numberOfLines={1}>
                {month ? monthLabel(month) : 'All Months'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => shiftMonth(1)} disabled={!!month && month >= thisMonth()}
              style={{ padding: 4, opacity: month && month >= thisMonth() ? 0.3 : 1 }}>
              <MaterialIcons name="chevron-right" size={22} color="#C7D2FE" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Day-wise window — the same From/To flow Leave Approvals uses. */}
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
              <MaterialIcons name="receipt-long" size={44} color="#CBD5E1" />
              <Text style={styles.emptyText}>
                No {filter === 'all' ? '' : filter} expense requests{hasFilters ? ' match these filters' : ''}
              </Text>
            </View>
          ) : (
            requests.map((r) => {
              const st = STATUS_STYLE[r.status] || STATUS_STYLE.cancelled;
              const busy = busyId === r.id;
              return (
                <Card key={r.id} style={styles.reqCard}>
                  <View style={styles.cardTop}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>{initials(r.user?.fullName || r.user?.username)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name}>{r.user?.fullName || r.user?.username}</Text>
                      <Text style={styles.userSub}>@{r.user?.username} · {prettyDate(r.createdAt)}</Text>
                    </View>
                    <Chip text={st.label} color={st.c} soft={st.bg} />
                  </View>

                  <View style={styles.typeRow}>
                    <Chip text={r.type} icon={iconFor(r.type)} color={COLORS.primary} soft={COLORS.indigoSoft} />
                  </View>

                  <View style={styles.bodyRow}>
                    <Text style={styles.details}>{r.details}</Text>
                  </View>

                  {/* Every attachment on the claim, each opening on its own. */}
                  {billsOf(r).length > 0 ? (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.billStrip}>
                      {billsOf(r).map((b) => (
                        <TouchableOpacity key={b} activeOpacity={0.9} onPress={() => openBill(b)} style={{ marginRight: 8 }}>
                          {isPdfBill(b) ? (
                            <View style={[styles.thumb, styles.pdfThumb]}>
                              <MaterialIcons name="picture-as-pdf" size={22} color={COLORS.red} />
                              <Text style={styles.pdfThumbText}>PDF bill</Text>
                            </View>
                          ) : (
                            <Image source={{ uri: `${BASE}/${b}` }} style={styles.thumb} resizeMode="cover" />
                          )}
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  ) : null}

                  {r.status !== 'pending' && r.reviewedBy ? (
                    <Text style={styles.reviewLine}>
                      {st.label} by {r.reviewedBy.fullName || r.reviewedBy.username}
                      {r.reviewedAt ? ` • ${prettyDate(r.reviewedAt)}` : ''}
                      {r.reviewNote ? ` • ${r.reviewNote}` : ''}
                    </Text>
                  ) : null}

                  {r.status === 'pending' && (
                    <View style={styles.actions}>
                      <TouchableOpacity style={[styles.actBtn, styles.rejectBtn, busy && { opacity: 0.5 }]}
                        disabled={busy} onPress={() => decide(r, 'rejected')}>
                        <MaterialIcons name="close" size={17} color={COLORS.red} />
                        <Text style={[styles.actText, { color: COLORS.red }]}>Reject</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={{ flex: 1 }} activeOpacity={0.85}
                        disabled={busy} onPress={() => decide(r, 'approved')}>
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
          <View style={[styles.sheet, kb.visible && { paddingBottom: 26 + kb.lift }]}>
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
              style={{ maxHeight: kb.visible ? 190 : 330 }}
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

      {/* Decision + optional review note. Alert.prompt is iOS-only, so the note
          is collected in a small confirm card instead. */}
      <Modal visible={!!decision} transparent animationType="fade" onRequestClose={() => setDecision(null)}>
        {/* Padding the overlay re-centres the card in what is left above the IME. */}
        <View style={[styles.overlayCenter, kb.visible && { paddingBottom: 20 + kb.lift }]}>
          <View style={styles.confirmCard}>
            <Text style={styles.sheetTitle}>{approving ? 'Approve expense' : 'Reject expense'}</Text>
            <Text style={styles.confirmText}>
              {approving ? 'Approve' : 'Reject'} the {decision?.r.type} expense submitted by {decisionWho}?
            </Text>

            <Text style={styles.fieldLabel}>REVIEW NOTE (OPTIONAL)</Text>
            <TextInput
              style={styles.noteInput}
              placeholder={approving ? 'e.g. Reimbursed with this month’s payroll' : 'e.g. Bill is not readable'}
              placeholderTextColor={COLORS.faint}
              value={note}
              onChangeText={setNote}
              multiline
              maxLength={300}
            />

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setDecision(null)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ flex: 1, marginTop: 10 }} activeOpacity={0.85} onPress={sendDecision}>
                {approving ? (
                  <LinearGradient colors={GREEN_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.confirmBtn}>
                    <Text style={styles.confirmBtnText}>Approve</Text>
                  </LinearGradient>
                ) : (
                  <View style={[styles.confirmBtn, { backgroundColor: COLORS.red }]}>
                    <Text style={styles.confirmBtnText}>Reject</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* From / To date picker */}
      <Modal visible={!!picking} transparent animationType="fade" onRequestClose={() => setPicking(null)}>
        <View style={styles.overlayCenter}>
          <View style={styles.calCard}>
            <Text style={styles.sheetTitle}>Select {picking === 'from' ? 'from' : 'to'} date</Text>
            <Calendar
              current={pickedDate || todayYMD()}
              minDate={picking === 'to' ? (from || undefined) : undefined}
              maxDate={picking === 'from' ? (to || undefined) : undefined}
              onDayPress={(d) => pickDay(d.dateString)}
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
        </View>
      </Modal>

      {/* Full-screen bill viewer */}
      <Modal visible={!!viewBill} transparent animationType="fade" onRequestClose={() => setViewBill(null)}>
        <View style={styles.viewer}>
          <TouchableOpacity style={styles.viewerClose} onPress={() => setViewBill(null)}>
            <MaterialIcons name="close" size={26} color="#fff" />
          </TouchableOpacity>
          {viewBill && <Image source={{ uri: viewBill }} style={styles.viewerImg} resizeMode="contain" />}
        </View>
      </Modal>

      <BottomNav navigation={navigation} active={null} />
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
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#E0E7FF', justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: COLORS.primary, fontWeight: '800', fontSize: 13 },
  name: { fontSize: 14, fontWeight: '800', color: COLORS.ink },
  userSub: { fontSize: 11.5, color: COLORS.faint, marginTop: 1 },

  typeRow: { flexDirection: 'row', marginTop: 12 },
  bodyRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 10 },
  thumb: { width: 60, height: 60, borderRadius: 10, backgroundColor: COLORS.field },
  billStrip: { marginTop: 10 },
  pdfThumb: { backgroundColor: COLORS.redSoft, justifyContent: 'center', alignItems: 'center', gap: 2 },
  pdfThumbText: { fontSize: 9, fontWeight: '800', color: COLORS.red, letterSpacing: 0.2 },
  details: { flex: 1, fontSize: 12.5, color: '#374151', lineHeight: 18 },
  reviewLine: { fontSize: 11.5, color: COLORS.faint, fontWeight: '600', marginTop: 8 },

  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  actBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 46, borderRadius: RADIUS.button },
  rejectBtn: { flex: 1, borderWidth: 1.5, borderColor: '#FCA5A5', backgroundColor: '#FEF2F2' },
  actText: { fontSize: 13.5, fontWeight: '800' },

  /* employee picker */
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

  /* decision card */
  overlayCenter: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'center', padding: 20 },
  calCard: { backgroundColor: COLORS.card, borderRadius: RADIUS.sheet, padding: 16 },
  confirmCard: { backgroundColor: COLORS.card, borderRadius: RADIUS.sheet, padding: 18 },
  confirmText: { fontSize: 13.5, color: '#374151', textAlign: 'center', lineHeight: 19 },
  fieldLabel: { fontSize: 10.5, fontWeight: '800', color: COLORS.faint, letterSpacing: 0.6, marginTop: 14, marginBottom: 8 },
  noteInput: {
    backgroundColor: COLORS.field, borderWidth: 1.5, borderColor: COLORS.line, borderRadius: RADIUS.input,
    padding: 12, fontSize: 14, color: COLORS.ink, minHeight: 64, textAlignVertical: 'top',
  },
  cancelBtn: {
    flex: 1, height: 50, borderRadius: 13, borderWidth: 1.5, borderColor: COLORS.line,
    justifyContent: 'center', alignItems: 'center', marginTop: 10,
  },
  cancelBtnText: { color: '#374151', fontWeight: '700' },
  confirmBtn: { height: 50, borderRadius: 13, justifyContent: 'center', alignItems: 'center' },
  confirmBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },

  /* full-screen bill viewer */
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center' },
  viewerClose: {
    position: 'absolute', top: 48, right: 20, zIndex: 2, width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center',
  },
  viewerImg: { width: '100%', height: '80%' },
});
