import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Image,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { saveAuth } from '../lib/auth';
import { api } from '../lib/api';

const INDIGO = '#1E3A8A';
const EMPTY_PIN = ['', '', '', ''];

/* Masked 4-digit PIN input row (auto-advance, backspace to previous). */
function PinRow({ value, setValue, autoFocus = false, onFilled }) {
  const refs = useRef([]);
  const onChange = (v, i) => {
    const d = v.replace(/\D/g, '').slice(-1);
    const next = [...value];
    next[i] = d;
    setValue(next);
    if (d && i < 3) refs.current[i + 1]?.focus();
    if (d && i === 3 && onFilled) onFilled(next.join(''));
  };
  const onKey = (e, i) => {
    if (e.nativeEvent.key === 'Backspace' && !value[i] && i > 0) refs.current[i - 1]?.focus();
  };
  return (
    <View style={styles.pinRow}>
      {value.map((d, i) => (
        <TextInput
          key={i}
          ref={(r) => (refs.current[i] = r)}
          style={[styles.pinBox, d ? styles.pinBoxFilled : null]}
          keyboardType="number-pad"
          maxLength={1}
          secureTextEntry
          autoFocus={autoFocus && i === 0}
          value={d}
          onChangeText={(v) => onChange(v, i)}
          onKeyPress={(e) => onKey(e, i)}
        />
      ))}
    </View>
  );
}

