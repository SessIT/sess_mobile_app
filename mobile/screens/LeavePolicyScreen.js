import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, RefreshControl, TextInput, Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { GradientHeader, BottomNav, Card, Chip, PrimaryButton, SectionLabel } from '../components/ui';
import { COLORS, RADIUS } from '../lib/theme';
import { api } from '../lib/api';
import { getAuth } from '../lib/auth';

const ADMIN = 'Technical Director / Admin';

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

      <BottomNav navigation={navigation} active={null} />
    </View>
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
});
