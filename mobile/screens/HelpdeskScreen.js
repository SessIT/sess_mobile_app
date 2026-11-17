import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, RefreshControl, Modal, TextInput, Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { api } from '../lib/api';
import { GradientHeader, BottomNav, Card, Chip, PrimaryButton, SheetOverlay } from '../components/ui';
import { COLORS, RADIUS } from '../lib/theme';

/* HR helpdesk — ask HR anything (payslip query, letter request, policy…) and
 * follow the reply thread. */
const STATUS = {
  open: ['Open', COLORS.orange, COLORS.orangeSoft], in_progress: ['In progress', COLORS.primary, COLORS.indigoSoft],
  resolved: ['Resolved', COLORS.green, COLORS.greenSoft], closed: ['Closed', COLORS.sub, '#F3F4F6'],
};
const when = (iso) => new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function HelpdeskScreen({ navigation }) {
  const [tickets, setTickets] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [cats, setCats] = useState([]);
  const [composing, setComposing] = useState(false);
  const [form, setForm] = useState({ category: '', subject: '', body: '' });
  const [busy, setBusy] = useState(false);
  const [thread, setThread] = useState(null); // { ticket, messages }
  const [reply, setReply] = useState('');

  const load = useCallback(async () => {
    try { setTickets((await api('/helpdesk/my')).tickets || []); } catch { setTickets((p) => p ?? []); }
    finally { setRefreshing(false); }
  }, []);
  useEffect(() => { load(); api('/helpdesk/categories').then(setCats).catch(() => {}); }, [load]);

  const submit = async () => {
    if (!form.category || !form.subject.trim() || !form.body.trim()) { Alert.alert('Missing details', 'Pick a category and fill in the subject and details.'); return; }
    setBusy(true);
    try {
      await api('/helpdesk', { method: 'POST', body: JSON.stringify(form) });
      setComposing(false); setForm({ category: '', subject: '', body: '' }); load();
    } catch (e) { Alert.alert('Could not send', e.message); } finally { setBusy(false); }
  };

  const openThread = async (id) => {
    try { setThread(await api(`/helpdesk/${id}`)); setReply(''); } catch (e) { Alert.alert('Error', e.message); }
  };
  const sendReply = async () => {
    if (!reply.trim()) return;
    setBusy(true);
    try {
      await api(`/helpdesk/${thread.ticket.id}/messages`, { method: 'POST', body: JSON.stringify({ body: reply }) });
      await openThread(thread.ticket.id); load();
    } catch (e) { Alert.alert('Could not send', e.message); } finally { setBusy(false); }
  };
  const closeTicket = async () => {
    try { await api(`/helpdesk/${thread.ticket.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'closed' }) }); setThread(null); load(); }
    catch (e) { Alert.alert('Error', e.message); }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <GradientHeader title="HR Helpdesk" subtitle="Questions & requests to HR" onBack={() => navigation.goBack()} />
      {tickets === null ? <ActivityIndicator size="large" color={COLORS.primary} style={{ flex: 1 }} /> : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={[COLORS.primary]} />}>
          <PrimaryButton title="Ask HR" icon="add-comment" onPress={() => setComposing(true)} style={{ marginBottom: 14 }} />
          {tickets.length === 0 && <Text style={styles.empty}>No requests yet. Payslip doubts, letters, policies — ask here.</Text>}
          {tickets.map((t) => {
            const [label, c, soft] = STATUS[t.status] || STATUS.open;
            return (
              <TouchableOpacity key={t.id} activeOpacity={0.85} onPress={() => openThread(t.id)}>
                <Card style={styles.card}>
                  <View style={styles.row}>
                    <Text style={styles.subject} numberOfLines={1}>{t.subject}</Text>
                    <Chip text={label} color={c} soft={soft} />
                  </View>
                  <Text style={styles.meta}>{t.category} · {when(t.updatedAt)}</Text>
                  {t.lastMessage && <Text style={styles.preview} numberOfLines={2}>{t.lastMessage.fromHR ? 'HR: ' : 'You: '}{t.lastMessage.body}</Text>}
                </Card>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* New request */}
      <Modal visible={composing} transparent animationType="slide" onRequestClose={() => setComposing(false)}>
        <SheetOverlay>
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>Ask HR</Text>
            <Text style={styles.label}>CATEGORY</Text>
            <View style={styles.cats}>
              {cats.map((c) => (
                <TouchableOpacity key={c} onPress={() => setForm((f) => ({ ...f, category: c }))}
                  style={[styles.cat, form.category === c && styles.catOn]}>
                  <Text style={[styles.catText, form.category === c && { color: '#fff' }]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.label}>SUBJECT</Text>
            <TextInput style={styles.input} value={form.subject} maxLength={120} placeholder="e.g. Need a salary certificate"
              placeholderTextColor={COLORS.faint} onChangeText={(t) => setForm((f) => ({ ...f, subject: t }))} />
            <Text style={styles.label}>DETAILS</Text>
            <TextInput style={[styles.input, { height: 100, textAlignVertical: 'top', paddingTop: 10 }]} multiline maxLength={3000}
              value={form.body} placeholder="Explain what you need" placeholderTextColor={COLORS.faint}
              onChangeText={(t) => setForm((f) => ({ ...f, body: t }))} />
            <PrimaryButton title="Send to HR" icon="send" busy={busy} onPress={submit} style={{ marginTop: 14 }} />
            <TouchableOpacity style={styles.close} onPress={() => setComposing(false)}><Text style={styles.closeText}>Cancel</Text></TouchableOpacity>
          </View>
        </SheetOverlay>
      </Modal>

      {/* Thread */}
      <Modal visible={!!thread} transparent animationType="slide" onRequestClose={() => setThread(null)}>
        <SheetOverlay>
          <View style={[styles.sheet, { maxHeight: '92%' }]}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle} numberOfLines={2}>{thread?.ticket.subject}</Text>
            <Text style={[styles.meta, { textAlign: 'center' }]}>{thread?.ticket.category}</Text>
            <ScrollView style={{ maxHeight: 360, marginTop: 10 }}>
              {(thread?.messages || []).map((m) => (
                <View key={m.id} style={[styles.bubble, m.fromHR ? styles.bubbleHR : styles.bubbleMe]}>
                  <Text style={styles.bubbleText}>{m.body}</Text>
                  <Text style={styles.bubbleMeta}>{m.fromHR ? (m.author?.fullName || 'HR') : 'You'} · {when(m.createdAt)}</Text>
                </View>
              ))}
            </ScrollView>
            {thread?.ticket.status !== 'closed' && (
              <View style={styles.replyRow}>
                <TextInput style={[styles.input, { flex: 1 }]} value={reply} onChangeText={setReply} placeholder="Reply…" placeholderTextColor={COLORS.faint} multiline />
                <TouchableOpacity style={styles.sendBtn} onPress={sendReply} disabled={busy}>
                  {busy ? <ActivityIndicator color="#fff" size="small" /> : <MaterialIcons name="send" size={20} color="#fff" />}
                </TouchableOpacity>
              </View>
            )}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
              {thread && !['closed'].includes(thread.ticket.status) ? (
                <TouchableOpacity onPress={closeTicket}><Text style={[styles.closeText, { color: COLORS.green }]}>Mark as closed</Text></TouchableOpacity>
              ) : <View />}
              <TouchableOpacity onPress={() => setThread(null)}><Text style={styles.closeText}>Close</Text></TouchableOpacity>
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
  empty: { color: COLORS.faint, fontSize: 13, textAlign: 'center', marginTop: 20 },
  card: { padding: 14, marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  subject: { flex: 1, fontSize: 14.5, fontWeight: '800', color: COLORS.ink },
  meta: { fontSize: 11.5, color: COLORS.faint, marginTop: 3 },
  preview: { fontSize: 12.5, color: COLORS.sub, marginTop: 6 },
  sheet: { backgroundColor: COLORS.card, borderTopLeftRadius: RADIUS.sheet, borderTopRightRadius: RADIUS.sheet, padding: 18, paddingBottom: 26 },
  handle: { width: 42, height: 5, borderRadius: 3, backgroundColor: COLORS.line, alignSelf: 'center', marginBottom: 12 },
  sheetTitle: { fontSize: 16, fontWeight: '800', color: COLORS.ink, textAlign: 'center' },
  label: { fontSize: 10.5, fontWeight: '800', color: COLORS.faint, letterSpacing: 0.6, marginTop: 12, marginBottom: 6 },
  cats: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  cat: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.field },
  catOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  catText: { fontSize: 12, fontWeight: '700', color: COLORS.sub },
  input: {
    backgroundColor: COLORS.field, borderWidth: 1.5, borderColor: COLORS.line, borderRadius: RADIUS.input,
    paddingHorizontal: 12, minHeight: 46, fontSize: 14, color: COLORS.ink,
  },
  close: { alignItems: 'center', paddingVertical: 12 },
  closeText: { color: COLORS.sub, fontWeight: '700' },
  bubble: { borderRadius: 12, padding: 10, marginBottom: 8, maxWidth: '88%' },
  bubbleMe: { backgroundColor: COLORS.indigoSoft, alignSelf: 'flex-end' },
  bubbleHR: { backgroundColor: '#F3F4F6', alignSelf: 'flex-start' },
  bubbleText: { fontSize: 13.5, color: COLORS.ink },
  bubbleMeta: { fontSize: 10.5, color: COLORS.faint, marginTop: 4 },
  replyRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 10 },
  sendBtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center' },
});
