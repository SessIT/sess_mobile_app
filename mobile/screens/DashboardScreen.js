import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { clearAuth } from '../lib/auth';

const INDIGO = '#1E3A8A';
const ADMIN = 'Technical Director / Admin';

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

  const tiles = [
    isAdmin && { key: 'users', label: 'User Management', sub: 'Create & manage accounts', icon: 'group', screen: 'Users' },
    { key: 'punch', label: 'Punch In / Out', sub: 'Selfie + GPS attendance', icon: 'fingerprint', screen: 'Punch' },
    { key: 'myatt', label: 'My Attendance', sub: 'History & working hours', icon: 'event-available' },
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
            onPress={() => Alert.alert('Notifications', 'Coming soon 😄')}
          >
            <MaterialIcons name="notifications-none" size={22} color="#fff" />
            <View style={styles.bellDot} />
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
        <Text style={styles.sectionTitle}>Quick Actions</Text>
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

      <TouchableOpacity
        style={styles.logoutBtn}
        onPress={async () => { await clearAuth(); navigation.replace('Login'); }}
      >
        <MaterialIcons name="logout" size={18} color={INDIGO} />
        <Text style={styles.logoutText}>Logout</Text>
      </TouchableOpacity>
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
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#374151', marginBottom: 12 },
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

  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    margin: 16, marginTop: 8, borderWidth: 1.5, borderColor: '#C7D2FE',
    backgroundColor: '#fff', borderRadius: 14, paddingVertical: 13, elevation: 1,
  },
  logoutText: { color: INDIGO, fontWeight: '700' },
});