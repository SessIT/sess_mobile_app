import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput,
  ActivityIndicator, RefreshControl, Modal, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { Calendar } from 'react-native-calendars';
import { api } from '../lib/api';
import { GradientHeader, BottomNav, Card, SectionLabel, PrimaryButton } from '../components/ui';
import { COLORS, RADIUS } from '../lib/theme';

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

const prettyDate = (iso) => iso
  ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
  : '—';
const initials = (n) => (n || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

// Read-only row for employment/statutory data.
const InfoRow = ({ icon, label, value }) => (
  <View style={styles.infoRow}>
    <View style={styles.infoIcon}>
      <MaterialIcons name={icon} size={16} color={COLORS.primary} />
    </View>
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
        <GradientHeader
          title="My Profile"
          onBack={() => navigation.goBack()}
          right={profile ? (
            <View style={styles.hIdentity}>
              <View style={styles.hAvatar}>
                <Text style={styles.hAvatarText}>{initials(profile.fullName || profile.username)}</Text>
              </View>
              <View style={styles.hIdText}>
                <Text style={styles.hName} numberOfLines={1}>{profile.fullName || profile.username}</Text>
                <Text style={styles.hUser} numberOfLines={1}>@{profile.username}</Text>
              </View>
            </View>
          ) : null}
        />

        {loading ? (
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <ActivityIndicator size="large" color={COLORS.primary} />
          </View>
        ) : (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 16, paddingBottom: 28 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
            keyboardShouldPersistTaps="handled"
          >
            {/* Employment — read only */}
            <SectionLabel text="EMPLOYMENT" style={{ marginTop: 0 }} />
            <Card>
              <InfoRow icon="badge" label="Employee ID" value={profile?.employeeId} />
              <InfoRow icon="event" label="Joined" value={prettyDate(profile?.dateOfJoining)} />
              <InfoRow icon="work" label="Type" value={profile?.employmentType} />
              <InfoRow icon="supervisor-account" label="Manager"
                value={profile?.reportingManager ? (profile.reportingManager.fullName || profile.reportingManager.username) : null} />
              <InfoRow icon="smartphone" label="Phone" value={profile?.phone ? `+91 ${profile.phone}` : null} />
            </Card>

            {/* Personal — editable */}
            <SectionLabel
              text="PERSONAL"
              right={!editing ? (
                <TouchableOpacity style={styles.editLink} onPress={() => setEditing(true)}>
                  <MaterialIcons name="edit" size={14} color={COLORS.primary} />
                  <Text style={styles.editLinkText}>Edit</Text>
                </TouchableOpacity>
              ) : null}
            />
            <Card>
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
                    <MaterialIcons name="cake" size={18} color={COLORS.sub} />
                    <Text style={[styles.inputText, !dob && { color: COLORS.faint }]}>
                      {dob ? prettyDate(dob) : 'Select date'}
                    </Text>
                    <MaterialIcons name="calendar-today" size={16} color={COLORS.sub} />
                  </TouchableOpacity>

                  <Text style={styles.fieldLabel}>BLOOD GROUP</Text>
                  <View style={styles.chipWrap}>
                    {BLOOD_GROUPS.map((b) => (
                      <TouchableOpacity key={b}
                        style={[styles.bgChip, bloodGroup === b && styles.bgChipOn]}
                        onPress={() => setBloodGroup(bloodGroup === b ? '' : b)}>
                        <Text style={[styles.bgChipText, bloodGroup === b && styles.bgChipTextOn]}>{b}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={styles.fieldLabel}>EMERGENCY CONTACT</Text>
                  <View style={styles.inputRow}>
                    <MaterialIcons name="call" size={18} color={COLORS.sub} />
                    <TextInput
                      style={styles.input}
                      value={emergencyContact}
                      onChangeText={(t) => setEmergencyContact(t.replace(/\D/g, '').slice(0, 10))}
                      placeholder="10-digit number"
                      placeholderTextColor={COLORS.faint}
                      keyboardType="number-pad"
                      maxLength={10}
                    />
                    {emergencyContact.length === 10 && <MaterialIcons name="check-circle" size={17} color={COLORS.green} />}
                  </View>

                  <Text style={styles.fieldLabel}>ADDRESS</Text>
                  <View style={[styles.inputRow, { height: undefined, minHeight: 70, alignItems: 'flex-start', paddingVertical: 10 }]}>
                    <MaterialIcons name="home" size={18} color={COLORS.sub} style={{ marginTop: 2 }} />
                    <TextInput
                      style={[styles.input, { textAlignVertical: 'top' }]}
                      value={address}
                      onChangeText={setAddress}
                      placeholder="Street, city, PIN code"
                      placeholderTextColor={COLORS.faint}
                      multiline
                      maxLength={300}
                    />
                  </View>

                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                    <TouchableOpacity style={styles.cancelBtn} disabled={saving}
                      onPress={() => { setEditing(false); load(); }}>
                      <Text style={styles.cancelText}>Cancel</Text>
                    </TouchableOpacity>
                    <PrimaryButton
                      title={saving ? 'Saving…' : 'Save'}
                      icon="save"
                      busy={saving}
                      onPress={save}
                      style={{ flex: 1 }}
                    />
                  </View>
                </>
              )}
            </Card>

            {/* Statutory — read only */}
            <SectionLabel text="STATUTORY" />
            <Card>
              <InfoRow icon="verified-user" label="ESI" value={profile?.esiNumber} />
              <InfoRow icon="account-balance" label="EPF" value={profile?.epfNumber} />
              <InfoRow icon="credit-card" label="PAN" value={profile?.panNumber} />
            </Card>
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
                markedDates={dob ? { [dob]: { selected: true, selectedColor: COLORS.primary } } : {}}
                theme={{ todayTextColor: COLORS.primary, arrowColor: COLORS.primary, textMonthFontWeight: '800' }}
              />
              <TouchableOpacity style={[styles.cancelBtn, { flex: 0, marginTop: 10 }]} onPress={() => setDobPicker(false)}>
                <Text style={styles.cancelText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        <BottomNav navigation={navigation} active="profile" />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },

  /* header identity block (right side of the header row) */
  hIdentity: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  hAvatar: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.22)',
    justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.55)',
  },
  hAvatarText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  hIdText: { maxWidth: 150 },
  hName: { color: '#fff', fontSize: 14.5, fontWeight: '800' },
  hUser: { color: '#C7D2FE', fontSize: 11.5, fontWeight: '600', marginTop: 1 },

  /* info rows */
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  infoIcon: {
    width: 30, height: 30, borderRadius: 10, backgroundColor: COLORS.indigoSoft,
    justifyContent: 'center', alignItems: 'center',
  },
  infoLabel: { width: 96, fontSize: 13, color: COLORS.ink, fontWeight: '700' },
  infoValue: { flex: 1, fontSize: 13, color: COLORS.sub, fontWeight: '600', textAlign: 'right' },

  editLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  editLinkText: { color: COLORS.primary, fontSize: 12.5, fontWeight: '800' },

  /* edit form */
  fieldLabel: { fontSize: 10.5, fontWeight: '800', color: COLORS.faint, letterSpacing: 0.6, marginTop: 12, marginBottom: 6 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.field,
    borderWidth: 1.5, borderColor: COLORS.line, borderRadius: RADIUS.input, paddingHorizontal: 12, height: 48,
  },
  input: { flex: 1, fontSize: 14, color: COLORS.ink },
  inputText: { flex: 1, fontSize: 14, color: COLORS.ink, fontWeight: '600' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  bgChip: {
    borderWidth: 1.5, borderColor: COLORS.line, borderRadius: 18,
    paddingHorizontal: 13, paddingVertical: 7, backgroundColor: COLORS.card,
  },
  bgChipOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  bgChipText: { fontSize: 12.5, color: '#374151', fontWeight: '700' },
  bgChipTextOn: { color: '#fff' },

  cancelBtn: {
    flex: 1, height: 52, borderRadius: RADIUS.button, borderWidth: 1.5, borderColor: COLORS.line,
    backgroundColor: COLORS.card, justifyContent: 'center', alignItems: 'center',
  },
  cancelText: { color: '#374151', fontWeight: '700' },
  note: { fontSize: 11, color: COLORS.faint, marginTop: 14, textAlign: 'center', fontStyle: 'italic' },

  /* DOB modal */
  overlayCenter: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'center', padding: 20 },
  calCard: { backgroundColor: COLORS.card, borderRadius: RADIUS.sheet, padding: 16 },
  calTitle: { fontSize: 16, fontWeight: '800', color: COLORS.ink, textAlign: 'center', marginBottom: 8 },
});
