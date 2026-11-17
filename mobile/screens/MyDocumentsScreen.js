import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, RefreshControl, Modal, TextInput, Alert, Linking,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import { api, apiUpload, fileUrl } from '../lib/api';
import { GradientHeader, BottomNav, Card, Chip, PrimaryButton, SheetOverlay } from '../components/ui';
import { COLORS, RADIUS } from '../lib/theme';

/* My documents (private folder shared with HR) + company assets I hold.
 * Employees can add photos of their own documents; HR can add PDFs/letters. */
const when = (iso) => new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

export default function MyDocumentsScreen({ navigation }) {
  const [tab, setTab] = useState('docs');
  const [docs, setDocs] = useState(null);
  const [assets, setAssets] = useState([]);
  const [cats, setCats] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [adding, setAdding] = useState(null); // { uri, name, type }
  const [category, setCategory] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [d, a] = await Promise.all([api('/documents/my'), api('/assets/my')]);
      setDocs(d.documents || []); setAssets(a.assets || []);
    } catch { setDocs((p) => p ?? []); }
    finally { setRefreshing(false); }
  }, []);
  useEffect(() => { load(); api('/documents/categories').then((c) => { setCats(c); setCategory(c[0]); }).catch(() => {}); }, [load]);

  const pick = async (useCamera) => {
    const perm = useCamera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission needed', 'Allow access to add a photo of your document.'); return; }
    const res = useCamera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (res.canceled || !res.assets?.length) return;
    const a = res.assets[0];
    setTitle(''); setAdding({ uri: a.uri, name: a.fileName || 'document.jpg', type: a.mimeType || 'image/jpeg' });
  };

  const upload = async () => {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', { uri: adding.uri, name: adding.name, type: adding.type });
      fd.append('category', category);
      fd.append('title', title.trim() || category);
      await apiUpload('/documents', fd);
      setAdding(null); load();
    } catch (e) { Alert.alert('Upload failed', e.message); } finally { setBusy(false); }
  };

  const open = (d) => Linking.openURL(fileUrl(`api/documents/${d.id}/file`)).catch(() => Alert.alert('Could not open the document'));
  const remove = (d) => Alert.alert('Delete document', `Delete "${d.title}"?`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: async () => {
      try { await api(`/documents/${d.id}`, { method: 'DELETE' }); load(); } catch (e) { Alert.alert('Could not delete', e.message); }
    } },
  ]);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <GradientHeader title="My Documents" subtitle="Your files with HR & company assets you hold" onBack={() => navigation.goBack()}>
        <View style={styles.segment}>
          {[['docs', 'Documents'], ['assets', `Assets${assets.length ? ` · ${assets.length}` : ''}`]].map(([k, l]) => (
            <TouchableOpacity key={k} style={[styles.segBtn, tab === k && styles.segOn]} onPress={() => setTab(k)}>
              <Text style={[styles.segText, tab === k && { color: COLORS.primary }]}>{l}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </GradientHeader>

      {docs === null ? <ActivityIndicator size="large" color={COLORS.primary} style={{ flex: 1 }} /> : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={[COLORS.primary]} />}>
          {tab === 'docs' ? (
            <>
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
                <TouchableOpacity style={styles.addBtn} onPress={() => pick(true)}>
                  <MaterialIcons name="photo-camera" size={18} color={COLORS.primary} /><Text style={styles.addText}>Scan with camera</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.addBtn} onPress={() => pick(false)}>
                  <MaterialIcons name="photo-library" size={18} color={COLORS.primary} /><Text style={styles.addText}>From gallery</Text>
                </TouchableOpacity>
              </View>
              {docs.length === 0 && <Text style={styles.empty}>No documents yet. Add your ID proof, PAN, certificates…</Text>}
              {docs.map((d) => (
                <Card key={d.id} style={styles.card}>
                  <TouchableOpacity style={styles.docRow} onPress={() => open(d)} activeOpacity={0.8}>
                    <MaterialIcons name={d.mimeType === 'application/pdf' ? 'picture-as-pdf' : 'image'} size={26} color={d.mimeType === 'application/pdf' ? COLORS.red : COLORS.primary} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.docTitle} numberOfLines={1}>{d.title}</Text>
                      <Text style={styles.meta}>{d.category} · {when(d.createdAt)}{d.uploadedById !== d.userId ? ' · from HR' : ''}</Text>
                    </View>
                    {d.uploadedById === d.userId && (
                      <TouchableOpacity onPress={() => remove(d)} hitSlop={8}><MaterialIcons name="delete-outline" size={20} color={COLORS.red} /></TouchableOpacity>
                    )}
                  </TouchableOpacity>
                </Card>
              ))}
              <Text style={styles.note}>Only you and HR can open these files.</Text>
            </>
          ) : (
            <>
              {assets.length === 0 && <Text style={styles.empty}>No company assets are issued to you.</Text>}
              {assets.map((a) => (
                <Card key={a.id} style={styles.card}>
                  <View style={styles.docRow}>
                    <MaterialIcons name="inventory-2" size={24} color={COLORS.primary} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.docTitle}>{a.name}</Text>
                      <Text style={styles.meta}>{a.tag} · {a.category}{a.serialNo ? ` · S/N ${a.serialNo}` : ''}</Text>
                      {a.assignedAt && <Text style={styles.meta}>Issued {when(a.assignedAt)}</Text>}
                    </View>
                    <Chip text="With you" color={COLORS.primary} soft={COLORS.indigoSoft} />
                  </View>
                </Card>
              ))}
              {assets.length > 0 && <Text style={styles.note}>Return these to HR before your last working day.</Text>}
            </>
          )}
        </ScrollView>
      )}

      <Modal visible={!!adding} transparent animationType="slide" onRequestClose={() => setAdding(null)}>
        <SheetOverlay>
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>Add document</Text>
            <Text style={styles.label}>TYPE</Text>
            <View style={styles.cats}>
              {cats.map((c) => (
                <TouchableOpacity key={c} onPress={() => setCategory(c)} style={[styles.cat, category === c && styles.catOn]}>
                  <Text style={[styles.catText, category === c && { color: '#fff' }]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.label}>NAME</Text>
            <TextInput style={styles.input} value={title} onChangeText={setTitle} maxLength={100} placeholder="e.g. Aadhaar card (front)" placeholderTextColor={COLORS.faint} />
            <PrimaryButton title="Upload" icon="cloud-upload" busy={busy} onPress={upload} style={{ marginTop: 14 }} />
            <TouchableOpacity style={{ alignItems: 'center', paddingVertical: 12 }} onPress={() => setAdding(null)}>
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
  segment: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 12, padding: 4, marginTop: 14 },
  segBtn: { flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: 'center' },
  segOn: { backgroundColor: '#fff' },
  segText: { color: '#E0E7FF', fontWeight: '700', fontSize: 12.5 },
  addBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 44,
    borderRadius: RADIUS.button, borderWidth: 1.5, borderColor: '#C7D2FE', backgroundColor: COLORS.indigoSoft,
  },
  addText: { color: COLORS.primary, fontWeight: '700', fontSize: 13 },
  empty: { color: COLORS.faint, fontSize: 13, textAlign: 'center', marginTop: 20 },
  note: { color: COLORS.faint, fontSize: 11.5, textAlign: 'center', marginTop: 8 },
  card: { padding: 12, marginBottom: 8 },
  docRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  docTitle: { fontSize: 14, fontWeight: '800', color: COLORS.ink },
  meta: { fontSize: 11.5, color: COLORS.faint, marginTop: 2 },
  sheet: { backgroundColor: COLORS.card, borderTopLeftRadius: RADIUS.sheet, borderTopRightRadius: RADIUS.sheet, padding: 18, paddingBottom: 26 },
  handle: { width: 42, height: 5, borderRadius: 3, backgroundColor: COLORS.line, alignSelf: 'center', marginBottom: 12 },
  sheetTitle: { fontSize: 16, fontWeight: '800', color: COLORS.ink, textAlign: 'center' },
  label: { fontSize: 10.5, fontWeight: '800', color: COLORS.faint, letterSpacing: 0.6, marginTop: 12, marginBottom: 6 },
  cats: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  cat: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.field },
  catOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  catText: { fontSize: 12, fontWeight: '700', color: COLORS.sub },
  input: {
    backgroundColor: COLORS.field, borderWidth: 1.5, borderColor: COLORS.line, borderRadius: RADIUS.input,
    paddingHorizontal: 12, height: 48, fontSize: 14, color: COLORS.ink,
  },
});
