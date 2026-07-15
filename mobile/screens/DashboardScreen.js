import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { MaterialIcons } from '@expo/vector-icons';
import { clearAuth } from '../lib/auth';

const INDIGO = '#1E3A8A';
const ADMIN = 'Technical Director / Admin';

export default function DashboardScreen({ route, navigation }) {
  const { fullName, roles = [] } = route.params || {};
  const isAdmin = roles.includes(ADMIN);

  const tiles = [
    isAdmin && { key: 'users', label: 'User Management', icon: 'group', screen: 'Users' },
    { key: 'punch', label: 'Punch In / Out', icon: 'fingerprint' },
    { key: 'myatt', label: 'My Attendance', icon: 'event-available' },
  ].filter(Boolean);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Text style={styles.greet}>Welcome back,</Text>
        <Text style={styles.name}>{fullName || 'User'}</Text>
        <Text style={styles.role}>{roles.join(' • ')}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.grid}>
        {tiles.map(t => (
          <TouchableOpacity
            key={t.key}
            style={styles.tile}
            activeOpacity={0.8}
            onPress={() => t.screen ? navigation.navigate(t.screen) : Alert.alert(t.label, 'Upcoming module build in progress 😄')}
          >
            <View style={styles.tileIcon}>
              <MaterialIcons name={t.icon} size={28} color={INDIGO} />
            </View>
            <Text style={styles.tileLabel}>{t.label}</Text>
          </TouchableOpacity>
        ))}
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
  header: { backgroundColor: INDIGO, paddingTop: 60, paddingBottom: 24, paddingHorizontal: 20, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  greet: { color: '#C7D2FE', fontSize: 14 },
  name: { color: '#fff', fontSize: 24, fontWeight: 'bold', marginTop: 2 },
  role: { color: '#C7D2FE', fontSize: 13, marginTop: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', padding: 16, gap: 12 },
  tile: { width: '47%', backgroundColor: '#fff', borderRadius: 16, padding: 16, alignItems: 'flex-start', elevation: 1 },
  tileIcon: { width: 48, height: 48, borderRadius: 12, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  tileLabel: { fontSize: 14, fontWeight: '600', color: '#111827' },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, margin: 16, borderWidth: 1, borderColor: INDIGO, borderRadius: 12, paddingVertical: 12 },
  logoutText: { color: INDIGO, fontWeight: '600' },
});