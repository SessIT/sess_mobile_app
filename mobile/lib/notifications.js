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

/* Tapping a reminder banner routes to the screen in its data payload
 * (both reminders -> Punch). Returns an unsubscribe function. */
export function onNotificationTap(navigate) {
  if (!Notifications) return () => {};
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const screen = response?.notification?.request?.content?.data?.screen;
    if (screen) navigate(screen);
  });
  return () => sub.remove();
}
