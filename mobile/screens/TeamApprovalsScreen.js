import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, Linking,
  ActivityIndicator, RefreshControl, Modal, TextInput, Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { api, fileUrl } from '../lib/api';
import { GradientHeader, BottomNav, Card, Chip, ManagerStage, PrimaryButton, SheetOverlay } from '../components/ui';
import { COLORS, RADIUS } from '../lib/theme';

/* Reporting-manager inbox: the FIRST approval for every request type raised by
 * the manager's direct reports. Approving passes it to the admin for the final
 * decision; rejecting closes it. */

const KIND_STYLE = {
  leave: { icon: 'beach-access', c: COLORS.purple, soft: COLORS.purpleSoft, label: 'Leave' },
  ot: { icon: 'more-time', c: COLORS.primary, soft: COLORS.indigoSoft, label: 'Overtime' },
  compoff: { icon: 'redeem', c: COLORS.teal, soft: COLORS.tealSoft, label: 'Comp-off' },
  expense: { icon: 'receipt-long', c: COLORS.orange, soft: COLORS.orangeSoft, label: 'Expense' },
  correction: { icon: 'edit-calendar', c: COLORS.red, soft: COLORS.redSoft, label: 'Correction' },
};
const KIND_FILTERS = ['all', 'leave', 'ot', 'compoff', 'expense', 'correction'];
const STATUS_STYLE = {
  pending: { c: COLORS.orange, soft: COLORS.orangeSoft, label: 'Pending' },
  approved: { c: COLORS.green, soft: COLORS.greenSoft, label: 'Approved' },
  rejected: { c: COLORS.red, soft: COLORS.redSoft, label: 'Rejected' },
  cancelled: { c: COLORS.sub, soft: '#F3F4F6', label: 'Cancelled' },
  revoked: { c: COLORS.sub, soft: '#F3F4F6', label: 'Revoked' },
};
const isImage = (p) => /\.(jpe?g|png|webp|heic|gif)$/i.test(p || '');
const fmtWhen = (iso) => new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'Asia/Kolkata' });

