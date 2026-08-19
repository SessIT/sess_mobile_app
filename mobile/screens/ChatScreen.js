import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, TextInput,
  ActivityIndicator, Alert, Image, Modal, Linking,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import { api, apiUpload, API_URL } from '../lib/api';
import { GradientHeader } from '../components/ui';
import { COLORS, SHADOW } from '../lib/theme';
import { useKeyboard } from '../lib/useKeyboard';

const BASE = API_URL.replace('/api', '');
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
  const [uploading, setUploading] = useState(false); // media upload in flight
  const [pendingMedia, setPendingMedia] = useState(null); // asset awaiting preview-confirm
  const [mediaCaption, setMediaCaption] = useState('');
  const [viewer, setViewer] = useState(null); // full-screen image URL
  const [notAtBottom, setNotAtBottom] = useState(false);
  const kb = useKeyboard();

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

  // The composer grows by the keyboard height so the list shrinks — re-pin to the
  // newest message, but only if the user was already reading the bottom.
  useEffect(() => {
    if (kb.visible && atBottomRef.current) scrollToEnd(true);
  }, [kb.visible]); // eslint-disable-line react-hooks/exhaustive-deps

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

  /* ---------- media: pick / shoot -> WhatsApp-style preview -> send ---------- */
  const stageMedia = (asset) => {
    if (asset.fileSize && asset.fileSize > 25 * 1024 * 1024) {
      Alert.alert('Too large', 'Please pick a file under 25 MB.');
      return;
    }
    setMediaCaption(text.trim()); // typed text carries over as the caption
    setPendingMedia(asset);
  };

  const pickFromGallery = async () => {
    if (uploading) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow gallery access to share photos and videos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.7,
    });
    if (!result.canceled && result.assets?.length) stageMedia(result.assets[0]);
  };

  const takePhoto = async () => {
    if (uploading) return;
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow camera access to take a photo.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });
    if (!result.canceled && result.assets?.length) stageMedia(result.assets[0]);
  };

  // Confirmed in the preview — upload then send with the caption.
  const sendPendingMedia = async () => {
    const asset = pendingMedia;
    if (!asset || uploading) return;
    setUploading(true);
    try {
      // SDK 57: the WinterCG fetch only accepts real Blob/File parts — the
      // expo-file-system File class wraps the picked URI as a proper Blob.
      const form = new FormData();
      const file = new File(asset.uri);
      form.append(
        'file',
        file,
        asset.fileName || `media${asset.type === 'video' ? '.mp4' : '.jpg'}`
      );
      const up = await apiUpload('/chat/upload', form);
      const msg = await api('/chat/send', {
        method: 'POST',
        body: JSON.stringify({
          ...(isGroup ? { groupId: group.id } : { toUserId: other.id }),
          body: mediaCaption.trim(),
          attachment: up.path,
          attachmentType: up.type,
        }),
      });
      setPendingMedia(null);
      setMediaCaption('');
      setText('');
      mergeIn([msg], { fromMe: true });
    } catch (e) { Alert.alert('Could not share', e.message); }
    finally { setUploading(false); }
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
    <View style={styles.container} onLayout={kb.onLayout}>
      <StatusBar style="light" />
      {/* Compact thread header: back · avatar · name/subtitle, inside the shared gradient */}
      <GradientHeader style={styles.header}>
        <View style={styles.headRow}>
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
        </View>
      </GradientHeader>

      {messages === null ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 40 }} />
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
                    {r.attachment ? (
                      r.attachmentType === 'video' ? (
                        <TouchableOpacity
                          style={styles.mediaVideo}
                          activeOpacity={0.85}
                          onPress={() => Linking.openURL(`${BASE}/${r.attachment}`)}
                        >
                          <MaterialIcons name="play-circle-filled" size={42} color="#fff" />
                          <Text style={styles.mediaVideoText}>Video · tap to play</Text>
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity activeOpacity={0.9} onPress={() => setViewer(`${BASE}/${r.attachment}`)}>
                          <Image source={{ uri: `${BASE}/${r.attachment}` }} style={styles.mediaImage} />
                        </TouchableOpacity>
                      )
                    ) : null}
                    {r.body ? (
                      <Text style={[styles.bubbleText, mine && { color: '#fff' }, r.attachment && { marginTop: 6 }]}>
                        {renderBody(r.body, mine)}
                      </Text>
                    ) : null}
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

      {/* Composer — owns the bottom strip, so it pays the safe-area inset when
          the keyboard is closed. Android resizes the window for the IME, so it
          already sits on the keyboard when open (see lib/useKeyboard). */}
      <View style={[styles.composer, { paddingBottom: kb.inset }]}>
        <TouchableOpacity style={styles.attachBtn} disabled={uploading} onPress={pickFromGallery}>
          <MaterialIcons name="photo-library" size={21} color={COLORS.primary} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.attachBtn} disabled={uploading} onPress={takePhoto}>
          <MaterialIcons name="photo-camera" size={21} color={COLORS.primary} />
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          placeholder={uploading ? 'Sharing media…' : 'Type a message…'}
          placeholderTextColor={COLORS.faint}
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

      {/* WhatsApp-style media preview: confirm + caption BEFORE sending */}
      <Modal
        visible={!!pendingMedia}
        transparent
        animationType="slide"
        onRequestClose={() => !uploading && setPendingMedia(null)}
      >
        <View style={styles.previewOverlay}>
          {/* Header */}
          <View style={styles.previewHead}>
            <TouchableOpacity
              style={styles.previewClose}
              disabled={uploading}
              onPress={() => { setPendingMedia(null); setMediaCaption(''); }}
            >
              <MaterialIcons name="close" size={24} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.previewTitle}>
              Send to {isGroup ? (groupInfo?.name || group.name) : (other?.fullName || other?.username)}
            </Text>
          </View>

          {/* Media */}
          <View style={styles.previewBody}>
            {pendingMedia?.type === 'video' ? (
              <View style={styles.previewVideo}>
                <MaterialIcons name="play-circle-filled" size={64} color="#fff" />
                <Text style={styles.previewVideoText}>
                  Video ready{pendingMedia?.fileSize ? ` · ${(pendingMedia.fileSize / (1024 * 1024)).toFixed(1)} MB` : ''}
                </Text>
              </View>
            ) : pendingMedia ? (
              <Image source={{ uri: pendingMedia.uri }} style={styles.previewImage} resizeMode="contain" />
            ) : null}
          </View>

          {/* Caption + send — same spacing rule as the main composer; the
              dialog window resizes for the IME just like the activity does. */}
          <View
            style={[
              styles.previewFoot,
              { paddingBottom: kb.visible ? 12 + kb.lift : Math.max(kb.inset, 26) },
            ]}
          >
            <TextInput
              style={styles.previewCaption}
              placeholder="Add a caption…"
              placeholderTextColor="rgba(255,255,255,0.55)"
              value={mediaCaption}
              onChangeText={setMediaCaption}
              multiline
              maxLength={1000}
              editable={!uploading}
            />
            <TouchableOpacity
              style={[styles.previewSend, uploading && { opacity: 0.6 }]}
              disabled={uploading}
              onPress={sendPendingMedia}
            >
              {uploading
                ? <ActivityIndicator color="#fff" size="small" />
                : <MaterialIcons name="send" size={22} color="#fff" />}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Full-screen image viewer */}
      <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
        <View style={styles.viewerOverlay}>
          <TouchableOpacity style={styles.viewerClose} onPress={() => setViewer(null)}>
            <MaterialIcons name="close" size={26} color="#fff" />
          </TouchableOpacity>
          {viewer && <Image source={{ uri: viewer }} style={styles.viewerImage} resizeMode="contain" />}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },

  /* header (custom row rendered as GradientHeader children) */
  header: { paddingBottom: 14 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.14)', justifyContent: 'center', alignItems: 'center' },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  title: { color: '#fff', fontSize: 15.5, fontWeight: '800' },
  subTitle: { color: '#C7D2FE', fontSize: 11, marginTop: 1 },

  empty: { alignItems: 'center', paddingVertical: 60, gap: 8 },
  emptyText: { color: COLORS.faint, fontSize: 13, textAlign: 'center' },

  dayWrap: { alignSelf: 'center', backgroundColor: '#E2E8F0', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3, marginVertical: 8 },
  dayText: { fontSize: 10.5, color: '#475569', fontWeight: '700' },

  bubbleRow: { flexDirection: 'row', marginVertical: 3 },
  bubble: { maxWidth: '80%', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 },
  bubbleMine: { backgroundColor: COLORS.primary, borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: COLORS.card, borderBottomLeftRadius: 4, ...SHADOW.card, elevation: 1 },
  senderName: { fontSize: 11, fontWeight: '800', marginBottom: 2 },
  bubbleText: { fontSize: 14, color: COLORS.ink, lineHeight: 19 },
  bubbleTaggedMe: { borderWidth: 1.5, borderColor: '#F59E0B', backgroundColor: '#FFFBEB' },
  mention: { color: COLORS.accent, fontWeight: '800' },
  mentionInMine: { color: '#BFDBFE', fontWeight: '800' },
  mentionMe: { backgroundColor: '#FDE68A', color: '#92400E', fontWeight: '800' },
  mentionBar: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, paddingHorizontal: 10, paddingTop: 8, backgroundColor: COLORS.card, borderTopWidth: 1, borderTopColor: COLORS.line },
  mentionChip: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: COLORS.indigoSoft, borderRadius: 16, paddingHorizontal: 11, paddingVertical: 6, borderWidth: 1, borderColor: '#E0E7FF' },
  mentionChipAt: { color: COLORS.accent, fontWeight: '900', fontSize: 12.5 },
  mentionChipText: { color: COLORS.primary, fontWeight: '700', fontSize: 12.5 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-end', marginTop: 3 },
  metaText: { fontSize: 9.5, color: COLORS.faint },

  jumpFab: { position: 'absolute', right: 14, bottom: 12, width: 42, height: 42, borderRadius: 21, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center', ...SHADOW.raised, elevation: 4 },

  // paddingBottom is set per-render from useKeyboard — safe-area inset when idle,
  // keyboard height when typing — so the bar always clears the system nav bar.
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 10, paddingTop: 10, backgroundColor: COLORS.card, borderTopWidth: 1, borderTopColor: COLORS.line },
  attachBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.indigoSoft, justifyContent: 'center', alignItems: 'center' },
  mediaImage: { width: 210, height: 210, borderRadius: 12, backgroundColor: COLORS.line },
  mediaVideo: { width: 210, height: 130, borderRadius: 12, backgroundColor: '#0F172A', justifyContent: 'center', alignItems: 'center', gap: 4 },
  mediaVideoText: { color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '700' },
  previewOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.96)' },
  previewHead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 50, paddingHorizontal: 16, paddingBottom: 10 },
  previewClose: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.14)', justifyContent: 'center', alignItems: 'center' },
  previewTitle: { flex: 1, color: '#fff', fontSize: 14.5, fontWeight: '800' },
  previewBody: { flex: 1, justifyContent: 'center', paddingHorizontal: 10 },
  previewImage: { width: '100%', height: '100%' },
  previewVideo: { alignItems: 'center', gap: 10 },
  previewVideoText: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '700' },
  previewFoot: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, padding: 12, paddingBottom: 26 },
  previewCaption: { flex: 1, maxHeight: 100, backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 22, paddingHorizontal: 16, paddingVertical: 11, fontSize: 14.5, color: '#fff' },
  previewSend: { width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.green, justifyContent: 'center', alignItems: 'center', elevation: 3 },

  viewerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center' },
  viewerClose: { position: 'absolute', top: 48, right: 18, zIndex: 2, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
  viewerImage: { width: '100%', height: '80%' },
  input: { flex: 1, maxHeight: 110, backgroundColor: COLORS.field, borderWidth: 1, borderColor: COLORS.line, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9, fontSize: 14, color: COLORS.ink },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center' },
});
