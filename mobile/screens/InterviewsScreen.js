import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, RefreshControl, Modal, TextInput, Alert, Linking,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { api, fileUrl } from '../lib/api';
import { GradientHeader, BottomNav, Card, Chip, PrimaryButton, SheetOverlay } from '../components/ui';
import { COLORS, RADIUS } from '../lib/theme';

/* Interviews HR scheduled me to take: see the candidate, open their resume,
 * and submit a rating + hire / hold / reject recommendation. */
const when = (iso) => new Date(iso).toLocaleString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const RECS = [['hire', 'Hire', COLORS.green], ['hold', 'Hold', COLORS.orange], ['reject', 'Reject', COLORS.red]];

export default function InterviewsScreen({ navigation }) {
  const [items, setItems] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [open, setOpen] = useState(null);
  const [rating, setRating] = useState(0);
  const [rec, setRec] = useState('');
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setItems((await api('/recruitment/interviews/my')).interviews || []); } catch { setItems((p) => p ?? []); }
    finally { setRefreshing(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const start = (iv) => { setOpen(iv); setRating(0); setRec(''); setFeedback(''); };
  const submit = async () => {
    if (!rating || !rec || !feedback.trim()) { Alert.alert('Incomplete', 'Give a rating, a recommendation and your feedback.'); return; }
    setBusy(true);
    try {
      await api(`/recruitment/interviews/${open.id}/feedback`, { method: 'POST', body: JSON.stringify({ rating, recommendation: rec, feedback }) });
      setOpen(null); load();
    } catch (e) { Alert.alert('Could not submit', e.message); } finally { setBusy(false); }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <GradientHeader title="My Interviews" subtitle="Candidates you're interviewing" onBack={() => navigation.goBack()} />
      {items === null ? <ActivityIndicator size="large" color={COLORS.primary} style={{ flex: 1 }} /> : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={[COLORS.primary]} />}>
          {items.length === 0 && <Text style={styles.empty}>No interviews assigned to you.</Text>}
          {items.map((iv) => (
            <Card key={iv.id} style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.name}>{iv.candidate.name}</Text>
                <Chip text={iv.status === 'done' ? 'Feedback given' : 'Scheduled'} color={iv.status === 'done' ? COLORS.green : COLORS.orange} soft={iv.status === 'done' ? COLORS.greenSoft : COLORS.orangeSoft} />
              </View>
              <Text style={styles.meta}>{iv.candidate.jobTitle}{iv.candidate.experienceYears != null ? ` · ${iv.candidate.experienceYears} yrs exp` : ''}</Text>
              <Text style={styles.when}>{iv.round} · {iv.mode} · {when(iv.scheduledAt)}</Text>
              {iv.feedback ? <Text style={styles.fb}>★ {iv.rating}/5 · {iv.recommendation?.toUpperCase()} — {iv.feedback}</Text> : null}
              <View style={styles.actions}>
                {iv.candidate.hasResume && (
                  <TouchableOpacity style={styles.ghost} onPress={() => Linking.openURL(fileUrl(`api/recruitment/candidates/${iv.candidate.id}/resume`)).catch(() => {})}>
                    <MaterialIcons name="description" size={17} color={COLORS.primary} /><Text style={styles.ghostText}>Resume</Text>
                  </TouchableOpacity>
                )}
                {iv.status !== 'done' && (
                  <TouchableOpacity style={styles.primary} onPress={() => start(iv)}>
                    <MaterialIcons name="rate-review" size={17} color="#fff" /><Text style={styles.primaryText}>Give feedback</Text>
                  </TouchableOpacity>
                )}
              </View>
            </Card>
          ))}
        </ScrollView>
      )}

      <Modal visible={!!open} transparent animationType="slide" onRequestClose={() => setOpen(null)}>
        <SheetOverlay>
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>{open?.candidate.name}</Text>
            <Text style={[styles.meta, { textAlign: 'center' }]}>{open?.round} · {open?.candidate.jobTitle}</Text>
            <Text style={styles.label}>RATING</Text>
            <View style={styles.stars}>
              {[1, 2, 3, 4, 5].map((n) => (
                <TouchableOpacity key={n} onPress={() => setRating(n)} hitSlop={6}>
                  <MaterialIcons name={n <= rating ? 'star' : 'star-border'} size={34} color={COLORS.orange} />
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.label}>RECOMMENDATION</Text>
            <View style={styles.recRow}>
              {RECS.map(([k, l, c]) => (
                <TouchableOpacity key={k} onPress={() => setRec(k)} style={[styles.recBtn, rec === k && { backgroundColor: c, borderColor: c }]}>
                  <Text style={[styles.recText, rec === k && { color: '#fff' }]}>{l}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.label}>FEEDBACK</Text>
            <TextInput style={styles.input} multiline maxLength={2000} value={feedback} onChangeText={setFeedback}
              placeholder="Strengths, gaps, technical depth, communication…" placeholderTextColor={COLORS.faint} />
            <PrimaryButton title="Submit feedback" busy={busy} onPress={submit} style={{ marginTop: 14 }} />
            <TouchableOpacity style={{ alignItems: 'center', paddingVertical: 12 }} onPress={() => setOpen(null)}>
              <Text style={{ color: COLORS.sub, fontWeight: '700' }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </SheetOverlay>
      </Modal>
      <BottomNav navigation={navigation} active="profile" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  empty: { color: COLORS.faint, fontSize: 13, textAlign: 'center', marginTop: 40 },
  card: { padding: 14, marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flex: 1, fontSize: 15, fontWeight: '800', color: COLORS.ink },
  meta: { fontSize: 12, color: COLORS.faint, marginTop: 3 },
  when: { fontSize: 13, color: COLORS.primary, fontWeight: '700', marginTop: 6 },
  fb: { fontSize: 12.5, color: COLORS.sub, marginTop: 8, fontStyle: 'italic' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  ghost: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 42,
    borderRadius: RADIUS.button, borderWidth: 1.5, borderColor: '#C7D2FE', backgroundColor: COLORS.indigoSoft,
  },
  ghostText: { color: COLORS.primary, fontWeight: '700' },
  primary: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 42, borderRadius: RADIUS.button, backgroundColor: COLORS.primary },
  primaryText: { color: '#fff', fontWeight: '800' },
  sheet: { backgroundColor: COLORS.card, borderTopLeftRadius: RADIUS.sheet, borderTopRightRadius: RADIUS.sheet, padding: 18, paddingBottom: 26 },
  handle: { width: 42, height: 5, borderRadius: 3, backgroundColor: COLORS.line, alignSelf: 'center', marginBottom: 12 },
  sheetTitle: { fontSize: 16, fontWeight: '800', color: COLORS.ink, textAlign: 'center' },
  label: { fontSize: 10.5, fontWeight: '800', color: COLORS.faint, letterSpacing: 0.6, marginTop: 14, marginBottom: 8 },
  stars: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  recRow: { flexDirection: 'row', gap: 8 },
  recBtn: { flex: 1, height: 42, borderRadius: RADIUS.button, borderWidth: 1.5, borderColor: COLORS.line, alignItems: 'center', justifyContent: 'center' },
  recText: { fontWeight: '800', color: COLORS.sub },
  input: {
    backgroundColor: COLORS.field, borderWidth: 1.5, borderColor: COLORS.line, borderRadius: RADIUS.input,
    paddingHorizontal: 12, paddingTop: 10, height: 110, textAlignVertical: 'top', fontSize: 14, color: COLORS.ink,
  },
});
