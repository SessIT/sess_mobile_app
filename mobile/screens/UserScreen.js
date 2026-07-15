import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput,
  TouchableOpacity, ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { api } from '../lib/api';

const INDIGO = '#1E3A8A';

export default function UsersScreen({ navigation }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await api('/users');
      setUsers(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const unsub = navigation.addListener('focus', load);
    return unsub;
  }, [navigation, load]);

  const filtered = users.filter(u =>
    (u.username + ' ' + (u.fullName || '')).toLowerCase().includes(search.toLowerCase())
  );

  const initials = (u) =>
    (u.fullName || u.username).split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>User Management</Text>
      </View>

      <View style={styles.searchRow}>
        <MaterialIcons name="search" size={20} color="#6B7280" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search users…"
          placeholderTextColor="#9CA3AF"
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={INDIGO} style={{ marginTop: 40 }} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(u) => String(u.id)}
          contentContainerStyle={{ padding: 16, paddingBottom: 90 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />
          }
          ListEmptyComponent={<Text style={styles.empty}>No users found</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.avatar}><Text style={styles.avatarText}>{initials(item)}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.fullName || item.username}</Text>
                <Text style={styles.username}>@{item.username}</Text>
                <View style={styles.badgeRow}>
                  {item.roles.map(r => (
                    <View key={r} style={styles.badge}><Text style={styles.badgeText}>{r}</Text></View>
                  ))}
                </View>
              </View>
              <View style={[styles.statusDot, { backgroundColor: item.isActive ? '#16A34A' : '#9CA3AF' }]} />
            </View>
          )}
        />
      )}

      <TouchableOpacity
        style={styles.fab}
        activeOpacity={0.8}
        onPress={() => navigation.navigate('CreateUser')}
      >
        <MaterialIcons name="add" size={28} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  header: { backgroundColor: INDIGO, paddingTop: 56, paddingBottom: 16, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' },
  backBtn: { marginRight: 12 },
  title: { color: '#fff', fontSize: 18, fontWeight: '600' },
  searchRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', margin: 16, marginBottom: 0, borderRadius: 12, paddingHorizontal: 12, height: 46, borderWidth: 1, borderColor: '#E5E7EB' },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 15, color: '#111827' },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, elevation: 1 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#E0E7FF', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  avatarText: { color: INDIGO, fontWeight: '700' },
  name: { fontSize: 15, fontWeight: '600', color: '#111827' },
  username: { fontSize: 12, color: '#6B7280', marginTop: 1 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6, gap: 6 },
  badge: { backgroundColor: '#EEF2FF', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { color: INDIGO, fontSize: 11, fontWeight: '600' },
  statusDot: { width: 10, height: 10, borderRadius: 5, marginLeft: 8 },
  empty: { textAlign: 'center', color: '#6B7280', marginTop: 40 },
  error: { color: '#DC2626', textAlign: 'center', marginTop: 40 },
  fab: { position: 'absolute', right: 20, bottom: 28, width: 56, height: 56, borderRadius: 28, backgroundColor: INDIGO, justifyContent: 'center', alignItems: 'center', elevation: 4 },
});