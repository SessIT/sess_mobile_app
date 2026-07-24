import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput,
  TouchableOpacity, ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { api } from '../lib/api';

const INDIGO = '#1E3A8A';
const GREEN = '#16A34A';
const RED = '#DC2626';

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

      <LinearGradient
        colors={['#1E40AF', '#1E3A8A', '#312E81']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <View style={[styles.deco, { width: 150, height: 150, top: -55, right: -45 }]} />
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>User Management</Text>
            <Text style={styles.subTitle}>{users.length} users • {activeCount} active</Text>
          </View>
        </View>

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
      </LinearGradient>

      {loading ? (
        <ActivityIndicator size="large" color={INDIGO} style={{ marginTop: 40 }} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(u) => String(u.id)}
          contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
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
            <TouchableOpacity style={styles.card} activeOpacity={0.85} onPress={() => openActions(item)}>
              <View style={[styles.avatar, !item.isActive && { backgroundColor: '#F3F4F6' }]}>
                <Text style={[styles.avatarText, !item.isActive && { color: '#9CA3AF' }]}>{initials(item)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.nameRow}>
                  <Text style={[styles.name, !item.isActive && { color: '#9CA3AF' }]}>
                    {item.fullName || item.username}
                  </Text>
                  <View style={[styles.statusPill, { backgroundColor: item.isActive ? '#ECFDF5' : '#F3F4F6' }]}>
                    <View style={[styles.statusDot, { backgroundColor: item.isActive ? GREEN : '#9CA3AF' }]} />
                    <Text style={[styles.statusText, { color: item.isActive ? GREEN : '#9CA3AF' }]}>
                      {item.isActive ? 'Active' : 'Inactive'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.username}>@{item.username}</Text>
                <View style={styles.phoneRow}>
                  <MaterialIcons name="smartphone" size={13} color={item.phone ? '#6B7280' : '#D1D5DB'} />
                  <Text style={[styles.phoneText, !item.phone && { color: '#D1D5DB' }]}>
                    {item.phone ? `+91 ${item.phone}` : 'No phone — OTP login not possible'}
                  </Text>
                </View>
                <View style={styles.badgeRow}>
                  {item.roles.map(r => (
                    <View key={r} style={styles.badge}><Text style={styles.badgeText}>{r}</Text></View>
                  ))}
                </View>
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      <TouchableOpacity style={styles.fab} activeOpacity={0.85} onPress={() => navigation.navigate('CreateUser')}>
        <LinearGradient colors={['#1E40AF', '#312E81']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fabGrad}>
          <MaterialIcons name="person-add" size={26} color="#fff" />
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  header: { paddingTop: 52, paddingBottom: 16, paddingHorizontal: 18, borderBottomLeftRadius: 26, borderBottomRightRadius: 26, overflow: 'hidden', elevation: 6 },
  deco: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.07)' },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.14)', justifyContent: 'center', alignItems: 'center' },
  title: { color: '#fff', fontSize: 17, fontWeight: '800' },
  subTitle: { color: '#C7D2FE', fontSize: 11.5, marginTop: 1 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.13)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', borderRadius: 14, paddingHorizontal: 12, height: 46, marginTop: 14 },
  searchInput: { flex: 1, fontSize: 14, color: '#fff' },

  card: { flexDirection: 'row', gap: 12, backgroundColor: '#fff', borderRadius: 18, padding: 14, marginBottom: 10, elevation: 2, shadowColor: '#1E3A8A', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#E0E7FF', justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: INDIGO, fontWeight: '800', fontSize: 15 },
  nameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  name: { fontSize: 15, fontWeight: '800', color: '#111827', flex: 1 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 3 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 10, fontWeight: '800' },
  username: { fontSize: 12, color: '#9CA3AF', marginTop: 1 },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5 },
  phoneText: { fontSize: 12.5, color: '#374151', fontWeight: '700', letterSpacing: 0.3 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 7, gap: 6 },
  badge: { backgroundColor: '#EEF2FF', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { color: INDIGO, fontSize: 11, fontWeight: '700' },

  empty: { alignItems: 'center', marginTop: 60, gap: 10 },
  emptyText: { color: '#9CA3AF', fontSize: 14 },
  error: { color: RED, textAlign: 'center', marginTop: 40 },
  fab: { position: 'absolute', right: 20, bottom: 28, borderRadius: 30, elevation: 5 },
  fabGrad: { width: 58, height: 58, borderRadius: 29, justifyContent: 'center', alignItems: 'center' },
});