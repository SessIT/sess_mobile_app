// Dashboard widgets, now hosted on the Profile menu (My Profile hub).
// Each one loads its own data and fails silently so the host screen is never
// blocked by a slow or failing call.
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { api } from '../lib/api';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const todayYMD = () => new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);

/* Next upcoming holiday — taps through to the full Holidays screen. */
export function HolidayWidget({ navigation }) {
  const [next, setNext] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await api('/holidays/upcoming?limit=1');
        if (alive) setNext(res.holidays?.[0] || null);
      } catch {
        if (alive) setNext(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const d = next ? new Date(next.date) : null;
  const until = d
    ? Math.round((new Date(d.toISOString().slice(0, 10) + 'T00:00:00Z') - new Date(todayYMD() + 'T00:00:00Z')) / 86400000)
    : null;
  const away = until === 0 ? 'Today' : until === 1 ? 'Tomorrow' : `in ${until} days`;

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={() => navigation.navigate('Holidays')}>
      <LinearGradient
        colors={['#4F46E5', '#4338CA']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.widget}
      >
        <View style={styles.widgetIcon}>
          <MaterialIcons name="celebration" size={24} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.widgetLabel}>NEXT HOLIDAY</Text>
          {loading ? (
            <Text style={styles.widgetName}>Loading…</Text>
          ) : next ? (
            <>
              <Text style={styles.widgetName} numberOfLines={1}>{next.name}</Text>
              <Text style={styles.widgetSub}>
                {d.getUTCDate()} {MONTHS[d.getUTCMonth()]} {d.getUTCFullYear()} · {away}
              </Text>
            </>
          ) : (
            <Text style={styles.widgetName}>No upcoming holidays</Text>
          )}
        </View>
        <MaterialIcons name="chevron-right" size={26} color="rgba(255,255,255,0.85)" />
      </LinearGradient>
    </TouchableOpacity>
  );
}

/* Upcoming birthdays & work anniversaries (next 30 days) — horizontal strip.
 * Hides itself entirely when there is nothing coming up or the call fails. */
