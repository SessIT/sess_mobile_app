import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { GradientHeader, Card, SectionLabel, PrimaryButton } from '../components/ui';
import { COLORS, RADIUS } from '../lib/theme';
import { api } from '../lib/api';

const initials = (n) => (n || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* Labeled input row: small gray label + icon + control in a soft-gray field. */
const Field = ({ icon, label, error, children }) => (
  <View style={{ marginBottom: 12 }}>
    {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
    <View style={[styles.inputRow, error && { borderColor: '#FCA5A5', backgroundColor: COLORS.redSoft }]}>
      <MaterialIcons name={icon} size={19} color={COLORS.sub} style={{ marginRight: 9 }} />
      {children}
    </View>
    {error ? <Text style={styles.fieldError}>{error}</Text> : null}
  </View>
);

// Edit an existing user. route.params.user.
export default function EditUserScreen({ route, navigation }) {
  const editing = route.params?.user || {};
  const [username, setUsername] = useState(editing.username || '');
  const [fullName, setFullName] = useState(editing.fullName || '');
  const [email, setEmail] = useState(editing.email || '');
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
    if (email.trim() && !EMAIL_RE.test(email.trim())) e.email = 'Enter a valid email address';
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
      // Only touch email when it actually changed — '' is a deliberate "clear it" on the server.
      const mail = email.trim().toLowerCase();
      if (mail !== (editing.email || '').trim().toLowerCase()) body.email = mail;
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

        <GradientHeader title="Edit User" onBack={() => navigation.goBack()}>
          {/* Hero: who is being edited */}
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
        </GradientHeader>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <SectionLabel text="ACCOUNT" style={{ marginTop: 0 }} />
          <Card>
            {/* Server-allocated — shown for reference, never editable. */}
            <View style={{ marginBottom: 12 }}>
              <Text style={styles.fieldLabel}>Employee ID</Text>
              <View style={[styles.inputRow, { backgroundColor: COLORS.bg }]}>
                <MaterialIcons name="badge" size={19} color={COLORS.faint} style={{ marginRight: 9 }} />
                <Text style={[styles.input, { color: COLORS.sub, fontWeight: '700' }]}>
                  {editing.employeeId || '—'}
                </Text>
                <MaterialIcons name="lock" size={15} color={COLORS.faint} />
              </View>
            </View>

            <Field icon="alternate-email" label="Username *" error={errors.username}>
              <TextInput style={styles.input} placeholder="username" placeholderTextColor={COLORS.faint}
                autoCapitalize="none" autoCorrect={false} value={username} onChangeText={setUsername} />
            </Field>
            <Field icon="badge" label="Full name">
              <TextInput style={styles.input} placeholder="Full name" placeholderTextColor={COLORS.faint}
                value={fullName} onChangeText={setFullName} />
            </Field>
          </Card>

          <SectionLabel text="CONTACT" />
          <Card>
            <Field icon="mail" label="Email" error={errors.email}>
              <TextInput style={styles.input} placeholder="name@company.com" placeholderTextColor={COLORS.faint}
                keyboardType="email-address" autoCapitalize="none" autoCorrect={false}
                value={email} onChangeText={setEmail} />
            </Field>
            <Text style={styles.cardHint}>Employees log in with this email. Clearing it stops them logging in.</Text>

            <Text style={styles.fieldLabel}>Mobile (optional)</Text>
            <View style={[styles.inputRow, errors.phone && { borderColor: '#FCA5A5', backgroundColor: COLORS.redSoft }]}>
              <View style={styles.ccChip}><Text style={styles.ccText}>+91</Text></View>
              <TextInput
                style={[styles.input, { marginLeft: 9, letterSpacing: 1 }]}
                placeholder="9876543210"
                placeholderTextColor={COLORS.faint}
                keyboardType="number-pad"
                maxLength={10}
                value={phone}
                onChangeText={(t) => setPhone(t.replace(/\D/g, ''))}
              />
              {phone.length === 10 && <MaterialIcons name="check-circle" size={19} color={COLORS.green} />}
            </View>
            {errors.phone ? <Text style={styles.fieldError}>{errors.phone}</Text> : null}
          </Card>

          <SectionLabel text="RESET PASSWORD" />
          <Card>
            <Text style={styles.cardHint}>Leave blank to keep the current password.</Text>
            <Field icon="lock" label="New password" error={errors.password}>
              <TextInput style={styles.input} placeholder="Minimum 6 characters" placeholderTextColor={COLORS.faint}
                secureTextEntry={!showPass} value={password} onChangeText={setPassword} />
              <TouchableOpacity onPress={() => setShowPass(!showPass)} style={styles.eyeBtn}>
                <MaterialIcons name={showPass ? 'visibility-off' : 'visibility'} size={20} color={COLORS.sub} />
              </TouchableOpacity>
            </Field>
            {password ? (
              <Field icon="lock-outline" label="Confirm new password" error={errors.confirm}>
                <TextInput style={styles.input} placeholder="Re-enter password" placeholderTextColor={COLORS.faint}
                  secureTextEntry={!showPass} value={confirm} onChangeText={setConfirm} />
                {confirm.length > 0 && (
                  <MaterialIcons
                    name={confirm === password ? 'check-circle' : 'cancel'}
                    size={19}
                    color={confirm === password ? COLORS.green : COLORS.red}
                  />
                )}
              </Field>
            ) : null}
          </Card>

          <SectionLabel text="ROLE *" />
          <Card>
            {errors.role ? <Text style={[styles.fieldError, { marginBottom: 6 }]}>{errors.role}</Text> : null}
            <View style={styles.chipWrap}>
              {roles.map(r => (
                <TouchableOpacity key={r}
                  style={[styles.roleChip, roleName === r && styles.roleChipActive]}
                  onPress={() => setRoleName(r)}>
                  {roleName === r && <MaterialIcons name="check" size={13} color="#fff" style={{ marginRight: 3 }} />}
                  <Text style={[styles.roleChipText, roleName === r && styles.roleChipTextActive]}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Card>

          {errors.submit ? (
            <View style={styles.submitErr}>
              <MaterialIcons name="error-outline" size={16} color={COLORS.red} />
              <Text style={[styles.fieldError, { marginTop: 0, flex: 1 }]}>{errors.submit}</Text>
            </View>
          ) : null}

          <PrimaryButton
            title={busy ? 'Saving…' : 'Save Changes'}
            icon="save"
            busy={busy}
            onPress={submit}
            style={{ marginTop: 14 }}
          />
          <Text style={styles.note}>Employment, statutory & bank details are managed in the web console.</Text>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },

  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 16 },
  avatar: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)',
  },
  avatarText: { color: '#fff', fontSize: 19, fontWeight: '800' },
  avatarEdit: {
    position: 'absolute', bottom: -2, right: -2, width: 20, height: 20, borderRadius: 10,
    backgroundColor: '#F59E0B', justifyContent: 'center', alignItems: 'center',
    borderWidth: 1.5, borderColor: COLORS.primary,
  },
  heroName: { color: '#fff', fontSize: 16.5, fontWeight: '800' },
  heroSub: { color: '#C7D2FE', fontSize: 11.5, marginTop: 1 },
  heroChip: {
    alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, marginTop: 6,
  },
  heroChipText: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },

  cardHint: { fontSize: 11, color: COLORS.faint, marginBottom: 8 },
  fieldLabel: { fontSize: 10.5, fontWeight: '800', color: COLORS.faint, letterSpacing: 0.5, marginBottom: 5 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.field,
    borderRadius: RADIUS.input, borderWidth: 1.5, borderColor: COLORS.line,
    paddingHorizontal: 12, height: 48,
  },
  input: { flex: 1, fontSize: 14.5, color: COLORS.ink },
  eyeBtn: { padding: 4 },
  ccChip: { backgroundColor: COLORS.indigoSoft, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  ccText: { color: COLORS.primary, fontWeight: '800', fontSize: 12.5 },
  fieldError: { color: COLORS.red, fontSize: 11.5, marginTop: 4, marginLeft: 4 },

  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  roleChip: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: COLORS.line,
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: COLORS.card,
  },
  roleChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  roleChipText: { fontSize: 12.5, color: '#374151', fontWeight: '600' },
  roleChipTextActive: { color: '#fff', fontWeight: '700' },

  submitErr: {
    flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: COLORS.redSoft,
    borderRadius: 12, padding: 11, marginTop: 14,
  },
  note: { fontSize: 10.5, color: COLORS.faint, textAlign: 'center', marginTop: 12, fontStyle: 'italic' },
});
