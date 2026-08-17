import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, FlatList, Image,
  ActivityIndicator, Alert, Modal, RefreshControl,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { MaterialIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import { GradientHeader, BottomNav } from '../components/ui';
import { COLORS } from '../lib/theme';
import { api, apiUpload, API_URL } from '../lib/api';
import { useKeyboard } from '../lib/useKeyboard';

const BASE = API_URL.replace('/api', '');

/* My Notes — two things in one list:
 *   • notices an admin sent to me (kind: 'admin') — READ ONLY, no reply path
 *   • my own self notes (kind: 'self') — editable & deletable, private to me
 * The composer only ever creates self notes. */

const when = (iso) => {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  return sameDay
    ? `Today · ${time}`
    : `${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · ${time}`;
};

export default function NotesScreen({ navigation }) {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingPhoto, setPendingPhoto] = useState(null); // staged asset before saving
  const [editing, setEditing] = useState(null);           // { id, body } while editing a self note
  const [viewPhoto, setViewPhoto] = useState(null);       // full-screen photo viewer
  const inputRef = useRef(null);
  const kb = useKeyboard();

  const load = useCallback(async () => {
    try {
      const r = await api('/notes');
      setNotes(r.notes || []);
      // Opening the screen counts as reading the admin notices.
      api('/notes/read', { method: 'PATCH' }).catch(() => {});
    } catch (e) {
      Alert.alert('Could not load notes', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    return navigation.addListener('focus', load);
  }, [navigation, load]);

  /* ----- self note create / edit ----- */
  const save = async () => {
    const body = text.trim();
    if ((!body && !pendingPhoto) || saving) return;
    setSaving(true);
    try {
      if (editing) {
        const updated = await api(`/notes/${editing.id}`, {
          method: 'PATCH', body: JSON.stringify({ body }),
        });
        setNotes(prev => prev.map(n => (n.id === editing.id ? { ...n, body: updated.body } : n)));
        setEditing(null);
      } else {
        let photo = null;
        if (pendingPhoto) {
          setUploading(true);
          const form = new FormData();
          // SDK 57: fetch only accepts real Blob/File parts — File wraps the URI.
          form.append('file', new File(pendingPhoto.uri), pendingPhoto.fileName || 'note.jpg');
          photo = (await apiUpload('/notes/upload', form)).path;
          setUploading(false);
        }
        const created = await api('/notes', {
          method: 'POST', body: JSON.stringify({ body, photo }),
        });
        setNotes(prev => [{ ...created, kind: 'self', from: null }, ...prev]);
        setPendingPhoto(null);
      }
      setText('');
    } catch (e) {
      Alert.alert('Could not save', e.message);
    } finally {
      setSaving(false);
      setUploading(false);
    }
  };

  const startEdit = (note) => {
    setEditing({ id: note.id, body: note.body });
    setText(note.body);
    setPendingPhoto(null);
    inputRef.current?.focus();
  };

  const cancelEdit = () => { setEditing(null); setText(''); };

  const remove = (note) => {
    Alert.alert('Delete note?', 'This note will be removed permanently.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await api(`/notes/${note.id}`, { method: 'DELETE' });
            setNotes(prev => prev.filter(n => n.id !== note.id));
            if (editing?.id === note.id) cancelEdit();
          } catch (e) { Alert.alert('Could not delete', e.message); }
        },
      },
    ]);
  };

  /* ----- photo attachment (self notes only) ----- */
  const attach = async (fromCamera) => {
    if (uploading || saving || editing) return;
    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', `Allow ${fromCamera ? 'camera' : 'gallery'} access to attach a photo.`);
      return;
    }
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (!result.canceled && result.assets?.length) setPendingPhoto(result.assets[0]);
  };

  const photoOptions = () => {
    Alert.alert('Attach a photo', 'Add a photo to this note', [
      { text: 'Take photo', onPress: () => attach(true) },
      { text: 'Choose from gallery', onPress: () => attach(false) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  /* ----- rendering ----- */
  const renderNote = ({ item }) => {
    const fromAdmin = item.kind === 'admin';
    return (
      <View style={[styles.note, fromAdmin ? styles.noteAdmin : styles.noteSelf]}>
        <View style={styles.noteHead}>
          <View style={[styles.badge, fromAdmin ? styles.badgeAdmin : styles.badgeSelf]}>
            <MaterialIcons
              name={fromAdmin ? 'campaign' : 'sticky-note-2'}
              size={13}
              color={fromAdmin ? COLORS.primary : COLORS.orange}
            />
            <Text style={[styles.badgeText, { color: fromAdmin ? COLORS.primary : COLORS.orange }]}>
              {fromAdmin ? `FROM ${(item.from || 'ADMIN').toUpperCase()}` : 'MY NOTE'}
            </Text>
          </View>
          <Text style={styles.noteTime}>{when(item.createdAt)}</Text>
        </View>

        {item.body ? <Text style={styles.noteBody}>{item.body}</Text> : null}

        {item.photo ? (
          <TouchableOpacity activeOpacity={0.9} onPress={() => setViewPhoto(`${BASE}/${item.photo}`)}>
            <Image source={{ uri: `${BASE}/${item.photo}` }} style={styles.notePhoto} resizeMode="cover" />
          </TouchableOpacity>
        ) : null}

        {fromAdmin ? (
          // One-way by design: there is no reply control anywhere on this card.
          <View style={styles.noReply}>
            <MaterialIcons name="lock" size={12} color={COLORS.faint} />
            <Text style={styles.noReplyText}>Notice from admin · replies are not enabled</Text>
          </View>
        ) : (
          <View style={styles.actions}>
            <TouchableOpacity style={styles.action} onPress={() => startEdit(item)}>
              <MaterialIcons name="edit" size={15} color={COLORS.sub} />
              <Text style={styles.actionText}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.action} onPress={() => remove(item)}>
              <MaterialIcons name="delete-outline" size={15} color={COLORS.red} />
              <Text style={[styles.actionText, { color: COLORS.red }]}>Delete</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  const adminCount = notes.filter(n => n.kind === 'admin').length;

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <GradientHeader
        title="My Notes"
        subtitle={adminCount ? `${adminCount} notice${adminCount === 1 ? '' : 's'} from admin` : 'Private to you'}
        onBack={() => navigation.goBack()}
      />

      {/* The composer is lifted by hand (see lib/useKeyboard) — a
          KeyboardAvoidingView cannot see the IME under Android edge-to-edge. */}
      <View style={{ flex: 1 }}>
        {loading ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={COLORS.primary} />
        ) : (
          <FlatList
            data={notes}
            keyExtractor={(n) => String(n.id)}
            renderItem={renderNote}
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={COLORS.primary} />
            }
            ListEmptyComponent={
              <View style={styles.empty}>
                <View style={styles.emptyIcon}>
                  <MaterialIcons name="sticky-note-2" size={40} color={COLORS.primary} />
                </View>
                <Text style={styles.emptyTitle}>No notes yet</Text>
                <Text style={styles.emptyNote}>
                  Write a quick note below — it stays private to you. Notices sent by admin also appear here.
                </Text>
              </View>
            }
          />
        )}

        {/* staged photo preview */}
        {pendingPhoto && (
          <View style={styles.pending}>
            <Image source={{ uri: pendingPhoto.uri }} style={styles.pendingImg} />
            <Text style={styles.pendingText} numberOfLines={1}>Photo attached</Text>
            <TouchableOpacity onPress={() => setPendingPhoto(null)}>
              <MaterialIcons name="close" size={20} color={COLORS.sub} />
            </TouchableOpacity>
          </View>
        )}

        {editing && (
          <View style={styles.editingBar}>
            <MaterialIcons name="edit" size={15} color={COLORS.primary} />
            <Text style={styles.editingText}>Editing note</Text>
            <TouchableOpacity onPress={cancelEdit}>
              <Text style={styles.editingCancel}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* composer — self notes only. While the keyboard is up the BottomNav is
            gone, so the composer carries the whole bottom gap itself. */}
        <View style={[styles.composer, kb.visible && { paddingBottom: 10 + kb.lift }]}>
          <TouchableOpacity
            style={[styles.attachBtn, (editing || uploading) && { opacity: 0.4 }]}
            onPress={photoOptions}
            disabled={!!editing || uploading}
          >
            <MaterialIcons name="photo-camera" size={22} color={COLORS.primary} />
          </TouchableOpacity>
          <TextInput
            ref={inputRef}
            style={styles.input}
            placeholder={uploading ? 'Uploading photo…' : 'Write a note…'}
            placeholderTextColor={COLORS.faint}
            value={text}
            onChangeText={setText}
            multiline
            maxLength={2000}
            editable={!saving}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (saving || (!text.trim() && !pendingPhoto)) && { opacity: 0.5 }]}
            onPress={save}
            disabled={saving || (!text.trim() && !pendingPhoto)}
          >
            {saving
              ? <ActivityIndicator size="small" color="#fff" />
              : <MaterialIcons name={editing ? 'check' : 'send'} size={22} color="#fff" />}
          </TouchableOpacity>
        </View>
      </View>

      <Modal visible={!!viewPhoto} transparent animationType="fade" onRequestClose={() => setViewPhoto(null)}>
        <View style={styles.viewer}>
          <TouchableOpacity style={styles.viewerClose} onPress={() => setViewPhoto(null)}>
            <MaterialIcons name="close" size={26} color="#fff" />
          </TouchableOpacity>
          {viewPhoto && <Image source={{ uri: viewPhoto }} style={styles.viewerImg} resizeMode="contain" />}
        </View>
      </Modal>

      {!kb.visible && <BottomNav navigation={navigation} active="profile" />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  list: { padding: 16, paddingBottom: 8 },

  note: { backgroundColor: COLORS.card, borderRadius: 16, padding: 14, marginBottom: 12, elevation: 2, shadowColor: '#1E3A8A', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  noteAdmin: { borderLeftWidth: 4, borderLeftColor: COLORS.primary },
  noteSelf: { borderLeftWidth: 4, borderLeftColor: COLORS.orange },
  noteHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  badgeAdmin: { backgroundColor: COLORS.indigoSoft },
  badgeSelf: { backgroundColor: COLORS.orangeSoft },
  badgeText: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.4 },
  noteTime: { fontSize: 10.5, color: COLORS.faint, fontWeight: '600' },
  noteBody: { fontSize: 14, color: COLORS.ink, lineHeight: 20 },
  notePhoto: { width: '100%', height: 180, borderRadius: 12, marginTop: 10, backgroundColor: COLORS.field },

  noReply: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10 },
  noReplyText: { fontSize: 10.5, color: COLORS.faint, fontStyle: 'italic' },
  actions: { flexDirection: 'row', gap: 16, marginTop: 10, paddingTop: 9, borderTopWidth: 1, borderTopColor: COLORS.line },
  action: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionText: { fontSize: 12, fontWeight: '700', color: COLORS.sub },

  empty: { alignItems: 'center', paddingHorizontal: 32, paddingTop: 60 },
  emptyIcon: { width: 88, height: 88, borderRadius: 44, backgroundColor: COLORS.indigoSoft, justifyContent: 'center', alignItems: 'center', marginBottom: 14 },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: COLORS.ink },
  emptyNote: { fontSize: 13, color: COLORS.sub, textAlign: 'center', marginTop: 8, lineHeight: 19 },

  pending: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 12, marginBottom: 6, backgroundColor: COLORS.card, borderRadius: 12, padding: 8, elevation: 1 },
  pendingImg: { width: 40, height: 40, borderRadius: 8 },
  pendingText: { flex: 1, fontSize: 12.5, color: COLORS.sub, fontWeight: '600' },

  editingBar: { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 12, marginBottom: 6, backgroundColor: COLORS.indigoSoft, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  editingText: { flex: 1, fontSize: 12, fontWeight: '700', color: COLORS.primary },
  editingCancel: { fontSize: 12, fontWeight: '800', color: COLORS.red },

  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingBottom: 10 },
  attachBtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: COLORS.indigoSoft, justifyContent: 'center', alignItems: 'center' },
  input: {
    flex: 1, minHeight: 46, maxHeight: 120, borderRadius: 23, borderWidth: 1.5,
    borderColor: '#C7D2FE', backgroundColor: COLORS.card, paddingHorizontal: 16,
    paddingTop: 12, paddingBottom: 12, fontSize: 14, color: COLORS.ink,
  },
  sendBtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center', elevation: 3 },

  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center' },
  viewerClose: { position: 'absolute', top: 48, right: 20, zIndex: 2, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
  viewerImg: { width: '100%', height: '80%' },
});
