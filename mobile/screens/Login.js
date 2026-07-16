import React, { useState, useRef, useEffect } from 'react';
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

export default function LoginScreen({ navigation }) {
  const [mode, setMode] = useState('phone'); // 'phone' | 'otp' | 'admin'
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const otpRefs = useRef([]);
  const [devOtp, setDevOtp] = useState(null);
  const [timer, setTimer] = useState(0);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (timer <= 0) return;
    const t = setTimeout(() => setTimer(timer - 1), 1000);
    return () => clearTimeout(t);
  }, [timer]);

  const finishLogin = async (data) => {
    await saveAuth(data);
    navigation.replace('Dashboard', { fullName: data.fullName, roles: data.roles });
  };

  const requestOtp = async () => {
    setError(null);
    const p = phone.replace(/\D/g, '');
    if (p.length !== 10) { setError('Enter a valid 10-digit mobile number'); return; }
    setBusy(true);
    try {
      const data = await api('/auth/request-otp', {
        method: 'POST', body: JSON.stringify({ phone: p }),
      });
      setDevOtp(data.devOtp || null); // dev mode helper — production-la varaadhu
      setOtp(['', '', '', '', '', '']);
      setMode('otp');
      setTimer(30);
      setTimeout(() => otpRefs.current[0]?.focus(), 400);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const verifyOtp = async () => {
    setError(null);
    const code = otp.join('');
    if (code.length !== 6) { setError('Enter the 6-digit OTP'); return; }
    setBusy(true);
    try {
      const data = await api('/auth/verify-otp', {
        method: 'POST',
        body: JSON.stringify({ phone: phone.replace(/\D/g, ''), otp: code }),
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

  const onOtpChange = (val, i) => {
    const v = val.replace(/\D/g, '').slice(-1);
    const next = [...otp];
    next[i] = v;
    setOtp(next);
    if (v && i < 5) otpRefs.current[i + 1]?.focus();
  };

  const onOtpKey = (e, i) => {
    if (e.nativeEvent.key === 'Backspace' && !otp[i] && i > 0)
      otpRefs.current[i - 1]?.focus();
  };

  const switchMode = (m) => { setError(null); setMode(m); };

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
              {/* Logo ready aana: assets/logo.png-la save panni, keezha line-a uncomment + icon line-a delete */}
              {/* <Image source={require('../assets/sesslogo.png')} style={styles.logoImg} resizeMode="contain" /> */}
              <MaterialIcons name="precision-manufacturing" size={42} color={INDIGO} />
            </View>
            <Text style={styles.brandName}>SESS Employee</Text>
            <Text style={styles.brandSub}>Sri Eswari Scientific Solution</Text>
          </View>

          {/* ===== Card ===== */}
          <View style={styles.card}>
            {mode === 'phone' && (
              <>
                <Text style={styles.cardTitle}>Welcome 👋</Text>
                <Text style={styles.cardSub}>Registered mobile number podunga — OTP anupurom</Text>

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
                  onPress={requestOtp} disabled={busy} activeOpacity={0.85}>
                  {busy ? <ActivityIndicator color="#fff" /> : (
                    <>
                      <Text style={styles.primaryText}>Get OTP</Text>
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

            {mode === 'otp' && (
              <>
                <Text style={styles.cardTitle}>Verify OTP 🔐</Text>
                <Text style={styles.cardSub}>+91 {phone}-ku 6-digit code anuppirukom</Text>

                <View style={styles.otpRow}>
                  {otp.map((d, i) => (
                    <TextInput
                      key={i}
                      ref={(r) => (otpRefs.current[i] = r)}
                      style={[styles.otpBox, d && styles.otpBoxFilled]}
                      keyboardType="number-pad"
                      maxLength={1}
                      value={d}
                      onChangeText={(v) => onOtpChange(v, i)}
                      onKeyPress={(e) => onOtpKey(e, i)}
                    />
                  ))}
                </View>

                {devOtp && <Text style={styles.devHint}>Dev OTP: {devOtp}</Text>}
                {error && <Text style={[styles.error, { alignSelf: 'center' }]}>{error}</Text>}

                <TouchableOpacity style={[styles.primaryBtn, busy && { opacity: 0.7 }]}
                  onPress={verifyOtp} disabled={busy} activeOpacity={0.85}>
                  {busy ? <ActivityIndicator color="#fff" /> : (
                    <Text style={styles.primaryText}>Verify & Continue</Text>
                  )}
                </TouchableOpacity>

                <View style={styles.otpFooter}>
                  <TouchableOpacity onPress={() => switchMode('phone')}>
                    <Text style={styles.linkText}>Change number</Text>
                  </TouchableOpacity>
                  <TouchableOpacity disabled={timer > 0} onPress={requestOtp}>
                    <Text style={[styles.linkText, timer > 0 && { color: '#9CA3AF' }]}>
                      {timer > 0 ? `Resend in ${timer}s` : 'Resend OTP'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {mode === 'admin' && (
              <>
                <Text style={styles.cardTitle}>Admin Login 🛡️</Text>
                <Text style={styles.cardSub}>Username & password-oda sign in pannunga</Text>

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
                  <Text style={styles.linkText}>Login with OTP instead</Text>
                </TouchableOpacity>
              </>
            )}
          </View>

          <Text style={styles.footer}>© {new Date().getFullYear()} Sri Eswari Scientific Solution Pvt Ltd</Text>
        </ScrollView>
      </KeyboardAvoidingView>
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
  brandSub: { color: '#C7D2FE', fontSize: 13, marginTop: 3 },

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

  otpRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  otpBox: {
    width: 46, height: 54, borderRadius: 12, borderWidth: 1.5, borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB', textAlign: 'center', fontSize: 20, fontWeight: '700', color: '#111827',
  },
  otpBoxFilled: { borderColor: INDIGO, backgroundColor: '#EEF2FF' },
  devHint: { alignSelf: 'center', color: '#16A34A', fontSize: 12, fontWeight: '700', marginTop: 6 },
  otpFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 },

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