// Design tokens for the SESS HR mobile UI (source: SESS_MOBILE_APP_UI.pdf).
// Every screen styles from here so the app reads as one system.

export const COLORS = {
  primary: '#1E3A8A',      // deep indigo — buttons, active elements
  primaryLight: '#1E40AF',
  primaryDark: '#312E81',
  accent: '#4F46E5',

  bg: '#F1F3F9',           // light gray-blue page background
  card: '#FFFFFF',
  ink: '#111827',          // main text
  sub: '#6B7280',          // secondary text
  faint: '#9CA3AF',        // hints / placeholders
  line: '#E5E7EB',         // borders
  field: '#F9FAFB',        // input backgrounds
  indigoSoft: '#EEF2FF',   // soft indigo chip/tile background

  green: '#16A34A',
  greenSoft: '#DCFCE7',
  orange: '#D97706',
  orangeSoft: '#FEF3C7',
  red: '#DC2626',
  redSoft: '#FEE2E2',
  purple: '#7C3AED',
  purpleSoft: '#EDE9FE',
  teal: '#0D9488',         // company holiday — reads apart from present/late/leave/absent
  tealSoft: '#CCFBF1',
};

// Header / brand gradient (dark indigo, top-left → bottom-right)
export const GRADIENT = ['#1E40AF', '#1E3A8A', '#312E81'];
// Punch-in / success gradient
export const GREEN_GRADIENT = ['#22C55E', '#16A34A'];

export const RADIUS = { card: 18, button: 14, input: 12, sheet: 24, header: 28 };

export const SHADOW = {
  card: {
    elevation: 2, shadowColor: '#1E3A8A', shadowOpacity: 0.08,
    shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
  },
  raised: {
    elevation: 6, shadowColor: '#000', shadowOpacity: 0.2,
    shadowRadius: 16, shadowOffset: { width: 0, height: 8 },
  },
};
