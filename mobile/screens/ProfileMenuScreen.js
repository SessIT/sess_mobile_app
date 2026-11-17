import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { MaterialIcons } from '@expo/vector-icons';
import { GradientHeader, BottomNav, HeaderIconButton, SectionLabel } from '../components/ui';
// import { HolidayWidget, CelebrationsWidget } from '../components/widgets';
import { COLORS, SHADOW } from '../lib/theme';
import { api } from '../lib/api';
import { getAuth } from '../lib/auth';

const ADMIN = 'Admin';

const initials = (n) => (n || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

/* My Profile hub (design page 9) — avatar hero, the dashboard widgets, and the
 * tile grid into every section. Admins get an extra management block. */
const MY_TILES = [
  { key: 'profile', label: 'Profile', icon: 'account-circle', screen: 'ProfileDetail' },
  { key: 'attendance', label: 'My Attendance', icon: 'event-available', screen: 'MyAttendance' },
  { key: 'leave', label: 'My Leave', icon: 'beach-access', screen: 'Leave' },
  { key: 'overtime', label: 'My Overtime', icon: 'more-time', screen: 'Overtime' },
  { key: 'compoff', label: 'Comp-Off', icon: 'redeem', screen: 'CompOff' },
  { key: 'expense', label: 'My Expenses', icon: 'receipt-long', screen: 'Expense' },
  { key: 'payslips', label: 'My Payslips', icon: 'payments', screen: 'Payslips' },
  { key: 'announcements', label: 'Announcements', icon: 'campaign', screen: 'Announcements' },
  { key: 'helpdesk', label: 'HR Helpdesk', icon: 'support-agent', screen: 'Helpdesk' },
  { key: 'mydocs', label: 'My Documents', icon: 'folder-shared', screen: 'MyDocuments' },
  { key: 'training', label: 'My Training', icon: 'school', screen: 'Training' },
  { key: 'holidays', label: 'Holiday List', icon: 'celebration', screen: 'Holidays' },
  { key: 'tasks', label: 'My Tasks', icon: 'checklist', screen: 'TaskList' },
  { key: 'notes', label: 'Notes', icon: 'sticky-note-2', screen: 'Notes' },
];

// Shown to anyone with employees reporting to them (reporting manager).
const MANAGER_TILES = [
  { key: 'myteam', label: 'My Team', icon: 'groups', screen: 'TeamAttendance', params: { scope: 'team' } },
  { key: 'teamappr', label: 'Team Approvals', icon: 'approval', screen: 'TeamApprovals' },
];

// `perm` = the admin area the role needs (Roles & Permissions on the web).
const ADMIN_TILES = [
  { key: 'users', label: 'User Management', icon: 'group', screen: 'Users', perm: 'users' },
  { key: 'teamatt', label: 'Team Attendance', icon: 'groups', screen: 'TeamAttendance', perm: 'attendance' },
  { key: 'trail', label: 'Team Trail', icon: 'map', screen: 'TeamTrail', perm: 'location' },
  { key: 'leaveappr', label: 'Leave Approvals', icon: 'fact-check', screen: 'LeaveApprovals', perm: 'leave' },
  { key: 'otappr', label: 'OT Approvals', icon: 'more-time', screen: 'OtApprovals', perm: 'overtime' },
  { key: 'coappr', label: 'Comp-Off Approvals', icon: 'redeem', screen: 'CompOffApprovals', perm: 'compoff' },
  { key: 'expappr', label: 'Expense Approvals', icon: 'receipt-long', screen: 'ExpenseApprovals', perm: 'expenses' },
  { key: 'leavepolicy', label: 'Leave Policy', icon: 'rule', screen: 'LeavePolicy', perm: 'leave' },
  { key: 'sites', label: 'Customer Sites', icon: 'place', screen: 'Sites', perm: 'sites' },
  { key: 'sendnote', label: 'Send Note', icon: 'campaign', screen: 'SendNote', perm: 'announcements' },
];

export default function ProfileMenuScreen({ navigation }) {
  const [me, setMe] = useState(null);
  const [unread, setUnread] = useState(0);
  const [noteUnread, setNoteUnread] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [team, setTeam] = useState(null); // { isManager, teamSize, pendingApprovals }
  const [annPending, setAnnPending] = useState(0); // notices awaiting my acknowledgement
  const [perms, setPerms] = useState([]); // admin areas my role may manage (live from /me)
  const [trainPending, setTrainPending] = useState(0);
  const [interviews, setInterviews] = useState(0); // interviews I'm scheduled to take

  useEffect(() => {
    let alive = true;
    api('/me/profile').then(p => { if (alive) setMe(p); }).catch(() => {});
    // Roles live in the saved login payload — /me/profile does not return them.
    getAuth().then(a => { if (alive) setIsAdmin((a?.roles || []).includes(ADMIN)); }).catch(() => {});
    // Live role + permissions: a role change takes effect without logging out.
    api('/me').then(m => {
      if (!alive) return;
      setIsAdmin((m.roles || []).includes(ADMIN));
      setPerms(m.permissions || []);
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // Unread counters — refreshed each time the screen is focused.
  useEffect(() => {
    const fetchCounts = () => {
      Promise.all([
        api('/chat/unread-count').then(r => r.count || 0).catch(() => 0),
        api('/notifications/unread-count').then(r => r.count || 0).catch(() => 0),
      ]).then(([chat, updates]) => setUnread(chat + updates));
      api('/notes/unread-count').then(r => setNoteUnread(r.count || 0)).catch(() => {});
      // Live, not from the login payload: someone can become a manager mid-session.
      api('/team/summary').then(setTeam).catch(() => {});
      api('/announcements/pending-count').then(r => setAnnPending(r.count || 0)).catch(() => {});
      api('/training/my').then(r => setTrainPending(r.pending || 0)).catch(() => {});
      api('/recruitment/interviews/my').then(r => setInterviews((r.interviews || []).length)).catch(() => {});
    };
    fetchCounts();
    return navigation.addListener('focus', fetchCounts);
  }, [navigation]);

  const adminTiles = ADMIN_TILES.filter(t => isAdmin || perms.includes(t.perm));

  const Tile = ({ t }) => {
    const badge = t.key === 'notes' ? noteUnread : t.key === 'teamappr' ? (team?.pendingApprovals || 0) : t.key === 'announcements' ? annPending : t.key === 'training' ? trainPending : t.key === 'interviews' ? interviews : 0;
    return (
      <TouchableOpacity
        style={styles.tile}
        activeOpacity={0.75}
        onPress={() => navigation.navigate(t.screen, t.params)}
      >
        <View style={styles.tileIcon}>
          <MaterialIcons name={t.icon} size={26} color={COLORS.primary} />
          {badge > 0 && (
            <View style={styles.tileBadge}>
              <Text style={styles.tileBadgeText}>{badge > 9 ? '9+' : badge}</Text>
            </View>
          )}
        </View>
        <Text style={styles.tileLabel}>{t.label}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <GradientHeader
        title="My Profile"
        onBack={() => navigation.goBack()}
        right={
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <HeaderIconButton
              icon={unread > 0 ? 'notifications-active' : 'notifications-none'}
              badge={unread > 0}
              onPress={() => navigation.navigate('Notifications')}
            />
            <HeaderIconButton icon="more-vert" onPress={() => navigation.navigate('MoreSettings')} />
          </View>
        }
      >
        <View style={styles.heroRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials(me?.fullName || me?.username)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroName} numberOfLines={1}>{me?.fullName || me?.username || '…'}</Text>
            <Text style={styles.heroSub} numberOfLines={1}>
              {me?.designation || (me?.username ? `@${me.username}` : '')}
            </Text>
          </View>
        </View>
      </GradientHeader>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {/* Widgets moved here from the dashboard */}
        {/* <HolidayWidget navigation={navigation} />
        <CelebrationsWidget navigation={navigation} /> */}

        <SectionLabel text="MY WORKSPACE" />
        <View style={styles.grid}>
          {MY_TILES.map(t => <Tile key={t.key} t={t} />)}
        </View>

        {team?.isManager && (
          <>
            <SectionLabel text={`MY TEAM · ${team.teamSize} ${team.teamSize === 1 ? 'MEMBER' : 'MEMBERS'}`} />
            <View style={styles.grid}>
              {MANAGER_TILES.map(t => <Tile key={t.key} t={t} />)}
            </View>
          </>
        )}

        {interviews > 0 && (
          <>
            <SectionLabel text="HIRING" />
            <View style={styles.grid}>
              <Tile t={{ key: 'interviews', label: 'My Interviews', icon: 'record-voice-over', screen: 'Interviews' }} />
            </View>
          </>
        )}

        {adminTiles.length > 0 && (
          <>
            <SectionLabel text={isAdmin ? 'ADMIN · MANAGEMENT' : 'MANAGEMENT'} />
            <View style={styles.grid}>
              {adminTiles.map(t => <Tile key={t.key} t={t} />)}
            </View>
          </>
        )}
      </ScrollView>

      <BottomNav navigation={navigation} active="profile" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 18 },
  avatar: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.45)',
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { color: '#fff', fontSize: 22, fontWeight: '800' },
  heroName: { color: '#fff', fontSize: 18, fontWeight: '800' },
  heroSub: { color: '#C7D2FE', fontSize: 12.5, marginTop: 2 },

  body: { padding: 16, paddingTop: 18, paddingBottom: 24 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: {
    width: '31%', flexGrow: 1, backgroundColor: COLORS.card, borderRadius: 16,
    paddingVertical: 18, alignItems: 'center', gap: 10, ...SHADOW.card,
  },
  tileIcon: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.indigoSoft,
    justifyContent: 'center', alignItems: 'center',
  },
  tileBadge: {
    position: 'absolute', top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: COLORS.red, justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 4, borderWidth: 1.5, borderColor: COLORS.card,
  },
  tileBadgeText: { color: '#fff', fontSize: 9.5, fontWeight: '800' },
  tileLabel: { fontSize: 12, fontWeight: '700', color: COLORS.ink, textAlign: 'center', paddingHorizontal: 4 },
});
