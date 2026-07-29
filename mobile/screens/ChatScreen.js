import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, TextInput,
  ActivityIndicator, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { api } from '../lib/api';

const INDIGO = '#1E3A8A';
const POLL_MS = 4000;
const NAME_COLORS = ['#4F46E5', '#0891B2', '#16A34A', '#D97706', '#DC2626', '#7C3AED', '#DB2777'];

const initials = (n) => (n || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
const fmtT = (iso) => new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
const dayLabel = (iso) => {
  const d = new Date(iso), now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Today';
  const yest = new Date(now.getTime() - 86400000);
  if (d.toDateString() === yest.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

// Thread screen — 1:1 (route.params.user) or group (route.params.group).
// WhatsApp-style bubbles; polls every 4s; smart scrolling: sticks to the
// bottom only when you're already there, with a jump-to-latest FAB otherwise.
export default function ChatScreen({ route, navigation }) {
  const other = route.params?.user || null;
  const group = route.params?.group || null;
  const isGroup = !!group;

  const [messages, setMessages] = useState(null);
  const [meId, setMeId] = useState(null);
  const [meUsername, setMeUsername] = useState(null);
  const [groupInfo, setGroupInfo] = useState(group);
  const [text, setText] = useState(route.params?.prefill || '');
  const [sending, setSending] = useState(false);
  const [notAtBottom, setNotAtBottom] = useState(false);

  const lastIdRef = useRef(0);
  const atBottomRef = useRef(true);
  const pollRef = useRef(null);
  const listRef = useRef(null);

  const threadPath = (after) => isGroup
    ? `/chat/group-thread/${group.id}${after ? `?after=${after}` : ''}`
    : `/chat/thread/${other.id}${after ? `?after=${after}` : ''}`;

  const scrollToEnd = (animated = true) =>
    setTimeout(() => listRef.current?.scrollToEnd?.({ animated }), 90);

  const mergeIn = (incoming, { fromMe = false } = {}) => {
    if (!incoming.length) return;
    setMessages((prev) => {
      const seen = new Set((prev || []).map((m) => m.id));
      const fresh = incoming.filter((m) => !seen.has(m.id));
      if (!fresh.length) return prev || [];
      const next = [...(prev || []), ...fresh];
      lastIdRef.current = next[next.length - 1].id;
      return next;
    });
    // Stick to the bottom only if we were already there (or we sent it).
    if (fromMe || atBottomRef.current) scrollToEnd(true);
  };

  const loadFull = useCallback(async () => {
    try {
      const res = await api(threadPath());
      const list = res.messages || [];
      lastIdRef.current = list.length ? list[list.length - 1].id : 0;
      setMeId(res.meId);
      if (res.meUsername) setMeUsername(res.meUsername);
      if (res.group) setGroupInfo(res.group);
      setMessages(list);
      scrollToEnd(false);
    } catch (e) {
      Alert.alert('Error', e.message);
      setMessages([]);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const poll = useCallback(async () => {
    try {
      const res = await api(threadPath(lastIdRef.current));
      mergeIn(res.messages || []);
    } catch {}
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadFull();
    pollRef.current = setInterval(poll, POLL_MS);
    return () => clearInterval(pollRef.current);
  }, [loadFull, poll]);

  const onScroll = (e) => {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    const atBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 90;
    atBottomRef.current = atBottom;
    setNotAtBottom(!atBottom);
  };

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const msg = await api('/chat/send', {
        method: 'POST',
        body: JSON.stringify(isGroup ? { groupId: group.id, body } : { toUserId: other.id, body }),
      });
      setText('');
      mergeIn([msg], { fromMe: true });
    } catch (e) { Alert.alert('Could not send', e.message); }
    finally { setSending(false); }
  };

  const isMine = (m) => (meId != null ? m.senderId === meId : (!isGroup && m.senderId !== other.id));

  /* ---------- @mentions (group chats) ---------- */
  const members = Array.isArray(groupInfo?.members) && typeof groupInfo.members[0] === 'object'
    ? groupInfo.members : [];
  // Live "@partial" at the end of the composer -> member suggestions.
  const mentionMatch = isGroup ? text.match(/@([\w.-]*)$/) : null;
  const mentionOptions = mentionMatch
    ? members.filter((mb) => {
        if (mb.id === meId) return false;
        const q = mentionMatch[1].toLowerCase();
        return !q
          || (mb.username || '').toLowerCase().startsWith(q)
          || (mb.fullName || '').toLowerCase().startsWith(q);
      }).slice(0, 5)
    : [];
  const insertMention = (mb) => setText((t) => t.replace(/@([\w.-]*)$/, `@${mb.username} `));

  const mentionsMe = (body) =>
    !!meUsername && new RegExp(`@${meUsername}\\b`, 'i').test(body);

  // Render a message body with @tokens highlighted (amber when it's YOU).
  const renderBody = (body, mine) => {
    const parts = String(body).split(/(@[\w.-]+)/g);
    return parts.map((p, i) => {
      if (/^@[\w.-]+$/.test(p)) {
        const isMe = !!meUsername && p.slice(1).toLowerCase() === meUsername.toLowerCase();
        return (
          <Text
            key={i}
            style={isMe ? styles.mentionMe : (mine ? styles.mentionInMine : styles.mention)}
          >
            {p}
          </Text>
        );
      }
      return <Text key={i}>{p}</Text>;
    });
  };

  // Rows with date separators; group messages carry showName for others' bubbles.
  const rows = [];
  let lastDay = null, prevSender = null;
  for (const m of messages || []) {
    const day = dayLabel(m.createdAt);
    if (day !== lastDay) { rows.push({ type: 'day', id: `d-${day}-${m.id}`, day }); lastDay = day; prevSender = null; }
    rows.push({ type: 'msg', ...m, showName: isGroup && !isMine(m) && m.senderId !== prevSender });
    prevSender = m.senderId;
  }

  const title = isGroup ? (groupInfo?.name || group.name) : (other.fullName || other.username);
  const memberNames = members.map((mb) => (mb.fullName || mb.username).split(' ')[0]);
  const subtitle = isGroup
    ? (memberNames.length
        ? memberNames.slice(0, 4).join(', ') + (memberNames.length > 4 ? '…' : '')
        : `${groupInfo?.memberCount ?? ''} members`)
    : `@${other.username}`;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.container}>
        <StatusBar style="light" />
        <LinearGradient colors={['#1E40AF', '#1E3A8A', '#312E81']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={styles.avatar}>
            {isGroup
              ? <MaterialIcons name="groups" size={20} color="#fff" />
              : <Text style={styles.avatarText}>{initials(title)}</Text>}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title} numberOfLines={1}>{title}</Text>
            <Text style={styles.subTitle} numberOfLines={1}>{subtitle}</Text>
          </View>
        </LinearGradient>

        {messages === null ? (
          <ActivityIndicator size="large" color={INDIGO} style={{ marginTop: 40 }} />
        ) : (
          <View style={{ flex: 1 }}>
            <FlatList
              ref={listRef}
              data={rows}
              keyExtractor={(r) => String(r.id)}
              contentContainerStyle={{ padding: 14, paddingBottom: 8 }}
              onScroll={onScroll}
              scrollEventThrottle={120}
              ListEmptyComponent={
                <View style={styles.empty}>
                  <Text style={{ fontSize: 40 }}>💬</Text>
                  <Text style={styles.emptyText}>
                    {isGroup ? 'Start the conversation in this group!' : 'No messages yet — send a wish or say hello!'}
                  </Text>
                </View>
              }
              renderItem={({ item: r }) => {
                if (r.type === 'day') {
                  return <View style={styles.dayWrap}><Text style={styles.dayText}>{r.day}</Text></View>;
                }
                const mine = isMine(r);
                const senderName = r.sender?.fullName || r.sender?.username;
                const taggedMe = isGroup && !mine && mentionsMe(r.body);
                return (
                  <View style={[styles.bubbleRow, mine ? { justifyContent: 'flex-end' } : null]}>
                    <View style={[
                      styles.bubble,
                      mine ? styles.bubbleMine : styles.bubbleTheirs,
                      taggedMe && styles.bubbleTaggedMe,
                    ]}>
                      {r.showName && senderName ? (
                        <Text style={[styles.senderName, { color: NAME_COLORS[r.senderId % NAME_COLORS.length] }]}>
                          {senderName}
                        </Text>
                      ) : null}
                      <Text style={[styles.bubbleText, mine && { color: '#fff' }]}>{renderBody(r.body, mine)}</Text>
                      <View style={styles.metaRow}>
                        <Text style={[styles.metaText, mine && { color: 'rgba(255,255,255,0.75)' }]}>{fmtT(r.createdAt)}</Text>
                        {mine && !isGroup && (
                          <MaterialIcons name="done-all" size={13} color={r.readAt ? '#7DD3FC' : 'rgba(255,255,255,0.6)'} />
                        )}
                      </View>
                    </View>
                  </View>
                );
              }}
            />

            {/* Jump to latest — appears once you scroll up to read history */}
            {notAtBottom && (
              <TouchableOpacity
                style={styles.jumpFab}
                onPress={() => { atBottomRef.current = true; setNotAtBottom(false); scrollToEnd(true); }}
              >
                <MaterialIcons name="keyboard-double-arrow-down" size={22} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* @mention suggestions (group chats) */}
        {mentionOptions.length > 0 && (
          <View style={styles.mentionBar}>
            {mentionOptions.map((mb) => (
              <TouchableOpacity key={mb.id} style={styles.mentionChip} onPress={() => insertMention(mb)}>
                <Text style={styles.mentionChipAt}>@</Text>
                <Text style={styles.mentionChipText}>{mb.fullName || mb.username}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Composer */}
        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            placeholder="Type a message…"
            placeholderTextColor="#9CA3AF"
            value={text}
            onChangeText={setText}
            multiline
            maxLength={1000}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!text.trim() || sending) && { opacity: 0.5 }]}
            disabled={!text.trim() || sending}
            onPress={send}
          >
            {sending ? <ActivityIndicator color="#fff" size="small" /> : <MaterialIcons name="send" size={20} color="#fff" />}
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#EEF1F6' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 50, paddingBottom: 14, paddingHorizontal: 14, elevation: 6 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.14)', justifyContent: 'center', alignItems: 'center' },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  title: { color: '#fff', fontSize: 15.5, fontWeight: '800' },
  subTitle: { color: '#C7D2FE', fontSize: 11 },

  empty: { alignItems: 'center', paddingVertical: 60, gap: 8 },
  emptyText: { color: '#9CA3AF', fontSize: 13, textAlign: 'center' },

  dayWrap: { alignSelf: 'center', backgroundColor: '#E2E8F0', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3, marginVertical: 8 },
  dayText: { fontSize: 10.5, color: '#475569', fontWeight: '700' },

  bubbleRow: { flexDirection: 'row', marginVertical: 3 },
  bubble: { maxWidth: '80%', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 },
  bubbleMine: { backgroundColor: INDIGO, borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: '#fff', borderBottomLeftRadius: 4, elevation: 1 },
  senderName: { fontSize: 11, fontWeight: '800', marginBottom: 2 },
  bubbleText: { fontSize: 14, color: '#111827', lineHeight: 19 },
  bubbleTaggedMe: { borderWidth: 1.5, borderColor: '#F59E0B', backgroundColor: '#FFFBEB' },
  mention: { color: '#4F46E5', fontWeight: '800' },
  mentionInMine: { color: '#BFDBFE', fontWeight: '800' },
  mentionMe: { backgroundColor: '#FDE68A', color: '#92400E', fontWeight: '800' },
  mentionBar: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, paddingHorizontal: 10, paddingTop: 8, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#E5E7EB' },
  mentionChip: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: '#EEF2FF', borderRadius: 16, paddingHorizontal: 11, paddingVertical: 6, borderWidth: 1, borderColor: '#E0E7FF' },
  mentionChipAt: { color: '#4F46E5', fontWeight: '900', fontSize: 12.5 },
  mentionChipText: { color: '#1E3A8A', fontWeight: '700', fontSize: 12.5 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-end', marginTop: 3 },
  metaText: { fontSize: 9.5, color: '#9CA3AF' },

  jumpFab: { position: 'absolute', right: 14, bottom: 12, width: 42, height: 42, borderRadius: 21, backgroundColor: INDIGO, justifyContent: 'center', alignItems: 'center', elevation: 4, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } },

  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#E5E7EB' },
  input: { flex: 1, maxHeight: 110, backgroundColor: '#F3F4F6', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9, fontSize: 14, color: '#111827' },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: INDIGO, justifyContent: 'center', alignItems: 'center' },
});
