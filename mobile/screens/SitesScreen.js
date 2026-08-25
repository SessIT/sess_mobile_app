import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, RefreshControl, Modal, TextInput, Alert, Switch, Linking,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';
import { api } from '../lib/api';
import { GradientHeader, BottomNav, Card, Chip, PrimaryButton, HeaderIconButton } from '../components/ui';
import { COLORS, RADIUS } from '../lib/theme';
import { useKeyboard } from '../lib/useKeyboard';

// Mirrors the backend clamp in routes/sites.js so the saved value never
// silently differs from what the admin typed.
const clampRadius = (r) => Math.min(Math.max(parseInt(r) || 100, 20), 5000);

// Accepts "12.9716, 77.5946" (the format Google Maps copies) — also tolerates
// a space or semicolon separator. Returns { lat, lng } or null.
const parseLatLng = (text) => {
  const m = String(text || '').trim().match(/^(-?\d+(?:\.\d+)?)[,;\s]+(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = parseFloat(m[1]), lng = parseFloat(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
};

const fmtCoords = (lat, lng) => `${lat.toFixed(6)}, ${lng.toFixed(6)}`;

export default function SitesScreen({ navigation }) {
  const [sites, setSites] = useState(null); // null = loading
  const [loadError, setLoadError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [editorSite, setEditorSite] = useState(undefined); // undefined = closed, null = new, object = edit
  const [busyId, setBusyId] = useState(null); // site id with an in-flight toggle/delete

  const load = useCallback(async () => {
    try {
      const res = await api('/sites?all=1');
      setSites(Array.isArray(res) ? res : []);
      setLoadError(null);
    } catch {
      // A failed load must NOT read as "no sites" — that would show the
      // "geofence off" banner for a geofence that may well be on server-side.
      setSites([]);
      setLoadError('Could not load sites. Pull down to retry.');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(); };

  const toggleActive = async (s) => {
    setBusyId(s.id);
    try {
      await api(`/sites/${s.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: !s.isActive }) });
      await load();
    } catch (e) { Alert.alert('Could not update', e.message); }
    // Functional clear: don't wipe another row's busy marker if the admin
    // started a second toggle while this one was in flight.
    finally { setBusyId((prev) => (prev === s.id ? null : prev)); }
  };

  const removeSite = (s) => {
    Alert.alert('Delete site', `Remove “${s.name}”? Employees will no longer be able to punch there.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          setBusyId(s.id);
          try {
            await api(`/sites/${s.id}`, { method: 'DELETE' });
            await load();
          } catch (e) { Alert.alert('Delete failed', e.message); }
          finally { setBusyId((prev) => (prev === s.id ? null : prev)); }
        },
      },
    ]);
  };

  const activeCount = (sites || []).filter(s => s.isActive).length;

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <GradientHeader
        title="Customer Sites"
        subtitle="Authorized punch-in locations"
        onBack={() => navigation.goBack()}
        right={<HeaderIconButton icon="add-location-alt" onPress={() => setEditorSite(null)} />}
      >
        {sites !== null && (
          <View style={styles.countRow}>
            <View style={styles.countPill}>
              <Text style={styles.countPillTxt}>{activeCount} active</Text>
            </View>
            <View style={[styles.countPill, { backgroundColor: 'rgba(255,255,255,0.13)' }]}>
              <Text style={styles.countPillTxt}>{(sites.length - activeCount)} inactive</Text>
            </View>
          </View>
        )}
      </GradientHeader>

      {sites === null ? (
        <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />}
        >
          {loadError && (
            <View style={[styles.warnCard, { backgroundColor: COLORS.redSoft, borderColor: '#FECACA' }]}>
              <MaterialIcons name="cloud-off" size={20} color={COLORS.red} />
              <Text style={[styles.warnText, { color: '#991B1B' }]}>{loadError}</Text>
            </View>
          )}

          {/* Same warning the web console shows: the punch geofence only exists
              once at least one ACTIVE site does. Suppressed on a failed load —
              we don't actually know the server's site list then. */}
          {!loadError && activeCount === 0 && (
            <View style={styles.warnCard}>
              <MaterialIcons name="warning-amber" size={20} color={COLORS.orange} />
              <Text style={styles.warnText}>
                Geofence is OFF — with no active sites, employees can punch in from anywhere.
              </Text>
            </View>
          )}

          {sites.length === 0 ? (
            !loadError && (
              <View style={styles.emptyWrap}>
                <MaterialIcons name="location-off" size={54} color="#CBD5E1" />
                <Text style={styles.emptyTitle}>No sites yet</Text>
                <Text style={styles.emptyHint}>Tap the + button to add the first customer site.</Text>
              </View>
            )
          ) : sites.map((s) => (
            <Card key={s.id} style={[styles.card, !s.isActive && { opacity: 0.65 }]}>
              <View style={styles.cardTop}>
                <View style={[styles.siteIcon, !s.isActive && { backgroundColor: '#F3F4F6' }]}>
                  <MaterialIcons name="place" size={22} color={s.isActive ? COLORS.primary : COLORS.faint} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.siteName} numberOfLines={1}>{s.name}</Text>
                  {s.address ? <Text style={styles.siteAddr} numberOfLines={2}>{s.address}</Text> : null}
                  <Text style={styles.siteCoords}>{fmtCoords(s.lat, s.lng)} · {s.radiusM} m radius</Text>
                </View>
                {busyId === s.id
                  ? <ActivityIndicator size="small" color={COLORS.primary} />
                  : (
                    <Switch
                      value={s.isActive}
                      onValueChange={() => toggleActive(s)}
                      trackColor={{ false: '#D1D5DB', true: '#A5B4FC' }}
                      thumbColor={s.isActive ? COLORS.primary : '#F9FAFB'}
                    />
                  )}
              </View>
              <View style={styles.cardActions}>
                <Chip
                  text={s.isActive ? 'Active' : 'Inactive'}
                  color={s.isActive ? COLORS.green : COLORS.sub}
                  soft={s.isActive ? COLORS.greenSoft : '#F3F4F6'}
                />
                <View style={{ flex: 1 }} />
                <TouchableOpacity style={styles.actionBtn} onPress={() => setEditorSite(s)} disabled={busyId === s.id}>
                  <MaterialIcons name="edit" size={17} color={COLORS.primary} />
                  <Text style={styles.actionTxt}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: COLORS.redSoft }]}
                  onPress={() => removeSite(s)}
                  disabled={busyId === s.id}
                >
                  <MaterialIcons name="delete-outline" size={17} color={COLORS.red} />
                  <Text style={[styles.actionTxt, { color: COLORS.red }]}>Delete</Text>
                </TouchableOpacity>
              </View>
            </Card>
          ))}
        </ScrollView>
      )}

      <SiteEditorSheet
        visible={editorSite !== undefined}
        site={editorSite}
        onClose={() => setEditorSite(undefined)}
        onSaved={() => { setEditorSite(undefined); load(); }}
      />

      <BottomNav navigation={navigation} active="profile" />
    </View>
  );
}

