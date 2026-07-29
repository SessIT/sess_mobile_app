import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  ActivityIndicator, RefreshControl, TextInput, Modal, ScrollView, Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { api } from '../lib/api';

const INDIGO = '#1E3A8A';
const GREEN = '#16A34A';

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
      <LinearGradient colors={['#1E40AF', '#1E3A8A', '#312E81']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
        <View style={[styles.deco, { width: 150, height: 150, top: -55, right: -45 }]} />
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Team Chat</Text>
            <Text style={styles.subTitle}>Wishes, blessings & updates 💬</Text>
          </View>
          <TouchableOpacity
            style={styles.newGroupBtn}
            onPress={() => { setGroupName(''); setSelected(new Set()); setGroupModal(true); }}
          >
            <MaterialIcons name="group-add" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
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
      </LinearGradient>

      {convos === null ? (
        <ActivityIndicator size="large" color={INDIGO} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(c) => `${c.kind}-${c.id}`}
          contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
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
                  <MaterialIcons name="groups" size={24} color="#fff" />
                </LinearGradient>
              ) : (
                <View style={[styles.avatar, { backgroundColor: AVATAR_COLORS[c.id % AVATAR_COLORS.length] }]}>
                  <Text style={styles.avatarText}>{initials(c.name)}</Text>
                </View>
              )}
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={styles.nameRow}>
                  <Text style={styles.name} numberOfLines={1}>{c.name}</Text>
                  {c.lastMessage && <Text style={styles.time}>{timeAgo(c.lastMessage.at)}</Text>}
                </View>
                <View style={styles.previewRow}>
                  <Text style={[styles.preview, c.unread > 0 && styles.previewUnread]} numberOfLines={1}>
                    {c.lastMessage
                      ? `${c.lastMessage.mine ? 'You' : (c.lastMessage.senderName || '').split(' ')[0] || ''}${c.lastMessage.mine || c.lastMessage.senderName ? ': ' : ''}${c.lastMessage.body}`
                      : c.kind === 'group'
                        ? `${c.memberCount} members`
                        : (c.designation || 'Say hello 👋')}
                  </Text>
                  {c.unread > 0 && (
                    <View style={styles.unreadBadge}>
                      <Text style={styles.unreadText}>{c.unread > 99 ? '99+' : c.unread}</Text>
                    </View>
                  )}
                </View>
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
              <MaterialIcons name="groups" size={20} color={INDIGO} />
              <TextInput
                style={styles.groupNameInput}
                placeholder="Group name — e.g. Service Team 🚀"
                placeholderTextColor="#9CA3AF"
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
                      color={on ? GREEN : '#CBD5E1'}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  header: { paddingTop: 52, paddingBottom: 16, paddingHorizontal: 16, borderBottomLeftRadius: 26, borderBottomRightRadius: 26, overflow: 'hidden', elevation: 6 },
  deco: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.07)' },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.14)', justifyContent: 'center', alignItems: 'center' },
  newGroupBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.14)', justifyContent: 'center', alignItems: 'center' },
  title: { color: '#fff', fontSize: 17, fontWeight: '800' },
  subTitle: { color: '#C7D2FE', fontSize: 11.5, marginTop: 1 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 12, paddingHorizontal: 12, height: 42, marginTop: 14 },
  searchInput: { flex: 1, color: '#fff', fontSize: 13.5 },

  empty: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyText: { color: '#9CA3AF', fontSize: 13 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 16, padding: 12, marginBottom: 8, elevation: 1 },
  avatar: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  nameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  name: { flex: 1, fontSize: 14.5, fontWeight: '800', color: '#111827' },
  time: { fontSize: 10.5, color: '#9CA3AF', fontWeight: '600' },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  preview: { flex: 1, fontSize: 12.5, color: '#6B7280' },
  previewUnread: { color: '#111827', fontWeight: '700' },
  unreadBadge: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: GREEN, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 5 },
  unreadText: { color: '#fff', fontSize: 10.5, fontWeight: '800' },

  sheetOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 18, paddingBottom: 26 },
  sheetHandle: { width: 42, height: 5, borderRadius: 3, backgroundColor: '#E5E7EB', alignSelf: 'center', marginBottom: 12 },
  sheetTitle: { fontSize: 16, fontWeight: '800', color: '#111827', textAlign: 'center', marginBottom: 12 },
  groupNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F9FAFB', borderWidth: 1.5, borderColor: '#E0E7FF', borderRadius: 12, paddingHorizontal: 12, height: 50 },
  groupNameInput: { flex: 1, fontSize: 14.5, color: '#111827', fontWeight: '600' },
  pickLabel: { fontSize: 10.5, fontWeight: '800', color: '#9CA3AF', letterSpacing: 0.6, marginTop: 14, marginBottom: 6 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  avatarSm: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  avatarSmText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  memberName: { fontSize: 13.5, fontWeight: '700', color: '#111827' },
  memberSub: { fontSize: 11, color: '#9CA3AF' },
  cancelBtn: { flex: 1, height: 48, borderRadius: 12, borderWidth: 1.5, borderColor: '#E5E7EB', justifyContent: 'center', alignItems: 'center' },
  cancelText: { color: '#374151', fontWeight: '700' },
  createBtn: { flex: 1.4, flexDirection: 'row', gap: 6, height: 48, borderRadius: 12, backgroundColor: INDIGO, justifyContent: 'center', alignItems: 'center' },
  createText: { color: '#fff', fontWeight: '800' },
});