export default function LoginScreen({ navigation }) {
  const [mode, setMode] = useState('phone'); // 'phone' | 'pin' | 'setpin' | 'admin'
  const [phone, setPhone] = useState('');
  const [greetName, setGreetName] = useState('');
  const [isReset, setIsReset] = useState(false); // setpin: first-time vs forgot-PIN
  const [pin, setPin] = useState(EMPTY_PIN);
  const [pin2, setPin2] = useState(EMPTY_PIN);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const finishLogin = async (data) => {
    await saveAuth(data);
    navigation.replace('Dashboard', { fullName: data.fullName, roles: data.roles });
  };

  // Step 1 — verify the mobile number is registered, branch on PIN existence.
  const checkPhone = async () => {
    setError(null);
    const p = phone.replace(/\D/g, '');
    if (p.length !== 10) { setError('Enter a valid 10-digit mobile number'); return; }
    setBusy(true);
    try {
      const data = await api('/auth/check-phone', {
        method: 'POST', body: JSON.stringify({ phone: p }),
      });
      setGreetName(data.name || '');
      setPin(EMPTY_PIN);
      setPin2(EMPTY_PIN);
      if (data.hasPin) {
        setMode('pin');
      } else {
        setIsReset(false);
        setMode('setpin'); // first login — user creates their own PIN
      }
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  // Step 2a — login with the existing PIN (auto-fires on the 4th digit).
  const verifyPin = async (code) => {
    setError(null);
    const pinCode = code || pin.join('');
    if (pinCode.length !== 4) { setError('Enter your 4-digit PIN'); return; }
    setBusy(true);
    try {
      const data = await api('/auth/verify-pin', {
        method: 'POST',
        body: JSON.stringify({ phone: phone.replace(/\D/g, ''), pin: pinCode }),
      });
      await finishLogin(data);
    } catch (e) {
      setError(e.message);
      setPin(EMPTY_PIN);
    } finally { setBusy(false); }
  };

  // Step 2b — create / reset the PIN (enter + confirm), then logged in.
  const savePin = async () => {
    setError(null);
    const p1 = pin.join(''), p2 = pin2.join('');
    if (p1.length !== 4) { setError('Enter a 4-digit PIN'); return; }
    if (p2 !== p1) { setError('PINs do not match — try again'); return; }
    setBusy(true);
    try {
      const data = await api('/auth/set-pin', {
        method: 'POST',
        body: JSON.stringify({ phone: phone.replace(/\D/g, ''), pin: p1 }),
      });
      await finishLogin(data);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const adminLogin = async () => {
    setError(null);
    if (!username.trim() || !password) { setError('Enter username and password'); return; }
    setBusy(true);
    try {
      const data = await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: username.trim(), password }),
      });
      await finishLogin(data);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const switchMode = (m) => { setError(null); setMode(m); };
  const startForgotPin = () => {
    setError(null);
    setIsReset(true);
    setPin(EMPTY_PIN);
    setPin2(EMPTY_PIN);
    setMode('setpin');
  };

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style="light" />
      <LinearGradient
        colors={['#1E40AF', '#1E3A8A', '#312E81']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.deco, { width: 240, height: 240, top: -90, right: -70 }]} />
      <View style={[styles.deco, { width: 140, height: 140, bottom: 60, left: -60 }]} />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

          {/* ===== Brand ===== */}
          <View style={styles.brand}>
            <View style={styles.logoCircle}>
              <Image source={require('../assets/sesslogo.png')} style={styles.logoImg} resizeMode="contain" />
            </View>
            <Text style={styles.brandName}>SESS Employee</Text>
            <Text style={styles.brandSub}>SRI EASWARI SCIENTIFIC SOLUTION</Text>
          </View>

          {/* ===== Card ===== */}
          <View style={styles.card}>
            {mode === 'phone' && (
              <>
                <Text style={styles.cardTitle}>Welcome 👋</Text>
                <Text style={styles.cardSub}>Enter your registered mobile number</Text>

                <View style={styles.phoneRow}>
                  <View style={styles.ccChip}><Text style={styles.ccText}>+91</Text></View>
                  <TextInput
                    style={styles.phoneInput}
                    placeholder="10-digit mobile number"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="number-pad"
                    maxLength={10}
                    value={phone}
                    onChangeText={(t) => setPhone(t.replace(/\D/g, ''))}
                  />
                </View>

                {error && <Text style={styles.error}>{error}</Text>}

                <TouchableOpacity style={[styles.primaryBtn, busy && { opacity: 0.7 }]}
                  onPress={checkPhone} disabled={busy} activeOpacity={0.85}>
                  {busy ? <ActivityIndicator color="#fff" /> : (
                    <>
                      <Text style={styles.primaryText}>Continue</Text>
                      <MaterialIcons name="arrow-forward" size={19} color="#fff" />
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity onPress={() => switchMode('admin')} style={styles.linkBtn}>
                  <MaterialIcons name="admin-panel-settings" size={16} color={INDIGO} />
                  <Text style={styles.linkText}>Admin login</Text>
                </TouchableOpacity>
              </>
            )}

            {mode === 'pin' && (
              <>
                <Text style={styles.cardTitle}>Hi {greetName || 'there'} 👋</Text>
                <Text style={styles.cardSub}>Enter your 4-digit PIN for +91 {phone}</Text>

                <PinRow value={pin} setValue={setPin} autoFocus onFilled={(code) => verifyPin(code)} />

                {error && <Text style={[styles.error, { alignSelf: 'center' }]}>{error}</Text>}

                <TouchableOpacity style={[styles.primaryBtn, busy && { opacity: 0.7 }]}
                  onPress={() => verifyPin()} disabled={busy} activeOpacity={0.85}>
                  {busy ? <ActivityIndicator color="#fff" /> : (
                    <>
                      <MaterialIcons name="lock-open" size={18} color="#fff" />
                      <Text style={styles.primaryText}>Unlock</Text>
                    </>
                  )}
                </TouchableOpacity>

                <View style={styles.pinFooter}>
                  <TouchableOpacity onPress={() => switchMode('phone')}>
                    <Text style={styles.linkText}>Change number</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={startForgotPin}>
                    <Text style={styles.linkText}>Forgot PIN?</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {mode === 'setpin' && (
              <>
                <Text style={styles.cardTitle}>{isReset ? 'Reset PIN 🔁' : `Hi ${greetName || 'there'} — create your PIN 🔐`}</Text>
                <Text style={styles.cardSub}>
                  {isReset
                    ? `Set a new 4-digit PIN for +91 ${phone}`
                    : 'Set a 4-digit PIN — you will use it to login from now on'}
                </Text>

                <Text style={styles.pinLabel}>NEW PIN</Text>
                <PinRow value={pin} setValue={setPin} autoFocus />

                <Text style={styles.pinLabel}>CONFIRM PIN</Text>
                <PinRow value={pin2} setValue={setPin2} />

                {pin2.join('').length === 4 && (
                  <Text style={[styles.matchHint, { color: pin2.join('') === pin.join('') ? '#16A34A' : '#DC2626' }]}>
                    {pin2.join('') === pin.join('') ? '✓ PINs match' : '✗ PINs do not match'}
                  </Text>
                )}
                {error && <Text style={[styles.error, { alignSelf: 'center' }]}>{error}</Text>}

                <TouchableOpacity style={[styles.primaryBtn, busy && { opacity: 0.7 }]}
                  onPress={savePin} disabled={busy} activeOpacity={0.85}>
                  {busy ? <ActivityIndicator color="#fff" /> : (
                    <>
                      <MaterialIcons name="check-circle" size={18} color="#fff" />
                      <Text style={styles.primaryText}>{isReset ? 'Save New PIN' : 'Save PIN & Continue'}</Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity onPress={() => switchMode('phone')} style={styles.linkBtn}>
                  <Text style={styles.linkText}>Change number</Text>
                </TouchableOpacity>
              </>
            )}

            {mode === 'admin' && (
              <>
                <Text style={styles.cardTitle}>Admin Login 🛡️</Text>
                <Text style={styles.cardSub}>Sign in with your username & password</Text>

                <View style={styles.inputRow}>
                  <MaterialIcons name="person" size={20} color="#6B7280" style={{ marginRight: 8 }} />
                  <TextInput style={styles.input} placeholder="Username" placeholderTextColor="#9CA3AF"
                    autoCapitalize="none" autoCorrect={false} value={username} onChangeText={setUsername} />
                </View>

                <View style={styles.inputRow}>
                  <MaterialIcons name="lock" size={20} color="#6B7280" style={{ marginRight: 8 }} />
                  <TextInput style={styles.input} placeholder="Password" placeholderTextColor="#9CA3AF"
                    secureTextEntry={!showPass} value={password} onChangeText={setPassword} />
                  <TouchableOpacity onPress={() => setShowPass(!showPass)}>
                    <MaterialIcons name={showPass ? 'visibility-off' : 'visibility'} size={20} color="#6B7280" />
                  </TouchableOpacity>
                </View>

                {error && <Text style={styles.error}>{error}</Text>}

                <TouchableOpacity style={[styles.primaryBtn, busy && { opacity: 0.7 }]}
                  onPress={adminLogin} disabled={busy} activeOpacity={0.85}>
                  {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Sign In</Text>}
                </TouchableOpacity>

                <TouchableOpacity onPress={() => switchMode('phone')} style={styles.linkBtn}>
                  <MaterialIcons name="smartphone" size={16} color={INDIGO} />
                  <Text style={styles.linkText}>Login with PIN instead</Text>
                </TouchableOpacity>
              </>
            )}
          </View>

          <Text style={styles.footer}>© {new Date().getFullYear()} Sri Easwari Scientific Solution Pvt Ltd</Text>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Settings gear (design page 1) — Terms / Privacy / version, pre-login */}
      <TouchableOpacity style={styles.gearBtn} onPress={() => navigation.navigate('MoreSettings')}>
        <MaterialIcons name="settings" size={22} color="rgba(255,255,255,0.85)" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 22 },
  deco: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.07)' },

  brand: { alignItems: 'center', marginBottom: 26 },
  logoCircle: {
    width: 88, height: 88, borderRadius: 44, backgroundColor: '#fff',
    justifyContent: 'center', alignItems: 'center', elevation: 8,
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 6 },
  },
  logoImg: { width: 62, height: 62 },
  brandName: { color: '#fff', fontSize: 26, fontWeight: '800', marginTop: 14, letterSpacing: 0.3 },
  brandSub: { color: '#C7D2FE', fontSize: 12, marginTop: 4, letterSpacing: 1.2, fontWeight: '600' },
  gearBtn: {
    position: 'absolute', bottom: 26, right: 22, width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.12)', justifyContent: 'center', alignItems: 'center',
  },

  card: {
    backgroundColor: '#fff', borderRadius: 24, padding: 22, elevation: 10,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 16, shadowOffset: { width: 0, height: 8 },
  },
  cardTitle: { fontSize: 20, fontWeight: '800', color: '#111827' },
  cardSub: { fontSize: 13, color: '#6B7280', marginTop: 4, marginBottom: 18 },

  phoneRow: { flexDirection: 'row', gap: 10 },
  ccChip: {
    height: 52, borderRadius: 12, backgroundColor: '#F3F4F6', paddingHorizontal: 14,
    justifyContent: 'center', borderWidth: 1, borderColor: '#E5E7EB',
  },
  ccText: { fontSize: 15, fontWeight: '700', color: '#374151' },
  phoneInput: {
    flex: 1, height: 52, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB', paddingHorizontal: 14, fontSize: 16,
    letterSpacing: 1, color: '#111827',
  },

  pinRow: { flexDirection: 'row', justifyContent: 'center', gap: 14, marginBottom: 6 },
  pinBox: {
    width: 56, height: 60, borderRadius: 14, borderWidth: 1.5, borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB', textAlign: 'center', fontSize: 24, fontWeight: '800', color: '#111827',
  },
  pinBoxFilled: { borderColor: INDIGO, backgroundColor: '#EEF2FF' },
  pinLabel: { fontSize: 10.5, fontWeight: '800', color: '#9CA3AF', letterSpacing: 0.7, marginTop: 10, marginBottom: 8, alignSelf: 'center' },
  matchHint: { alignSelf: 'center', fontSize: 12.5, fontWeight: '800', marginTop: 6 },
  pinFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 },

  inputRow: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB',
    borderRadius: 12, backgroundColor: '#F9FAFB', marginBottom: 12, paddingHorizontal: 12, height: 52,
  },
  input: { flex: 1, fontSize: 15, color: '#111827' },

  error: { color: '#DC2626', fontSize: 12.5, marginTop: 8 },
  primaryBtn: {
    flexDirection: 'row', gap: 8, height: 52, backgroundColor: INDIGO, borderRadius: 14,
    justifyContent: 'center', alignItems: 'center', marginTop: 16, elevation: 3,
  },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  linkBtn: { flexDirection: 'row', gap: 5, alignItems: 'center', alignSelf: 'center', marginTop: 16 },
  linkText: { color: INDIGO, fontSize: 13.5, fontWeight: '600' },
  footer: { textAlign: 'center', color: 'rgba(255,255,255,0.55)', fontSize: 11, marginTop: 22 },
});
