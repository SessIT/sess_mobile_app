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
const fmtTime = (iso) =>
  new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });

const STATUS_STYLE = {
  pending: { c: COLORS.orange, bg: COLORS.orangeSoft, label: 'Pending' },
  approved: { c: COLORS.green, bg: COLORS.greenSoft, label: 'Approved' },
  rejected: { c: COLORS.red, bg: COLORS.redSoft, label: 'Rejected' },
  cancelled: { c: COLORS.sub, bg: '#F3F4F6', label: 'Cancelled' },
  revoked: { c: COLORS.red, bg: COLORS.redSoft, label: 'Revoked' },
};
const FILTERS = ['pending', 'approved', 'rejected', 'all'];

// The punch verdict banner — the heart of comp-off review. A credit is only
// legitimate if the employee punched in/out and covered the full 9:30–6:30 day.
function PunchBanner({ punch }) {
  if (!punch) return null;
  if (!punch.punched) {
    return (
      <View style={[styles.punchBanner, { backgroundColor: COLORS.redSoft }]}>
        <MaterialIcons name="error-outline" size={16} color={COLORS.red} />
        <Text style={[styles.punchBannerText, { color: COLORS.red }]}>
          NOT PUNCHED — no punch in/out on this day
        </Text>
      </View>
    );
  }
  if (!punch.fullDay) {
    return (
      <View style={[styles.punchBanner, { backgroundColor: COLORS.orangeSoft }]}>
        <MaterialIcons name="warning-amber" size={16} color={COLORS.orange} />
        <Text style={[styles.punchBannerText, { color: COLORS.orange }]}>
          {fmtTime(punch.firstIn)} → {punch.lastOut ? fmtTime(punch.lastOut) : 'NO PUNCH-OUT'} · {punch.hours}h — did not cover 9:30 AM–6:30 PM
        </Text>
      </View>
    );
  }
  return (
    <View style={[styles.punchBanner, { backgroundColor: COLORS.greenSoft }]}>
      <MaterialIcons name="verified" size={16} color={COLORS.green} />
      <Text style={[styles.punchBannerText, { color: COLORS.green }]}>
        {fmtTime(punch.firstIn)} → {fmtTime(punch.lastOut)} · {punch.hours}h — full day worked ✓
      </Text>
    </View>
  );
}

export default function CompOffApprovalsScreen({ navigation }) {
  const [filter, setFilter] = useState('pending');
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = filter === 'all' ? '' : `&status=${filter}`;
      const res = await api(`/compoff/requests?year=${CUR_YEAR}${q}`);
      setRequests(res.requests || []);
    } catch (e) { Alert.alert('Error', e.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const decide = (r, status) => {
    const who = r.user?.fullName || r.user?.username;
    const warn = !r.punch?.punched
      ? '\n\n⚠ They did NOT punch in/out that day.'
      : !r.punch?.fullDay
        ? '\n\n⚠ Their punches do not cover the full 9:30–6:30 day.'
        : '';
    const go = async () => {
      setBusyId(r.id);
      try {
        await api(`/compoff/requests/${r.id}/decision`, {
          method: 'PATCH',
          body: JSON.stringify({ status, reviewNote: '' }),
        });
        load();
      } catch (e) { Alert.alert('Failed', e.message); }
      finally { setBusyId(null); }
    };
    Alert.alert(
      status === 'approved' ? 'Approve comp-off' : 'Reject comp-off',
      `${status === 'approved' ? 'Approve' : 'Reject'} comp-off credit for ${who} (worked ${prettyDate(r.workDate)})?${status === 'approved' ? warn : ''}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: status === 'approved' ? 'Approve' : 'Reject',
          style: status === 'approved' ? 'default' : 'destructive',
          onPress: go,
        },
      ],
    );
  };

  const revoke = (r) => {
    const who = r.user?.fullName || r.user?.username;
    Alert.alert(
      'Remove comp-off credit',
      `Revoke the approved credit for ${who} (${prettyDate(r.workDate)})? Their CO leave balance drops by 1 day.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke', style: 'destructive',
          onPress: async () => {
            setBusyId(r.id);
            try {
              await api(`/compoff/admin/${r.id}/revoke`, { method: 'PATCH', body: JSON.stringify({}) });
              load();
            } catch (e) { Alert.alert('Failed', e.message); }
            finally { setBusyId(null); }
          },
        },
      ],
    );
  };

  const pendingCount = requests.filter((r) => r.status === 'pending').length;

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <GradientHeader
        title="Comp-Off Approvals"
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
              <MaterialIcons name="redeem" size={44} color="#CBD5E1" />
              <Text style={styles.emptyText}>No {filter === 'all' ? '' : filter} comp-off requests</Text>
            </View>
          ) : (
            requests.map((r) => {
              const st = STATUS_STYLE[r.status] || STATUS_STYLE.cancelled;
              const busy = busyId === r.id;
              return (
                <Card key={r.id} style={styles.reqCard}>
                  <View style={styles.cardTop}>
                    <View style={[styles.typeTag, { backgroundColor: st.bg }]}>
                      <MaterialIcons name="redeem" size={20} color={st.c} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name}>{r.user?.fullName || r.user?.username}</Text>
                      <Text style={styles.userSub}>@{r.user?.username} · worked {prettyDate(r.workDate)}</Text>
                    </View>
                    <Chip text={st.label} color={st.c} soft={st.bg} />
                  </View>

                  <PunchBanner punch={r.punch} />
                  {r.reason ? <Text style={styles.reason}>“{r.reason}”</Text> : null}
                  {(r.status === 'rejected' || r.status === 'revoked') && r.reviewNote ? (
                    <Text style={styles.reviewNote}>{r.reviewNote}</Text>
                  ) : null}

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

                  {r.status === 'approved' && (
                    <TouchableOpacity style={[styles.actBtn, styles.revokeBtn]} disabled={busy} onPress={() => revoke(r)}>
                      {busy ? <ActivityIndicator color={COLORS.red} size="small" /> : (
                        <>
                          <MaterialIcons name="remove-circle-outline" size={17} color={COLORS.red} />
                          <Text style={[styles.actText, { color: COLORS.red }]}>Remove credit</Text>
                        </>
                      )}
                    </TouchableOpacity>
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
  name: { fontSize: 14, fontWeight: '800', color: COLORS.ink },
  userSub: { fontSize: 11.5, color: COLORS.faint, marginTop: 1 },

  punchBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, marginTop: 12,
  },
  punchBannerText: { fontSize: 11.5, fontWeight: '800', flex: 1 },

  reason: { fontSize: 12.5, color: COLORS.sub, marginTop: 8, fontStyle: 'italic' },
  reviewNote: { fontSize: 11.5, color: COLORS.red, marginTop: 6, fontWeight: '600' },

  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  actBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 46, borderRadius: RADIUS.button },
  rejectBtn: { flex: 1, borderWidth: 1.5, borderColor: '#FCA5A5', backgroundColor: '#FEF2F2' },
  revokeBtn: { marginTop: 14, borderWidth: 1.5, borderColor: '#FCA5A5', backgroundColor: '#FEF2F2' },
  actText: { fontSize: 13.5, fontWeight: '800' },
});
