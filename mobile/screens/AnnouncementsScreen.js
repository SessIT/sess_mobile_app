import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { api } from '../lib/api';
import { GradientHeader, BottomNav, Card, Chip } from '../components/ui';
import { COLORS, RADIUS } from '../lib/theme';

/* Company notices and policies. Ones marked "please read" need an explicit
 * "I have read this" — HR sees who has. */
const when = (iso) => new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

export default function AnnouncementsScreen({ navigation }) {
  const [items, setItems] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState({});
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    try { setItems((await api('/announcements')).items || []); } catch { setItems((p) => p ?? []); }
    finally { setRefreshing(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const ack = async (a) => {
    setBusy(a.id);
    try {
      const r = await api(`/announcements/${a.id}/ack`, { method: 'POST' });
      setItems((prev) => prev.map((x) => (x.id === a.id ? { ...x, myAckAt: r.ackedAt } : x)));
    } catch (e) { Alert.alert('Could not save', e.message); } finally { setBusy(null); }
  };

  const pending = (items || []).filter((a) => a.requiresAck && !a.myAckAt).length;

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <GradientHeader title="Announcements" subtitle={pending ? `${pending} need your acknowledgement` : 'Company notices & policies'} onBack={() => navigation.goBack()} />
      {items === null ? <ActivityIndicator size="large" color={COLORS.primary} style={{ flex: 1 }} /> : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={[COLORS.primary]} />}>
          {items.length === 0 && (
            <View style={styles.empty}>
              <MaterialIcons name="campaign" size={50} color="#CBD5E1" />
              <Text style={styles.emptyText}>No announcements yet</Text>
            </View>
          )}
          {items.map((a) => {
            const needsAck = a.requiresAck && !a.myAckAt;
            const open = expanded[a.id] || needsAck;
            return (
              <Card key={a.id} style={[styles.card, needsAck && styles.cardAttention]}>
                <TouchableOpacity activeOpacity={0.8} onPress={() => setExpanded((e) => ({ ...e, [a.id]: !e[a.id] }))}>
                  <View style={styles.top}>
                    <MaterialIcons name={a.pinned ? 'push-pin' : 'campaign'} size={18} color={a.pinned ? COLORS.orange : COLORS.primary} />
                    <Text style={styles.title}>{a.title}</Text>
                  </View>
                  <Text style={styles.date}>{when(a.createdAt)}</Text>
                  <Text style={styles.body} numberOfLines={open ? undefined : 3}>{a.body}</Text>
                </TouchableOpacity>
                {a.requiresAck && (
                  a.myAckAt ? (
                    <Chip text={`Acknowledged ${when(a.myAckAt)}`} icon="check-circle" color={COLORS.green} soft={COLORS.greenSoft} style={{ marginTop: 10 }} />
                  ) : (
                    <TouchableOpacity style={styles.ackBtn} onPress={() => ack(a)} disabled={busy === a.id}>
                      {busy === a.id ? <ActivityIndicator color="#fff" size="small" /> : <MaterialIcons name="done-all" size={18} color="#fff" />}
                      <Text style={styles.ackText}>I have read and understood this</Text>
                    </TouchableOpacity>
                  )
                )}
              </Card>
            );
          })}
        </ScrollView>
      )}
      <BottomNav navigation={navigation} active="profile" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  empty: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyText: { color: COLORS.faint, fontSize: 13 },
  card: { padding: 14, marginBottom: 10 },
  cardAttention: { borderLeftWidth: 3, borderLeftColor: COLORS.orange },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, fontSize: 15, fontWeight: '800', color: COLORS.ink },
  date: { fontSize: 11.5, color: COLORS.faint, marginTop: 3 },
  body: { fontSize: 13.5, color: '#374151', marginTop: 10, lineHeight: 20 },
  ackBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12,
    backgroundColor: COLORS.primary, borderRadius: RADIUS.button, height: 44,
  },
  ackText: { color: '#fff', fontWeight: '800', fontSize: 13.5 },
});
