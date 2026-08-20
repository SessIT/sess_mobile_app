// Shared UI building blocks for the SESS HR redesign (SESS_MOBILE_APP_UI.pdf).
// Every screen composes these so headers, cards and the tab bar stay identical.
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, GRADIENT, RADIUS, SHADOW } from '../lib/theme';

/* Round translucent icon button used inside gradient headers. */
export function HeaderIconButton({ icon, onPress, badge = false, size = 22 }) {
  return (
    <TouchableOpacity style={styles.hIconBtn} onPress={onPress}>
      <MaterialIcons name={icon} size={size} color="#fff" />
      {badge && <View style={styles.hIconDot} />}
    </TouchableOpacity>
  );
}

/* Gradient page header with rounded bottom corners.
 * props: title, subtitle, onBack, right (node), children (hero content below the row). */
export function GradientHeader({ title, subtitle, onBack, right, children, style }) {
  return (
    <LinearGradient
      colors={GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={[styles.header, style]}
    >
      <View style={[styles.deco, { width: 190, height: 190, top: -70, right: -50 }]} />
      <View style={[styles.deco, { width: 110, height: 110, bottom: -40, left: -30 }]} />

      <View style={styles.headerRow}>
        {onBack && (
          <TouchableOpacity onPress={onBack} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={styles.headerSub} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
        {right}
      </View>
      {children}
    </LinearGradient>
  );
}

/* Bottom tab bar from the design: PUNCH IN/OUT · TASK LIST · TEAM CHAT · PROFILE.
 * Rendered on every post-login screen. `active` highlights the current tab. */
const TABS = [
  { key: 'punch', label: 'PUNCH IN / OUT', icon: 'fingerprint', screen: 'Punch' },
  { key: 'tasks', label: 'TASK LIST', icon: 'checklist', screen: 'TaskList' },
  { key: 'chat', label: 'TEAM CHAT', icon: 'forum', screen: 'ChatList' },
  { key: 'profile', label: 'PROFILE', icon: 'account-circle', screen: 'MyProfile' },
];

export function BottomNav({ navigation, active }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.nav, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {TABS.map((t) => {
        const on = active === t.key;
        return (
          <TouchableOpacity
            key={t.key}
            style={styles.navItem}
            activeOpacity={0.8}
            onPress={() => { if (!on) navigation.navigate(t.screen); }}
          >
            <MaterialIcons name={t.icon} size={24} color={on ? '#fff' : 'rgba(255,255,255,0.72)'} />
            <Text style={[styles.navLabel, on && styles.navLabelOn]} numberOfLines={1}>{t.label}</Text>
            {on && <View style={styles.navDot} />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/* White rounded card with the standard soft shadow. */
export function Card({ children, style }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

/* Small colored status chip, e.g. <Chip text="Approved" color={COLORS.green} soft={COLORS.greenSoft} /> */
export function Chip({ text, color = COLORS.primary, soft = COLORS.indigoSoft, icon, style }) {
  return (
    <View style={[styles.chip, { backgroundColor: soft }, style]}>
      {icon ? <MaterialIcons name={icon} size={13} color={color} /> : null}
      <Text style={[styles.chipText, { color }]}>{text}</Text>
    </View>
  );
}

/* Full-width primary action button (indigo by default, pass color for green punch). */
export function PrimaryButton({ title, icon, onPress, busy = false, disabled = false, colors, style }) {
  const grad = colors || [COLORS.primaryLight, COLORS.primary];
  return (
    <TouchableOpacity onPress={onPress} disabled={busy || disabled} activeOpacity={0.85} style={style}>
      <LinearGradient
        colors={disabled ? ['#9CA3AF', '#6B7280'] : grad}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={[styles.primaryBtn, busy && { opacity: 0.75 }]}
      >
        {icon ? <MaterialIcons name={icon} size={19} color="#fff" /> : null}
        <Text style={styles.primaryText}>{title}</Text>
      </LinearGradient>
    </TouchableOpacity>
  );
}

/* Gray uppercase section label, e.g. EMPLOYMENT / MONTHLY OVERVIEW. */
export function SectionLabel({ text, right, style }) {
  return (
    <View style={[styles.sectionHead, style]}>
      <Text style={styles.sectionLabel}>{text}</Text>
      {right}
    </View>
  );
}

/* Placeholder body for features shipping in a later version (Tasks, Notes). */
export function Upcoming({ icon = 'rocket-launch', title, note }) {
  return (
    <View style={styles.upWrap}>
      <View style={styles.upIcon}>
        <MaterialIcons name={icon} size={40} color={COLORS.primary} />
      </View>
      <Text style={styles.upTitle}>{title}</Text>
      <View style={styles.upBadge}>
        <MaterialIcons name="update" size={14} color={COLORS.orange} />
        <Text style={styles.upBadgeText}>UPCOMING UPDATE</Text>
      </View>
      <Text style={styles.upNote}>{note}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  /* header */
  header: {
    paddingTop: 54, paddingBottom: 22, paddingHorizontal: 18,
    borderBottomLeftRadius: RADIUS.header, borderBottomRightRadius: RADIUS.header,
    overflow: 'hidden', elevation: 6,
  },
  deco: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.07)' },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.14)',
    justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '800', letterSpacing: 0.2 },
  headerSub: { color: '#C7D2FE', fontSize: 12, marginTop: 2, fontWeight: '600' },
  hIconBtn: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.14)',
    justifyContent: 'center', alignItems: 'center',
  },
  hIconDot: {
    position: 'absolute', top: 9, right: 10, width: 7, height: 7,
    borderRadius: 4, backgroundColor: '#F87171', borderWidth: 1, borderColor: COLORS.primary,
  },

  /* bottom nav */
  nav: {
    flexDirection: 'row', backgroundColor: COLORS.primary,
    borderTopLeftRadius: 18, borderTopRightRadius: 18,
    paddingTop: 10, paddingHorizontal: 4, elevation: 12,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: -4 },
  },
  navItem: { flex: 1, alignItems: 'center', gap: 3, paddingVertical: 2 },
  navLabel: { color: 'rgba(255,255,255,0.72)', fontSize: 9, fontWeight: '700', letterSpacing: 0.2 },
  navLabelOn: { color: '#fff', fontWeight: '800' },
  navDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#fff', marginTop: 1 },

  /* card + chips + buttons */
  card: { backgroundColor: COLORS.card, borderRadius: RADIUS.card, padding: 16, ...SHADOW.card },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start',
    borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4,
  },
  chipText: { fontSize: 11.5, fontWeight: '800' },
  primaryBtn: {
    flexDirection: 'row', gap: 8, height: 52, borderRadius: RADIUS.button,
    justifyContent: 'center', alignItems: 'center', elevation: 3,
  },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, marginBottom: 8 },
  sectionLabel: { fontSize: 11, fontWeight: '800', color: COLORS.faint, letterSpacing: 0.9 },

  /* upcoming placeholder */
  upWrap: { alignItems: 'center', paddingHorizontal: 32, paddingTop: 70 },
  upIcon: {
    width: 92, height: 92, borderRadius: 46, backgroundColor: COLORS.indigoSoft,
    justifyContent: 'center', alignItems: 'center', marginBottom: 16,
  },
  upTitle: { fontSize: 19, fontWeight: '800', color: COLORS.ink },
  upBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: COLORS.orangeSoft,
    borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, marginTop: 10,
  },
  upBadgeText: { color: COLORS.orange, fontSize: 10.5, fontWeight: '800', letterSpacing: 0.6 },
  upNote: { fontSize: 13, color: COLORS.sub, textAlign: 'center', marginTop: 12, lineHeight: 19 },
});

/* Bottom sheet backdrop that lifts above the keyboard.
 *
 * RN <Modal> is a separate Android window, so app.json's
 * softwareKeyboardLayoutMode:"resize" does not reach inside it — a sheet
 * pinned with justifyContent:'flex-end' stays put and the IME covers it.
 * KeyboardAvoidingView inside the Modal is what actually moves it.
 *
 * Drop-in for  <View style={styles.sheetOverlay}>  inside a <Modal>.
 * Pass center for centred cards (styles.overlayCenter). */
export function SheetOverlay({ children, center = false, style }) {
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[
        { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)' },
        center
          ? { justifyContent: 'center', padding: 20 }
          : { justifyContent: 'flex-end' },
        style,
      ]}
    >
      {children}
    </KeyboardAvoidingView>
  );
}