export function CelebrationsWidget({ navigation }) {
  const [events, setEvents] = useState(null);

  useEffect(() => {
    let alive = true;
    api('/reports/upcoming?days=30')
      .then((r) => { if (alive) setEvents(r.events || []); })
      .catch(() => { if (alive) setEvents([]); });
    return () => { alive = false; };
  }, []);

  if (!events || events.length === 0) return null;

  const initials = (n) => (n || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const when = (d) => (d === 0 ? '🎉 TODAY' : d === 1 ? 'Tomorrow' : `in ${d} days`);
  const prettyDay = (ymd) => `${Number(ymd.slice(8, 10))} ${MONTHS[Number(ymd.slice(5, 7)) - 1]}`;

  return (
    <View style={{ marginBottom: 6 }}>
      <View style={styles.celebHead}>
        <View style={styles.celebHeadIcon}>
          <MaterialIcons name="auto-awesome" size={13} color="#D97706" />
        </View>
        <Text style={styles.celebTitle}>CELEBRATIONS</Text>
        <View style={styles.celebCount}><Text style={styles.celebCountText}>{events.length}</Text></View>
        <Text style={styles.celebSub}>next 30 days</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 6 }}>
        {events.map((e) => {
          const isToday = e.daysUntil === 0;
          const bday = e.type === 'birthday';
          const wish = bday
            ? 'Happy Birthday! 🎂🎉 Wishing you a fantastic year ahead!'
            : `Congratulations on ${e.years} wonderful year${e.years === 1 ? '' : 's'} with SESS! 🏆🎉`;
          return (
            <TouchableOpacity
              key={`${e.type}-${e.id}`}
              activeOpacity={0.85}
              // Tap a celebration -> open chat with a ready-made wish.
              onPress={() => navigation.navigate('Chat', {
                user: { id: e.id, fullName: e.fullName, username: e.username },
                prefill: wish,
              })}
            >
              <LinearGradient
                colors={isToday ? ['#F59E0B', '#D97706'] : bday ? ['#7C3AED', '#5B21B6'] : ['#1E40AF', '#312E81']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={[styles.celebCard, isToday && styles.celebCardToday]}
              >
                <View style={styles.celebDeco} />
                <View style={[styles.celebDeco, { width: 46, height: 46, top: undefined, bottom: -18, right: undefined, left: -14, opacity: 0.7 }]} />

                <View style={styles.celebTopRow}>
                  <View style={styles.celebAvatarWrap}>
                    <View style={styles.celebAvatar}>
                      <Text style={styles.celebAvatarText}>{initials(e.fullName || e.username)}</Text>
                    </View>
                    <View style={styles.celebEmoji}>
                      <Text style={{ fontSize: 12 }}>{bday ? '🎂' : '🏆'}</Text>
                    </View>
                  </View>
                  <View style={styles.celebDate}>
                    <Text style={styles.celebDateDay}>{prettyDay(e.date).split(' ')[0]}</Text>
                    <Text style={styles.celebDateMon}>{prettyDay(e.date).split(' ')[1]}</Text>
                  </View>
                </View>

                <Text style={styles.celebName} numberOfLines={1}>{e.fullName || e.username}</Text>
                <Text style={styles.celebType} numberOfLines={1}>
                  {bday ? 'Birthday' : `${e.years} yr${e.years === 1 ? '' : 's'} with SESS`}
                  {e.designation ? ` · ${e.designation}` : ''}
                </Text>

                <View style={styles.celebFootRow}>
                  <View style={[styles.celebPill, isToday && styles.celebPillToday]}>
                    <Text style={[styles.celebPillText, isToday && { color: '#92400E' }]}>{when(e.daysUntil)}</Text>
                  </View>
                  <View style={styles.celebWishHint}>
                    <MaterialIcons name="chat" size={11} color="rgba(255,255,255,0.95)" />
                    <Text style={styles.celebWishText}>Wish</Text>
                  </View>
                </View>
              </LinearGradient>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  widget: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderRadius: 18, padding: 16, marginBottom: 18,
    elevation: 3, shadowColor: '#312E81', shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 5 },
  },
  widgetIcon: {
    width: 46, height: 46, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center', alignItems: 'center',
  },
  widgetLabel: { color: '#C7D2FE', fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  widgetName: { color: '#fff', fontSize: 16, fontWeight: '800', marginTop: 3 },
  widgetSub: { color: '#E0E7FF', fontSize: 12, fontWeight: '600', marginTop: 2 },

  /* Celebrations strip */
  celebHead: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 10, marginTop: 4 },
  celebHeadIcon: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#FEF3C7', justifyContent: 'center', alignItems: 'center' },
  celebTitle: { fontSize: 11, fontWeight: '800', color: '#374151', letterSpacing: 0.9 },
  celebCount: { minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#4F46E5', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 5 },
  celebCountText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  celebSub: { fontSize: 10.5, color: '#9CA3AF', fontWeight: '600', marginLeft: 'auto' },

  celebCard: { width: 156, borderRadius: 20, padding: 13, overflow: 'hidden', elevation: 4, shadowColor: '#1E3A8A', shadowOpacity: 0.2, shadowRadius: 9, shadowOffset: { width: 0, height: 5 } },
  celebCardToday: { borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.55)', shadowColor: '#F59E0B', shadowOpacity: 0.4 },
  celebDeco: { position: 'absolute', width: 96, height: 96, borderRadius: 48, backgroundColor: 'rgba(255,255,255,0.10)', top: -38, right: -32 },
  celebTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 9 },
  celebAvatarWrap: { alignSelf: 'flex-start' },
  celebAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.22)', justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.4)' },
  celebAvatarText: { color: '#fff', fontSize: 14.5, fontWeight: '800' },
  celebEmoji: { position: 'absolute', bottom: -4, right: -7, width: 23, height: 23, borderRadius: 12, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', elevation: 2 },
  celebDate: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4, minWidth: 38 },
  celebDateDay: { color: '#fff', fontSize: 15, fontWeight: '900', lineHeight: 17 },
  celebDateMon: { color: 'rgba(255,255,255,0.85)', fontSize: 9, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  celebName: { color: '#fff', fontSize: 14, fontWeight: '800' },
  celebType: { color: 'rgba(255,255,255,0.85)', fontSize: 10.5, fontWeight: '700', marginTop: 2 },
  celebFootRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  celebPill: { backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3.5 },
  celebPillToday: { backgroundColor: '#FDE68A' },
  celebPillText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  celebWishHint: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  celebWishText: { color: 'rgba(255,255,255,0.95)', fontSize: 9.5, fontWeight: '800', letterSpacing: 0.3 },
});
