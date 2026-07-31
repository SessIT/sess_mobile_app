import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { api } from '../lib/api';
import { ensurePunchReminders, onNotificationTap } from '../lib/notifications';
import { BottomNav } from '../components/ui';

const INDIGO = '#1E3A8A';
const ADMIN = 'Technical Director / Admin';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const todayYMD = () => new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);

/* Compact holiday widget — shows the next upcoming holiday and opens the full
 * Holidays screen (upcoming-first) on tap. Fails silently so the dashboard is
 * never blocked by this call. */
// function HolidayWidget({ navigation }) {
//   const [next, setNext] = useState(null);
//   const [loading, setLoading] = useState(true);

//   useEffect(() => {
//     let alive = true;
//     (async () => {
//       try {
//         const res = await api('/holidays/upcoming?limit=1');
//         if (alive) setNext(res.holidays?.[0] || null);
//       } catch {
//         if (alive) setNext(null);
//       } finally {
//         if (alive) setLoading(false);
//       }
//     })();
//     return () => { alive = false; };
//   }, []);

//   const d = next ? new Date(next.date) : null;
//   const until = d ? Math.round((new Date(d.toISOString().slice(0, 10) + 'T00:00:00Z') - new Date(todayYMD() + 'T00:00:00Z')) / 86400000) : null;
//   const away = until === 0 ? 'Today' : until === 1 ? 'Tomorrow' : `in ${until} days`;

//   return (
//     <TouchableOpacity activeOpacity={0.85} onPress={() => navigation.navigate('Holidays')}>
//       <LinearGradient
//         colors={['#4F46E5', '#4338CA']}
//         start={{ x: 0, y: 0 }}
//         end={{ x: 1, y: 1 }}
//         style={styles.widget}
//       >
//         <View style={styles.widgetIcon}>
//           <MaterialIcons name="celebration" size={24} color="#fff" />
//         </View>
//         <View style={{ flex: 1 }}>
//           <Text style={styles.widgetLabel}>NEXT HOLIDAY</Text>
//           {loading ? (
//             <Text style={styles.widgetName}>Loading…</Text>
//           ) : next ? (
//             <>
//               <Text style={styles.widgetName} numberOfLines={1}>{next.name}</Text>
//               <Text style={styles.widgetSub}>
//                 {d.getUTCDate()} {MONTHS[d.getUTCMonth()]} {d.getUTCFullYear()} · {away}
//               </Text>
//             </>
//           ) : (
//             <Text style={styles.widgetName}>No upcoming holidays</Text>
//           )}
//         </View>
//         <MaterialIcons name="chevron-right" size={26} color="rgba(255,255,255,0.85)" />
//       </LinearGradient>
//     </TouchableOpacity>
//   );
// }

/* Upcoming birthdays & work anniversaries (next 30 days) — a horizontal strip
 * of celebration cards. Hides itself entirely when there is nothing coming up
 * or the call fails, so the dashboard is never blocked. */
// function CelebrationsWidget({ navigation }) {
//   const [events, setEvents] = useState(null);

//   useEffect(() => {
//     let alive = true;
//     api('/reports/upcoming?days=30')
//       .then((r) => { if (alive) setEvents(r.events || []); })
//       .catch(() => { if (alive) setEvents([]); });
//     return () => { alive = false; };
//   }, []);

//   if (!events || events.length === 0) return null;

//   const initials = (n) => (n || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
//   const when = (d) => (d === 0 ? '🎉 TODAY' : d === 1 ? 'Tomorrow' : `in ${d} days`);
//   const prettyDay = (ymd) => `${Number(ymd.slice(8, 10))} ${MONTHS[Number(ymd.slice(5, 7)) - 1]}`;

