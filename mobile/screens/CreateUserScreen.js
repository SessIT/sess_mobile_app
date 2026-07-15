import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { api } from '../lib/api';

const INDIGO = '#1E3A8A';

const Field = ({ icon, error, children }) => (
    <View style={{ marginBottom: 12 }}>
        <View style={[styles.inputRow, error && { borderColor: '#DC2626' }]}>
        <MaterialIcons name={icon} size={20} color="#6B7280" style={{ marginRight: 8 }} />
        {children}
        </View>
        {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
    );

export default function CreateUserScreen({ navigation }) {
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [roles, setRoles] = useState([]);
  const [roleName, setRoleName] = useState(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    api('/users/roles').then(setRoles).catch(() => setRoles([]));
  }, []);

  const validate = () => {
    const e = {};
    if (!username.trim()) e.username = 'Username is required';
    else if (/\s/.test(username.trim())) e.username = 'No spaces allowed';
    if (!password) e.password = 'Password is required';
    else if (password.length < 6) e.password = 'Minimum 6 characters';
    if (confirm !== password) e.confirm = 'Passwords do not match';
    if (!roleName) e.role = 'Select a role';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  
  const submit = async () => {
    if (!validate()) return;
    setBusy(true);
    try {
      const user = await api('/users', {
        method: 'POST',
        body: JSON.stringify({
          username: username.trim().toLowerCase(),
          fullName: fullName.trim(),
          password,
          roleName,
        }),
      });
      Alert.alert('User Created ✅', `@${user.username} (${roleName})`, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      setErrors({ submit: e.message });
    } finally {
      setBusy(false);
    }
  };

//   const Field = ({ icon, error, children }) => (
//     <View style={{ marginBottom: 12 }}>
//       <View style={[styles.inputRow, error && { borderColor: '#DC2626' }]}>
//         <MaterialIcons name={icon} size={20} color="#6B7280" style={{ marginRight: 8 }} />
//         {children}
//       </View>
//       {error ? <Text style={styles.fieldError}>{error}</Text> : null}
//     </View>
//   );

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginRight: 12 }}>
            <MaterialIcons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.title}>Create User</Text>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
          <Field icon="person" error={errors.username}>
            <TextInput style={styles.input} placeholder="Username *" placeholderTextColor="#9CA3AF"
              autoCapitalize="none" autoCorrect={false} value={username} onChangeText={setUsername} />
          </Field>

          <Field icon="badge" error={null}>
            <TextInput style={styles.input} placeholder="Full name" placeholderTextColor="#9CA3AF"
              value={fullName} onChangeText={setFullName} />
          </Field>

          <Field icon="lock" error={errors.password}>
            <TextInput style={styles.input} placeholder="Password *" placeholderTextColor="#9CA3AF"
              secureTextEntry={!showPass} value={password} onChangeText={setPassword} />
            <TouchableOpacity onPress={() => setShowPass(!showPass)}>
              <MaterialIcons name={showPass ? 'visibility-off' : 'visibility'} size={20} color="#6B7280" />
            </TouchableOpacity>
          </Field>

          <Field icon="lock-outline" error={errors.confirm}>
            <TextInput style={styles.input} placeholder="Confirm password *" placeholderTextColor="#9CA3AF"
              secureTextEntry={!showPass} value={confirm} onChangeText={setConfirm} />
          </Field>

          <Text style={styles.sectionLabel}>Role *</Text>
          {errors.role ? <Text style={styles.fieldError}>{errors.role}</Text> : null}
          <View style={styles.chipWrap}>
            {roles.map(r => (
              <TouchableOpacity key={r}
                style={[styles.chip, roleName === r && styles.chipActive]}
                onPress={() => setRoleName(r)}>
                <Text style={[styles.chipText, roleName === r && styles.chipTextActive]}>{r}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {errors.submit ? <Text style={[styles.fieldError, { marginTop: 8 }]}>{errors.submit}</Text> : null}

          <TouchableOpacity style={[styles.button, busy && { opacity: 0.7 }]} onPress={submit} disabled={busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Create User</Text>}
          </TouchableOpacity>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  header: { backgroundColor: INDIGO, paddingTop: 56, paddingBottom: 16, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' },
  title: { color: '#fff', fontSize: 18, fontWeight: '600' },
  inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 12, height: 50 },
  input: { flex: 1, fontSize: 15, color: '#111827' },
  fieldError: { color: '#DC2626', fontSize: 12, marginTop: 4, marginLeft: 4 },
  sectionLabel: { fontSize: 14, fontWeight: '600', color: '#374151', marginTop: 8, marginBottom: 8 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#fff' },
  chipActive: { backgroundColor: INDIGO, borderColor: INDIGO },
  chipText: { fontSize: 13, color: '#374151' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  button: { height: 50, backgroundColor: INDIGO, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginTop: 20 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});