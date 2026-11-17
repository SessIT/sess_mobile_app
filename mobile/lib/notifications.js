// Local notification helpers — daily punch reminders (WhatsApp-style banners).
//
// IMPORTANT: on ANDROID EXPO GO, merely importing expo-notifications throws at
// module-load time (push support was removed from Expo Go in SDK 53 and the
// import registers a push-token listener). So we load it defensively: if the
// import throws, the app still boots and reminders simply stay off until the
// app runs as a development/production build.
import { Platform } from 'react-native';

let Notifications = null;
try {
  Notifications = require('expo-notifications');
  // Show banners even while the app is foregrounded.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
} catch {
  Notifications = null; // Expo Go on Android — degrade gracefully, no crash
}

// True when the notifications module is usable in this runtime.
export const notificationsAvailable = () => !!Notifications;

const PUNCH_IN_ID = 'punch-in-reminder';
const PUNCH_OUT_ID = 'punch-out-reminder';

/* Schedule the two daily attendance reminders (idempotent — cancels and
 * re-schedules by fixed identifiers so reloads never duplicate them):
 *   09:15 — punch-in reminder (cutoff is 09:30)
 *   18:30 — punch-out reminder
 * Returns true when scheduled, false when permission was denied. */
export async function ensurePunchReminders() {
  if (!Notifications) return false;
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') return false;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('reminders', {
        name: 'Attendance reminders',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }

    await Notifications.cancelScheduledNotificationAsync(PUNCH_IN_ID).catch(() => {});
    await Notifications.cancelScheduledNotificationAsync(PUNCH_OUT_ID).catch(() => {});

    await Notifications.scheduleNotificationAsync({
      identifier: PUNCH_IN_ID,
      content: {
        title: '⏰ Punch-In Reminder',
        body: 'Good morning! Punch in before 9:30 AM to stay on time.',
        sound: true,
        data: { screen: 'Punch' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: 9,
        minute: 15,
        channelId: 'reminders',
      },
    });

    await Notifications.scheduleNotificationAsync({
      identifier: PUNCH_OUT_ID,
      content: {
        title: '🌆 Punch-Out Reminder',
        body: "Wrapping up? Don't forget to punch out before you leave.",
        sound: true,
        data: { screen: 'Punch' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: 18,
        minute: 30,
        channelId: 'reminders',
      },
    });

    return true;
  } catch {
    return false;
  }
}

/* Server push (approvals, decisions, payslips).
 * Gets this install's Expo push token and registers it with the backend so
 * lib/notify.js can reach the phone. Needs a development/production build
 * (not Expo Go on Android) and, for Android delivery, FCM credentials on the
 * EAS project. Safe to call on every app start — the server upserts. */
let registeredToken = null;

export async function registerForPush() {
  if (!Notifications) return null;
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') return null;
    if (Platform.OS === 'android') {
      // Must match the channelId the server sends with ('default').
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Approvals & updates',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }
    const Constants = require('expo-constants').default;
    const projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
    const { data: token } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    if (!token) return null;
    const { api } = require('./api'); // lazy: api.js must not load before auth is ready
    await api('/notifications/push-token', { method: 'POST', body: JSON.stringify({ token, platform: Platform.OS }) });
    registeredToken = token;
    return token;
  } catch {
    return null; // no permission / no FCM config / offline — the in-app inbox still works
  }
}

// On logout: stop pushes for this account reaching this phone.
export async function unregisterPush() {
  if (!registeredToken) return;
  try {
    const { api } = require('./api');
    await api('/notifications/push-token', { method: 'DELETE', body: JSON.stringify({ token: registeredToken }) });
  } catch { /* best effort — the next login re-assigns the token anyway */ }
  registeredToken = null;
}

/* Tapping a banner (reminder or server push) routes to the screen in its data
 * payload, with optional params. Returns an unsubscribe function. */
export function onNotificationTap(navigate) {
  if (!Notifications) return () => {};
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response?.notification?.request?.content?.data || {};
    if (data.screen) navigate(data.screen, data.params);
  });
  return () => sub.remove();
}
