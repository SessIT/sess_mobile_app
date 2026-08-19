import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Image,
  ActivityIndicator, RefreshControl, Modal, TextInput, Alert, Linking,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import { Calendar } from 'react-native-calendars';
import { File } from 'expo-file-system';
import { api, apiUpload, API_URL } from '../lib/api';
import { GradientHeader, BottomNav, Card, Chip, PrimaryButton } from '../components/ui';
import { COLORS, RADIUS } from '../lib/theme';
import { useKeyboard } from '../lib/useKeyboard';

const BASE = API_URL.replace('/api', '');

// Fallback list — the same six the client specified. /expenses/types is the
// source of truth so the set can grow server-side without a new build.
const EXPENSE_TYPES = ['Travel', 'Food & Meals', 'Office Supplies', 'Client Entertainment', 'Stationery', 'Other'];
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

const MAX_DETAILS = 500;
const MAX_BILL_BYTES = 5 * 1024 * 1024;
// One claim may carry several bills — the server caps it at the same number.
const MAX_BILLS = 5;

const todayYMD = () => new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
const shortDate = (ymd) =>
  new Date(ymd + 'T00:00:00.000Z').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'UTC' });

// Rows carry `bills` now; `billPath` is still read so an older payload renders.
const billsOf = (r) => (Array.isArray(r.bills) && r.bills.length ? r.bills : [r.billPath].filter(Boolean));

const STATUS_STYLE = {
  pending: { c: COLORS.orange, bg: COLORS.orangeSoft, label: 'Pending' },
  approved: { c: COLORS.green, bg: COLORS.greenSoft, label: 'Approved' },
  rejected: { c: COLORS.red, bg: COLORS.redSoft, label: 'Rejected' },
  cancelled: { c: COLORS.sub, bg: '#F3F4F6', label: 'Cancelled' },
};

// createdAt is a real timestamp, so it renders in the business timezone.
const prettyDate = (iso) =>
  new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

