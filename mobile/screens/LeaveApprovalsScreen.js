import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { api } from '../lib/api';

const INDIGO = '#1E3A8A';
const GREEN = '#16A34A';
const RED = '#DC2626';
const AMBER = '#D97706';
const GREY = '#6B7280';

const todayYMD = () => new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
const CUR_YEAR = Number(todayYMD().slice(0, 4));
const prettyDate = (iso) =>
  new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
const rangeText = (a, b) => (a.slice(0, 10) === b.slice(0, 10) ? prettyDate(a) : `${prettyDate(a)} → ${prettyDate(b)}`);
const TYPE_COLOR = { CL: '#2563EB', SL: '#D97706', PL: '#16A34A' };
const STATUS_STYLE = {
  pending: { c: AMBER, bg: '#FEF3C7', label: 'Pending' },
  approved: { c: GREEN, bg: '#ECFDF5', label: 'Approved' },
  rejected: { c: RED, bg: '#FEE2E2', label: 'Rejected' },
  cancelled: { c: GREY, bg: '#F3F4F6', label: 'Cancelled' },
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
      <LinearGradient colors={['#1E40AF', '#1E3A8A', '#312E81']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
        <View style={[styles.deco, { width: 150, height: 150, top: -55, right: -45 }]} />
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Leave Approvals</Text>
            <Text style={styles.subTitle}>{CUR_YEAR} • {pendingCount} pending</Text>
          </View>
        </View>
        <View style={styles.segment}>
          {FILTERS.map((f) => (
            <TouchableOpacity key={f} style={[styles.segBtn, filter === f && styles.segBtnOn]} onPress={() => setFilter(f)}>
              <Text style={[styles.segText, filter === f && styles.segTextOn]}>{f[0].toUpperCase() + f.slice(1)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </LinearGradient>

      {loading ? (
        <ActivityIndicator size="large" color={INDIGO} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
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
                <View key={r.id} style={styles.card}>
                  <View style={styles.cardTop}>
                    <View style={[styles.typeTag, { backgroundColor: (TYPE_COLOR[r.leaveType?.code] || INDIGO) + '18' }]}>
                      <Text style={[styles.typeText, { color: TYPE_COLOR[r.leaveType?.code] || INDIGO }]}>{r.leaveType?.code}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name}>{r.user?.fullName || r.user?.username}</Text>
                      <Text style={styles.userSub}>@{r.user?.username}</Text>
                    </View>
                    <View style={[styles.stPill, { backgroundColor: st.bg }]}>
                      <Text style={[styles.stText, { color: st.c }]}>{st.label}</Text>
                    </View>
                  </View>

                  <View style={styles.detailRow}>
                    <MaterialIcons name="event" size={15} color={GREY} />
                    <Text style={styles.detailText}>{rangeText(r.startDate, r.endDate)}</Text>
                    <View style={styles.daysPill}><Text style={styles.daysText}>{r.days} day{r.days === 1 ? '' : 's'}</Text></View>
                  </View>
                  {r.reason ? <Text style={styles.reason}>“{r.reason}”</Text> : null}

                  {r.status === 'pending' && (
                    <View style={styles.actions}>
                      <TouchableOpacity style={[styles.actBtn, styles.rejectBtn]} disabled={busy} onPress={() => decide(r, 'rejected')}>
                        <MaterialIcons name="close" size={17} color={RED} />
                        <Text style={[styles.actText, { color: RED }]}>Reject</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.actBtn, styles.approveBtn]} disabled={busy} onPress={() => decide(r, 'approved')}>
                        {busy ? <ActivityIndicator color="#fff" size="small" /> : (
                          <>
                            <MaterialIcons name="check" size={17} color="#fff" />
                            <Text style={[styles.actText, { color: '#fff' }]}>Approve</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  header: { paddingTop: 52, paddingBottom: 14, paddingHorizontal: 16, borderBottomLeftRadius: 26, borderBottomRightRadius: 26, overflow: 'hidden', elevation: 6 },
  deco: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.07)' },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.14)', justifyContent: 'center', alignItems: 'center' },
  title: { color: '#fff', fontSize: 17, fontWeight: '800' },
  subTitle: { color: '#C7D2FE', fontSize: 11.5, marginTop: 1 },
  segment: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 12, padding: 4, marginTop: 14 },
  segBtn: { flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: 'center' },
  segBtnOn: { backgroundColor: '#fff' },
  segText: { color: '#E0E7FF', fontWeight: '700', fontSize: 11.5 },
  segTextOn: { color: INDIGO },

  empty: { alignItems: 'center', paddingVertical: 50, gap: 10 },
  emptyText: { color: '#9CA3AF', fontSize: 13 },

  card: { backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 10, elevation: 1 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  typeTag: { width: 42, height: 42, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  typeText: { fontSize: 13, fontWeight: '800' },
  name: { fontSize: 14, fontWeight: '800', color: '#111827' },
  userSub: { fontSize: 11.5, color: '#9CA3AF', marginTop: 1 },
  stPill: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  stText: { fontSize: 10.5, fontWeight: '800' },

  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  detailText: { fontSize: 13, color: '#374151', fontWeight: '600' },
  daysPill: { backgroundColor: '#EEF2FF', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, marginLeft: 4 },
  daysText: { fontSize: 11, color: INDIGO, fontWeight: '800' },
  reason: { fontSize: 12.5, color: '#6B7280', marginTop: 8, fontStyle: 'italic' },

  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  actBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 44, borderRadius: 12 },
  rejectBtn: { borderWidth: 1.5, borderColor: '#FCA5A5', backgroundColor: '#FEF2F2' },
  approveBtn: { backgroundColor: GREEN },
  actText: { fontSize: 13.5, fontWeight: '800' },
});
