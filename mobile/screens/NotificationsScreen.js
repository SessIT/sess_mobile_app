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
import { GradientHeader, BottomNav, Card, SectionLabel } from '../components/ui';
import { COLORS, RADIUS, SHADOW } from '../lib/theme';

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
      <GradientHeader
        title="Notifications"
        subtitle={items ? `${items.length} unread conversation${items.length === 1 ? '' : 's'}` : 'Loading…'}
        onBack={() => navigation.goBack()}
      />

      {items === null ? (
        <View style={{ flex: 1 }}>
          <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 40 }} />
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingBottom: 28 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        >
          {/* Unread messages */}
          <SectionLabel text="MESSAGES" style={{ marginTop: 0 }} />
          {items.length === 0 ? (
            <Card style={styles.caughtUp}>
              <Text style={{ fontSize: 40 }}>🎉</Text>
              <Text style={styles.caughtUpTitle}>You're all caught up!</Text>
              <Text style={styles.caughtUpSub}>New messages will appear here.</Text>
            </Card>
          ) : (
            items.map((c) => (
              <TouchableOpacity key={`${c.kind}-${c.id}`} style={styles.msgCard} activeOpacity={0.8} onPress={() => openItem(c)}>
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
                  <View style={styles.msgTop}>
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

          {/* Daily reminders info (display-only) */}
          <SectionLabel text="DAILY REMINDERS" />
          <Card style={{ padding: 14 }}>
            <View style={styles.remRow}>
              <View style={[styles.remIcon, { backgroundColor: COLORS.greenSoft }]}>
                <MaterialIcons name="alarm-on" size={19} color={COLORS.green} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.remTitle}>Punch-In Reminder</Text>
                <Text style={styles.remSub}>Every day at 9:15 AM</Text>
              </View>
              <MaterialIcons name="notifications-active" size={17} color={COLORS.green} />
            </View>
            <View style={[styles.remRow, { borderTopWidth: 1, borderTopColor: COLORS.line, paddingTop: 12, marginTop: 12 }]}>
              <View style={[styles.remIcon, { backgroundColor: COLORS.orangeSoft }]}>
                <MaterialIcons name="alarm" size={19} color={COLORS.orange} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.remTitle}>Punch-Out Reminder</Text>
                <Text style={styles.remSub}>Every day at 6:30 PM</Text>
              </View>
              <MaterialIcons name="notifications-active" size={17} color={COLORS.orange} />
            </View>
          </Card>
          {notificationsAvailable() ? (
            <Text style={styles.note}>Reminders pop up as phone notifications — tap one to jump straight to Punch In/Out.</Text>
          ) : (
            <View style={styles.warnCard}>
              <MaterialIcons name="info-outline" size={16} color={COLORS.orange} />
              <Text style={styles.warnText}>
                Phone reminders need the installed app build — they are not supported inside Expo Go on Android.
              </Text>
            </View>
          )}
        </ScrollView>
      )}

      <BottomNav navigation={navigation} active="profile" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },

  caughtUp: { alignItems: 'center', paddingVertical: 30, gap: 6 },
  caughtUpTitle: { fontSize: 15, fontWeight: '800', color: COLORS.ink },
  caughtUpSub: { fontSize: 12, color: COLORS.faint },

  msgCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.card, borderRadius: RADIUS.card, padding: 13, marginBottom: 8,
    borderLeftWidth: 3, borderLeftColor: COLORS.accent, ...SHADOW.card,
  },
  avatar: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  msgTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  name: { flex: 1, fontSize: 14, fontWeight: '800', color: COLORS.ink },
  time: { fontSize: 10.5, color: COLORS.faint, fontWeight: '600' },
  preview: { fontSize: 12.5, color: COLORS.sub, marginTop: 2, fontWeight: '600' },
  unreadBadge: {
    minWidth: 22, height: 22, borderRadius: 11, backgroundColor: COLORS.green,
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 6,
  },
  unreadText: { color: '#fff', fontSize: 11, fontWeight: '800' },

  remRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  remIcon: { width: 38, height: 38, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  remTitle: { fontSize: 13.5, fontWeight: '800', color: COLORS.ink },
  remSub: { fontSize: 11.5, color: COLORS.sub, fontWeight: '600', marginTop: 1 },

  note: { fontSize: 11, color: COLORS.faint, marginTop: 10, textAlign: 'center', fontStyle: 'italic' },
  warnCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: COLORS.orangeSoft, borderRadius: 12, padding: 12, marginTop: 10,
  },
  warnText: { flex: 1, fontSize: 11.5, color: '#92400E', fontWeight: '600', lineHeight: 16 },
});
