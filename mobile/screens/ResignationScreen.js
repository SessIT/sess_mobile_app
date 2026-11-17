import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, TextInput, Alert, RefreshControl } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { api } from '../lib/api';
import { GradientHeader, BottomNav, Card, Chip, PrimaryButton } from '../components/ui';
import { COLORS, RADIUS } from '../lib/theme';

/* Resignation: submit (with the last working day you'd like), follow HR's
 * decision and the clearance checklist, or withdraw before it's completed. */
const ymdIST = (d = new Date()) => new Date(d.getTime() + 5.5 * 3600000).toISOString().slice(0, 10);
const plusDays = (n) => ymdIST(new Date(Date.now() + n * 86400000));
const fmt = (ymd) => (ymd ? new Date(`${ymd}T00:00:00Z`).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '—');
const STATUS = {
  requested: ['Waiting for HR', COLORS.orange, COLORS.orangeSoft],
  accepted: ['Accepted — serving notice', COLORS.primary, COLORS.indigoSoft],
  completed: ['Exit completed', COLORS.sub, '#F3F4F6'],
  rejected: ['Not accepted', COLORS.red, COLORS.redSoft],
};

export default function ResignationScreen({ navigation }) {
  const [data, setData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [reason, setReason] = useState('');
  const [lastDay, setLastDay] = useState(plusDays(30));
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setData(await api('/exits/my')); } catch { setData({ case: null, assets: [] }); }
    finally { setRefreshing(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const submit = () => {
    if (!reason.trim()) { Alert.alert('Reason needed', 'Please share a short reason.'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(lastDay)) { Alert.alert('Check the date', 'Enter the last working day as YYYY-MM-DD.'); return; }
    Alert.alert('Submit resignation?', `Requested last working day: ${fmt(lastDay)}. HR and your manager will be notified.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Submit', style: 'destructive', onPress: async () => {
        setBusy(true);
        try { await api('/exits/resign', { method: 'POST', body: JSON.stringify({ reason, requestedLastDay: lastDay }) }); load(); }
        catch (e) { Alert.alert('Could not submit', e.message); } finally { setBusy(false); }
      } },
    ]);
  };

  const withdraw = () => Alert.alert('Withdraw resignation?', 'HR will be told you are staying.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Withdraw', onPress: async () => {
      try { await api('/exits/my/withdraw', { method: 'POST' }); load(); } catch (e) { Alert.alert('Error', e.message); }
    } },
  ]);

  const c = data?.case;
  const active = c && ['requested', 'accepted'].includes(c.status);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <GradientHeader title="Resignation" subtitle="Notice, clearance & last working day" onBack={() => navigation.goBack()} />
      {data === null ? <ActivityIndicator size="large" color={COLORS.primary} style={{ flex: 1 }} /> : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={[COLORS.primary]} />}>
          {c && c.status !== 'rejected' ? (
            <Card style={styles.card}>
              <Chip text={STATUS[c.status]?.[0] || c.status} color={STATUS[c.status]?.[1]} soft={STATUS[c.status]?.[2]} />
              <Text style={styles.big}>{fmt(c.lastWorkingDay || c.requestedLastDay)}</Text>
              <Text style={styles.meta}>{c.lastWorkingDay ? 'Last working day (confirmed by HR)' : 'Last working day you asked for'}</Text>
              {c.adminNote ? <Text style={styles.note}>HR: {c.adminNote}</Text> : null}
              {c.status === 'accepted' && (
                <>
                  <Text style={styles.label}>CLEARANCE</Text>
                  {(c.checklist || []).map((i) => {
                    const done = i.key === 'assets' ? data.assets.length === 0 : i.done;
                    return (
                      <View key={i.key} style={styles.checkRow}>
                        <MaterialIcons name={done ? 'check-circle' : 'radio-button-unchecked'} size={18} color={done ? COLORS.green : COLORS.faint} />
                        <Text style={[styles.checkText, done && { color: COLORS.sub }]}>{i.label}</Text>
                      </View>
                    );
                  })}
                  {data.assets.length > 0 && (
                    <Text style={styles.warn}>Return to HR: {data.assets.map((a) => `${a.name} (${a.tag})`).join(', ')}</Text>
                  )}
                </>
              )}
              {active && (
                <TouchableOpacity style={styles.withdraw} onPress={withdraw}>
                  <Text style={styles.withdrawText}>Withdraw resignation</Text>
                </TouchableOpacity>
              )}
            </Card>
          ) : (
            <Card style={styles.card}>
              {c?.status === 'rejected' && (
                <Text style={[styles.note, { marginTop: 0, marginBottom: 10 }]}>Your previous resignation was not accepted{c.adminNote ? `: ${c.adminNote}` : ''}. Please talk to HR.</Text>
              )}
              <Text style={styles.cardTitle}>Submit your resignation</Text>
              <Text style={styles.meta}>HR confirms the final last working day based on your notice period.</Text>
              <Text style={styles.label}>REASON</Text>
              <TextInput style={[styles.input, { height: 100, textAlignVertical: 'top', paddingTop: 10 }]} multiline maxLength={1000}
                value={reason} onChangeText={setReason} placeholder="Share why you're leaving" placeholderTextColor={COLORS.faint} />
              <Text style={styles.label}>LAST WORKING DAY YOU'D LIKE (YYYY-MM-DD)</Text>
              <TextInput style={styles.input} value={lastDay} onChangeText={setLastDay} maxLength={10} autoCapitalize="none"
                keyboardType="numbers-and-punctuation" placeholder="2026-12-31" placeholderTextColor={COLORS.faint} />
              <Text style={styles.meta}>{/^\d{4}-\d{2}-\d{2}$/.test(lastDay) ? fmt(lastDay) : ''}</Text>
              <PrimaryButton title="Submit resignation" busy={busy} onPress={submit} style={{ marginTop: 14 }} colors={['#F87171', COLORS.red]} />
            </Card>
          )}
        </ScrollView>
      )}
      <BottomNav navigation={navigation} active="profile" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  card: { padding: 16 },
  big: { fontSize: 22, fontWeight: '800', color: COLORS.ink, marginTop: 12 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: COLORS.ink },
  meta: { fontSize: 12, color: COLORS.faint, marginTop: 3 },
  note: { fontSize: 13, color: COLORS.sub, marginTop: 10, fontStyle: 'italic' },
  label: { fontSize: 10.5, fontWeight: '800', color: COLORS.faint, letterSpacing: 0.6, marginTop: 16, marginBottom: 8 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  checkText: { fontSize: 13.5, color: COLORS.ink, flex: 1 },
  warn: { fontSize: 12.5, color: COLORS.red, marginTop: 8, fontWeight: '600' },
  withdraw: { alignItems: 'center', paddingVertical: 12, marginTop: 10 },
  withdrawText: { color: COLORS.red, fontWeight: '800' },
  input: {
    backgroundColor: COLORS.field, borderWidth: 1.5, borderColor: COLORS.line, borderRadius: RADIUS.input,
    paddingHorizontal: 12, height: 48, fontSize: 14, color: COLORS.ink,
  },
});