/* ---------------- Add / edit site sheet ---------------- */
const SEARCH_DEBOUNCE_MS = 450; // same pacing as the web Sites editor

function SiteEditorSheet({ visible, site, onClose, onSaved }) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [coordsText, setCoordsText] = useState('');
  const [radius, setRadius] = useState('100');
  const [isActive, setIsActive] = useState(true);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [locBusy, setLocBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});
  const kb = useKeyboard();
  const [, requestLocPermission] = Location.useForegroundPermissions();
  // Guards out-of-order search responses; bumped again when a result is picked
  // so the in-flight request can't reopen the list.
  const searchSeq = useRef(0);
  // Last values WE wrote into name/address from a search pick or GPS fix.
  // A field still holding its auto-filled value may be overwritten by the next
  // pick; a value the admin typed or edited themselves is never clobbered.
  const autoFill = useRef({ name: '', address: '' });

  useEffect(() => {
    if (visible) {
      setName(site?.name || '');
      setAddress(site?.address || '');
      setCoordsText(site ? fmtCoords(site.lat, site.lng) : '');
      setRadius(String(site?.radiusM ?? 100));
      setIsActive(site ? !!site.isActive : true);
      setQuery('');
      setResults([]);
      setSearching(false);
      setLocBusy(false);
      setBusy(false);
      setErrors({});
      autoFill.current = { name: '', address: '' };
    }
  }, [visible, site]);

  // Debounced place search through the backend Nominatim proxy (admin-only).
  useEffect(() => {
    const q = query.trim();
    // Bump the sequence on EVERY query change — including clearing below the
    // minimum — so a response still in flight can never reopen the list.
    const seq = ++searchSeq.current;
    if (q.length < 3) { setResults([]); setSearching(false); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await api(`/geo/search?q=${encodeURIComponent(q)}`);
        if (searchSeq.current === seq) setResults(res.results || []);
      } catch {
        if (searchSeq.current === seq) setResults([]);
      } finally {
        if (searchSeq.current === seq) setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  const pickResult = (r) => {
    searchSeq.current++; // invalidate any in-flight search
    setCoordsText(fmtCoords(r.lat, r.lng));
    const nextName = (r.name || '').slice(0, 80);
    const nextAddress = (r.displayName || '').slice(0, 200);
    let nameFilled = false;
    if (!name.trim() || name === autoFill.current.name) {
      setName(nextName);
      autoFill.current.name = nextName;
      nameFilled = true;
    }
    if (!address.trim() || address === autoFill.current.address) {
      setAddress(nextAddress);
      autoFill.current.address = nextAddress;
    }
    setQuery('');
    setResults([]);
    setErrors((e) => ({ ...e, coords: null, ...(nameFilled ? { name: null } : null) }));
  };

  // Fill the coordinates from the phone's GPS — the natural mobile flow: the
  // admin stands at the customer site and captures it in one tap.
  const useCurrentLocation = async () => {
    setLocBusy(true);
    try {
      const perm = await requestLocPermission();
      if (!perm?.granted) {
        if (perm?.canAskAgain === false) {
          // The OS has stopped prompting — the only way forward is Settings.
          Alert.alert('Location needed', 'Location permission is turned off for this app. Enable it in Settings to capture the site coordinates.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open settings', onPress: () => Linking.openSettings() },
          ]);
        } else {
          Alert.alert('Location needed', 'Allow location access to capture the site coordinates.');
        }
        return;
      }
      const enabled = await Location.hasServicesEnabledAsync();
      if (!enabled) {
        Alert.alert('GPS is off', 'Turn on location (GPS), then try again.');
        return;
      }
      const loc = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000)),
      ]);
      const lat = loc.coords.latitude, lng = loc.coords.longitude;
      setCoordsText(fmtCoords(lat, lng));
      setErrors((e) => ({ ...e, coords: null }));
      if (!address.trim() || address === autoFill.current.address) {
        try {
          const r = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
          if (r?.length) {
            const a = r[0];
            const nextAddress = (a.formattedAddress || [a.name, a.district, a.city].filter(Boolean).join(', ')).slice(0, 200);
            setAddress(nextAddress);
            autoFill.current.address = nextAddress;
          }
        } catch {}
      }
    } catch {
      Alert.alert('No GPS fix', 'Could not get your position. Move to open sky and try again.');
    } finally {
      setLocBusy(false);
    }
  };

  const submit = async () => {
    const next = {};
    if (!name.trim()) next.name = 'Enter the site name.';
    const ll = parseLatLng(coordsText);
    if (!ll) next.coords = 'Enter coordinates as “lat, lng” — search, paste from Google Maps, or use current location.';
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    try {
      const body = {
        name: name.trim(),
        address: address.trim(),
        lat: ll.lat, lng: ll.lng,
        radiusM: clampRadius(radius),
      };
      if (site) {
        await api(`/sites/${site.id}`, { method: 'PATCH', body: JSON.stringify({ ...body, isActive }) });
      } else {
        await api('/sites', { method: 'POST', body: JSON.stringify(body) });
      }
      onSaved();
    } catch (e) {
      Alert.alert('Could not save', e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetOverlay} onLayout={kb.onLayout}>
        <View style={[styles.sheet, kb.visible && { paddingBottom: 26 + kb.lift }]}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>{site ? 'Edit Site' : 'Add Site'}</Text>

          <ScrollView keyboardShouldPersistTaps="handled" style={{ flexShrink: 1 }}>
            <Text style={styles.fieldLabel}>SITE NAME *</Text>
            <TextInput
              style={[styles.input, errors.name && styles.fieldBad]}
              placeholder="e.g. ABC Hospital — Coimbatore"
              placeholderTextColor={COLORS.faint}
              value={name}
              onChangeText={(t) => { setName(t); if (errors.name) setErrors((e) => ({ ...e, name: null })); }}
              maxLength={80}
            />
            {errors.name ? <Text style={styles.fieldError}>{errors.name}</Text> : null}

            <Text style={styles.fieldLabel}>FIND LOCATION</Text>
            <View style={styles.searchRow}>
              <MaterialIcons name="search" size={18} color={COLORS.faint} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search a place (min 3 letters)"
                placeholderTextColor={COLORS.faint}
                value={query}
                onChangeText={setQuery}
              />
              {searching && <ActivityIndicator size="small" color={COLORS.primary} />}
            </View>
            {results.length > 0 && (
              <View style={styles.resultsBox}>
                {results.map((r, i) => (
                  <TouchableOpacity key={`${r.lat},${r.lng},${i}`} style={styles.resultRow} onPress={() => pickResult(r)}>
                    <MaterialIcons name="place" size={16} color={COLORS.primary} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.resultName} numberOfLines={1}>{r.name}</Text>
                      <Text style={styles.resultSub} numberOfLines={1}>{r.displayName}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <TouchableOpacity style={styles.gpsBtn} onPress={useCurrentLocation} disabled={locBusy}>
              {locBusy
                ? <ActivityIndicator size="small" color={COLORS.primary} />
                : <MaterialIcons name="my-location" size={17} color={COLORS.primary} />}
              <Text style={styles.gpsBtnTxt}>{locBusy ? 'Getting GPS fix…' : 'Use my current location'}</Text>
            </TouchableOpacity>

            <Text style={styles.fieldLabel}>COORDINATES (LAT, LNG) *</Text>
            <TextInput
              style={[styles.input, errors.coords && styles.fieldBad]}
              placeholder="e.g. 11.016844, 76.955832"
              placeholderTextColor={COLORS.faint}
              value={coordsText}
              onChangeText={(t) => { setCoordsText(t); if (errors.coords) setErrors((e) => ({ ...e, coords: null })); }}
              keyboardType="numbers-and-punctuation"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.fieldHint}>Tip: in Google Maps, long-press the spot and copy the numbers shown.</Text>
            {errors.coords ? <Text style={styles.fieldError}>{errors.coords}</Text> : null}

            <Text style={styles.fieldLabel}>ADDRESS (OPTIONAL)</Text>
            <TextInput
              style={[styles.input, { height: 68, textAlignVertical: 'top', paddingTop: 12 }]}
              placeholder="Street, area, city"
              placeholderTextColor={COLORS.faint}
              value={address}
              onChangeText={setAddress}
              multiline
              maxLength={200}
            />

            <Text style={styles.fieldLabel}>PUNCH RADIUS (METERS)</Text>
            <TextInput
              style={styles.input}
              value={radius}
              onChangeText={(t) => setRadius(t.replace(/[^0-9]/g, ''))}
              onBlur={() => setRadius(String(clampRadius(radius)))}
              keyboardType="number-pad"
              maxLength={4}
            />
            <Text style={styles.fieldHint}>20–5000 m. Employees can punch inside this circle (plus their GPS accuracy).</Text>

            {site && (
              <View style={styles.activeRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.activeLabel}>Site is active</Text>
                  <Text style={styles.fieldHint}>Inactive sites are ignored by the punch geofence.</Text>
                </View>
                <Switch
                  value={isActive}
                  onValueChange={setIsActive}
                  trackColor={{ false: '#D1D5DB', true: '#A5B4FC' }}
                  thumbColor={isActive ? COLORS.primary : '#F9FAFB'}
                />
              </View>
            )}
          </ScrollView>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={busy}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <PrimaryButton
              title={site ? 'Save changes' : 'Add site'}
              style={{ flex: 1 }}
              busy={busy}
              onPress={submit}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30 },
  // Inside the ScrollView flex:1 wouldn't fill, so the empty state sizes itself.
  emptyWrap: { alignItems: 'center', padding: 30, paddingTop: 70 },
  emptyTitle: { marginTop: 14, fontSize: 16, fontWeight: '700', color: '#374151' },
  emptyHint: { marginTop: 6, fontSize: 13, color: COLORS.faint, textAlign: 'center' },

  countRow: { flexDirection: 'row', gap: 8, marginTop: 16 },
  countPill: {
    backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 5,
  },
  countPillTxt: { color: '#fff', fontSize: 12, fontWeight: '700' },

  list: { padding: 16, paddingBottom: 24 },
  warnCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: COLORS.orangeSoft,
    borderRadius: 14, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#FDE68A',
  },
  warnText: { flex: 1, color: '#92400E', fontSize: 12.5, fontWeight: '600', lineHeight: 18 },

  card: { padding: 14, marginBottom: 10 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  siteIcon: {
    width: 44, height: 44, borderRadius: 14, backgroundColor: COLORS.indigoSoft,
    justifyContent: 'center', alignItems: 'center',
  },
  siteName: { fontSize: 15, fontWeight: '800', color: COLORS.ink },
  siteAddr: { fontSize: 12, color: COLORS.sub, marginTop: 2, lineHeight: 16 },
  siteCoords: { fontSize: 11.5, color: COLORS.faint, marginTop: 3, fontWeight: '600' },
  cardActions: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12,
    borderTopWidth: 1, borderTopColor: COLORS.line, paddingTop: 12,
  },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: COLORS.indigoSoft,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7,
  },
  actionTxt: { fontSize: 12.5, fontWeight: '700', color: COLORS.primary },

  /* editor sheet */
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: COLORS.card, borderTopLeftRadius: RADIUS.sheet, borderTopRightRadius: RADIUS.sheet,
    padding: 18, paddingBottom: 26, maxHeight: '92%',
  },
  sheetHandle: { width: 42, height: 5, borderRadius: 3, backgroundColor: COLORS.line, alignSelf: 'center', marginBottom: 12 },
  sheetTitle: { fontSize: 16, fontWeight: '800', color: COLORS.ink, marginBottom: 12, textAlign: 'center' },
  fieldLabel: { fontSize: 10.5, fontWeight: '800', color: COLORS.faint, letterSpacing: 0.6, marginTop: 12, marginBottom: 8 },
  input: {
    backgroundColor: COLORS.field, borderWidth: 1.5, borderColor: COLORS.line, borderRadius: RADIUS.input,
    paddingHorizontal: 12, height: 50, fontSize: 14, color: COLORS.ink,
  },
  fieldBad: { borderColor: COLORS.red },
  fieldError: { color: COLORS.red, fontSize: 11.5, marginTop: 5 },
  fieldHint: { color: COLORS.faint, fontSize: 11.5, marginTop: 5, lineHeight: 16 },

  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.field,
    borderWidth: 1.5, borderColor: COLORS.line, borderRadius: RADIUS.input, paddingHorizontal: 12, height: 50,
  },
  searchInput: { flex: 1, fontSize: 14, color: COLORS.ink },
  resultsBox: {
    marginTop: 6, borderWidth: 1.5, borderColor: COLORS.line, borderRadius: RADIUS.input,
    backgroundColor: COLORS.card, overflow: 'hidden',
  },
  resultRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: COLORS.line,
  },
  resultName: { fontSize: 13.5, fontWeight: '700', color: COLORS.ink },
  resultSub: { fontSize: 11, color: COLORS.faint, marginTop: 1 },
  gpsBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 10, borderWidth: 1.5, borderColor: '#C7D2FE', backgroundColor: COLORS.indigoSoft,
    borderRadius: RADIUS.button, paddingVertical: 12,
  },
  gpsBtnTxt: { color: COLORS.primary, fontWeight: '700', fontSize: 13.5 },

  activeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16,
    backgroundColor: COLORS.field, borderRadius: RADIUS.input, padding: 12,
  },
  activeLabel: { fontSize: 14, fontWeight: '700', color: COLORS.ink },

  cancelBtn: {
    flex: 1, height: 52, borderRadius: RADIUS.button, borderWidth: 1.5,
    borderColor: COLORS.line, justifyContent: 'center', alignItems: 'center',
  },
  cancelBtnText: { color: '#374151', fontWeight: '700' },
});
