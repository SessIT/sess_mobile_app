import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from './api';

export const TRACK_INTERVAL_MIN = 5; // ⚡ test-ku 1, every 5 mins capture record
const QUEUE_KEY = 'sess_loc_queue';
const MAX_QUEUE = 500; // ~5 days safety cap

let timer = null;
let flushing = false;

// ---- queue helpers (disk-backed, restart-safe) ----
async function getQueue() {
  try { return JSON.parse(await AsyncStorage.getItem(QUEUE_KEY)) || []; }
  catch { return []; }
}
async function setQueue(q) {
  try { await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-MAX_QUEUE))); }
  catch {}
}

export async function pendingCount() {
  return (await getQueue()).length;
}

// ---- capture: ALWAYS queue first, then try flush ----
async function capture() {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') return;
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });

    let address = null;
    try {
      const r = await Location.reverseGeocodeAsync({
        latitude: loc.coords.latitude, longitude: loc.coords.longitude,
      });
      if (r?.length) {
        const a = r[0];
        address = a.formattedAddress || [a.name, a.district, a.city].filter(Boolean).join(', ');
      }
    } catch {} // offline-la geocode fail — coords podhum, address server-view-la coords fallback

    const q = await getQueue();
    q.push({
      lat: loc.coords.latitude, lng: loc.coords.longitude,
      acc: Math.round(loc.coords.accuracy), address,
      capturedAt: new Date().toISOString(),
    });
    await setQueue(q);
  } catch {}
  flush(); // capture mudinja odane try
}

// ---- flush: queue → server (batch), success-aana remove ----
export async function flush() {
  if (flushing) return;
  flushing = true;
  try {
    const q = await getQueue();
    if (!q.length) return;
    const batch = q.slice(0, 100); // server limit match
    const res = await api('/location/log', {
      method: 'POST',
      body: JSON.stringify({ points: batch }),
    });
    if (res?.saved != null) {
      await setQueue(q.slice(batch.length)); // sent points remove
      const rest = await getQueue();
      if (rest.length) { flushing = false; return flush(); } // backlog periya-na continue
    }
  } catch {} // network/403 — queue-la safe-a wait
  finally { flushing = false; }
}

export function startTracking() {
  if (timer) return;
  capture();
  timer = setInterval(capture, TRACK_INTERVAL_MIN * 60 * 1000);
}

export function stopTracking() {
  if (timer) { clearInterval(timer); timer = null; }
  flush(); // last attempt on punch-out
}

export function isTracking() { return !!timer; }