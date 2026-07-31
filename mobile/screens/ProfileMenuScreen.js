import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { MaterialIcons } from '@expo/vector-icons';
import { GradientHeader, BottomNav, HeaderIconButton } from '../components/ui';
import { COLORS, SHADOW } from '../lib/theme';
import { api } from '../lib/api';

const initials = (n) => (n || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

/* My Profile hub (design page 9) — avatar hero + tile grid into each section. */
const TILES = [
  { key: 'profile', label: 'Profile', icon: 'account-circle', screen: 'ProfileDetail' },
  { key: 'attendance', label: 'My Attendance', icon: 'event-available', screen: 'MyAttendance' },
  { key: 'leave', label: 'My Leave', icon: 'beach-access', screen: 'Leave' },
  { key: 'holidays', label: 'Holiday List', icon: 'celebration', screen: 'Holidays' },
  { key: 'tasks', label: 'My Tasks', icon: 'checklist', screen: 'TaskList' },
  { key: 'notes', label: 'Notes', icon: 'sticky-note-2', screen: 'Notes' },
];

export default function ProfileMenuScreen({ navigation }) {
  const [me, setMe] = useState(null);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let alive = true;
    api('/me/profile').then(p => { if (alive) setMe(p); }).catch(() => {});
    api('/chat/unread-count').then(r => { if (alive) setUnread(r.count || 0); }).catch(() => {});
    return () => { alive = false; };
  }, []);

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
            <Text style={styles.heroSub} numberOfLines={1}>{me?.username ? `@${me.username}` : ''}</Text>
          </View>
        </View>
      </GradientHeader>

      <ScrollView contentContainerStyle={styles.grid}>
        {TILES.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={styles.tile}
            activeOpacity={0.75}
            onPress={() => navigation.navigate(t.screen)}
          >
            <View style={styles.tileIcon}>
              <MaterialIcons name={t.icon} size={26} color={COLORS.primary} />
            </View>
            <Text style={styles.tileLabel}>{t.label}</Text>
          </TouchableOpacity>
        ))}
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

  grid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 12,
    padding: 16, paddingTop: 20, paddingBottom: 24,
  },
  tile: {
    width: '31%', flexGrow: 1, backgroundColor: COLORS.card, borderRadius: 16,
    paddingVertical: 18, alignItems: 'center', gap: 10, ...SHADOW.card,
  },
  tileIcon: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.indigoSoft,
    justifyContent: 'center', alignItems: 'center',
  },
  tileLabel: { fontSize: 12, fontWeight: '700', color: COLORS.ink, textAlign: 'center', paddingHorizontal: 4 },
});
