import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, RefreshControl, TextInput, Alert, Modal,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { GradientHeader, BottomNav, Card, Chip, PrimaryButton, SectionLabel } from '../components/ui';
import { COLORS, RADIUS } from '../lib/theme';
import { api } from '../lib/api';
import { getAuth } from '../lib/auth';
import { useKeyboard } from '../lib/useKeyboard';

const ADMIN = 'Admin';

const CURRENT_YEAR = new Date(Date.now() + 5.5 * 3600000).getUTCFullYear();
// Same window the web console offers in its year dropdown.
const MIN_YEAR = CURRENT_YEAR - 1;
const MAX_YEAR = CURRENT_YEAR + 3;

// Leave-type badge colors, matching LeaveScreen: CL indigo, SL orange, PL green.
const TYPE_STYLE = {
  CL: { c: COLORS.accent, soft: COLORS.indigoSoft },
  SL: { c: COLORS.orange, soft: COLORS.orangeSoft },
  PL: { c: COLORS.green, soft: COLORS.greenSoft },
};
const typeStyle = (code) => TYPE_STYLE[code] || { c: COLORS.primary, soft: COLORS.indigoSoft };

const num = (v) => Number(v) || 0;

/* Admin leave policy — how many days of each type every employee gets in a year.
 * Comp-off is absent by design: the server leaves CO out because that balance is
 * earned per approved credit, not allocated. */
