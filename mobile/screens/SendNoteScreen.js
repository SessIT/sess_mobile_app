import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, FlatList,
  ActivityIndicator, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { MaterialIcons } from '@expo/vector-icons';
import { GradientHeader, BottomNav, PrimaryButton, Chip } from '../components/ui';
import { COLORS } from '../lib/theme';
import { api } from '../lib/api';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/* Admin → employee notes (one way).
 * COMPOSE tab: pick one or more employees, write the notice, send.
 * SENT tab: what I sent, with a read / not-read marker per recipient.
 * There is no reply channel — employees only read these in My Notes. */

const initials = (n) => (n || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
const AVATAR_COLORS = ['#0E7490', '#B45309', '#15803D', '#6D28D9', '#BE123C', '#1D4ED8'];
const colorFor = (id) => AVATAR_COLORS[id % AVATAR_COLORS.length];

const when = (iso) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · ${d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}`;
};

export default function SendNoteScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState('compose');   // compose | sent
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState([]);    // selected user ids
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState([]);
  const [sentLoading, setSentLoading] = useState(false);

  useEffect(() => {
    api('/users')
      .then((list) => setUsers((list || []).filter(u => u.isActive !== false)))
      .catch(e => Alert.alert('Could not load employees', e.message))
      .finally(() => setLoading(false));
  }, []);

  const loadSent = useCallback(() => {
    setSentLoading(true);
    api('/notes/sent')
      .then(r => setSent(r.notes || []))
      .catch(() => {})
      .finally(() => setSentLoading(false));
  }, []);

  useEffect(() => { if (tab === 'sent') loadSent(); }, [tab, loadSent]);

  const toggle = (id) =>
    setPicked(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));

  const send = async () => {
    const text = body.trim();
    if (!picked.length) { Alert.alert('Choose an employee', 'Select who should receive this note.'); return; }
    if (!text) { Alert.alert('Write the note', 'The note cannot be empty.'); return; }
    setSending(true);
    try {
      const r = await api('/notes/send', {
        method: 'POST',
        body: JSON.stringify({ userIds: picked, body: text }),
      });
      Alert.alert('Note sent', `Delivered to ${r.sent} employee${r.sent === 1 ? '' : 's'}.`);
      setBody('');
      setPicked([]);
    } catch (e) { Alert.alert('Could not send', e.message); }
    finally { setSending(false); }
  };

  const withdraw = (note) => {
    Alert.alert('Withdraw note?', `Remove this note from ${note.to}'s notes?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Withdraw', style: 'destructive',
        onPress: async () => {
          try {
            await api(`/notes/sent/${note.id}`, { method: 'DELETE' });
            setSent(prev => prev.filter(n => n.id !== note.id));
          } catch (e) { Alert.alert('Could not withdraw', e.message); }
        },
      },
    ]);
  };

  const q = search.trim().toLowerCase();
  const filtered = q
    ? users.filter(u =>
        (u.fullName || '').toLowerCase().includes(q) ||
        (u.username || '').toLowerCase().includes(q) ||
        (u.employeeId || '').toLowerCase().includes(q))
    : users;

  const renderUser = ({ item }) => {
    const on = picked.includes(item.id);
    return (
      <TouchableOpacity
        style={[styles.userRow, on && styles.userRowOn]}
        activeOpacity={0.75}
        onPress={() => toggle(item.id)}
      >
        <View style={[styles.avatar, { backgroundColor: colorFor(item.id) }]}>
          <Text style={styles.avatarText}>{initials(item.fullName || item.username)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.userName} numberOfLines={1}>{item.fullName || item.username}</Text>
          <Text style={styles.userSub} numberOfLines={1}>
            {item.designation || item.roles?.[0] || `@${item.username}`}
          </Text>
        </View>
        <MaterialIcons
          name={on ? 'check-circle' : 'radio-button-unchecked'}
          size={22}
          color={on ? COLORS.primary : COLORS.line}
        />
      </TouchableOpacity>
    );
  };

  const renderSent = ({ item }) => (
    <View style={styles.sentCard}>
      <View style={styles.sentHead}>
        <Text style={styles.sentTo} numberOfLines={1}>{item.to}</Text>
        <Chip
          text={item.readAt ? 'Read' : 'Unread'}
          color={item.readAt ? COLORS.green : COLORS.orange}
          soft={item.readAt ? COLORS.greenSoft : COLORS.orangeSoft}
          icon={item.readAt ? 'done-all' : 'schedule'}
        />
      </View>
      <Text style={styles.sentBody}>{item.body}</Text>
      <View style={styles.sentFoot}>
        <Text style={styles.sentTime}>{when(item.createdAt)}</Text>
        <TouchableOpacity style={styles.withdraw} onPress={() => withdraw(item)}>
          <MaterialIcons name="undo" size={14} color={COLORS.red} />
          <Text style={styles.withdrawText}>Withdraw</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <GradientHeader
        title="Send Note"
        subtitle="One-way notice to employees"
        onBack={() => navigation.goBack()}
      >
        <View style={styles.segment}>
          {[['compose', 'Compose'], ['sent', 'Sent']].map(([key, label]) => (
            <TouchableOpacity
              key={key}
              style={[styles.segBtn, tab === key && styles.segBtnOn]}
              onPress={() => setTab(key)}
            >
              <Text style={[styles.segText, tab === key && styles.segTextOn]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </GradientHeader>

      {tab === 'compose' ? (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={'padding'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        >
          <View style={styles.searchWrap}>
            <MaterialIcons name="search" size={19} color={COLORS.faint} />
            <TextInput
              style={styles.search}
              placeholder="Search employee…"
              placeholderTextColor={COLORS.faint}
              value={search}
              onChangeText={setSearch}
            />
            {picked.length > 0 && (
              <TouchableOpacity onPress={() => setPicked([])}>
                <Text style={styles.clearPick}>Clear ({picked.length})</Text>
              </TouchableOpacity>
            )}
          </View>

          {loading ? (
            <ActivityIndicator style={{ marginTop: 30 }} color={COLORS.primary} />
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(u) => String(u.id)}
              renderItem={renderUser}
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8 }}
              ListEmptyComponent={<Text style={styles.emptyText}>No employee matched</Text>}
              keyboardShouldPersistTaps="handled"
            />
          )}

          <View style={[styles.composeBox, { paddingBottom: insets.bottom + 12 }]}>
            <TextInput
              style={styles.bodyInput}
              placeholder="Write the note for the selected employee(s)…"
              placeholderTextColor={COLORS.faint}
              value={body}
              onChangeText={setBody}
              multiline
              maxLength={2000}
            />
            <PrimaryButton
              title={sending ? 'Sending…' : `Send note${picked.length ? ` (${picked.length})` : ''}`}
              icon="send"
              onPress={send}
              busy={sending}
              disabled={!picked.length || !body.trim()}
              style={{ marginTop: 10 }}
            />
            <Text style={styles.hint}>
              Employees can read this in My Notes. They cannot reply to it.
            </Text>
          </View>
        </KeyboardAvoidingView>
      ) : sentLoading ? (
        <ActivityIndicator style={{ marginTop: 30 }} color={COLORS.primary} />
      ) : (
        <FlatList
          data={sent}
          keyExtractor={(n) => String(n.id)}
          renderItem={renderSent}
          contentContainerStyle={{ padding: 16 }}
          ListEmptyComponent={<Text style={styles.emptyText}>You haven't sent any notes yet</Text>}
        />
      )}

      <BottomNav navigation={navigation} active={null} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },

  segment: { flexDirection: 'row', gap: 6, backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 12, padding: 4, marginTop: 14 },
  segBtn: { flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: 'center' },
  segBtnOn: { backgroundColor: '#fff' },
  segText: { fontSize: 12.5, fontWeight: '700', color: 'rgba(255,255,255,0.85)' },
  segTextOn: { color: COLORS.primary },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    margin: 16, marginBottom: 10, paddingHorizontal: 14, height: 46,
    backgroundColor: COLORS.card, borderRadius: 12, borderWidth: 1, borderColor: COLORS.line,
  },
  search: { flex: 1, fontSize: 14, color: COLORS.ink },
  clearPick: { fontSize: 12, fontWeight: '800', color: COLORS.red },

  userRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.card, borderRadius: 14, padding: 12, marginBottom: 8,
    borderWidth: 1.5, borderColor: 'transparent',
  },
  userRowOn: { borderColor: COLORS.primary, backgroundColor: COLORS.indigoSoft },
  avatar: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#fff', fontSize: 13.5, fontWeight: '800' },
  userName: { fontSize: 14, fontWeight: '700', color: COLORS.ink },
  userSub: { fontSize: 11.5, color: COLORS.faint, marginTop: 2 },

  composeBox: {
    backgroundColor: COLORS.card, padding: 14,
    borderTopLeftRadius: 20, borderTopRightRadius: 20, elevation: 10,
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: -4 },
  },
  bodyInput: {
    minHeight: 76, maxHeight: 140, borderRadius: 12, borderWidth: 1.5, borderColor: '#C7D2FE',
    backgroundColor: COLORS.field, padding: 12, fontSize: 14, color: COLORS.ink, textAlignVertical: 'top',
  },
  hint: { fontSize: 10.5, color: COLORS.faint, textAlign: 'center', marginTop: 8 },

  sentCard: { backgroundColor: COLORS.card, borderRadius: 14, padding: 14, marginBottom: 10, elevation: 2, shadowColor: '#1E3A8A', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  sentHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 6 },
  sentTo: { flex: 1, fontSize: 14, fontWeight: '800', color: COLORS.ink },
  sentBody: { fontSize: 13, color: COLORS.sub, lineHeight: 19 },
  sentFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, paddingTop: 9, borderTopWidth: 1, borderTopColor: COLORS.line },
  sentTime: { fontSize: 10.5, color: COLORS.faint, fontWeight: '600' },
  withdraw: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  withdrawText: { fontSize: 11.5, fontWeight: '800', color: COLORS.red },

  emptyText: { textAlign: 'center', color: COLORS.faint, fontSize: 13, marginTop: 30 },
});
