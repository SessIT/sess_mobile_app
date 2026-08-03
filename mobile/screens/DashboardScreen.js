import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { api } from '../lib/api';
import { ensurePunchReminders, onNotificationTap } from '../lib/notifications';
import { BottomNav } from '../components/ui';

const INDIGO = '#1E3A8A';

/* Home screen (design page 4): greeting header + Today Tasks.
 * Every other widget and shortcut now lives under My Profile. */

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

          <TouchableOpacity style={styles.avatar} activeOpacity={0.8} onPress={() => navigation.navigate('MyProfile')}>
            <Text style={styles.avatarText}>{getInitials(fullName)}</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

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
});
