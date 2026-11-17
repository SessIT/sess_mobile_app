// Biometric punches → attendance sessions.
//
// Devices only know "this PIN was seen at this time" — no in/out. Punches are
// paired per IST day: the first punch opens a session, the next one closes it,
// the next opens another, and so on (same multi-session model as the app).
// Every raw punch is kept in biometric_logs (once per device+PIN+time) so a
// re-sent batch or a re-imported file never double-counts.
const prisma = require('./prisma');
const { shiftForUser, lateLevelOf, isLateLevel } = require('./shifts');
const { lockedMonth } = require('./attendanceLock');

const ymdIST = (d) => new Date(new Date(d).getTime() + 5.5 * 3600000).toISOString().slice(0, 10);
const DOUBLE_TAP_MS = 2 * 60 * 1000;

/** @returns {'processed'|'duplicate'|'unmatched'|'skipped'} */
async function ingestPunch({ deviceSn, pin, time, siteName = null, deviceName = null }) {
  pin = String(pin).trim();
  if (!pin || Number.isNaN(time?.getTime?.())) return 'skipped';
  let log;
  try {
    log = await prisma.biometricLog.create({ data: { deviceSn, pin, punchTime: time, status: 'processed' } });
  } catch (e) {
    if (e.code === 'P2002') return 'duplicate'; // already received
    throw e;
  }
  const mark = (status, note, userId = null) =>
    prisma.biometricLog.update({ where: { id: log.id }, data: { status, note, userId } });

  const user = await prisma.user.findUnique({ where: { biometricId: pin }, select: { id: true, isActive: true } });
  if (!user || !user.isActive) { await mark('unmatched', 'No active employee has this biometric ID'); return 'unmatched'; }

  const ymd = ymdIST(time);
  if (await lockedMonth(ymd)) { await mark('skipped', 'Month is locked for payroll', user.id); return 'skipped'; }

  const start = new Date(`${ymd}T00:00:00+05:30`);
  const end = new Date(start.getTime() + 86400000);
  const sessions = await prisma.attendanceSession.findMany({
    where: { userId: user.id, punchInTime: { gte: start, lt: end } }, orderBy: { punchInTime: 'asc' },
  });
  const near = sessions.some((s) => Math.abs(s.punchInTime - time) < DOUBLE_TAP_MS
    || (s.punchOutTime && Math.abs(s.punchOutTime - time) < DOUBLE_TAP_MS));
  if (near) { await mark('duplicate', 'Within 2 minutes of an earlier punch', user.id); return 'duplicate'; }

  const open = [...sessions].reverse().find((s) => !s.punchOutTime && s.punchInTime < time);
  if (open) {
    await prisma.attendanceSession.update({
      where: { id: open.id },
      data: {
        punchOutTime: time,
        workingHours: Math.round(((time - open.punchInTime) / 3600000) * 100) / 100,
        punchOutAddress: deviceName ? `Biometric · ${deviceName}` : 'Biometric',
      },
    });
    await mark('processed', 'out', user.id);
  } else {
    const shift = await shiftForUser(user.id);
    await prisma.attendanceSession.create({
      data: {
        userId: user.id,
        punchInTime: time,
        isLate: sessions.length === 0 && isLateLevel(lateLevelOf(time, shift)),
        siteName: (siteName || deviceName || 'Biometric').slice(0, 60),
        punchInAddress: deviceName ? `Biometric · ${deviceName}` : 'Biometric',
        source: 'biometric',
      },
    });
    await mark('processed', 'in', user.id);
  }
  return 'processed';
}

// Process many punches oldest-first (pairing depends on order). Returns counts.
async function ingestMany(punches) {
  const counts = { processed: 0, duplicate: 0, unmatched: 0, skipped: 0 };
  const sorted = [...punches].sort((a, b) => a.time - b.time);
  for (const p of sorted) {
    try { counts[await ingestPunch(p)]++; } catch (e) { console.error('[biometric] ingest failed:', e.message); counts.skipped++; }
  }
  return counts;
}

// Device / export timestamps are local (IST) wall-clock times.
// Accepts YYYY-MM-DD HH:MM[:SS], DD-MM-YYYY HH:MM[:SS] or DD/MM/YYYY …
function parseLocalTime(s) {
  const t = String(s || '').trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(t);
  if (!m) {
    const d = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(t);
    if (d) m = [d[0], d[3], d[2].padStart(2, '0'), d[1].padStart(2, '0'), d[4], d[5], d[6]];
  }
  if (!m) return null;
  const iso = `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}T${String(m[4]).padStart(2, '0')}:${m[5]}:${m[6] || '00'}+05:30`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

module.exports = { ingestPunch, ingestMany, parseLocalTime };
