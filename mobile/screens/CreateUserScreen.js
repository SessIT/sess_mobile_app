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

const Field = ({ icon, error, children }) => (
  <View style={{ marginBottom: 12 }}>
    <View style={[styles.inputRow, error && { borderColor: COLORS.red }]}>
      <MaterialIcons name={icon} size={20} color={COLORS.sub} style={{ marginRight: 8 }} />
      {children}
    </View>
    {error ? <Text style={styles.fieldError}>{error}</Text> : null}
  </View>
);

export default function CreateUserScreen({ navigation }) {
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
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
    if (phone.length !== 10) e.phone = '10-digit mobile number required (OTP login)';
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
          phone,
          password,
          roleName,
        }),
      });
      Alert.alert('User Created ✅', `@${user.username} • +91 ${phone}\n${roleName}`, [
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
        <GradientHeader
          title="Create User"
          subtitle="New employee account"
          onBack={() => navigation.goBack()}
        />

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <SectionLabel text="ACCOUNT DETAILS" style={{ marginTop: 0 }} />
          <Card>
            <Field icon="person" error={errors.username}>
              <TextInput style={styles.input} placeholder="Username *" placeholderTextColor={COLORS.faint}
                autoCapitalize="none" autoCorrect={false} value={username} onChangeText={setUsername} />
            </Field>

            <Field icon="badge" error={null}>
              <TextInput style={styles.input} placeholder="Full name" placeholderTextColor={COLORS.faint}
                value={fullName} onChangeText={setFullName} />
            </Field>

            <View style={{ marginBottom: 2 }}>
              <View style={[styles.inputRow, errors.phone && { borderColor: COLORS.red }]}>
                <MaterialIcons name="smartphone" size={20} color={COLORS.sub} style={{ marginRight: 8 }} />
                <View style={styles.ccChip}><Text style={styles.ccText}>+91</Text></View>
                <TextInput
                  style={[styles.input, { marginLeft: 8, letterSpacing: 1 }]}
                  placeholder="Mobile number * (OTP login)"
                  placeholderTextColor={COLORS.faint}
                  keyboardType="number-pad"
                  maxLength={10}
                  value={phone}
                  onChangeText={(t) => setPhone(t.replace(/\D/g, ''))}
                />
                {phone.length === 10 && <MaterialIcons name="check-circle" size={19} color={COLORS.green} />}
              </View>
              {errors.phone ? <Text style={styles.fieldError}>{errors.phone}</Text> : null}
            </View>
          </Card>

          <SectionLabel text="SECURITY" />
          <Card>
            <Field icon="lock" error={errors.password}>
              <TextInput style={styles.input} placeholder="Password *" placeholderTextColor={COLORS.faint}
                secureTextEntry={!showPass} value={password} onChangeText={setPassword} />
              <TouchableOpacity onPress={() => setShowPass(!showPass)}>
                <MaterialIcons name={showPass ? 'visibility-off' : 'visibility'} size={20} color={COLORS.sub} />
              </TouchableOpacity>
            </Field>

            <Field icon="lock-outline" error={errors.confirm}>
              <TextInput style={styles.input} placeholder="Confirm password *" placeholderTextColor={COLORS.faint}
                secureTextEntry={!showPass} value={confirm} onChangeText={setConfirm} />
            </Field>
          </Card>

          <SectionLabel text="ROLE *" />
          <Card>
            {errors.role ? <Text style={[styles.fieldError, { marginBottom: 6 }]}>{errors.role}</Text> : null}
            <View style={styles.chipWrap}>
              {roles.map(r => (
                <TouchableOpacity key={r}
                  style={[styles.roleChip, roleName === r && styles.roleChipActive]}
                  onPress={() => setRoleName(r)}>
                  <Text style={[styles.roleChipText, roleName === r && styles.roleChipTextActive]}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Card>

          {errors.submit ? <Text style={[styles.fieldError, { marginTop: 10 }]}>{errors.submit}</Text> : null}

          <PrimaryButton
            title={busy ? 'Creating…' : 'Create User'}
            icon="person-add"
            busy={busy}
            onPress={submit}
            style={{ marginTop: 20 }}
          />
          <Text style={styles.note}>User indha number-la OTP vachi login pannuvaanga</Text>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.field,
    borderRadius: RADIUS.input, borderWidth: 1.5, borderColor: COLORS.line,
    paddingHorizontal: 12, height: 50,
  },
  input: { flex: 1, fontSize: 14.5, color: COLORS.ink },
  ccChip: { backgroundColor: COLORS.indigoSoft, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  ccText: { color: COLORS.primary, fontWeight: '800', fontSize: 12.5 },
  fieldError: { color: COLORS.red, fontSize: 11.5, marginTop: 4, marginLeft: 4 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  roleChip: {
    borderWidth: 1.5, borderColor: COLORS.line, borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 8, backgroundColor: COLORS.card,
  },
  roleChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  roleChipText: { fontSize: 12.5, color: '#374151', fontWeight: '600' },
  roleChipTextActive: { color: '#fff', fontWeight: '700' },
  note: { fontSize: 10.5, color: COLORS.faint, textAlign: 'center', marginTop: 12 },
});
