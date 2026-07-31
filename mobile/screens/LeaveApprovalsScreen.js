import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { api } from '../lib/api';
import { GradientHeader, BottomNav, Card, Chip } from '../components/ui';
import { COLORS, GREEN_GRADIENT, RADIUS } from '../lib/theme';

const todayYMD = () => new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
const CUR_YEAR = Number(todayYMD().slice(0, 4));
const prettyDate = (iso) =>
  new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
const rangeText = (a, b) => (a.slice(0, 10) === b.slice(0, 10) ? prettyDate(a) : `${prettyDate(a)} → ${prettyDate(b)}`);
const TYPE_COLOR = { CL: '#2563EB', SL: COLORS.orange, PL: COLORS.green };
const STATUS_STYLE = {
  pending: { c: COLORS.orange, bg: COLORS.orangeSoft, label: 'Pending' },
  approved: { c: COLORS.green, bg: COLORS.greenSoft, label: 'Approved' },
  rejected: { c: COLORS.red, bg: COLORS.redSoft, label: 'Rejected' },
  cancelled: { c: COLORS.sub, bg: '#F3F4F6', label: 'Cancelled' },
};
const FILTERS = ['pending', 'approved', 'rejected', 'all'];

export default function LeaveApprovalsScreen({ navigation }) {
  const [filter, setFilter] = useState('pending');
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = filter === 'all' ? '' : `&status=${filter}`;
      const res = await api(`/leaves/requests?year=${CUR_YEAR}${q}`);
      setRequests(res.requests || []);
    } catch (e) { Alert.alert('Error', e.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const decide = (r, status) => {
    const go = async (reviewNote) => {
      setBusyId(r.id);
      try {
        await api(`/leaves/requests/${r.id}/decision`, {
          method: 'PATCH',
          body: JSON.stringify({ status, reviewNote: reviewNote || '' }),
        });
        load();
      } catch (e) { Alert.alert('Failed', e.message); }
      finally { setBusyId(null); }
    };
    if (status === 'approved') {
      Alert.alert('Approve leave', `Approve ${r.leaveType?.code} for ${r.user?.fullName || r.user?.username}?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Approve', onPress: () => go('') },
      ]);
    } else {
      Alert.alert('Reject leave', `Reject ${r.leaveType?.code} for ${r.user?.fullName || r.user?.username}?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reject', style: 'destructive', onPress: () => go('') },
      ]);
    }
  };

  const pendingCount = requests.filter((r) => r.status === 'pending').length;

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <GradientHeader
        title="Leave Approvals"
        subtitle={`${CUR_YEAR} • ${pendingCount} pending`}
        onBack={() => navigation.goBack()}
      >
        <View style={styles.segment}>
          {FILTERS.map((f) => (
            <TouchableOpacity key={f} style={[styles.segBtn, filter === f && styles.segBtnOn]} onPress={() => setFilter(f)}>
              <Text style={[styles.segText, filter === f && styles.segTextOn]}>{f[0].toUpperCase() + f.slice(1)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </GradientHeader>

      {loading ? (
        <View style={{ flex: 1 }}>
          <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 40 }} />
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        >
          {requests.length === 0 ? (
            <View style={styles.empty}>
              <MaterialIcons name="event-available" size={44} color="#CBD5E1" />
              <Text style={styles.emptyText}>No {filter === 'all' ? '' : filter} leave requests</Text>
            </View>
          ) : (
            requests.map((r) => {
              const st = STATUS_STYLE[r.status] || STATUS_STYLE.cancelled;
              const busy = busyId === r.id;
              return (
                <Card key={r.id} style={styles.reqCard}>
                  <View style={styles.cardTop}>
                    <View style={[styles.typeTag, { backgroundColor: (TYPE_COLOR[r.leaveType?.code] || COLORS.primary) + '18' }]}>
                      <Text style={[styles.typeText, { color: TYPE_COLOR[r.leaveType?.code] || COLORS.primary }]}>{r.leaveType?.code}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name}>{r.user?.fullName || r.user?.username}</Text>
                      <Text style={styles.userSub}>@{r.user?.username}</Text>
                    </View>
                    <Chip text={st.label} color={st.c} soft={st.bg} />
                  </View>

                  <View style={styles.detailRow}>
                    <MaterialIcons name="event" size={15} color={COLORS.sub} />
                    <Text style={styles.detailText}>{rangeText(r.startDate, r.endDate)}</Text>
                    <View style={styles.daysPill}><Text style={styles.daysText}>{r.days} day{r.days === 1 ? '' : 's'}</Text></View>
                  </View>
                  {r.reason ? <Text style={styles.reason}>“{r.reason}”</Text> : null}

                  {r.status === 'pending' && (
                    <View style={styles.actions}>
                      <TouchableOpacity style={[styles.actBtn, styles.rejectBtn]} disabled={busy} onPress={() => decide(r, 'rejected')}>
                        <MaterialIcons name="close" size={17} color={COLORS.red} />
                        <Text style={[styles.actText, { color: COLORS.red }]}>Reject</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={{ flex: 1 }} activeOpacity={0.85} disabled={busy} onPress={() => decide(r, 'approved')}>
                        <LinearGradient colors={GREEN_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                          style={[styles.actBtn, busy && { opacity: 0.75 }]}>
                          {busy ? <ActivityIndicator color="#fff" size="small" /> : (
                            <>
                              <MaterialIcons name="check" size={17} color="#fff" />
                              <Text style={[styles.actText, { color: '#fff' }]}>Approve</Text>
                            </>
                          )}
                        </LinearGradient>
                      </TouchableOpacity>
                    </View>
                  )}
                </Card>
              );
            })
          )}
        </ScrollView>
      )}

      <BottomNav navigation={navigation} active={null} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },

  /* header controls (inside GradientHeader) */
  segment: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 12, padding: 4, marginTop: 14 },
  segBtn: { flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: 'center' },
  segBtnOn: { backgroundColor: '#fff' },
  segText: { color: '#E0E7FF', fontWeight: '700', fontSize: 11.5 },
  segTextOn: { color: COLORS.primary },

  empty: { alignItems: 'center', paddingVertical: 50, gap: 10 },
  emptyText: { color: COLORS.faint, fontSize: 13 },

  reqCard: { padding: 14, marginBottom: 10 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  typeTag: { width: 42, height: 42, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  typeText: { fontSize: 13, fontWeight: '800' },
  name: { fontSize: 14, fontWeight: '800', color: COLORS.ink },
  userSub: { fontSize: 11.5, color: COLORS.faint, marginTop: 1 },

  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  detailText: { fontSize: 13, color: '#374151', fontWeight: '600' },
  daysPill: { backgroundColor: COLORS.indigoSoft, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, marginLeft: 4 },
  daysText: { fontSize: 11, color: COLORS.primary, fontWeight: '800' },
  reason: { fontSize: 12.5, color: COLORS.sub, marginTop: 8, fontStyle: 'italic' },

  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  actBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 46, borderRadius: RADIUS.button },
  rejectBtn: { flex: 1, borderWidth: 1.5, borderColor: '#FCA5A5', backgroundColor: '#FEF2F2' },
  actText: { fontSize: 13.5, fontWeight: '800' },
});
