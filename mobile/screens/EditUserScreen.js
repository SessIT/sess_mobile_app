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
const RED = '#DC2626';
const GREY = '#6B7280';

const initials = (n) => (n || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

/* Labeled premium input row: floating section-style label + icon + control. */
const Field = ({ icon, label, error, children }) => (
  <View style={{ marginBottom: 12 }}>
    {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
    <View style={[styles.inputRow, error && { borderColor: '#FCA5A5', backgroundColor: '#FEF2F2' }]}>
      <MaterialIcons name={icon} size={19} color={GREY} style={{ marginRight: 9 }} />
      {children}
    </View>
    {error ? <Text style={styles.fieldError}>{error}</Text> : null}
  </View>
);

const SectionCard = ({ title, icon, children }) => (
  <View style={styles.card}>
    <View style={styles.cardHead}>
      <View style={styles.cardHeadIcon}>
        <MaterialIcons name={icon} size={15} color={INDIGO} />
      </View>
      <Text style={styles.cardTitle}>{title}</Text>
    </View>
    {children}
  </View>
);

// Edit an existing user — premium sectioned layout. route.params.user.
export default function EditUserScreen({ route, navigation }) {
  const editing = route.params?.user || {};
  const [username, setUsername] = useState(editing.username || '');
  const [fullName, setFullName] = useState(editing.fullName || '');
  const [phone, setPhone] = useState(editing.phone || '');
  const [password, setPassword] = useState('');   // blank = keep current
  const [confirm, setConfirm] = useState('');
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
    if (password && confirm !== password) e.confirm = 'Passwords do not match';
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
      Alert.alert('Saved ✅', `@${user.username} updated successfully.`, [
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

        {/* ===== Hero header ===== */}
        <LinearGradient
          colors={['#1E40AF', '#1E3A8A', '#312E81']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={styles.header}
        >
          <View style={[styles.deco, { width: 160, height: 160, top: -60, right: -50 }]} />
          <View style={[styles.deco, { width: 90, height: 90, bottom: -30, left: -20 }]} />

          <View style={styles.headerRow}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
              <MaterialIcons name="arrow-back" size={22} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.title}>Edit User</Text>
          </View>

          <View style={styles.heroRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials(editing.fullName || editing.username)}</Text>
              <View style={styles.avatarEdit}>
                <MaterialIcons name="edit" size={11} color="#fff" />
              </View>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.heroName} numberOfLines={1}>{editing.fullName || editing.username}</Text>
              <Text style={styles.heroSub}>@{editing.username}</Text>
              {editing.roles?.[0] ? (
                <View style={styles.heroChip}><Text style={styles.heroChipText}>{editing.roles[0]}</Text></View>
              ) : null}
            </View>
          </View>
        </LinearGradient>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          {/* ===== Account ===== */}
          <SectionCard title="ACCOUNT" icon="person">
            <Field icon="alternate-email" label="Username *" error={errors.username}>
              <TextInput style={styles.input} placeholder="username" placeholderTextColor="#9CA3AF"
                autoCapitalize="none" autoCorrect={false} value={username} onChangeText={setUsername} />
            </Field>
            <Field icon="badge" label="Full name">
              <TextInput style={styles.input} placeholder="Full name" placeholderTextColor="#9CA3AF"
                value={fullName} onChangeText={setFullName} />
            </Field>
          </SectionCard>

          {/* ===== Contact ===== */}
          <SectionCard title="CONTACT" icon="call">
            <Text style={styles.fieldLabel}>Mobile (OTP login)</Text>
            <View style={[styles.inputRow, errors.phone && { borderColor: '#FCA5A5', backgroundColor: '#FEF2F2' }]}>
              <View style={styles.ccChip}><Text style={styles.ccText}>+91</Text></View>
              <TextInput
                style={[styles.input, { marginLeft: 9, letterSpacing: 1 }]}
                placeholder="9876543210"
                placeholderTextColor="#9CA3AF"
                keyboardType="number-pad"
                maxLength={10}
                value={phone}
                onChangeText={(t) => setPhone(t.replace(/\D/g, ''))}
              />
              {phone.length === 10 && <MaterialIcons name="check-circle" size={19} color={GREEN} />}
            </View>
            {errors.phone ? <Text style={styles.fieldError}>{errors.phone}</Text> : null}
          </SectionCard>

          {/* ===== Security ===== */}
          <SectionCard title="RESET PASSWORD" icon="lock">
            <Text style={styles.cardHint}>Leave blank to keep the current password.</Text>
            <Field icon="lock" label="New password" error={errors.password}>
              <TextInput style={styles.input} placeholder="Minimum 6 characters" placeholderTextColor="#9CA3AF"
                secureTextEntry={!showPass} value={password} onChangeText={setPassword} />
              <TouchableOpacity onPress={() => setShowPass(!showPass)} style={styles.eyeBtn}>
                <MaterialIcons name={showPass ? 'visibility-off' : 'visibility'} size={20} color={GREY} />
              </TouchableOpacity>
            </Field>
            {password ? (
              <Field icon="lock-outline" label="Confirm new password" error={errors.confirm}>
                <TextInput style={styles.input} placeholder="Re-enter password" placeholderTextColor="#9CA3AF"
                  secureTextEntry={!showPass} value={confirm} onChangeText={setConfirm} />
                {confirm.length > 0 && (
                  <MaterialIcons
                    name={confirm === password ? 'check-circle' : 'cancel'}
                    size={19}
                    color={confirm === password ? GREEN : RED}
                  />
                )}
              </Field>
            ) : null}
          </SectionCard>

          {/* ===== Role ===== */}
          <SectionCard title="ROLE *" icon="workspace-premium">
            {errors.role ? <Text style={[styles.fieldError, { marginBottom: 6 }]}>{errors.role}</Text> : null}
            <View style={styles.chipWrap}>
              {roles.map(r => (
                <TouchableOpacity key={r}
                  style={[styles.chip, roleName === r && styles.chipActive]}
                  onPress={() => setRoleName(r)}>
                  {roleName === r && <MaterialIcons name="check" size={13} color="#fff" style={{ marginRight: 3 }} />}
                  <Text style={[styles.chipText, roleName === r && styles.chipTextActive]}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </SectionCard>

          {errors.submit ? (
            <View style={styles.submitErr}>
              <MaterialIcons name="error-outline" size={16} color={RED} />
              <Text style={[styles.fieldError, { marginTop: 0, flex: 1 }]}>{errors.submit}</Text>
            </View>
          ) : null}

          <TouchableOpacity style={{ marginTop: 6 }} onPress={submit} disabled={busy} activeOpacity={0.85}>
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
          <Text style={styles.note}>Employment, statutory & bank details are managed in the web console.</Text>
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

  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 16 },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.18)', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)' },
  avatarText: { color: '#fff', fontSize: 19, fontWeight: '800' },
  avatarEdit: { position: 'absolute', bottom: -2, right: -2, width: 20, height: 20, borderRadius: 10, backgroundColor: '#F59E0B', justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, borderColor: '#1E3A8A' },
  heroName: { color: '#fff', fontSize: 16.5, fontWeight: '800' },
  heroSub: { color: '#C7D2FE', fontSize: 11.5, marginTop: 1 },
  heroChip: { alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, marginTop: 6 },
  heroChipText: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },

  card: { backgroundColor: '#fff', borderRadius: 18, padding: 14, marginBottom: 12, elevation: 1, shadowColor: '#1E3A8A', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  cardHeadIcon: { width: 24, height: 24, borderRadius: 8, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center' },
  cardTitle: { fontSize: 11, fontWeight: '800', color: '#374151', letterSpacing: 0.8 },
  cardHint: { fontSize: 11, color: '#9CA3AF', marginBottom: 8, marginTop: -4 },

  fieldLabel: { fontSize: 10.5, fontWeight: '800', color: '#9CA3AF', letterSpacing: 0.5, marginBottom: 5 },
  inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', borderRadius: 12, borderWidth: 1.5, borderColor: '#E5E7EB', paddingHorizontal: 12, height: 48 },
  input: { flex: 1, fontSize: 14.5, color: '#111827' },
  eyeBtn: { padding: 4 },
  ccChip: { backgroundColor: '#EEF2FF', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  ccText: { color: INDIGO, fontWeight: '800', fontSize: 12.5 },
  fieldError: { color: RED, fontSize: 11.5, marginTop: 4, marginLeft: 4 },

  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#fff' },
  chipActive: { backgroundColor: INDIGO, borderColor: INDIGO },
  chipText: { fontSize: 12.5, color: '#374151', fontWeight: '600' },
  chipTextActive: { color: '#fff', fontWeight: '700' },

  submitErr: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#FEF2F2', borderRadius: 12, padding: 11, marginBottom: 10 },
  button: { flexDirection: 'row', gap: 7, height: 52, borderRadius: 14, justifyContent: 'center', alignItems: 'center', elevation: 2 },
  buttonText: { color: '#fff', fontSize: 15.5, fontWeight: '800' },
  note: { fontSize: 10.5, color: '#9CA3AF', textAlign: 'center', marginTop: 12, fontStyle: 'italic' },
});
