import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput,
  TouchableOpacity, ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { GradientHeader, HeaderIconButton, BottomNav, Card, Chip } from '../components/ui';
import { COLORS } from '../lib/theme';
import { api } from '../lib/api';

const initials = (u) =>
  ((u.fullName || u.username).split(' ').map(w => w[0]).join('').slice(0, 2)).toUpperCase();

export default function UsersScreen({ navigation }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setUsers(await api('/users'));
    } catch (e) { setError(e.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => {
    const unsub = navigation.addListener('focus', load);
    return unsub;
  }, [navigation, load]);

  const openActions = (u) => {
    Alert.alert(
      u.fullName || u.username,
      `@${u.username}${u.phone ? ` • +91 ${u.phone}` : ''}`,
      [
        {
          text: 'Edit ✏️',
          onPress: () => navigation.navigate('EditUser', { user: u }),
        },
        {
          text: u.isActive ? 'Deactivate ⛔' : 'Activate ✅',
          style: u.isActive ? 'destructive' : 'default',
          onPress: async () => {
            try {
              await api(`/users/${u.id}/status`, {
                method: 'PATCH',
                body: JSON.stringify({ isActive: !u.isActive }),
              });
              load();
            } catch (e) { Alert.alert('Failed', e.message); }
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const filtered = users.filter(u =>
    (u.username + ' ' + (u.fullName || '') + ' ' + (u.phone || '')).toLowerCase().includes(search.toLowerCase())
  );
  const activeCount = users.filter(u => u.isActive).length;

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <GradientHeader
        title="User Management"
        subtitle={`${users.length} users • ${activeCount} active`}
        onBack={() => navigation.goBack()}
        right={<HeaderIconButton icon="person-add" onPress={() => navigation.navigate('CreateUser')} />}
      >
        <View style={styles.searchRow}>
          <MaterialIcons name="search" size={19} color="#C7D2FE" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search name, username or phone…"
            placeholderTextColor="rgba(199,210,254,0.7)"
            value={search}
            onChangeText={setSearch}
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch('')}>
              <MaterialIcons name="close" size={18} color="#C7D2FE" />
            </TouchableOpacity>
          ) : null}
        </View>
      </GradientHeader>

      <View style={{ flex: 1 }}>
        {loading ? (
          <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 40 }} />
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : (
          <FlatList
            style={{ flex: 1 }}
            data={filtered}
            keyExtractor={(u) => String(u.id)}
            contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />
            }
            ListEmptyComponent={
              <View style={styles.empty}>
                <MaterialIcons name="person-search" size={42} color="#D1D5DB" />
                <Text style={styles.emptyText}>No users found</Text>
              </View>
            }
            renderItem={({ item }) => (
              <TouchableOpacity activeOpacity={0.85} onPress={() => openActions(item)}>
                <Card style={styles.userCard}>
                  <View style={[styles.avatar, !item.isActive && { backgroundColor: '#F3F4F6' }]}>
                    <Text style={[styles.avatarText, !item.isActive && { color: COLORS.faint }]}>{initials(item)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.nameRow}>
                      <Text style={[styles.name, !item.isActive && { color: COLORS.faint }]}>
                        {item.fullName || item.username}
                      </Text>
                      {item.isActive
                        ? <Chip text="Active" color={COLORS.green} soft={COLORS.greenSoft} />
                        : <Chip text="Inactive" color={COLORS.faint} soft="#F3F4F6" />}
                    </View>
                    <Text style={styles.username}>@{item.username}</Text>
                    <View style={styles.phoneRow}>
                      <MaterialIcons name="smartphone" size={13} color={item.phone ? COLORS.sub : '#D1D5DB'} />
                      <Text style={[styles.phoneText, !item.phone && { color: '#D1D5DB' }]}>
                        {item.phone ? `+91 ${item.phone}` : 'No phone — OTP login not possible'}
                      </Text>
                    </View>
                    <View style={styles.badgeRow}>
                      {item.roles.map(r => (
                        <Chip key={r} text={r} color={COLORS.primary} soft={COLORS.indigoSoft} />
                      ))}
                    </View>
                  </View>
                </Card>
              </TouchableOpacity>
            )}
          />
        )}
      </View>

      <BottomNav navigation={navigation} active={null} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.13)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: 14, paddingHorizontal: 12, height: 46, marginTop: 14,
  },
  searchInput: { flex: 1, fontSize: 14, color: '#fff' },

  userCard: { flexDirection: 'row', gap: 12, padding: 14, marginBottom: 10 },
  avatar: {
    width: 46, height: 46, borderRadius: 23, backgroundColor: COLORS.indigoSoft,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { color: COLORS.primary, fontWeight: '800', fontSize: 15 },
  nameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  name: { fontSize: 15, fontWeight: '800', color: COLORS.ink, flex: 1 },
  username: { fontSize: 12, color: COLORS.faint, marginTop: 1 },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5 },
  phoneText: { fontSize: 12.5, color: '#374151', fontWeight: '700', letterSpacing: 0.3 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 7, gap: 6 },

  empty: { alignItems: 'center', marginTop: 60, gap: 10 },
  emptyText: { color: COLORS.faint, fontSize: 14 },
  error: { color: COLORS.red, textAlign: 'center', marginTop: 40 },
});
