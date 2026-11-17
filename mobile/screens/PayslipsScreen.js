import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Linking,
  ActivityIndicator, RefreshControl, Modal, Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { api, fileUrl } from '../lib/api';
import { GradientHeader, BottomNav, Card, PrimaryButton, SheetOverlay } from '../components/ui';
import { COLORS, RADIUS } from '../lib/theme';

/* Employee payslips — only months whose payroll an admin has FINALIZED.
 * The full printable payslip opens in the phone's browser, where
 * Share / Print → Save as PDF gives the employee a PDF copy. */

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const monthName = (ym) =>
  new Date(`${ym}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });

export default function PayslipsScreen({ navigation }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(null); // full payslip
  const [opening, setOpening] = useState(null); // id being fetched

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await api('/payroll/my');
      setList(res.payslips || []);
    } catch (e) {
      setError(e.message || 'Could not load payslips');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const view = async (id) => {
    setOpening(id);
    try { setOpen(await api(`/payroll/payslips/${id}`)); }
    catch (e) { Alert.alert('Could not open payslip', e.message); }
    finally { setOpening(null); }
  };

  const printable = () => {
    Linking.openURL(fileUrl(`api/payroll/payslips/${open.id}/html`))
      .catch(() => Alert.alert('Could not open', 'No browser available to show the payslip.'));
  };

  const latest = list[0];

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <GradientHeader title="My Payslips" subtitle="Monthly salary statements" onBack={() => navigation.goBack()}>
        {latest && (
          <View style={styles.hero}>
            <Text style={styles.heroLabel}>Latest net pay · {monthName(latest.month)}</Text>
            <Text style={styles.heroValue}>{inr(latest.netPay)}</Text>
          </View>
        )}
      </GradientHeader>

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={{ flex: 1 }} />
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={[COLORS.primary]} />}
        >
          {error ? (
            <View style={styles.errorBox}>
              <MaterialIcons name="error-outline" size={18} color={COLORS.red} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {!error && list.length === 0 && (
            <View style={styles.empty}>
              <MaterialIcons name="receipt-long" size={50} color="#CBD5E1" />
              <Text style={styles.emptyTitle}>No payslips yet</Text>
              <Text style={styles.emptyHint}>Payslips appear here once HR finalizes the month&apos;s payroll.</Text>
            </View>
          )}

          {list.map((p) => (
            <TouchableOpacity key={p.id} activeOpacity={0.85} onPress={() => view(p.id)}>
              <Card style={styles.row}>
                <View style={styles.rowIcon}>
                  <MaterialIcons name="receipt-long" size={22} color={COLORS.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{monthName(p.month)}</Text>
                  <Text style={styles.rowSub}>
                    Gross {inr(p.gross)} · {p.paidDays}/{p.daysInMonth} days paid
                  </Text>
                </View>
                {opening === p.id
                  ? <ActivityIndicator size="small" color={COLORS.primary} />
                  : <Text style={styles.rowNet}>{inr(p.netPay)}</Text>}
              </Card>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <Modal visible={!!open} transparent animationType="slide" onRequestClose={() => setOpen(null)}>
        <SheetOverlay>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>{open ? monthName(open.month) : ''}</Text>
            <Text style={styles.sheetSub}>
              {open?.paidDays}/{open?.daysInMonth} days paid{open?.lopDays ? ` · ${open.lopDays} LOP` : ''}
            </Text>
            <ScrollView style={{ maxHeight: 420 }}>
              <Text style={styles.section}>EARNINGS</Text>
              {(open?.earnings || []).map((e) => (
                <View key={e.code} style={styles.line}>
                  <Text style={styles.lineLabel}>{e.label}</Text>
                  <Text style={styles.lineAmt}>{inr(e.amount)}</Text>
                </View>
              ))}
              <View style={[styles.line, styles.totalLine]}>
                <Text style={styles.totalLabel}>Gross earnings</Text>
                <Text style={styles.totalAmt}>{inr(open?.gross)}</Text>
              </View>

              <Text style={styles.section}>DEDUCTIONS</Text>
              {(open?.deductions || []).length === 0 && <Text style={styles.lineLabel}>No deductions</Text>}
              {(open?.deductions || []).map((d) => (
                <View key={d.code} style={styles.line}>
                  <Text style={styles.lineLabel}>{d.label}</Text>
                  <Text style={[styles.lineAmt, { color: COLORS.red }]}>− {inr(d.amount)}</Text>
                </View>
              ))}
              <View style={[styles.line, styles.totalLine]}>
                <Text style={styles.totalLabel}>Total deductions</Text>
                <Text style={[styles.totalAmt, { color: COLORS.red }]}>{inr(open?.totalDeductions)}</Text>
              </View>

              <View style={styles.netBox}>
                <Text style={styles.netLabel}>Net pay</Text>
                <Text style={styles.netValue}>{inr(open?.netPay)}</Text>
              </View>
              {open && (open.epfEmployer + open.epsEmployer + open.esiEmployer) > 0 && (
                <Text style={styles.er}>
                  Employer also contributes (not from your pay): PF {inr(open.epfEmployer + open.epsEmployer)}
                  {open.esiEmployer ? ` · ESI ${inr(open.esiEmployer)}` : ''}
                </Text>
              )}
              {open?.note ? <Text style={styles.er}>Note: {open.note}</Text> : null}
            </ScrollView>

            <PrimaryButton title="Open printable payslip (PDF)" icon="picture-as-pdf" style={{ marginTop: 14 }} onPress={printable} />
            <TouchableOpacity style={styles.closeBtn} onPress={() => setOpen(null)}>
              <Text style={styles.closeText}>Close</Text>
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
  hero: { marginTop: 14, backgroundColor: 'rgba(255,255,255,0.13)', borderRadius: 14, padding: 12 },
  heroLabel: { color: '#C7D2FE', fontSize: 12, fontWeight: '700' },
  heroValue: { color: '#fff', fontSize: 24, fontWeight: '800', marginTop: 2 },

  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.redSoft,
    borderRadius: RADIUS.input, padding: 12, marginBottom: 12,
  },
  errorText: { flex: 1, fontSize: 12.5, color: COLORS.red, fontWeight: '600' },
  empty: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 24 },
  emptyTitle: { marginTop: 12, fontSize: 15, fontWeight: '700', color: '#374151' },
  emptyHint: { marginTop: 6, fontSize: 13, color: COLORS.faint, textAlign: 'center' },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, marginBottom: 10 },
  rowIcon: { width: 42, height: 42, borderRadius: 12, backgroundColor: COLORS.indigoSoft, justifyContent: 'center', alignItems: 'center' },
  rowTitle: { fontSize: 14.5, fontWeight: '800', color: COLORS.ink },
  rowSub: { fontSize: 12, color: COLORS.faint, marginTop: 2 },
  rowNet: { fontSize: 15, fontWeight: '800', color: COLORS.green },

  sheet: {
    backgroundColor: COLORS.card, borderTopLeftRadius: RADIUS.sheet, borderTopRightRadius: RADIUS.sheet,
    padding: 18, paddingBottom: 26, maxHeight: '92%',
  },
  sheetHandle: { width: 42, height: 5, borderRadius: 3, backgroundColor: COLORS.line, alignSelf: 'center', marginBottom: 12 },
  sheetTitle: { fontSize: 17, fontWeight: '800', color: COLORS.ink, textAlign: 'center' },
  sheetSub: { fontSize: 12.5, color: COLORS.sub, textAlign: 'center', marginTop: 3, marginBottom: 6 },
  section: { fontSize: 10.5, fontWeight: '800', color: COLORS.faint, letterSpacing: 0.6, marginTop: 14, marginBottom: 6 },
  line: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  lineLabel: { fontSize: 13.5, color: '#374151', flex: 1 },
  lineAmt: { fontSize: 13.5, fontWeight: '700', color: COLORS.ink },
  totalLine: { borderTopWidth: 1, borderTopColor: COLORS.line, marginTop: 4, paddingTop: 8 },
  totalLabel: { fontSize: 13.5, fontWeight: '800', color: COLORS.ink },
  totalAmt: { fontSize: 14, fontWeight: '800', color: COLORS.ink },
  netBox: {
    marginTop: 16, backgroundColor: COLORS.greenSoft, borderRadius: 12, padding: 14,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  netLabel: { fontSize: 14, fontWeight: '800', color: '#166534' },
  netValue: { fontSize: 22, fontWeight: '800', color: COLORS.green },
  er: { fontSize: 12, color: COLORS.sub, marginTop: 10 },
  closeBtn: { alignItems: 'center', paddingVertical: 12, marginTop: 4 },
  closeText: { color: COLORS.sub, fontWeight: '700' },
});
