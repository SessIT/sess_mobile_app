import React from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Alert } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { MaterialIcons } from '@expo/vector-icons';
import { GradientHeader, BottomNav, Upcoming } from '../components/ui';
import { COLORS } from '../lib/theme';

/* My Notes (design page 14) — personal notepad with photo support.
 * Backend is not built yet, so the composer is a preview only. */
export default function NotesScreen({ navigation }) {
  const soon = () => Alert.alert('My Notes', 'Personal notes are coming in the next update 🚀');

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <GradientHeader title="My Notes" onBack={() => navigation.goBack()} />

      <View style={{ flex: 1 }}>
        <Upcoming
          icon="sticky-note-2"
          title="My Notes"
          note={'Jot down quick notes and snap photos of documents — your private notepad arrives in the next update. 🚀'}
        />
      </View>

      {/* Preview composer (disabled until the feature ships) */}
      <View style={styles.composer}>
        <TouchableOpacity style={styles.inputFake} onPress={soon} activeOpacity={0.7}>
          <MaterialIcons name="photo-camera" size={22} color={COLORS.primary} />
          <Text style={styles.inputHint}>Write a note…</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.sendBtn} onPress={soon} activeOpacity={0.7}>
          <MaterialIcons name="send" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <BottomNav navigation={navigation} active="profile" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  composer: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  inputFake: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, height: 50,
    borderRadius: 25, borderWidth: 1.5, borderColor: '#C7D2FE', backgroundColor: '#EDEFF5',
    paddingHorizontal: 14,
  },
  inputHint: { color: COLORS.faint, fontSize: 14 },
  sendBtn: {
    width: 50, height: 50, borderRadius: 25, backgroundColor: COLORS.primary,
    justifyContent: 'center', alignItems: 'center', elevation: 3,
  },
});
