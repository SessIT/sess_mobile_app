import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { MaterialIcons } from '@expo/vector-icons';
import { GradientHeader, BottomNav, Card } from '../components/ui';
import { COLORS } from '../lib/theme';
import { getAuth, clearAuth } from '../lib/auth';

const APP_VERSION = '0.1';

/* More Settings (design page 16): Terms, Privacy Policy, Logout + version chip.
 * Reachable pre-login too (gear on the login screen) — Logout hides then. */
export default function MoreSettingsScreen({ navigation }) {
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    getAuth().then((a) => setAuthed(!!a)).catch(() => {});
  }, []);

  const logout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout', style: 'destructive',
        onPress: async () => {
          await clearAuth();
          navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
        },
      },
    ]);
  };

  const Row = ({ icon, label, onPress, danger }) => (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <MaterialIcons name={icon} size={21} color={danger ? COLORS.red : COLORS.sub} />
      <Text style={[styles.rowLabel, danger && { color: COLORS.red }]}>{label}</Text>
      <MaterialIcons name="chevron-right" size={22} color={COLORS.faint} />
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <GradientHeader title="More Settings" onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Card style={{ padding: 6 }}>
          <Row icon="description" label="Terms & Conditions" onPress={() => navigation.navigate('Terms')} />
          <View style={styles.divider} />
          <Row icon="privacy-tip" label="Privacy Policy" onPress={() => navigation.navigate('Privacy')} />
          {authed && (
            <>
              <View style={styles.divider} />
              <Row icon="logout" label="Logout" onPress={logout} danger />
            </>
          )}
        </Card>

        <View style={styles.versionChip}>
          <Text style={styles.versionText}>Version {APP_VERSION}</Text>
        </View>
      </ScrollView>

      {authed && <BottomNav navigation={navigation} active="profile" />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 15, paddingHorizontal: 12 },
  rowLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: COLORS.ink },
  divider: { height: 1, backgroundColor: COLORS.line, marginLeft: 46 },
  versionChip: {
    alignSelf: 'center', backgroundColor: COLORS.primary, borderRadius: 8,
    paddingHorizontal: 16, paddingVertical: 7, marginTop: 24,
  },
  versionText: { color: '#fff', fontSize: 12.5, fontWeight: '700' },
});
