import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { api } from '../lib/api';
import { notificationsAvailable } from '../lib/notifications';

const INDIGO = '#1E3A8A';
const AVATAR_COLORS = ['#4F46E5', '#0891B2', '#16A34A', '#D97706', '#DC2626', '#7C3AED', '#DB2777'];

const initials = (n) => (n || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
const timeAgo = (iso) => {
  if (!iso) return '';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
};

// Notification center — WhatsApp-style: each unread conversation is a
// notification card with the message preview; tapping opens THAT thread.
export default function NotificationsScreen({ navigation }) {
  const [items, setItems] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api('/chat/conversations');
      setItems((res.conversations || []).filter((c) => c.unread > 0));
    } catch { setItems((prev) => prev ?? []); }
    finally { setRefreshing(false); }
  }, []);

  useEffect(() => {
    const unsub = navigation.addListener('focus', load);
    return unsub;
  }, [navigation, load]);

  const openItem = (c) => {
    if (c.kind === 'group') {
      navigation.navigate('Chat', { group: { id: c.id, name: c.name, memberCount: c.memberCount } });
    } else {
      navigation.navigate('Chat', { user: { id: c.id, fullName: c.name, username: c.username } });
    }
  };

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
            <Text style={styles.title}>Notifications</Text>
            <Text style={styles.subTitle}>
              {items ? `${items.length} unread conversation${items.length === 1 ? '' : 's'}` : 'Loading…'}
            </Text>
          </View>
        </View>
      </LinearGradient>

      {items === null ? (
        <ActivityIndicator size="large" color={INDIGO} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        >
          {/* Unread messages */}
          <Text style={styles.sectionTitle}>MESSAGES</Text>
          {items.length === 0 ? (
            <View style={styles.caughtUp}>
              <Text style={{ fontSize: 40 }}>🎉</Text>
              <Text style={styles.caughtUpTitle}>You're all caught up!</Text>
              <Text style={styles.caughtUpSub}>New messages will appear here.</Text>
            </View>
          ) : (
            items.map((c) => (
              <TouchableOpacity key={`${c.kind}-${c.id}`} style={styles.card} activeOpacity={0.8} onPress={() => openItem(c)}>
                {c.kind === 'group' ? (
                  <LinearGradient colors={['#0E7490', '#155E75']} style={styles.avatar}>
                    <MaterialIcons name="groups" size={22} color="#fff" />
                  </LinearGradient>
                ) : (
                  <View style={[styles.avatar, { backgroundColor: AVATAR_COLORS[c.id % AVATAR_COLORS.length] }]}>
                    <Text style={styles.avatarText}>{initials(c.name)}</Text>
                  </View>
                )}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={styles.cardTop}>
                    <Text style={styles.name} numberOfLines={1}>{c.name}</Text>
                    <Text style={styles.time}>{c.lastMessage ? timeAgo(c.lastMessage.at) : ''}</Text>
                  </View>
                  <Text style={styles.preview} numberOfLines={2}>
                    {c.lastMessage
                      ? `${c.lastMessage.senderName ? c.lastMessage.senderName.split(' ')[0] + ': ' : ''}${c.lastMessage.body}`
                      : 'New messages'}
                  </Text>
                </View>
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadText}>{c.unread > 99 ? '99+' : c.unread}</Text>
                </View>
              </TouchableOpacity>
            ))
          )}

          {/* Daily reminders info */}
          <Text style={styles.sectionTitle}>DAILY REMINDERS</Text>
          <View style={styles.remCard}>
            <View style={styles.remRow}>
              <View style={[styles.remIcon, { backgroundColor: '#ECFDF5' }]}>
                <MaterialIcons name="alarm-on" size={19} color="#16A34A" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.remTitle}>Punch-In Reminder</Text>
                <Text style={styles.remSub}>Every day at 9:15 AM</Text>
              </View>
              <MaterialIcons name="notifications-active" size={17} color="#16A34A" />
            </View>
            <View style={[styles.remRow, { borderTopWidth: 1, borderTopColor: '#F3F4F6', paddingTop: 12, marginTop: 12 }]}>
              <View style={[styles.remIcon, { backgroundColor: '#FEF3C7' }]}>
                <MaterialIcons name="alarm" size={19} color="#D97706" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.remTitle}>Punch-Out Reminder</Text>
                <Text style={styles.remSub}>Every day at 6:30 PM</Text>
              </View>
              <MaterialIcons name="notifications-active" size={17} color="#D97706" />
            </View>
          </View>
          {notificationsAvailable() ? (
            <Text style={styles.note}>Reminders pop up as phone notifications — tap one to jump straight to Punch In/Out.</Text>
          ) : (
            <View style={styles.warnCard}>
              <MaterialIcons name="info-outline" size={16} color="#D97706" />
              <Text style={styles.warnText}>
                Phone reminders need the installed app build — they are not supported inside Expo Go on Android.
              </Text>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  header: { paddingTop: 52, paddingBottom: 16, paddingHorizontal: 16, borderBottomLeftRadius: 26, borderBottomRightRadius: 26, overflow: 'hidden', elevation: 6 },
  deco: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.07)' },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.14)', justifyContent: 'center', alignItems: 'center' },
  title: { color: '#fff', fontSize: 17, fontWeight: '800' },
  subTitle: { color: '#C7D2FE', fontSize: 11.5, marginTop: 1 },

  sectionTitle: { fontSize: 11, fontWeight: '800', color: '#9CA3AF', letterSpacing: 0.8, marginBottom: 8, marginTop: 14 },
  caughtUp: { alignItems: 'center', backgroundColor: '#fff', borderRadius: 18, paddingVertical: 30, gap: 6, elevation: 1 },
  caughtUpTitle: { fontSize: 15, fontWeight: '800', color: '#111827' },
  caughtUpSub: { fontSize: 12, color: '#9CA3AF' },

  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 16, padding: 13, marginBottom: 8, elevation: 1, borderLeftWidth: 3, borderLeftColor: '#4F46E5' },
  avatar: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  name: { flex: 1, fontSize: 14, fontWeight: '800', color: '#111827' },
  time: { fontSize: 10.5, color: '#9CA3AF', fontWeight: '600' },
  preview: { fontSize: 12.5, color: '#4B5563', marginTop: 2, fontWeight: '600' },
  unreadBadge: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: '#16A34A', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 6 },
  unreadText: { color: '#fff', fontSize: 11, fontWeight: '800' },

  remCard: { backgroundColor: '#fff', borderRadius: 16, padding: 14, elevation: 1 },
  remRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  remIcon: { width: 38, height: 38, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  remTitle: { fontSize: 13.5, fontWeight: '800', color: '#111827' },
  remSub: { fontSize: 11.5, color: '#6B7280', fontWeight: '600', marginTop: 1 },
  note: { fontSize: 11, color: '#9CA3AF', marginTop: 10, textAlign: 'center', fontStyle: 'italic' },
  warnCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#FEF3C7', borderRadius: 12, padding: 12, marginTop: 10 },
  warnText: { flex: 1, fontSize: 11.5, color: '#92400E', fontWeight: '600', lineHeight: 16 },
});
