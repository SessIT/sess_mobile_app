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

// Icon + tint per update kind (server `kind`).
const KIND_ICON = {
  leave: ['beach-access', COLORS.purple, COLORS.purpleSoft],
  ot: ['more-time', COLORS.primary, COLORS.indigoSoft],
  compoff: ['redeem', COLORS.teal, COLORS.tealSoft],
  expense: ['receipt-long', COLORS.orange, COLORS.orangeSoft],
  correction: ['edit-calendar', COLORS.red, COLORS.redSoft],
  payroll: ['payments', COLORS.green, COLORS.greenSoft],
  announcement: ['campaign', COLORS.orange, COLORS.orangeSoft],
  helpdesk: ['support-agent', COLORS.primary, COLORS.indigoSoft],
  asset: ['inventory-2', COLORS.teal, COLORS.tealSoft],
  document: ['folder-shared', COLORS.primary, COLORS.indigoSoft],
  exit: ['exit-to-app', COLORS.red, COLORS.redSoft],
  recruitment: ['record-voice-over', COLORS.primary, COLORS.indigoSoft],
  training: ['school', COLORS.green, COLORS.greenSoft],
};

// Notification center:
//   UPDATES  — approvals, decisions, payslips (server inbox; also pushed to the phone)
//   MESSAGES — WhatsApp-style unread conversations; tapping opens THAT thread.
export default function NotificationsScreen({ navigation }) {
  const [items, setItems] = useState(null);
  const [updates, setUpdates] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [chat, inbox] = await Promise.all([
        api('/chat/conversations'),
        api('/notifications').catch(() => ({ items: [] })),
      ]);
      setItems((chat.conversations || []).filter((c) => c.unread > 0));
      setUpdates(inbox.items || []);
    } catch { setItems((prev) => prev ?? []); }
    finally { setRefreshing(false); }
  }, []);

  const unreadUpdates = updates.filter((u) => !u.readAt).length;

  const openUpdate = (u) => {
    if (!u.readAt) {
      setUpdates((prev) => prev.map((x) => (x.id === u.id ? { ...x, readAt: new Date().toISOString() } : x)));
      api('/notifications/read', { method: 'POST', body: JSON.stringify({ ids: [u.id] }) }).catch(() => {});
    }
    if (u.data?.screen) navigation.navigate(u.data.screen, u.data.params);
  };

  const markAllRead = () => {
    setUpdates((prev) => prev.map((x) => ({ ...x, readAt: x.readAt || new Date().toISOString() })));
    api('/notifications/read', { method: 'POST', body: JSON.stringify({ all: true }) }).catch(() => {});
  };

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
        subtitle={items
          ? `${unreadUpdates} new update${unreadUpdates === 1 ? '' : 's'} · ${items.length} unread chat${items.length === 1 ? '' : 's'}`
          : 'Loading…'}
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
          {/* Updates (server inbox) */}
          <SectionLabel
            text="UPDATES"
            style={{ marginTop: 0 }}
            right={unreadUpdates > 0 ? (
              <TouchableOpacity onPress={markAllRead}><Text style={styles.markAll}>Mark all read</Text></TouchableOpacity>
            ) : null}
          />
          {updates.length === 0 ? (
            <Text style={styles.noUpdates}>Approvals, decisions and payslips will show up here.</Text>
          ) : (
            updates.slice(0, 30).map((u) => {
              const [icon, c, soft] = KIND_ICON[u.kind] || ['notifications', COLORS.primary, COLORS.indigoSoft];
              return (
                <TouchableOpacity key={u.id} activeOpacity={0.8} onPress={() => openUpdate(u)}
                  style={[styles.updCard, !u.readAt && styles.updUnread]}>
                  <View style={[styles.updIcon, { backgroundColor: soft }]}>
                    <MaterialIcons name={icon} size={19} color={c} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={styles.msgTop}>
                      <Text style={[styles.updTitle, !u.readAt && { fontWeight: '800' }]} numberOfLines={2}>{u.title}</Text>
                      <Text style={styles.time}>{timeAgo(u.createdAt)}</Text>
                    </View>
                    {u.body ? <Text style={styles.preview} numberOfLines={2}>{u.body}</Text> : null}
                  </View>
                  {!u.readAt && <View style={styles.updDot} />}
                </TouchableOpacity>
              );
            })
          )}

          {/* Unread messages */}
          <SectionLabel text="MESSAGES" />
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

  markAll: { fontSize: 11.5, fontWeight: '800', color: COLORS.primary },
  noUpdates: { fontSize: 12, color: COLORS.faint, marginBottom: 6 },
  updCard: {
    flexDirection: 'row', alignItems: 'center', gap: 11,
    backgroundColor: COLORS.card, borderRadius: RADIUS.card, padding: 12, marginBottom: 8, ...SHADOW.card,
  },
  updUnread: { borderLeftWidth: 3, borderLeftColor: COLORS.primary },
  updIcon: { width: 38, height: 38, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  updTitle: { flex: 1, fontSize: 13.5, fontWeight: '600', color: COLORS.ink },
  updDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.primary },

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