export default function LeavePolicyScreen({ navigation }) {
  const [year, setYear] = useState(CURRENT_YEAR);
  const [allocations, setAllocations] = useState([]);   // [{ leaveTypeId, code, name, quota: '12' }]
  const [baseline, setBaseline] = useState({});         // leaveTypeId → saved quota, for the dirty check
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAddType, setShowAddType] = useState(false);

  useEffect(() => {
    let alive = true;
    // Roles live in the saved login payload, like ProfileMenuScreen reads them.
    getAuth().then(a => { if (alive) setIsAdmin((a?.roles || []).includes(ADMIN)); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const load = useCallback(async (y, quiet = false) => {
    if (!quiet) setLoading(true);
    setError('');
    try {
      const res = await api(`/leaves/policy?year=${y}`);
      const rows = (res.allocations || []).map(a => ({ ...a, quota: String(a.quota ?? 0) }));
      setAllocations(rows);
      setBaseline(Object.fromEntries(rows.map(a => [a.leaveTypeId, num(a.quota)])));
    } catch (e) {
      setError(e.message || 'Could not load the leave policy');
      setAllocations([]);
      setBaseline({});
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(year); }, [year, load]);

  const dirty = allocations.some(a => num(a.quota) !== (baseline[a.leaveTypeId] ?? 0));
  const total = allocations.reduce((s, a) => s + num(a.quota), 0);

  const shiftYear = (n) => {
    const y = year + n;
    if (y < MIN_YEAR || y > MAX_YEAR) return;
    if (dirty) {
      Alert.alert('Discard changes?', `Your unsaved changes to ${year} will be lost.`, [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => setYear(y) },
      ]);
      return;
    }
    setYear(y);
  };

  // Digits only — quotas are whole days and can never go below zero.
  const setQuota = (leaveTypeId, text) =>
    setAllocations(prev => prev.map(a =>
      a.leaveTypeId === leaveTypeId ? { ...a, quota: text.replace(/[^0-9]/g, '') } : a));

  // Splice a freshly created type into the list instead of refetching, so any
  // unsaved quota edits survive. The server sends this year's quota with the
  // type (non-zero when a removed code was re-added and its policy row remained).
  const onTypeAdded = (t) => {
    setShowAddType(false);
    setAllocations(prev => prev.some(a => a.leaveTypeId === t.id)
      ? prev
      : [...prev, { leaveTypeId: t.id, code: t.code, name: t.name, builtin: false, quota: String(t.quota ?? 0) }]);
    setBaseline(prev => ({ ...prev, [t.id]: num(t.quota) }));
  };

  // Only custom types can go — the server refuses the built-in four anyway.
  const removeType = (a) => {
    Alert.alert(
      'Remove leave type',
      `Remove “${a.name}” (${a.code})? Employees will no longer be able to apply for it. Past requests are kept.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive',
          onPress: async () => {
            try {
              await api(`/leaves/types/${a.leaveTypeId}`, { method: 'DELETE' });
              setAllocations(prev => prev.filter(x => x.leaveTypeId !== a.leaveTypeId));
              setBaseline(prev => { const { [a.leaveTypeId]: _, ...rest } = prev; return rest; });
            } catch (e) { Alert.alert('Could not remove', e.message); }
          },
        },
      ],
    );
  };

  const save = async () => {
    setSaving(true);
    try {
      await api('/leaves/policy', {
        method: 'PUT',
        body: JSON.stringify({
          year,
          allocations: allocations.map(a => ({ leaveTypeId: a.leaveTypeId, quota: num(a.quota) })),
        }),
      });
      Alert.alert('Policy saved', `Every employee gets ${total} paid leave day${total === 1 ? '' : 's'} in ${year}.`);
      await load(year, true);
    } catch (e) {
      Alert.alert('Could not save', e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <GradientHeader
        title="Leave Policy"
        subtitle="Annual allocation per leave type"
        onBack={() => navigation.goBack()}
      >
        <View style={styles.yearRow}>
          <TouchableOpacity
            onPress={() => shiftYear(-1)}
            disabled={year <= MIN_YEAR}
            style={[styles.yearArrow, year <= MIN_YEAR && { opacity: 0.3 }]}
          >
            <MaterialIcons name="chevron-left" size={22} color="#C7D2FE" />
          </TouchableOpacity>
          <Text style={styles.yearText}>{year}</Text>
          <TouchableOpacity
            onPress={() => shiftYear(1)}
            disabled={year >= MAX_YEAR}
            style={[styles.yearArrow, year >= MAX_YEAR && { opacity: 0.3 }]}
          >
            <MaterialIcons name="chevron-right" size={22} color="#C7D2FE" />
          </TouchableOpacity>
        </View>
      </GradientHeader>

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={{ flex: 1 }} />
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(year, true); }}
              colors={[COLORS.primary]}
            />
          }
        >
          <Text style={styles.intro}>
            Set how many days of each leave type every employee gets in <Text style={styles.introYear}>{year}</Text>.
          </Text>

          {error ? (
            <View style={styles.errorBox}>
              <MaterialIcons name="error-outline" size={18} color={COLORS.red} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {!isAdmin && !error && allocations.length > 0 && (
            <View style={styles.noteBox}>
              <MaterialIcons name="lock-outline" size={16} color={COLORS.sub} />
              <Text style={styles.noteText}>Only an admin can change these allocations.</Text>
            </View>
          )}

          <SectionLabel text="LEAVE TYPES" />

          {allocations.length === 0 ? (
            !error && (
              <View style={styles.empty}>
                <MaterialIcons name="beach-access" size={44} color="#CBD5E1" />
                <Text style={styles.emptyText}>No leave types configured yet</Text>
              </View>
            )
          ) : (
            allocations.map((a) => {
              const t = typeStyle(a.code);
              return (
                <Card key={a.leaveTypeId} style={styles.typeCard}>
                  <View style={styles.typeTop}>
                    <Chip text={a.code} color={t.c} soft={t.soft} />
                    <Text style={styles.typeName}>{a.name}</Text>
                    {/* builtin === false comes only from a server that also has
                        the DELETE route, so the button never dead-ends. */}
                    {isAdmin && a.builtin === false && (
                      <TouchableOpacity style={styles.removeBtn} onPress={() => removeType(a)}>
                        <MaterialIcons name="delete-outline" size={18} color={COLORS.red} />
                      </TouchableOpacity>
                    )}
                  </View>
                  <View style={styles.qtyRow}>
                    {isAdmin ? (
                      <TextInput
                        style={styles.qtyInput}
                        value={a.quota}
                        onChangeText={(txt) => setQuota(a.leaveTypeId, txt)}
                        keyboardType="number-pad"
                        maxLength={3}
                        placeholder="0"
                        placeholderTextColor={COLORS.faint}
                        selectTextOnFocus
                      />
                    ) : (
                      <View style={styles.qtyBox}>
                        <Text style={styles.qtyReadOnlyText}>{num(a.quota)}</Text>
                      </View>
                    )}
                    <Text style={styles.qtyUnit}>days / year</Text>
                  </View>
                </Card>
              );
            })
          )}

          {isAdmin && !error && (
            <TouchableOpacity style={styles.addTypeBtn} onPress={() => setShowAddType(true)}>
              <MaterialIcons name="add-circle-outline" size={18} color={COLORS.primary} />
              <Text style={styles.addTypeTxt}>Add new leave type</Text>
            </TouchableOpacity>
          )}

          {allocations.length > 0 && (
            <>
              <Card style={styles.totalCard}>
                <MaterialIcons name="event-available" size={20} color={COLORS.primary} />
                <Text style={styles.totalLabel}>Total paid leave</Text>
                <Text style={styles.totalValue}>{total} days</Text>
              </Card>

              {isAdmin && (
                <PrimaryButton
                  title={dirty ? 'Save policy' : 'Saved'}
                  icon={dirty ? 'save' : 'check'}
                  busy={saving}
                  disabled={!dirty || saving}
                  onPress={save}
                  style={{ marginTop: 16 }}
                />
              )}
            </>
          )}
        </ScrollView>
      )}

      <AddTypeSheet
        visible={showAddType}
        year={year}
        onClose={() => setShowAddType(false)}
        onAdded={onTypeAdded}
      />

      <BottomNav navigation={navigation} active={null} />
    </View>
  );
}

/* ---------------- Add leave type sheet ---------------- */
function AddTypeSheet({ visible, year, onClose, onAdded }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});
  const kb = useKeyboard();

  useEffect(() => {
    if (visible) { setCode(''); setName(''); setBusy(false); setErrors({}); }
  }, [visible]);

  const submit = async () => {
    const next = {};
    if (code.length < 2) next.code = 'Code must be 2–5 letters, e.g. ML.';
    if (!name.trim()) next.name = 'Enter the leave type name.';
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      // year rides along so the response carries this year's quota — see onTypeAdded.
      const created = await api('/leaves/types', {
        method: 'POST',
        body: JSON.stringify({ code, name: name.trim(), year }),
      });
      onAdded(created);
    } catch (e) {
      Alert.alert('Could not add', e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetOverlay} onLayout={kb.onLayout}>
        <View style={[styles.sheet, kb.visible && { paddingBottom: 26 + kb.lift }]}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Add Leave Type</Text>

          <Text style={styles.fieldLabel}>SHORT CODE *</Text>
          <TextInput
            style={[styles.input, errors.code && styles.fieldBad]}
            placeholder="e.g. ML"
            placeholderTextColor={COLORS.faint}
            value={code}
            onChangeText={(t) => {
              setCode(t.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 5));
              if (errors.code) setErrors((e) => ({ ...e, code: null }));
            }}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={5}
          />
          <Text style={styles.fieldHint}>2–5 letters, shown on badges next to CL, SL and PL.</Text>
          {errors.code ? <Text style={styles.fieldError}>{errors.code}</Text> : null}

          <Text style={styles.fieldLabel}>NAME *</Text>
          <TextInput
            style={[styles.input, errors.name && styles.fieldBad]}
            placeholder="e.g. Marriage Leave"
            placeholderTextColor={COLORS.faint}
            value={name}
            onChangeText={(t) => { setName(t); if (errors.name) setErrors((e) => ({ ...e, name: null })); }}
            maxLength={60}
          />
          {errors.name ? <Text style={styles.fieldError}>{errors.name}</Text> : null}

          <Text style={styles.fieldHint}>
            The new type starts at 0 days — set its yearly quota on the policy list and save.
          </Text>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={busy}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <PrimaryButton
              title="Add type"
              icon="add"
              style={{ flex: 1 }}
              busy={busy}
              disabled={busy}
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

  yearRow: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginTop: 14,
    backgroundColor: 'rgba(255,255,255,0.13)', borderRadius: 14, height: 40,
    paddingHorizontal: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
  },
  yearArrow: { paddingHorizontal: 4, paddingVertical: 4 },
  yearText: { minWidth: 60, textAlign: 'center', color: '#fff', fontSize: 13.5, fontWeight: '800' },

  intro: { fontSize: 13, color: COLORS.sub, lineHeight: 19 },
  introYear: { fontWeight: '800', color: COLORS.ink },

  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.redSoft,
    borderRadius: RADIUS.input, padding: 12, marginTop: 12,
  },
  errorText: { flex: 1, fontSize: 12.5, color: COLORS.red, fontWeight: '600' },
  noteBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F3F4F6',
    borderRadius: RADIUS.input, padding: 12, marginTop: 12,
  },
  noteText: { flex: 1, fontSize: 12.5, color: COLORS.sub, fontWeight: '600' },

  empty: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyText: { color: COLORS.faint, fontSize: 13 },

  typeCard: { padding: 14, marginBottom: 10 },
  typeTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  typeName: { flex: 1, fontSize: 14, fontWeight: '700', color: COLORS.ink },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  qtyInput: {
    width: 92, height: 48, backgroundColor: COLORS.field, borderWidth: 1.5, borderColor: COLORS.line,
    borderRadius: RADIUS.input, paddingHorizontal: 12, fontSize: 16, fontWeight: '800', color: COLORS.ink,
  },
  qtyBox: {
    width: 92, height: 48, backgroundColor: COLORS.field, borderWidth: 1.5, borderColor: COLORS.line,
    borderRadius: RADIUS.input, paddingHorizontal: 12, justifyContent: 'center',
  },
  qtyReadOnlyText: { fontSize: 16, fontWeight: '800', color: COLORS.ink },
  qtyUnit: { fontSize: 13, color: COLORS.sub, fontWeight: '600' },

  totalCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, marginTop: 6 },
  totalLabel: { flex: 1, fontSize: 13.5, fontWeight: '700', color: '#374151' },
  totalValue: { fontSize: 17, fontWeight: '800', color: COLORS.primary },

  removeBtn: {
    width: 34, height: 34, borderRadius: 10, backgroundColor: COLORS.redSoft,
    justifyContent: 'center', alignItems: 'center',
  },
  addTypeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#C7D2FE', backgroundColor: COLORS.indigoSoft,
    borderRadius: RADIUS.button, paddingVertical: 13, marginBottom: 12,
  },
  addTypeTxt: { color: COLORS.primary, fontWeight: '700', fontSize: 13.5 },

  /* add-type sheet — same look as the site editor sheet */
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: COLORS.card, borderTopLeftRadius: RADIUS.sheet, borderTopRightRadius: RADIUS.sheet,
    padding: 18, paddingBottom: 26, maxHeight: '92%',
  },
  sheetHandle: { width: 42, height: 5, borderRadius: 3, backgroundColor: COLORS.line, alignSelf: 'center', marginBottom: 12 },
  sheetTitle: { fontSize: 16, fontWeight: '800', color: COLORS.ink, marginBottom: 4, textAlign: 'center' },
  fieldLabel: { fontSize: 10.5, fontWeight: '800', color: COLORS.faint, letterSpacing: 0.6, marginTop: 12, marginBottom: 8 },
  input: {
    backgroundColor: COLORS.field, borderWidth: 1.5, borderColor: COLORS.line, borderRadius: RADIUS.input,
    paddingHorizontal: 12, height: 50, fontSize: 14, color: COLORS.ink,
  },
  fieldBad: { borderColor: COLORS.red },
  fieldError: { color: COLORS.red, fontSize: 11.5, marginTop: 5 },
  fieldHint: { color: COLORS.faint, fontSize: 11.5, marginTop: 5, lineHeight: 16 },
  cancelBtn: {
    flex: 1, height: 52, borderRadius: RADIUS.button, borderWidth: 1.5,
    borderColor: COLORS.line, justifyContent: 'center', alignItems: 'center',
  },
  cancelBtnText: { color: '#374151', fontWeight: '700' },
});
