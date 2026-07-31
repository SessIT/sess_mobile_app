import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GradientHeader, Card } from '../components/ui';
import { COLORS } from '../lib/theme';

/* Static legal pages (More Settings → Terms / Privacy). One component serves
 * both routes; App.js passes { doc: 'terms' | 'privacy' } via initialParams.
 * Content mirrors PRIVACY_POLICY.md at the repo root — keep the two in sync. */

const PRIVACY = {
  title: 'Privacy Policy',
  updated: 'Effective 30 July 2026 · v1.1',
  sections: [
    ['What we collect', 'Your profile & employment details (name, employee ID, phone, DOB, department), statutory records required by law (PAN, ESI, EPF, salary & bank — visible to HR/Admin only), attendance punches (time, GPS location, address and a selfie photo), leave records, and team chat messages including photos/videos you choose to share.'],
    ['Location tracking — strict limits', 'Your GPS location is recorded ONLY between punch-in and punch-out. The server rejects location data sent outside a punch session. No tracking before punch-in, after punch-out, on leave days, holidays or weekends.'],
    ['Camera & gallery', 'The camera is used only when you take a punch selfie or choose to share a photo in chat. The gallery is accessed only through your phone\'s own picker — the app receives only files you explicitly select. Nothing runs in the background.'],
    ['Celebrations', 'Your name, birthday (day & month only — never the year), work anniversary and designation are shown to colleagues on the dashboard when the date is near.'],
    ['How we use it', 'Identity verification (phone + PIN), attendance & working-hours records, leave processing, payroll & statutory compliance, team communication, and daily punch reminders. We never sell or trade your data. It is shared only with our SMS gateway (phone number only, for OTP delivery) and government authorities where the law requires.'],
    ['Who can see it', 'Access is role-based and enforced by the server. Colleagues see only chat you share with them and celebration dates. Salary, bank and statutory details are visible to HR/Admin only. Your punch photos and location trail are visible to you and authorised admins only.'],
    ['Security', 'All traffic is encrypted (HTTPS). Sessions use signed tokens kept in your phone\'s encrypted secure storage. Passwords are stored as bcrypt hashes. The database is not reachable from the internet. Nightly backups are kept for 14 days.'],
    ['Retention & your rights', 'Employment and statutory records are retained as required by Indian law; punch photos and location trails for a limited period. You may access, correct, or request deletion of your data, and raise grievances, by contacting HR. Aligned with the Digital Personal Data Protection Act, 2023 (India).'],
  ],
};

const TERMS = {
  title: 'Terms & Conditions',
  updated: 'Effective 30 July 2026',
  sections: [
    ['Who may use this app', 'SESS HR is an internal application for employees of Sri Easwari Scientific Solution Pvt Ltd. Your account is created by HR and is personal to you — do not share your PIN or let anyone else punch on your behalf.'],
    ['Attendance integrity', 'Punch in/out records your selfie, time and GPS location as proof of attendance. Punching for another employee, spoofing location, or tampering with the app is a disciplinary matter.'],
    ['Acceptable use of chat', 'Team chat is for work communication — wishes, updates and coordination. Do not share offensive content or confidential company data outside authorised groups.'],
    ['Device permissions', 'Camera, location and notification permissions are requested only for the purposes described in the Privacy Policy. Declining them limits attendance features.'],
    ['Availability', 'The app is provided on a best-effort basis. If attendance cannot be recorded due to a technical problem, inform your manager the same day — attendance correction requests exist for this.'],
    ['Changes', 'The Company may update these terms and the app. Continued use after an update and in-app notice means you accept the revised terms.'],
  ],
};

export default function LegalScreen({ route, navigation }) {
  const doc = route.params?.doc === 'terms' ? TERMS : PRIVACY;
  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <GradientHeader title={doc.title} subtitle={doc.updated} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {doc.sections.map(([head, body]) => (
          <Card key={head} style={styles.block}>
            <Text style={styles.head}>{head}</Text>
            <Text style={styles.body}>{body}</Text>
          </Card>
        ))}
        <Text style={styles.foot}>© 2026 Sri Easwari Scientific Solution Pvt Ltd</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  block: { marginBottom: 12 },
  head: { fontSize: 14.5, fontWeight: '800', color: COLORS.ink, marginBottom: 6 },
  body: { fontSize: 13, color: COLORS.sub, lineHeight: 20 },
  foot: { textAlign: 'center', color: COLORS.faint, fontSize: 11, marginTop: 10 },
});
