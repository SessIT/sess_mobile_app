import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput,
  ActivityIndicator, RefreshControl, Modal, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { Calendar } from 'react-native-calendars';
import { api } from '../lib/api';

const INDIGO = '#1E3A8A';
const GREEN = '#16A34A';
const RED = '#DC2626';
const GREY = '#6B7280';
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

const prettyDate = (iso) => iso
  ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
  : '—';
const initials = (n) => (n || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

// Read-only row for employment/statutory data.
const InfoRow = ({ icon, label, value }) => (
  <View style={styles.infoRow}>
    <MaterialIcons name={icon} size={17} color={GREY} style={{ width: 24 }} />
    <Text style={styles.infoLabel}>{label}</Text>
    <Text style={styles.infoValue} numberOfLines={2}>{value || '—'}</Text>
  </View>
);

export default function MyProfileScreen({ navigation }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

  // Editable personal fields
  const [address, setAddress] = useState('');
  const [emergencyContact, setEmergencyContact] = useState('');
  const [bloodGroup, setBloodGroup] = useState('');
  const [dob, setDob] = useState(''); // YYYY-MM-DD
  const [dobPicker, setDobPicker] = useState(false);

  const load = useCallback(async () => {
    try {
      const p = await api('/me/profile');
      setProfile(p);
      setAddress(p.address || '');
      setEmergencyContact(p.emergencyContact || '');
      setBloodGroup(p.bloodGroup || '');
      setDob(p.dateOfBirth ? String(p.dateOfBirth).slice(0, 10) : '');
    } catch (e) { Alert.alert('Error', e.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (emergencyContact && emergencyContact.length !== 10) {
      Alert.alert('Invalid number', 'Emergency contact must be a 10-digit number.');
      return;
    }
    setSaving(true);
    try {
      const p = await api('/me/profile', {
        method: 'PATCH',
        body: JSON.stringify({ address, emergencyContact, bloodGroup, dateOfBirth: dob }),
      });
      setProfile(p);
      setEditing(false);
      Alert.alert('Saved ✅', 'Your personal details have been updated.');
    } catch (e) { Alert.alert('Could not save', e.message); }
    finally { setSaving(false); }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.container}>
        <StatusBar style="light" />
        <LinearGradient colors={['#1E40AF', '#1E3A8A', '#312E81']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
          <View style={[styles.deco, { width: 160, height: 160, top: -60, right: -50 }]} />
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
              <MaterialIcons name="arrow-back" size={22} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.title}>My Profile</Text>
          </View>
          {profile && (
            <View style={styles.heroRow}>
              <View style={styles.avatar}><Text style={styles.avatarText}>{initials(profile.fullName || profile.username)}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.heroName}>{profile.fullName || profile.username}</Text>
                <Text style={styles.heroSub}>
                  {[profile.designation, profile.department].filter(Boolean).join(' • ') || `@${profile.username}`}
                </Text>
                {profile.employeeId ? (
                  <View style={styles.idPill}><Text style={styles.idPillText}>ID: {profile.employeeId}</Text></View>
                ) : null}
              </View>
            </View>
          )}
        </LinearGradient>

        {loading ? (
          <ActivityIndicator size="large" color={INDIGO} style={{ marginTop: 40 }} />
        ) : (
          <ScrollView
            contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
            keyboardShouldPersistTaps="handled"
          >
            {/* Employment — read only */}
            <Text style={styles.sectionTitle}>EMPLOYMENT</Text>
            <View style={styles.card}>
              <InfoRow icon="badge" label="Employee ID" value={profile?.employeeId} />
              <InfoRow icon="event" label="Joined" value={prettyDate(profile?.dateOfJoining)} />
              <InfoRow icon="work" label="Type" value={profile?.employmentType} />
              <InfoRow icon="supervisor-account" label="Manager"
                value={profile?.reportingManager ? (profile.reportingManager.fullName || profile.reportingManager.username) : null} />
              <InfoRow icon="smartphone" label="Phone" value={profile?.phone ? `+91 ${profile.phone}` : null} />
            </View>

            {/* Personal — editable */}
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>PERSONAL</Text>
              {!editing && (
                <TouchableOpacity style={styles.editLink} onPress={() => setEditing(true)}>
                  <MaterialIcons name="edit" size={14} color={INDIGO} />
                  <Text style={styles.editLinkText}>Edit</Text>
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.card}>
              {!editing ? (
                <>
                  <InfoRow icon="cake" label="Birthday" value={prettyDate(profile?.dateOfBirth)} />
                  <InfoRow icon="bloodtype" label="Blood group" value={profile?.bloodGroup} />
                  <InfoRow icon="call" label="Emergency" value={profile?.emergencyContact ? `+91 ${profile.emergencyContact}` : null} />
                  <InfoRow icon="home" label="Address" value={profile?.address} />
                </>
              ) : (
                <>
                  <Text style={styles.fieldLabel}>DATE OF BIRTH</Text>
                  <TouchableOpacity style={styles.inputRow} onPress={() => setDobPicker(true)}>
                    <MaterialIcons name="cake" size={18} color={GREY} />
                    <Text style={[styles.inputText, !dob && { color: '#9CA3AF' }]}>
                      {dob ? prettyDate(dob) : 'Select date'}
                    </Text>
                    <MaterialIcons name="calendar-today" size={16} color={GREY} />
                  </TouchableOpacity>

                  <Text style={styles.fieldLabel}>BLOOD GROUP</Text>
                  <View style={styles.chipWrap}>
                    {BLOOD_GROUPS.map((b) => (
                      <TouchableOpacity key={b}
                        style={[styles.chip, bloodGroup === b && styles.chipOn]}
                        onPress={() => setBloodGroup(bloodGroup === b ? '' : b)}>
                        <Text style={[styles.chipText, bloodGroup === b && styles.chipTextOn]}>{b}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={styles.fieldLabel}>EMERGENCY CONTACT</Text>
                  <View style={styles.inputRow}>
                    <MaterialIcons name="call" size={18} color={GREY} />
                    <TextInput
                      style={styles.input}
                      value={emergencyContact}
                      onChangeText={(t) => setEmergencyContact(t.replace(/\D/g, '').slice(0, 10))}
                      placeholder="10-digit number"
                      placeholderTextColor="#9CA3AF"
                      keyboardType="number-pad"
                      maxLength={10}
                    />
                    {emergencyContact.length === 10 && <MaterialIcons name="check-circle" size={17} color={GREEN} />}
                  </View>

                  <Text style={styles.fieldLabel}>ADDRESS</Text>
                  <View style={[styles.inputRow, { height: undefined, minHeight: 70, alignItems: 'flex-start', paddingVertical: 10 }]}>
                    <MaterialIcons name="home" size={18} color={GREY} style={{ marginTop: 2 }} />
                    <TextInput
                      style={[styles.input, { textAlignVertical: 'top' }]}
                      value={address}
                      onChangeText={setAddress}
                      placeholder="Street, city, PIN code"
                      placeholderTextColor="#9CA3AF"
                      multiline
                      maxLength={300}
                    />
                  </View>

                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                    <TouchableOpacity style={styles.cancelBtn} disabled={saving}
                      onPress={() => { setEditing(false); load(); }}>
                      <Text style={styles.cancelText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.7 }]} disabled={saving} onPress={save}>
                      {saving ? <ActivityIndicator color="#fff" /> : (
                        <>
                          <MaterialIcons name="save" size={17} color="#fff" />
                          <Text style={styles.saveText}>Save</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>

            {/* Statutory — read only */}
            <Text style={styles.sectionTitle}>STATUTORY</Text>
            <View style={styles.card}>
              <InfoRow icon="verified-user" label="ESI" value={profile?.esiNumber} />
              <InfoRow icon="account-balance" label="EPF" value={profile?.epfNumber} />
              <InfoRow icon="credit-card" label="PAN" value={profile?.panNumber} />
            </View>
            <Text style={styles.note}>Employment & statutory details are managed by HR. Contact admin for changes.</Text>
          </ScrollView>
        )}

        {/* DOB picker */}
        <Modal visible={dobPicker} transparent animationType="fade" onRequestClose={() => setDobPicker(false)}>
          <View style={styles.overlayCenter}>
            <View style={styles.calCard}>
              <Text style={styles.calTitle}>Date of birth</Text>
              <Calendar
                current={dob || '1995-01-01'}
                maxDate={new Date().toISOString().slice(0, 10)}
                onDayPress={(d) => { setDob(d.dateString); setDobPicker(false); }}
                markedDates={dob ? { [dob]: { selected: true, selectedColor: INDIGO } } : {}}
                theme={{ todayTextColor: INDIGO, arrowColor: INDIGO, textMonthFontWeight: '800' }}
              />
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setDobPicker(false)}>
                <Text style={styles.cancelText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
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
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 18 },
  avatar: { width: 58, height: 58, borderRadius: 29, backgroundColor: 'rgba(255,255,255,0.18)', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)' },
  avatarText: { color: '#fff', fontSize: 20, fontWeight: '800' },
  heroName: { color: '#fff', fontSize: 17, fontWeight: '800' },
  heroSub: { color: '#C7D2FE', fontSize: 12, marginTop: 2 },
  idPill: { alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, marginTop: 6 },
  idPillText: { color: '#fff', fontSize: 10.5, fontWeight: '800', letterSpacing: 0.4 },

  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 11, fontWeight: '800', color: '#9CA3AF', letterSpacing: 0.8, marginTop: 16, marginBottom: 8 },
  editLink: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 16, marginBottom: 8 },
  editLinkText: { color: INDIGO, fontSize: 12.5, fontWeight: '800' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 14, elevation: 1 },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 7 },
  infoLabel: { width: 92, fontSize: 12.5, color: GREY, fontWeight: '600' },
  infoValue: { flex: 1, fontSize: 13.5, color: '#111827', fontWeight: '700' },

  fieldLabel: { fontSize: 10.5, fontWeight: '800', color: '#9CA3AF', letterSpacing: 0.6, marginTop: 12, marginBottom: 6 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F9FAFB', borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 12, height: 48 },
  input: { flex: 1, fontSize: 14, color: '#111827' },
  inputText: { flex: 1, fontSize: 14, color: '#111827', fontWeight: '600' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 18, paddingHorizontal: 13, paddingVertical: 7, backgroundColor: '#fff' },
  chipOn: { backgroundColor: INDIGO, borderColor: INDIGO },
  chipText: { fontSize: 12.5, color: '#374151', fontWeight: '700' },
  chipTextOn: { color: '#fff' },

  cancelBtn: { flex: 1, height: 48, borderRadius: 12, borderWidth: 1.5, borderColor: '#E5E7EB', justifyContent: 'center', alignItems: 'center', marginTop: 10 },
  cancelText: { color: '#374151', fontWeight: '700' },
  saveBtn: { flex: 1, flexDirection: 'row', gap: 6, height: 48, borderRadius: 12, backgroundColor: INDIGO, justifyContent: 'center', alignItems: 'center', marginTop: 10 },
  saveText: { color: '#fff', fontWeight: '800' },
  note: { fontSize: 11, color: '#9CA3AF', marginTop: 12, textAlign: 'center', fontStyle: 'italic' },

  overlayCenter: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'center', padding: 20 },
  calCard: { backgroundColor: '#fff', borderRadius: 24, padding: 16 },
  calTitle: { fontSize: 16, fontWeight: '800', color: '#111827', textAlign: 'center', marginBottom: 8 },
});