//   return (
//     <View style={{ marginBottom: 6 }}>
//       <View style={styles.celebHead}>
//         <View style={styles.celebHeadIcon}>
//           <MaterialIcons name="auto-awesome" size={13} color="#D97706" />
//         </View>
//         <Text style={styles.celebTitle}>CELEBRATIONS</Text>
//         <View style={styles.celebCount}><Text style={styles.celebCountText}>{events.length}</Text></View>
//         <Text style={styles.celebSub}>next 30 days</Text>
//       </View>
//       <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 6 }}>
//         {events.map((e) => {
//           const isToday = e.daysUntil === 0;
//           const bday = e.type === 'birthday';
//           const wish = bday
//             ? 'Happy Birthday! 🎂🎉 Wishing you a fantastic year ahead!'
//             : `Congratulations on ${e.years} wonderful year${e.years === 1 ? '' : 's'} with SESS! 🏆🎉`;
//           return (
//             <TouchableOpacity
//               key={`${e.type}-${e.id}`}
//               activeOpacity={0.85}
//               // Tap a celebration -> open chat with a ready-made wish.
//               onPress={() => navigation.navigate('Chat', {
//                 user: { id: e.id, fullName: e.fullName, username: e.username },
//                 prefill: wish,
//               })}
//             >
//               <LinearGradient
//                 colors={isToday ? ['#F59E0B', '#D97706'] : bday ? ['#7C3AED', '#5B21B6'] : ['#1E40AF', '#312E81']}
//                 start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
//                 style={[styles.celebCard, isToday && styles.celebCardToday]}
//               >
//                 <View style={styles.celebDeco} />
//                 <View style={[styles.celebDeco, { width: 46, height: 46, top: undefined, bottom: -18, right: undefined, left: -14, opacity: 0.7 }]} />

//                 <View style={styles.celebTopRow}>
//                   <View style={styles.celebAvatarWrap}>
//                     <View style={styles.celebAvatar}>
//                       <Text style={styles.celebAvatarText}>{initials(e.fullName || e.username)}</Text>
//                     </View>
//                     <View style={styles.celebEmoji}>
//                       <Text style={{ fontSize: 12 }}>{bday ? '🎂' : '🏆'}</Text>
//                     </View>
//                   </View>
//                   <View style={styles.celebDate}>
//                     <Text style={styles.celebDateDay}>{prettyDay(e.date).split(' ')[0]}</Text>
//                     <Text style={styles.celebDateMon}>{prettyDay(e.date).split(' ')[1]}</Text>
//                   </View>
//                 </View>

//                 <Text style={styles.celebName} numberOfLines={1}>{e.fullName || e.username}</Text>
//                 <Text style={styles.celebType} numberOfLines={1}>
//                   {bday ? 'Birthday' : `${e.years} yr${e.years === 1 ? '' : 's'} with SESS`}
//                   {e.designation ? ` · ${e.designation}` : ''}
//                 </Text>

//                 <View style={styles.celebFootRow}>
//                   <View style={[styles.celebPill, isToday && styles.celebPillToday]}>
//                     <Text style={[styles.celebPillText, isToday && { color: '#92400E' }]}>{when(e.daysUntil)}</Text>
//                   </View>
//                   <View style={styles.celebWishHint}>
//                     <MaterialIcons name="chat" size={11} color="rgba(255,255,255,0.95)" />
//                     <Text style={styles.celebWishText}>Wish</Text>
//                   </View>
//                 </View>
//               </LinearGradient>
//             </TouchableOpacity>
//           );
//         })}
//       </ScrollView>
//     </View>
//   );
// }

const getGreeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning ☀️';
  if (h < 17) return 'Good Afternoon 🌤️';
  return 'Good Evening 🌙';
};

