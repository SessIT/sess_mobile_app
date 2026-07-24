import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { api } from '../lib/api';

const INDIGO = '#1E3A8A';
const GREEN = '#16A34A';

const Field = ({ icon, error, children }) => (
  <View style={{ marginBottom: 12 }}>
    <View style={[styles.inputRow, error && { borderColor: '#DC2626' }]}>
      <MaterialIcons name={icon} size={20} color="#6B7280" style={{ marginRight: 8 }} />
      {children}
    </View>
    {error ? <Text style={styles.fieldError}>{error}</Text> : null}
  </View>
);

// Edit an existing user. Receives the user via route.params.user.
export default function EditUserScreen({ route, navigation }) {
  const editing = route.params?.user || {};
  const [username, setUsername] = useState(editing.username || '');
  const [fullName, setFullName] = useState(editing.fullName || '');
  const [phone, setPhone] = useState(editing.phone || '');
  const [password, setPassword] = useState(''); // blank = keep current
  const [showPass, setShowPass] = useState(false);
  const [roles, setRoles] = useState([]);
  const [roleName, setRoleName] = useState(editing.roles?.[0] || null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    api('/users/roles').then(setRoles).catch(() => setRoles([]));
  }, []);

  const validate = () => {
    const e = {};
    if (!username.trim()) e.username = 'Username is required';
    else if (/\s/.test(username.trim())) e.username = 'No spaces allowed';
    if (phone && phone.length !== 10) e.phone = '10-digit mobile number required';
    if (password && password.length < 6) e.password = 'Minimum 6 characters';
    if (!roleName) e.role = 'Select a role';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async () => {
    if (!validate()) return;
    setBusy(true);
    try {
      const body = {
        username: username.trim().toLowerCase(),
        fullName: fullName.trim(),
        phone,
        roleName,
      };
      if (password) body.password = password; // only send when resetting
      const user = await api(`/users/${editing.id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      Alert.alert('User Updated ✅', `@${user.username}\n${roleName}`, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      setErrors({ submit: e.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
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
            <View>
              <Text style={styles.title}>Edit User</Text>
              <Text style={styles.subTitle}>{editing.fullName || editing.username}</Text>
            </View>
          </View>
        </LinearGradient>

        <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <View style={styles.formCard}>
            <Text style={styles.sectionLabel}>ACCOUNT DETAILS</Text>

            <Field icon="person" error={errors.username}>
              <TextInput style={styles.input} placeholder="Username *" placeholderTextColor="#9CA3AF"
                autoCapitalize="none" autoCorrect={false} value={username} onChangeText={setUsername} />
            </Field>

            <Field icon="badge" error={null}>
              <TextInput style={styles.input} placeholder="Full name" placeholderTextColor="#9CA3AF"
                value={fullName} onChangeText={setFullName} />
            </Field>

            <View style={{ marginBottom: 12 }}>
              <View style={[styles.inputRow, errors.phone && { borderColor: '#DC2626' }]}>
                <MaterialIcons name="smartphone" size={20} color="#6B7280" style={{ marginRight: 8 }} />
                <View style={styles.ccChip}><Text style={styles.ccText}>+91</Text></View>
                <TextInput
                  style={[styles.input, { marginLeft: 8, letterSpacing: 1 }]}
                  placeholder="Mobile number (OTP login)"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="number-pad"
                  maxLength={10}
                  value={phone}
                  onChangeText={(t) => setPhone(t.replace(/\D/g, ''))}
                />
                {phone.length === 10 && <MaterialIcons name="check-circle" size={19} color={GREEN} />}
              </View>
              {errors.phone ? <Text style={styles.fieldError}>{errors.phone}</Text> : null}
            </View>

            <Text style={styles.sectionLabel}>RESET PASSWORD (optional)</Text>
            <Field icon="lock" error={errors.password}>
              <TextInput style={styles.input} placeholder="New password — blank keeps current" placeholderTextColor="#9CA3AF"
                secureTextEntry={!showPass} value={password} onChangeText={setPassword} />
              <TouchableOpacity onPress={() => setShowPass(!showPass)}>
                <MaterialIcons name={showPass ? 'visibility-off' : 'visibility'} size={20} color="#6B7280" />
              </TouchableOpacity>
            </Field>

            <Text style={styles.sectionLabel}>ROLE *</Text>
            {errors.role ? <Text style={[styles.fieldError, { marginBottom: 6 }]}>{errors.role}</Text> : null}
            <View style={styles.chipWrap}>
              {roles.map(r => (
                <TouchableOpacity key={r}
                  style={[styles.chip, roleName === r && styles.chipActive]}
                  onPress={() => setRoleName(r)}>
                  <Text style={[styles.chipText, roleName === r && styles.chipTextActive]}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {errors.submit ? <Text style={[styles.fieldError, { marginTop: 10 }]}>{errors.submit}</Text> : null}

            <TouchableOpacity style={{ marginTop: 20 }} onPress={submit} disabled={busy} activeOpacity={0.85}>
              <LinearGradient
                colors={['#1E40AF', '#312E81']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={[styles.button, busy && { opacity: 0.7 }]}
              >
                {busy ? <ActivityIndicator color="#fff" /> : (
                  <>
                    <MaterialIcons name="save" size={19} color="#fff" />
                    <Text style={styles.buttonText}>Save Changes</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  header: { paddingTop: 52, paddingBottom: 20, paddingHorizontal: 18, borderBottomLeftRadius: 26, borderBottomRightRadius: 26, overflow: 'hidden', elevation: 6 },
  deco: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.07)' },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.14)', justifyContent: 'center', alignItems: 'center' },
  title: { color: '#fff', fontSize: 17, fontWeight: '800' },
  subTitle: { color: '#C7D2FE', fontSize: 11.5, marginTop: 1 },

  formCard: { backgroundColor: '#fff', borderRadius: 20, padding: 16, elevation: 2, shadowColor: '#1E3A8A', shadowOpacity: 0.07, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  sectionLabel: { fontSize: 10.5, fontWeight: '800', color: '#9CA3AF', letterSpacing: 0.8, marginBottom: 8, marginTop: 6 },
  inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', borderRadius: 12, borderWidth: 1.5, borderColor: '#E5E7EB', paddingHorizontal: 12, height: 50 },
  input: { flex: 1, fontSize: 14.5, color: '#111827' },
  ccChip: { backgroundColor: '#EEF2FF', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  ccText: { color: INDIGO, fontWeight: '800', fontSize: 12.5 },
  fieldError: { color: '#DC2626', fontSize: 11.5, marginTop: 4, marginLeft: 4 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#fff' },
  chipActive: { backgroundColor: INDIGO, borderColor: INDIGO },
  chipText: { fontSize: 12.5, color: '#374151', fontWeight: '600' },
  chipTextActive: { color: '#fff', fontWeight: '700' },
  button: { flexDirection: 'row', gap: 7, height: 52, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 15.5, fontWeight: '800' },
});
