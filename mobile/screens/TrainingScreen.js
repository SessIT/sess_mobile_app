import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, RefreshControl, Alert, Linking } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { api } from '../lib/api';
import { GradientHeader, BottomNav, Card, Chip } from '../components/ui';
import { COLORS, RADIUS } from '../lib/theme';

/* Courses HR assigned to me: open the material, then confirm completion. */
const fmt = (ymd) => (ymd ? new Date(`${ymd}T00:00:00Z`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '');

export default function TrainingScreen({ navigation }) {
  const [items, setItems] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    try { setItems((await api('/training/my')).items || []); } catch { setItems((p) => p ?? []); }
    finally { setRefreshing(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const complete = (a) => Alert.alert('Mark as completed?', `Confirm you have completed "${a.course.title}".`, [
    { text: 'Not yet', style: 'cancel' },
    { text: 'Completed', onPress: async () => {
      setBusy(a.courseId);
      try { await api(`/training/my/${a.courseId}/complete`, { method: 'POST' }); load(); }
      catch (e) { Alert.alert('Could not save', e.message); } finally { setBusy(null); }
    } },
  ]);

  const pending = (items || []).filter((a) => a.status !== 'completed').length;

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <GradientHeader title="My Training" subtitle={pending ? `${pending} to complete` : 'All caught up'} onBack={() => navigation.goBack()} />
      {items === null ? <ActivityIndicator size="large" color={COLORS.primary} style={{ flex: 1 }} /> : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={[COLORS.primary]} />}>
          {items.length === 0 && (
            <View style={styles.empty}>
              <MaterialIcons name="school" size={50} color="#CBD5E1" />
              <Text style={styles.emptyText}>No training assigned to you</Text>
            </View>
          )}
          {items.map((a) => {
            const done = a.status === 'completed';
            return (
              <Card key={a.id} style={[styles.card, a.overdue && styles.overdue]}>
                <View style={styles.top}>
                  <MaterialIcons name={done ? 'task-alt' : 'school'} size={22} color={done ? COLORS.green : COLORS.primary} />
                  <Text style={styles.title}>{a.course.title}</Text>
                </View>
                <View style={styles.chips}>
                  {a.course.mandatory && <Chip text="Mandatory" color={COLORS.red} soft={COLORS.redSoft} />}
                  {a.course.durationMins ? <Chip text={`${a.course.durationMins} min`} color={COLORS.sub} soft="#F3F4F6" /> : null}
                  {a.course.dueDate && !done ? <Chip text={`${a.overdue ? 'Overdue · ' : 'Due '}${fmt(a.course.dueDate)}`} color={a.overdue ? COLORS.red : COLORS.orange} soft={a.overdue ? COLORS.redSoft : COLORS.orangeSoft} /> : null}
                  {done && <Chip text={`Completed ${new Date(a.completedAt).toLocaleDateString('en-IN')}`} color={COLORS.green} soft={COLORS.greenSoft} />}
                </View>
                {a.course.description ? <Text style={styles.desc}>{a.course.description}</Text> : null}
                <View style={styles.actions}>
                  {a.course.contentUrl ? (
                    <TouchableOpacity style={styles.openBtn} onPress={() => Linking.openURL(a.course.contentUrl).catch(() => Alert.alert('Could not open the link'))}>
                      <MaterialIcons name="open-in-new" size={17} color={COLORS.primary} />
                      <Text style={styles.openText}>Open course</Text>
                    </TouchableOpacity>
                  ) : null}
                  {!done && (
                    <TouchableOpacity style={styles.doneBtn} onPress={() => complete(a)} disabled={busy === a.courseId}>
                      {busy === a.courseId ? <ActivityIndicator color="#fff" size="small" /> : <MaterialIcons name="check" size={17} color="#fff" />}
                      <Text style={styles.doneText}>Mark completed</Text>
                    </TouchableOpacity>
                  )}
                </View>
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
  overdue: { borderLeftWidth: 3, borderLeftColor: COLORS.red },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { flex: 1, fontSize: 15, fontWeight: '800', color: COLORS.ink },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  desc: { fontSize: 13, color: '#374151', marginTop: 10, lineHeight: 19 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  openBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 42,
    borderRadius: RADIUS.button, borderWidth: 1.5, borderColor: '#C7D2FE', backgroundColor: COLORS.indigoSoft,
  },
  openText: { color: COLORS.primary, fontWeight: '700', fontSize: 13 },
  doneBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 42, borderRadius: RADIUS.button, backgroundColor: COLORS.green },
  doneText: { color: '#fff', fontWeight: '800', fontSize: 13 },
});
