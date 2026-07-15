import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { clearAuth } from '../lib/auth';

const INDIGO = '#1E3A8A';

export default function DashboardScreen({ route, navigation }) {
  const { fullName, roles } = route.params || {};

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Text style={styles.greet}>Welcome back,</Text>
        <Text style={styles.name}>{fullName || 'User'}</Text>
        <Text style={styles.role}>{(roles || []).join(' • ')}</Text>
      </View>
      <View style={styles.body}>
        <Text style={styles.placeholder}>Dashboard tiles coming soon…</Text>
        <TouchableOpacity style={styles.logoutBtn} onPress={async () => { await clearAuth(); navigation.replace('Login'); }}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  header: { backgroundColor: INDIGO, paddingTop: 60, paddingBottom: 24, paddingHorizontal: 20, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  greet: { color: '#C7D2FE', fontSize: 14 },
  name: { color: '#fff', fontSize: 24, fontWeight: 'bold', marginTop: 2 },
  role: { color: '#C7D2FE', fontSize: 13, marginTop: 4 },
  body: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  placeholder: { color: '#6B7280', fontSize: 15 },
  logoutBtn: { marginTop: 24, borderWidth: 1, borderColor: INDIGO, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 32 },
  logoutText: { color: INDIGO, fontWeight: '600' },
});