import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  ActivityIndicator, RefreshControl, TextInput, Modal, ScrollView, Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { api } from '../lib/api';
import { GradientHeader, HeaderIconButton, BottomNav } from '../components/ui';
import { COLORS, RADIUS, SHADOW } from '../lib/theme';

const initials = (n) => (n || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

// WhatsApp-style relative timestamp for the conversation list.
const timeAgo = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  const yest = new Date(now.getTime() - 86400000);
  if (d.toDateString() === yest.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
};

const AVATAR_COLORS = ['#4F46E5', '#0891B2', '#16A34A', '#D97706', '#DC2626', '#7C3AED', '#DB2777'];

export default function ChatListScreen({ navigation }) {
  const [convos, setConvos] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const pollRef = useRef(null);

  // New-group modal
  const [groupModal, setGroupModal] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api('/chat/conversations');
      setConvos(res.conversations || []);
    } catch { setConvos((prev) => prev ?? []); }
    finally { setRefreshing(false); }
  }, []);

  useEffect(() => {
    const unsub = navigation.addListener('focus', () => {
      load();
      pollRef.current = setInterval(load, 15000);
    });
    const unsubBlur = navigation.addListener('blur', () => clearInterval(pollRef.current));
    return () => { unsub(); unsubBlur(); clearInterval(pollRef.current); };
  }, [navigation, load]);

  const filtered = (convos || []).filter(c =>
    (c.name || '').toLowerCase().includes(search.trim().toLowerCase()));
  const people = (convos || []).filter(c => c.kind === 'user');

  const openConvo = (c) => {
    if (c.kind === 'group') {
      navigation.navigate('Chat', { group: { id: c.id, name: c.name, memberCount: c.memberCount } });
    } else {
      navigation.navigate('Chat', { user: { id: c.id, fullName: c.name, username: c.username } });
    }
  };

  const toggleMember = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const createGroup = async () => {
    if (!groupName.trim()) { Alert.alert('Group name required'); return; }
    if (selected.size === 0) { Alert.alert('Pick members', 'Select at least one teammate.'); return; }
    setCreating(true);
    try {
      const g = await api('/chat/groups', {
        method: 'POST',
        body: JSON.stringify({ name: groupName.trim(), memberIds: [...selected] }),
      });
      setGroupModal(false);
      load();
      navigation.navigate('Chat', { group: { id: g.id, name: g.name, memberCount: g.memberCount } });
    } catch (e) { Alert.alert('Could not create group', e.message); }
    finally { setCreating(false); }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <GradientHeader
        title="Team Chat"
        subtitle="Wishes, blessings & updates 💬"
        onBack={() => navigation.goBack()}
        right={
          <HeaderIconButton
            icon="group-add"
            size={20}
            onPress={() => { setGroupName(''); setSelected(new Set()); setGroupModal(true); }}
          />
        }
      >
        <View style={styles.searchRow}>
          <MaterialIcons name="search" size={18} color="#C7D2FE" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search teammate or group…"
            placeholderTextColor="#A5B4FC"
            value={search}
            onChangeText={setSearch}
          />
        </View>
      </GradientHeader>

      {convos === null ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={{ flex: 1 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(c) => `${c.kind}-${c.id}`}
          contentContainerStyle={{ padding: 16, paddingBottom: 20 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <MaterialIcons name="forum" size={44} color="#CBD5E1" />
              <Text style={styles.emptyText}>Nothing here yet</Text>
            </View>
          }
          renderItem={({ item: c }) => (
            <TouchableOpacity style={styles.row} activeOpacity={0.8} onPress={() => openConvo(c)}>
              {c.kind === 'group' ? (
                <LinearGradient colors={['#0E7490', '#155E75']} style={styles.avatar}>
                  <MaterialIcons name="groups" size={22} color="#fff" />
                </LinearGradient>
              ) : (
                <View style={[styles.avatar, { backgroundColor: AVATAR_COLORS[c.id % AVATAR_COLORS.length] }]}>
                  <Text style={styles.avatarText}>{initials(c.name)}</Text>
                </View>
              )}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.name} numberOfLines={1}>{c.name}</Text>
                <Text style={[styles.preview, c.unread > 0 && styles.previewUnread]} numberOfLines={1}>
                  {c.lastMessage
                    ? `${c.lastMessage.mine ? 'You' : (c.lastMessage.senderName || '').split(' ')[0] || ''}${c.lastMessage.mine || c.lastMessage.senderName ? ': ' : ''}${c.lastMessage.body}`
                    : c.kind === 'group'
                      ? `${c.memberCount} members`
                      : (c.designation || 'Say hello 👋')}
                </Text>
              </View>
              <View style={styles.rightCol}>
                {c.lastMessage ? <Text style={styles.time}>{timeAgo(c.lastMessage.at)}</Text> : null}
                {c.unread > 0 && (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadText}>{c.unread > 99 ? '99+' : c.unread}</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      {/* ---- New group modal ---- */}
      <Modal visible={groupModal} transparent animationType="slide" onRequestClose={() => setGroupModal(false)}>
        <View style={styles.sheetOverlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>New Group</Text>

            <View style={styles.groupNameRow}>
              <MaterialIcons name="groups" size={20} color={COLORS.primary} />
              <TextInput
                style={styles.groupNameInput}
                placeholder="Group name — e.g. Service Team 🚀"
                placeholderTextColor={COLORS.faint}
                value={groupName}
                onChangeText={setGroupName}
                maxLength={60}
              />
            </View>

            <Text style={styles.pickLabel}>ADD MEMBERS ({selected.size} selected)</Text>
            <ScrollView style={{ maxHeight: 300 }}>
              {people.map((p) => {
                const on = selected.has(p.id);
                return (
                  <TouchableOpacity key={p.id} style={styles.memberRow} onPress={() => toggleMember(p.id)}>
                    <View style={[styles.avatarSm, { backgroundColor: AVATAR_COLORS[p.id % AVATAR_COLORS.length] }]}>
                      <Text style={styles.avatarSmText}>{initials(p.name)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.memberName}>{p.name}</Text>
                      {p.designation ? <Text style={styles.memberSub}>{p.designation}</Text> : null}
                    </View>
                    <MaterialIcons
                      name={on ? 'check-circle' : 'radio-button-unchecked'}
                      size={22}
                      color={on ? COLORS.green : '#CBD5E1'}
                    />
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <TouchableOpacity style={styles.cancelBtn} disabled={creating} onPress={() => setGroupModal(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.createBtn, (creating || !groupName.trim() || selected.size === 0) && { opacity: 0.5 }]}
                disabled={creating || !groupName.trim() || selected.size === 0}
                onPress={createGroup}
              >
                {creating ? <ActivityIndicator color="#fff" /> : (
                  <>
                    <MaterialIcons name="check" size={18} color="#fff" />
                    <Text style={styles.createText}>Create Group</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <BottomNav navigation={navigation} active="chat" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },

  /* translucent search inside the gradient header */
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: RADIUS.input,
    paddingHorizontal: 12, height: 44, marginTop: 14,
  },
  searchInput: { flex: 1, color: '#fff', fontSize: 13.5 },

  empty: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyText: { color: COLORS.faint, fontSize: 13 },

  /* conversation card */
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.card, borderRadius: RADIUS.card,
    padding: 14, marginBottom: 10, ...SHADOW.card,
  },
  avatar: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  name: { fontSize: 14.5, fontWeight: '800', color: COLORS.ink },
  preview: { fontSize: 12.5, color: COLORS.sub, marginTop: 2 },
  previewUnread: { color: COLORS.ink, fontWeight: '700' },
  rightCol: { alignItems: 'flex-end', justifyContent: 'center', gap: 6, minWidth: 40 },
  time: { fontSize: 10.5, color: COLORS.faint, fontWeight: '600' },
  unreadBadge: {
    minWidth: 20, height: 20, borderRadius: 10, backgroundColor: COLORS.green,
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 5,
  },
  unreadText: { color: '#fff', fontSize: 10.5, fontWeight: '800' },

  /* new-group sheet */
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: COLORS.card, borderTopLeftRadius: RADIUS.sheet, borderTopRightRadius: RADIUS.sheet,
    padding: 18, paddingBottom: 26,
  },
  sheetHandle: { width: 42, height: 5, borderRadius: 3, backgroundColor: COLORS.line, alignSelf: 'center', marginBottom: 12 },
  sheetTitle: { fontSize: 16, fontWeight: '800', color: COLORS.ink, textAlign: 'center', marginBottom: 12 },
  groupNameRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.field,
    borderWidth: 1.5, borderColor: '#E0E7FF', borderRadius: RADIUS.input, paddingHorizontal: 12, height: 50,
  },
  groupNameInput: { flex: 1, fontSize: 14.5, color: COLORS.ink, fontWeight: '600' },
  pickLabel: { fontSize: 10.5, fontWeight: '800', color: COLORS.faint, letterSpacing: 0.6, marginTop: 14, marginBottom: 6 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  avatarSm: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  avatarSmText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  memberName: { fontSize: 13.5, fontWeight: '700', color: COLORS.ink },
  memberSub: { fontSize: 11, color: COLORS.faint },
  cancelBtn: {
    flex: 1, height: 48, borderRadius: RADIUS.input, borderWidth: 1.5, borderColor: COLORS.line,
    justifyContent: 'center', alignItems: 'center',
  },
  cancelText: { color: '#374151', fontWeight: '700' },
  createBtn: {
    flex: 1.4, flexDirection: 'row', gap: 6, height: 48, borderRadius: RADIUS.input,
    backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center',
  },
  createText: { color: '#fff', fontWeight: '800' },
});
