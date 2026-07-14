import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';

const INDIGO = '#1E3A8A'; // SESS indigo — original theme color
const API_URL = 'http://10.0.2.2:4000/api'; // emulator → PC localhost

export default function LoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
 
  const handleLogin = async () => {
  setError(null);
  if (!username.trim() || !password) {
    setError('Please enter username and password');
    return;
  }
  setBusy(true);
  try {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username.trim(), password }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.message || 'Login failed');
      return;
    }
    Alert.alert('Welcome! 🎉', `${data.fullName}\nRoles: ${data.roles.join(', ')}`);
    // Day 2: token save + navigate to Dashboard
  } catch (e) {
    setError('Cannot reach server. Is backend running?');
  } finally {
    setBusy(false);
  }
};

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#fff' }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <MaterialIcons name="badge" size={64} color={INDIGO} />
        <Text style={styles.title}>SESS Employee</Text>
        <Text style={styles.subtitle}>Sri Eswari Scientific Solution</Text>

        <View style={styles.inputRow}>
          <MaterialIcons name="person" size={22} color="#6B7280" style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="Username"
            placeholderTextColor="#9CA3AF"
            autoCapitalize="none"
            autoCorrect={false}
            value={username}
            onChangeText={setUsername}
          />
        </View>

        <View style={styles.inputRow}>
          <MaterialIcons name="lock" size={22} color="#6B7280" style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor="#9CA3AF"
            secureTextEntry={!showPass}
            value={password}
            onChangeText={setPassword}
          />
          <TouchableOpacity onPress={() => setShowPass(!showPass)} style={styles.eyeBtn}>
            <MaterialIcons name={showPass ? 'visibility-off' : 'visibility'} size={22} color="#6B7280" />
          </TouchableOpacity>
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity
          style={[styles.button, busy && { opacity: 0.7 }]}
          onPress={handleLogin}
          disabled={busy}
          activeOpacity={0.8}
        >
          {busy
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={styles.buttonText}>Login</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => Alert.alert('Forgot Password', 'Coming in a later module')}>
          <Text style={styles.forgot}>Forgot password?</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  title: { fontSize: 26, fontWeight: 'bold', color: '#111827', marginTop: 12 },
  subtitle: { fontSize: 14, color: '#6B7280', marginBottom: 28 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', width: '100%',
    borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 12,
    backgroundColor: '#F9FAFB', marginBottom: 12, paddingHorizontal: 12, height: 52,
  },
  inputIcon: { marginRight: 8 },
  input: { flex: 1, fontSize: 16, color: '#111827' },
  eyeBtn: { padding: 4 },
  error: { color: '#DC2626', marginTop: 4, marginBottom: 4, alignSelf: 'flex-start' },
  button: {
    width: '100%', height: 48, backgroundColor: INDIGO, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center', marginTop: 16,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  forgot: { color: INDIGO, marginTop: 16, fontSize: 14 },
});