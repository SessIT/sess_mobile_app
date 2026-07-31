import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { MaterialIcons } from '@expo/vector-icons';
import { GradientHeader, BottomNav, Upcoming, Card } from '../components/ui';
import { COLORS } from '../lib/theme';

/* Dummy preview rows so the screen hints at what task management will look like. */
const PREVIEW = [
  { icon: 'assignment', title: 'Site visit — instrument calibration', chip: 'HIGH' },
  { icon: 'assignment-turned-in', title: 'Submit service report', chip: 'DONE' },
  { icon: 'support-agent', title: 'Client complaint follow-up', chip: 'OPEN' },
];

export default function TaskListScreen({ navigation }) {
  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <GradientHeader
        title="Task List"
        subtitle="Daily tasks & client tickets"
        onBack={() => navigation.goBack()}
      />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
        <Upcoming
          icon="checklist"
          title="Task Management"
          note={'Assigning daily tasks, tracking progress and handling client tickets will land right here in the next update. 🚀'}
        />

        {/* Ghost preview of the upcoming module */}
        <View style={{ marginTop: 28, opacity: 0.45 }}>
          {PREVIEW.map((t) => (
            <Card key={t.title} style={styles.previewCard}>
              <View style={styles.previewIcon}>
                <MaterialIcons name={t.icon} size={20} color={COLORS.primary} />
              </View>
              <Text style={styles.previewTitle} numberOfLines={1}>{t.title}</Text>
              <View style={styles.previewChip}><Text style={styles.previewChipText}>{t.chip}</Text></View>
            </Card>
          ))}
        </View>
      </ScrollView>

      <BottomNav navigation={navigation} active="tasks" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  previewCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, marginBottom: 10 },
  previewIcon: {
    width: 38, height: 38, borderRadius: 12, backgroundColor: COLORS.indigoSoft,
    justifyContent: 'center', alignItems: 'center',
  },
  previewTitle: { flex: 1, fontSize: 13.5, fontWeight: '700', color: COLORS.ink },
  previewChip: { backgroundColor: COLORS.indigoSoft, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  previewChipText: { fontSize: 10, fontWeight: '800', color: COLORS.primary },
});