export default function ExpenseScreen({ navigation }) {
  const [data, setData] = useState(null);
  const [types, setTypes] = useState(EXPENSE_TYPES);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [viewBill, setViewBill] = useState(null); // full-screen bill URL
  // Day-wise window, the same shape Leave Management uses. Either bound alone
  // is valid — the server leaves the other side open.
  const [from, setFrom] = useState(null);
  const [to, setTo] = useState(null);
  const [picking, setPicking] = useState(null); // 'from' | 'to' | null

  const load = useCallback(async () => {
    try {
      const qs = [];
      if (from) qs.push(`from=${from}`);
      if (to) qs.push(`to=${to}`);
      setData(await api(`/expenses/my${qs.length ? `?${qs.join('&')}` : ''}`));
    } catch (e) { Alert.alert('Error', e.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, [from, to]);

  useEffect(() => {
    load();
    return navigation.addListener('focus', load);
  }, [navigation, load]);

  useEffect(() => {
    api('/expenses/types')
      .then((list) => { if (Array.isArray(list) && list.length) setTypes(list); })
      .catch(() => { /* the hardcoded fallback keeps the form usable */ });
  }, []);

  // The in-app viewer only knows how to draw images, so a PDF bill is handed to
  // whatever the phone uses to read PDFs.
  const openBill = (billPath) => {
    const url = `${BASE}/${billPath}`;
    if (isPdfBill(billPath)) {
      Linking.openURL(url).catch(() => Alert.alert('Cannot open', 'No app on this phone can open a PDF bill.'));
      return;
    }
    setViewBill(url);
  };

  const cancel = (r) => {
    Alert.alert('Cancel expense', `Withdraw your ${r.type} expense submitted on ${prettyDate(r.createdAt)}?`, [
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes, cancel', style: 'destructive',
        onPress: async () => {
          try { await api(`/expenses/${r.id}`, { method: 'DELETE' }); load(); }
          catch (e) { Alert.alert('Failed', e.message); }
        },
      },
    ]);
  };

  const totals = data?.totals || { pending: 0, approved: 0 };
  const requests = data?.requests || [];
  const pickedDate = picking === 'from' ? from : to;
  const periodLabel = from || to
    ? `${from ? shortDate(from) : 'Any'} → ${to ? shortDate(to) : 'Any'}`
    : 'All time';

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <GradientHeader
        title="My Expenses"
        subtitle={`${periodLabel} • ${totals.pending} pending • ${totals.approved} approved`}
        onBack={() => navigation.goBack()}
      >
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

        {(from || to) ? (
          <View style={styles.clearRow}>
            <TouchableOpacity style={styles.clearBtn} onPress={() => { setFrom(null); setTo(null); }}>
              <MaterialIcons name="close" size={13} color="#C7D2FE" />
              <Text style={styles.clearText}>Clear dates</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </GradientHeader>

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={{ flex: 1 }} />
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        >
          <View style={styles.balRow}>
            <Card style={styles.balCard}>
              <View style={[styles.balTag, { backgroundColor: COLORS.orangeSoft }]}>
                <MaterialIcons name="hourglass-top" size={13} color={COLORS.orange} />
                <Text style={[styles.balTagText, { color: COLORS.orange }]}>PENDING</Text>
              </View>
              <Text style={styles.balValue}>{totals.pending}</Text>
              <Text style={styles.balSub}>awaiting approval</Text>
            </Card>
            <Card style={styles.balCard}>
              <View style={[styles.balTag, { backgroundColor: COLORS.greenSoft }]}>
                <MaterialIcons name="verified" size={13} color={COLORS.green} />
                <Text style={[styles.balTagText, { color: COLORS.green }]}>APPROVED</Text>
              </View>
              <Text style={styles.balValue}>{totals.approved}</Text>
              <Text style={styles.balSub}>expenses cleared</Text>
            </Card>
          </View>

          <PrimaryButton
            title="Add Expense"
            icon="receipt-long"
            onPress={() => setAddOpen(true)}
            style={{ marginBottom: 20 }}
          />

          <Text style={styles.sectionTitle}>My Submissions</Text>
          {requests.length === 0 ? (
            <View style={styles.empty}>
              <MaterialIcons name="receipt-long" size={44} color="#CBD5E1" />
              <Text style={styles.emptyText}>No expenses submitted yet</Text>
            </View>
          ) : (
            requests.map((r) => {
              const st = STATUS_STYLE[r.status] || STATUS_STYLE.cancelled;
              return (
                <Card key={r.id} style={styles.reqCard}>
                  <View style={styles.reqTop}>
                    <View style={[styles.reqIcon, { backgroundColor: st.bg }]}>
                      <MaterialIcons name={iconFor(r.type)} size={20} color={st.c} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.reqType}>{r.type}</Text>
                      <Text style={styles.reqDate}>{prettyDate(r.createdAt)}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 6 }}>
                      <Chip text={st.label} color={st.c} soft={st.bg} />
                      {r.status === 'pending' && (
                        <TouchableOpacity onPress={() => cancel(r)}>
                          <Text style={styles.cancelLink}>Cancel</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>

                  <View style={styles.reqBody}>
                    <Text style={styles.reqDetails} numberOfLines={2}>{r.details}</Text>
                  </View>

                  {/* Every attachment on the claim, each opening on its own. */}
                  {billsOf(r).length > 0 ? (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.billStrip}>
                      {billsOf(r).map((b) => (
                        <TouchableOpacity key={b} activeOpacity={0.9} onPress={() => openBill(b)} style={{ marginRight: 8 }}>
                          {isPdfBill(b) ? (
                            <View style={[styles.thumb, styles.pdfThumb]}>
                              <MaterialIcons name="picture-as-pdf" size={20} color={COLORS.red} />
                              <Text style={styles.pdfThumbText}>PDF bill</Text>
                            </View>
                          ) : (
                            <Image source={{ uri: `${BASE}/${b}` }} style={styles.thumb} resizeMode="cover" />
                          )}
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  ) : null}

                  {r.reviewNote ? (
                    <Text style={[styles.reviewNote, r.status === 'rejected' && { color: COLORS.red }]}>
                      Admin: {r.reviewNote}
                    </Text>
                  ) : null}
                </Card>
              );
            })
          )}
        </ScrollView>
      )}

      <AddExpenseModal
        visible={addOpen}
        types={types}
        onClose={() => setAddOpen(false)}
        onDone={() => { setAddOpen(false); load(); }}
      />

      {/* Full-screen bill viewer */}
      <Modal visible={!!viewBill} transparent animationType="fade" onRequestClose={() => setViewBill(null)}>
        <View style={styles.viewer}>
          <TouchableOpacity style={styles.viewerClose} onPress={() => setViewBill(null)}>
            <MaterialIcons name="close" size={26} color="#fff" />
          </TouchableOpacity>
          {viewBill && <Image source={{ uri: viewBill }} style={styles.viewerImg} resizeMode="contain" />}
        </View>
      </Modal>

      {/* From / To date picker — same flow as Leave Management */}
      <Modal visible={!!picking} transparent animationType="fade" onRequestClose={() => setPicking(null)}>
        <View style={styles.overlayCenter}>
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
        </View>
      </Modal>

      <BottomNav navigation={navigation} active="profile" />
    </View>
  );
}

/* ---------------- Add expense sheet ---------------- */
function AddExpenseModal({ visible, types, onClose, onDone }) {
  const [type, setType] = useState('');
  const [details, setDetails] = useState('');
  // A claim can carry up to MAX_BILLS attachments: [{ path, uri, name }].
  // `path` is what the API stores.
  const [bills, setBills] = useState([]);
  const [typeOpen, setTypeOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});
  // The sheet is pinned to the bottom edge, so it takes the same spacing rule as
  // the chat/notes composers — see lib/useKeyboard. It is sized by its content
  // up to the cap in styles.sheet; the form scrolls inside whatever is left, so
  // the buttons always sit directly under the form with no dead space, however
  // many bills are attached and whether or not the IME is up.
  const kb = useKeyboard();

  useEffect(() => {
    if (visible) {
      setType('');
      setDetails('');
      setBills([]);
      setTypeOpen(false);
      setUploading(false);
      setBusy(false);
      setErrors({});
    }
  }, [visible]);

  // Bills upload the moment they are picked, so Submit only ever posts paths.
  // The gallery allows a multi-select; the camera adds one shot at a time.
  const pick = async (fromCamera) => {
    if (uploading || busy) return;
    const room = MAX_BILLS - bills.length;
    if (room <= 0) {
      Alert.alert('Limit reached', `A claim can carry at most ${MAX_BILLS} bills.`);
      return;
    }
    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', `Allow ${fromCamera ? 'camera' : 'gallery'} access to attach the bill.`);
      return;
    }
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'], quality: 0.7, allowsMultipleSelection: true, selectionLimit: room,
        });
    if (result.canceled || !result.assets?.length) return;

    // Anything past the remaining room is dropped rather than silently failing
    // the whole upload on the server's cap.
    const picked = result.assets.slice(0, room);
    const tooBig = picked.filter((a) => a.fileSize && a.fileSize > MAX_BILL_BYTES);
    const ok = picked.filter((a) => !(a.fileSize && a.fileSize > MAX_BILL_BYTES));
    if (tooBig.length) Alert.alert('Too large', `${tooBig.length} file(s) over 5 MB were skipped.`);
    if (!ok.length) return;

    setUploading(true);
    setErrors((e) => ({ ...e, bill: null }));
    try {
      // SDK 57: the WinterCG fetch only accepts real Blob/File parts — the
      // expo-file-system File class wraps the picked URI as a proper Blob.
      // The field repeats, which is what upload.array('file') expects.
      const form = new FormData();
      for (const a of ok) form.append('file', new File(a.uri), a.fileName || 'bill.jpg');
      const up = await apiUpload('/expenses/upload', form);
      const paths = up.paths || (up.path ? [up.path] : []);
      setBills((prev) => [
        ...prev,
        ...paths.map((path, i) => ({ path, uri: ok[i]?.uri, name: ok[i]?.fileName || 'bill.jpg' })),
      ]);
    } catch (e) {
      Alert.alert('Upload failed', e.message);
    } finally {
      setUploading(false);
    }
  };

  const removeBill = (path) => setBills((prev) => prev.filter((b) => b.path !== path));

  const attach = () => {
    Alert.alert('Attach bill / proof', 'Add photos of the bills', [
      { text: 'Take photo', onPress: () => pick(true) },
      { text: 'Choose from gallery', onPress: () => pick(false) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const submit = async () => {
    const next = {};
    if (!type) next.type = 'Select an expense type.';
    if (!details.trim()) next.details = 'Enter the expense details.';
    else if (details.trim().length > MAX_DETAILS) next.details = `Keep the details under ${MAX_DETAILS} characters.`;
    if (!bills.length) next.bill = 'Attach at least one bill or proof.';
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    try {
      await api('/expenses', {
        method: 'POST',
        body: JSON.stringify({ type, details: details.trim(), bills: bills.map((b) => b.path) }),
      });
      Alert.alert('Submitted ✅', 'Your expense has been sent for approval.');
      onDone();
    } catch (e) {
      Alert.alert('Could not submit', e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetOverlay} onLayout={kb.onLayout}>
        <View style={[styles.sheet, kb.visible && { paddingBottom: 26 + kb.lift }]}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Add Expense</Text>

          {/* The form gives up height to the keyboard so the Submit row stays on screen. */}
          <ScrollView keyboardShouldPersistTaps="handled" style={{ flexShrink: 1 }}>
            <Text style={styles.fieldLabel}>ADD EXPENSE *</Text>
            <TouchableOpacity style={[styles.dropField, errors.type && styles.fieldBad]} onPress={() => setTypeOpen(true)}>
              <MaterialIcons
                name={type ? iconFor(type) : 'category'}
                size={18}
                color={type ? COLORS.primary : COLORS.faint}
              />
              <Text style={[styles.dropValue, !type && { color: COLORS.faint }]}>{type || 'Select Expense'}</Text>
              <MaterialIcons name="expand-more" size={22} color={COLORS.faint} style={{ marginLeft: 'auto' }} />
            </TouchableOpacity>
            {errors.type ? <Text style={styles.fieldError}>{errors.type}</Text> : null}

            <Text style={styles.fieldLabel}>EXPENSE DETAILS *</Text>
            <View>
              <TextInput
                style={[styles.detailsInput, errors.details && styles.fieldBad]}
                placeholder="Enter expense details (e.g. Travel to client meeting, Stationery, etc.)"
                placeholderTextColor={COLORS.faint}
                value={details}
                onChangeText={(t) => {
                  setDetails(t);
                  if (errors.details) setErrors((e) => ({ ...e, details: null }));
                }}
                multiline
                maxLength={MAX_DETAILS}
              />
              <Text style={styles.counter}>{details.length}/{MAX_DETAILS}</Text>
            </View>
            {errors.details ? <Text style={styles.fieldError}>{errors.details}</Text> : null}

            <Text style={styles.fieldLabel}>ATTACH BILLS / PROOF * ({bills.length}/{MAX_BILLS})</Text>
            {bills.map((b) => (
              <View key={b.path} style={[styles.billRow, { marginBottom: 8 }]}>
                <Image source={{ uri: b.uri }} style={styles.billThumb} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.billName} numberOfLines={1}>{b.name}</Text>
                  <Text style={styles.billOk}>Uploaded ✓</Text>
                </View>
                <TouchableOpacity style={styles.billDelete} onPress={() => removeBill(b.path)} disabled={busy}>
                  <MaterialIcons name="delete-outline" size={20} color={COLORS.red} />
                </TouchableOpacity>
              </View>
            ))}
            {bills.length < MAX_BILLS ? (
              <TouchableOpacity
                style={[styles.uploadTile, errors.bill && styles.fieldBad]}
                onPress={attach}
                disabled={uploading}
                activeOpacity={0.85}
              >
                {uploading ? (
                  <>
                    <ActivityIndicator color={COLORS.primary} />
                    <Text style={styles.uploadHint}>Uploading…</Text>
                  </>
                ) : (
                  <>
                    <View style={styles.uploadIcon}>
                      <MaterialIcons name="cloud-upload" size={22} color={COLORS.primary} />
                    </View>
                    <Text style={styles.uploadTitle}>
                      {bills.length ? 'Add another bill' : 'Tap to attach the bill'}
                    </Text>
                    <Text style={styles.uploadHint}>JPG or PNG · max 5 MB each · up to {MAX_BILLS}</Text>
                  </>
                )}
              </TouchableOpacity>
            ) : null}
            {errors.bill ? <Text style={styles.fieldError}>{errors.bill}</Text> : null}
          </ScrollView>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={busy}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.submitBtn, (busy || uploading) && { opacity: 0.5 }]}
              onPress={submit}
              disabled={busy || uploading}
            >
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>Submit</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Expense type dropdown */}
      <Modal visible={typeOpen} transparent animationType="fade" onRequestClose={() => setTypeOpen(false)}>
        <View style={styles.overlayCenter}>
          <View style={styles.pickCard}>
            <Text style={styles.sheetTitle}>Select Expense</Text>
            {types.map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.typeRow, type === t && styles.typeRowOn]}
                onPress={() => { setType(t); setTypeOpen(false); setErrors((e) => ({ ...e, type: null })); }}
              >
                <View style={styles.typeIcon}>
                  <MaterialIcons name={iconFor(t)} size={18} color={COLORS.primary} />
                </View>
                <Text style={styles.typeName}>{t}</Text>
                {type === t && <MaterialIcons name="check-circle" size={20} color={COLORS.green} style={{ marginLeft: 'auto' }} />}
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.sheetClose} onPress={() => setTypeOpen(false)}>
              <Text style={styles.sheetCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },

  /* header date filters — mirrors LeaveApprovalsScreen */
  filterRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  filterField: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 11, paddingHorizontal: 10, paddingVertical: 9,
  },
  filterText: { flex: 1, color: '#fff', fontSize: 12.5, fontWeight: '700' },
  clearRow: { alignItems: 'flex-end', marginTop: 6 },
  clearBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: 2, paddingHorizontal: 4 },
  clearText: { color: '#C7D2FE', fontSize: 11.5, fontWeight: '700' },
  calCard: { backgroundColor: COLORS.card, borderRadius: RADIUS.sheet, padding: 16 },

  balRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  balCard: { flex: 1, padding: 14 },
  balTag: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  balTagText: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.4 },
  balValue: { fontSize: 26, fontWeight: '800', color: COLORS.ink, marginTop: 8 },
  balSub: { fontSize: 11, color: COLORS.faint, fontWeight: '600' },

  sectionTitle: { fontSize: 15, fontWeight: '800', color: COLORS.ink, marginBottom: 10, marginTop: 4 },

  empty: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyText: { color: COLORS.faint, fontSize: 13 },

  reqCard: { padding: 14, marginBottom: 10 },
  reqTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  reqIcon: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  reqType: { fontSize: 14, fontWeight: '800', color: COLORS.ink },
  reqDate: { fontSize: 12, color: COLORS.sub, fontWeight: '700', marginTop: 2 },
  cancelLink: { fontSize: 12, color: COLORS.red, fontWeight: '700' },
  reqBody: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 12 },
  thumb: { width: 56, height: 56, borderRadius: 10, backgroundColor: COLORS.field },
  pdfThumb: { backgroundColor: COLORS.redSoft, justifyContent: 'center', alignItems: 'center', gap: 2 },
  pdfThumbText: { fontSize: 8.5, fontWeight: '800', color: COLORS.red, letterSpacing: 0.2 },
  reqDetails: { flex: 1, fontSize: 12.5, color: '#374151', lineHeight: 18 },
  billStrip: { marginTop: 10 },
  reviewNote: { fontSize: 11.5, color: COLORS.faint, marginTop: 8, fontWeight: '600' },

  /* add-expense sheet */
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: COLORS.card, borderTopLeftRadius: RADIUS.sheet, borderTopRightRadius: RADIUS.sheet,
    padding: 18, paddingBottom: 26,
    // Never taller than the overlay it sits in — the form scrolls instead. A
    // fixed pixel cap cannot do this: it is wrong on a short phone and leaves
    // the sheet floating short of the top on a tall one.
    maxHeight: '92%',
  },
  sheetHandle: { width: 42, height: 5, borderRadius: 3, backgroundColor: COLORS.line, alignSelf: 'center', marginBottom: 12 },
  sheetTitle: { fontSize: 16, fontWeight: '800', color: COLORS.ink, marginBottom: 12, textAlign: 'center' },
  fieldLabel: { fontSize: 10.5, fontWeight: '800', color: COLORS.faint, letterSpacing: 0.6, marginTop: 12, marginBottom: 8 },
  fieldBad: { borderColor: '#FCA5A5' },
  fieldError: { color: COLORS.red, fontSize: 11.5, marginTop: 4, marginLeft: 4 },

  dropField: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.field, borderWidth: 1.5, borderColor: COLORS.line,
    borderRadius: RADIUS.input, padding: 13,
  },
  dropValue: { fontSize: 14, fontWeight: '700', color: COLORS.ink },

  detailsInput: {
    backgroundColor: COLORS.field, borderWidth: 1.5, borderColor: COLORS.line, borderRadius: RADIUS.input,
    padding: 12, paddingBottom: 26, fontSize: 14, color: COLORS.ink, minHeight: 92, textAlignVertical: 'top',
  },
  counter: { position: 'absolute', right: 12, bottom: 8, fontSize: 10.5, color: COLORS.faint, fontWeight: '700' },

  uploadTile: {
    alignItems: 'center', justifyContent: 'center', gap: 5,
    backgroundColor: COLORS.field, borderWidth: 1.5, borderColor: COLORS.line,
    borderStyle: 'dashed', borderRadius: RADIUS.input, paddingVertical: 22,
  },
  uploadIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.indigoSoft, justifyContent: 'center', alignItems: 'center', marginBottom: 3 },
  uploadTitle: { fontSize: 13.5, fontWeight: '800', color: COLORS.ink },
  uploadHint: { fontSize: 11.5, color: COLORS.faint, fontWeight: '600' },

  billRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.field, borderWidth: 1.5, borderColor: COLORS.line,
    borderRadius: RADIUS.input, padding: 10,
  },
  billThumb: { width: 44, height: 44, borderRadius: 10, backgroundColor: COLORS.line },
  billName: { fontSize: 13, fontWeight: '700', color: COLORS.ink },
  billOk: { fontSize: 11, color: COLORS.green, fontWeight: '700', marginTop: 2 },
  billDelete: { width: 36, height: 36, borderRadius: 10, backgroundColor: COLORS.redSoft, justifyContent: 'center', alignItems: 'center' },

  cancelBtn: {
    flex: 1, height: 50, borderRadius: 13, borderWidth: 1.5, borderColor: COLORS.line,
    justifyContent: 'center', alignItems: 'center', marginTop: 10,
  },
  cancelBtnText: { color: '#374151', fontWeight: '700' },
  submitBtn: { flex: 1, height: 50, borderRadius: 13, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center', marginTop: 10 },
  submitBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },

  /* type picker */
  overlayCenter: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'center', padding: 20 },
  pickCard: { backgroundColor: COLORS.card, borderRadius: RADIUS.sheet, padding: 16 },
  typeRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 12 },
  typeRowOn: { backgroundColor: COLORS.indigoSoft },
  typeIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: COLORS.indigoSoft, justifyContent: 'center', alignItems: 'center' },
  typeName: { fontSize: 14, fontWeight: '700', color: COLORS.ink },
  sheetClose: {
    marginTop: 10, height: 52, borderRadius: RADIUS.button, borderWidth: 1.5,
    borderColor: COLORS.line, justifyContent: 'center', alignItems: 'center',
  },
  sheetCloseText: { color: '#374151', fontWeight: '700' },

  /* full-screen bill viewer */
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center' },
  viewerClose: {
    position: 'absolute', top: 48, right: 20, zIndex: 2, width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center',
  },
  viewerImg: { width: '100%', height: '80%' },
});