const getInitials = (name) =>
  (name || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

const todayStr = () =>
  new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

export default function DashboardScreen({ route, navigation }) {
  const { fullName, roles = [] } = route.params || {};
  const isAdmin = roles.includes(ADMIN);

  // Daily punch reminders (9:15 in / 18:30 out) + tap-to-open-Punch routing.
  useEffect(() => {
    ensurePunchReminders();
    return onNotificationTap((screen) => navigation.navigate(screen));
  }, [navigation]);

  // Unread chat count — powers the bell dot. Polls while this screen is focused.
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    let timer = null;
    const fetchUnread = () => api('/chat/unread-count').then(r => setUnread(r.count || 0)).catch(() => {});
    const unsubFocus = navigation.addListener('focus', () => {
      fetchUnread();
      timer = setInterval(fetchUnread, 15000);
    });
    const unsubBlur = navigation.addListener('blur', () => clearInterval(timer));
    return () => { unsubFocus(); unsubBlur(); clearInterval(timer); };
  }, [navigation]);

  // Punch / Chat / Profile moved to the bottom tab bar — tiles keep the rest.
  const tiles = [
    isAdmin && { key: 'users', label: 'User Management', sub: 'Create & manage accounts', icon: 'group', screen: 'Users' },
    // { key: 'myatt', label: 'My Attendance', sub: 'History & working hours', icon: 'event-available', screen: 'MyAttendance' },
    // { key: 'leave', label: 'My Leave', sub: 'Apply & track leave balance', icon: 'beach-access', screen: 'Leave' },
    isAdmin && { key: 'trail', label: 'Team Trail', sub: 'Employee location timeline', icon: 'map', screen: 'TeamTrail' },
    isAdmin && { key: 'teamatt', label: 'Team Attendance', sub: 'All employees • month reports', icon: 'groups', screen: 'TeamAttendance' },
    isAdmin && { key: 'leaveappr', label: 'Leave Approvals', sub: 'Review & approve requests', icon: 'fact-check', screen: 'LeaveApprovals' },
  ].filter(Boolean);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* ===== Premium Header ===== */}
      <LinearGradient
        colors={['#1E40AF', '#1E3A8A', '#312E81']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        {/* decorative glass circles */}
        <View style={[styles.deco, { width: 190, height: 190, top: -70, right: -50 }]} />
        <View style={[styles.deco, { width: 110, height: 110, bottom: -40, left: -30 }]} />

        <View style={styles.headerTopRow}>
          <Text style={styles.dateText}>{todayStr()}</Text>
          <TouchableOpacity
            style={styles.bellBtn}
            onPress={() => navigation.navigate('Notifications')}
          >
            <MaterialIcons name={unread > 0 ? 'notifications-active' : 'notifications-none'} size={22} color="#fff" />
            {unread > 0 && <View style={styles.bellDot} />}
          </TouchableOpacity>
        </View>

        <View style={styles.headerMainRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greet}>{getGreeting()}</Text>
            <Text style={styles.name} numberOfLines={1}>{fullName || 'User'}</Text>
            <View style={styles.chipRow}>
              {roles.map(r => (
                <View key={r} style={styles.roleChip}>
                  <Text style={styles.roleChipText}>{r}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{getInitials(fullName)}</Text>
          </View>
        </View>
      </LinearGradient>

      {/* ===== Tiles ===== */}
      <ScrollView contentContainerStyle={styles.grid} showsVerticalScrollIndicator={false}>
        {/* Today Tasks — task management ships in the next update (design page 4) */}
        <Text style={styles.sectionTitle}>TODAY TASKS</Text>
        <TouchableOpacity style={styles.taskCard} activeOpacity={0.8}
          onPress={() => navigation.navigate('TaskList')}>
          <View style={styles.taskIcon}>
            <MaterialIcons name="checklist" size={24} color={INDIGO} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.taskTitle}>Task management is coming soon</Text>
            <Text style={styles.taskSub}>Your daily tasks will appear here · upcoming update 🚀</Text>
          </View>
          <MaterialIcons name="chevron-right" size={24} color="#9CA3AF" />
        </TouchableOpacity>

        {/* <HolidayWidget navigation={navigation} /> */}

        {/* <CelebrationsWidget navigation={navigation} /> */}

        {/* <Text style={styles.sectionTitle}>QUICK ACTIONS</Text> */}
        <View style={styles.tileWrap}>
          {tiles.map(t => (
            <TouchableOpacity
              key={t.key}
              style={styles.tile}
              activeOpacity={0.75}
              onPress={() => t.screen ? navigation.navigate(t.screen) : Alert.alert(t.label, 'Upcoming module build in progress 😄')}
            >
              <View style={styles.tileIcon}>
                <MaterialIcons name={t.icon} size={26} color={INDIGO} />
              </View>
              <Text style={styles.tileLabel}>{t.label}</Text>
              <Text style={styles.tileSub} numberOfLines={2}>{t.sub}</Text>
              <View style={styles.tileArrow}>
                <MaterialIcons name="arrow-forward" size={15} color="#9CA3AF" />
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <BottomNav navigation={navigation} active={null} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },

  header: {
    paddingTop: 54, paddingBottom: 26, paddingHorizontal: 20,
    borderBottomLeftRadius: 28, borderBottomRightRadius: 28,
    overflow: 'hidden', elevation: 6,
  },
  deco: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.07)' },

  headerTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dateText: { color: '#C7D2FE', fontSize: 12, fontWeight: '600', letterSpacing: 0.3 },
  bellBtn: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.14)',
    justifyContent: 'center', alignItems: 'center',
  },
  bellDot: {
    position: 'absolute', top: 9, right: 10, width: 7, height: 7,
    borderRadius: 4, backgroundColor: '#F87171', borderWidth: 1, borderColor: INDIGO,
  },

  headerMainRow: { flexDirection: 'row', alignItems: 'center', marginTop: 16 },
  greet: { color: '#C7D2FE', fontSize: 14, fontWeight: '500' },
  name: { color: '#fff', fontSize: 26, fontWeight: '800', marginTop: 2, letterSpacing: 0.2 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  roleChip: {
    backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)',
  },
  roleChipText: { color: '#E0E7FF', fontSize: 11, fontWeight: '600' },

  avatar: {
    width: 56, height: 56, borderRadius: 28, marginLeft: 14,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.45)',
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { color: '#fff', fontSize: 19, fontWeight: '800' },

  grid: { padding: 20, paddingBottom: 10 },

  widget: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderRadius: 18, padding: 16, marginBottom: 20,
    elevation: 3, shadowColor: '#312E81', shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 5 },
  },
  widgetIcon: {
    width: 46, height: 46, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center', alignItems: 'center',
  },
  widgetLabel: { color: '#C7D2FE', fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  widgetName: { color: '#fff', fontSize: 16, fontWeight: '800', marginTop: 3 },
  widgetSub: { color: '#E0E7FF', fontSize: 12, fontWeight: '600', marginTop: 2 },

  /* Celebrations strip */
  celebHead: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 10, marginTop: 4 },
  celebHeadIcon: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#FEF3C7', justifyContent: 'center', alignItems: 'center' },
  celebTitle: { fontSize: 11, fontWeight: '800', color: '#374151', letterSpacing: 0.9 },
  celebCount: { minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#4F46E5', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 5 },
  celebCountText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  celebSub: { fontSize: 10.5, color: '#9CA3AF', fontWeight: '600', marginLeft: 'auto' },

  celebCard: { width: 156, borderRadius: 20, padding: 13, overflow: 'hidden', elevation: 4, shadowColor: '#1E3A8A', shadowOpacity: 0.2, shadowRadius: 9, shadowOffset: { width: 0, height: 5 } },
  celebCardToday: { borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.55)', shadowColor: '#F59E0B', shadowOpacity: 0.4 },
  celebDeco: { position: 'absolute', width: 96, height: 96, borderRadius: 48, backgroundColor: 'rgba(255,255,255,0.10)', top: -38, right: -32 },
  celebTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 9 },
  celebAvatarWrap: { alignSelf: 'flex-start' },
  celebAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.22)', justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.4)' },
  celebAvatarText: { color: '#fff', fontSize: 14.5, fontWeight: '800' },
  celebEmoji: { position: 'absolute', bottom: -4, right: -7, width: 23, height: 23, borderRadius: 12, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', elevation: 2 },
  celebDate: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4, minWidth: 38 },
  celebDateDay: { color: '#fff', fontSize: 15, fontWeight: '900', lineHeight: 17 },
  celebDateMon: { color: 'rgba(255,255,255,0.85)', fontSize: 9, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  celebName: { color: '#fff', fontSize: 14, fontWeight: '800' },
  celebType: { color: 'rgba(255,255,255,0.85)', fontSize: 10.5, fontWeight: '700', marginTop: 2 },
  celebFootRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  celebPill: { backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3.5 },
  celebPillToday: { backgroundColor: '#FDE68A' },
  celebPillText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  celebWishHint: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  celebWishText: { color: 'rgba(255,255,255,0.95)', fontSize: 9.5, fontWeight: '800', letterSpacing: 0.3 },

  sectionTitle: { fontSize: 12, fontWeight: '800', color: '#374151', letterSpacing: 0.9, marginBottom: 12 },

  taskCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 18, padding: 16, marginBottom: 20,
    borderWidth: 1.5, borderColor: '#E0E7FF', borderStyle: 'dashed',
    elevation: 1,
  },
  taskIcon: {
    width: 44, height: 44, borderRadius: 14, backgroundColor: '#EEF2FF',
    justifyContent: 'center', alignItems: 'center',
  },
  taskTitle: { fontSize: 13.5, fontWeight: '800', color: '#111827' },
  taskSub: { fontSize: 11, color: '#9CA3AF', marginTop: 3 },
  tileWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: {
    width: '47.5%', backgroundColor: '#fff', borderRadius: 18, padding: 16,
    elevation: 2, shadowColor: '#1E3A8A', shadowOpacity: 0.08,
    shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
  },
  tileIcon: {
    width: 46, height: 46, borderRadius: 14, backgroundColor: '#EEF2FF',
    justifyContent: 'center', alignItems: 'center', marginBottom: 10,
  },
  tileLabel: { fontSize: 14, fontWeight: '700', color: '#111827' },
  tileSub: { fontSize: 11, color: '#9CA3AF', marginTop: 3, lineHeight: 15 },
  tileArrow: { position: 'absolute', top: 14, right: 14 },

});