export default function TeamApprovalsScreen({ navigation }) {
  const [view, setView] = useState('pending'); // 'pending' | 'done'
  const [kind, setKind] = useState('all');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [deciding, setDeciding] = useState(null); // { item, decision }
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await api(`/team/approvals?view=${view}`);
      setItems(res.items || []);
    } catch (e) {
      setItems([]);
      setError(e.message || 'Could not load approvals');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [view]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  const shown = kind === 'all' ? items : items.filter((i) => i.kind === kind);
  const countOf = (k) => (k === 'all' ? items.length : items.filter((i) => i.kind === k).length);

  const openDecision = (item, decision) => { setNote(''); setDeciding({ item, decision }); };

  const submit = async () => {
    const { item, decision } = deciding;
    setBusy(true);
    try {
      await api(`/team/approvals/${item.kind}/${item.id}`, {
        method: 'POST',
        body: JSON.stringify({ decision, note: note.trim() }),
      });
      setDeciding(null);
      // Drop it from the pending list right away; the server is the truth on refresh.
      setItems((prev) => prev.filter((i) => !(i.kind === item.kind && i.id === item.id)));
    } catch (e) {
      Alert.alert('Could not save', e.message);
      load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <GradientHeader
        title="Team Approvals"
        subtitle="First approval for your direct reports"
        onBack={() => navigation.goBack()}
      >
        <View style={styles.segment}>
          {[['pending', 'Waiting for me'], ['done', 'My decisions']].map(([v, label]) => (
            <TouchableOpacity key={v} style={[styles.segBtn, view === v && styles.segBtnOn]} onPress={() => setView(v)}>
              <Text style={[styles.segText, view === v && styles.segTextOn]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </GradientHeader>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.kindBar} contentContainerStyle={styles.kindRow}>
        {KIND_FILTERS.map((k) => {
          const on = kind === k;
          const n = countOf(k);
          return (
            <TouchableOpacity key={k} style={[styles.kindChip, on && styles.kindChipOn]} onPress={() => setKind(k)}>
              <Text style={[styles.kindChipText, on && styles.kindChipTextOn]}>
                {k === 'all' ? 'All' : KIND_STYLE[k].label}{n ? ` · ${n}` : ''}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={{ flex: 1 }} />
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={[COLORS.primary]} />}
        >
          {error ? (
            <View style={styles.errorBox}>
              <MaterialIcons name="error-outline" size={18} color={COLORS.red} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {!error && shown.length === 0 && (
            <View style={styles.empty}>
              <MaterialIcons name={view === 'pending' ? 'task-alt' : 'history'} size={46} color="#CBD5E1" />
              <Text style={styles.emptyText}>
                {view === 'pending' ? 'Nothing waiting for your approval' : 'No decisions yet'}
              </Text>
            </View>
          )}

          {shown.map((it) => {
            const ks = KIND_STYLE[it.kind];
            const ss = STATUS_STYLE[it.status] || STATUS_STYLE.pending;
            return (
              <Card key={`${it.kind}-${it.id}`} style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={[styles.kindIcon, { backgroundColor: ks.soft }]}>
                    <MaterialIcons name={ks.icon} size={20} color={ks.c} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name} numberOfLines={1}>{it.user?.fullName || it.user?.username}</Text>
                    <Text style={styles.sub} numberOfLines={1}>
                      {ks.label} · raised {fmtWhen(it.createdAt)}
                    </Text>
                  </View>
                  {view === 'done' && <Chip text={ss.label} color={ss.c} soft={ss.soft} />}
                </View>

                <Text style={styles.title}>{it.title}</Text>
                {it.subtitle ? <Text style={styles.subtitle}>{it.subtitle}</Text> : null}
                {it.reason ? <Text style={styles.reason}>“{it.reason}”</Text> : null}

                {it.attachments?.length > 0 && (
                  <View style={styles.attachRow}>
                    {it.attachments.map((p) => (
                      <TouchableOpacity key={p} onPress={() => Linking.openURL(fileUrl(p))} style={styles.attach}>
                        {isImage(p)
                          ? <Image source={{ uri: fileUrl(p) }} style={styles.attachImg} />
                          : <MaterialIcons name="picture-as-pdf" size={26} color={COLORS.red} />}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {view === 'done' && <ManagerStage stage={it.managerStage} />}
                {view === 'done' && it.managerStage?.note ? (
                  <Text style={styles.reason}>Your note: {it.managerStage.note}</Text>
                ) : null}

                {view === 'pending' && (
                  <View style={styles.actions}>
                    <TouchableOpacity style={[styles.actBtn, styles.rejectBtn]} onPress={() => openDecision(it, 'rejected')}>
                      <MaterialIcons name="close" size={18} color={COLORS.red} />
                      <Text style={[styles.actText, { color: COLORS.red }]}>Reject</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.actBtn, styles.approveBtn]} onPress={() => openDecision(it, 'approved')}>
                      <MaterialIcons name="check" size={18} color="#fff" />
                      <Text style={[styles.actText, { color: '#fff' }]}>Approve</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </Card>
            );
          })}
        </ScrollView>
      )}

      <Modal visible={!!deciding} transparent animationType="slide" onRequestClose={() => !busy && setDeciding(null)}>
        <SheetOverlay>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>
              {deciding?.decision === 'approved' ? 'Approve request' : 'Reject request'}
            </Text>
            <Text style={styles.sheetSub}>
              {deciding?.item?.user?.fullName || deciding?.item?.user?.username} · {deciding?.item?.title}
            </Text>
            <Text style={styles.sheetHint}>
              {deciding?.decision === 'approved'
                ? 'It goes to the admin for the final approval.'
                : 'This closes the request — the employee sees your note.'}
            </Text>
            <TextInput
              style={styles.noteInput}
              placeholder={deciding?.decision === 'approved' ? 'Note for the admin (optional)' : 'Reason (shown to the employee)'}
              placeholderTextColor={COLORS.faint}
              value={note}
              onChangeText={setNote}
              multiline
              maxLength={500}
            />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setDeciding(null)} disabled={busy}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <PrimaryButton
                title={deciding?.decision === 'approved' ? 'Approve' : 'Reject'}
                style={{ flex: 1 }}
                busy={busy}
                colors={deciding?.decision === 'rejected' ? ['#F87171', COLORS.red] : undefined}
                onPress={submit}
              />
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
  segment: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 12, padding: 4, marginTop: 14 },
  segBtn: { flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: 'center' },
  segBtnOn: { backgroundColor: '#fff' },
  segText: { color: '#E0E7FF', fontWeight: '700', fontSize: 12 },
  segTextOn: { color: COLORS.primary },

  kindBar: { flexGrow: 0 },
  kindRow: { paddingHorizontal: 16, paddingTop: 12, gap: 8 },
  kindChip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16,
    backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.line,
  },
  kindChipOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  kindChipText: { fontSize: 12, fontWeight: '700', color: COLORS.sub },
  kindChipTextOn: { color: '#fff' },

  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.redSoft,
    borderRadius: RADIUS.input, padding: 12, marginBottom: 12,
  },
  errorText: { flex: 1, fontSize: 12.5, color: COLORS.red, fontWeight: '600' },
  empty: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyText: { color: COLORS.faint, fontSize: 13 },

  card: { padding: 14, marginBottom: 10 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  kindIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  name: { fontSize: 14, fontWeight: '800', color: COLORS.ink },
  sub: { fontSize: 11.5, color: COLORS.faint, marginTop: 1 },
  title: { fontSize: 14, fontWeight: '700', color: COLORS.ink, marginTop: 12 },
  subtitle: { fontSize: 12.5, color: '#374151', marginTop: 3 },
  reason: { fontSize: 12.5, color: COLORS.sub, marginTop: 8, fontStyle: 'italic' },
  attachRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  attach: {
    width: 56, height: 56, borderRadius: 10, backgroundColor: '#F3F4F6',
    justifyContent: 'center', alignItems: 'center', overflow: 'hidden',
  },
  attachImg: { width: 56, height: 56 },

  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  actBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 44, borderRadius: RADIUS.button },
  rejectBtn: { borderWidth: 1.5, borderColor: '#FCA5A5', backgroundColor: '#FEF2F2' },
  approveBtn: { backgroundColor: COLORS.green },
  actText: { fontSize: 13.5, fontWeight: '800' },

  sheet: {
    backgroundColor: COLORS.card, borderTopLeftRadius: RADIUS.sheet, borderTopRightRadius: RADIUS.sheet,
    padding: 18, paddingBottom: 26,
  },
  sheetHandle: { width: 42, height: 5, borderRadius: 3, backgroundColor: COLORS.line, alignSelf: 'center', marginBottom: 12 },
  sheetTitle: { fontSize: 16, fontWeight: '800', color: COLORS.ink, textAlign: 'center' },
  sheetSub: { fontSize: 12.5, color: COLORS.sub, textAlign: 'center', marginTop: 4 },
  sheetHint: { fontSize: 12, color: COLORS.faint, textAlign: 'center', marginTop: 8 },
  noteInput: {
    backgroundColor: COLORS.field, borderWidth: 1.5, borderColor: COLORS.line, borderRadius: RADIUS.input,
    paddingHorizontal: 12, paddingTop: 12, height: 90, textAlignVertical: 'top', fontSize: 14, color: COLORS.ink, marginTop: 14,
  },
  cancelBtn: {
    flex: 1, height: 52, borderRadius: RADIUS.button, borderWidth: 1.5,
    borderColor: COLORS.line, justifyContent: 'center', alignItems: 'center',
  },
  cancelText: { color: '#374151', fontWeight: '700' },
});
