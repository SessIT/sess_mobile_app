// Notification fan-out: one call writes the in-app inbox row, sends a phone
// push to every registered device, and (for important items) emails people
// who have no device registered.
//
// Push goes through Expo's push service (https://exp.host) — free, no SDK
// needed. Android delivery additionally needs FCM credentials on the EAS
// project; until those exist Expo accepts the push but the phone never gets
// it, while the in-app inbox still works.
//
// notify() NEVER throws and is meant to be called without await from route
// handlers: a notification failure must not fail the request that caused it.
const prisma = require('./prisma');
const { sendMail } = require('./mailer');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const BATCH = 100; // Expo's per-request limit
const isExpoToken = (t) => /^Expo(nent)?PushToken\[.+\]$/.test(String(t || ''));

async function sendPush(messages) {
  for (let i = 0; i < messages.length; i += BATCH) {
    const chunk = messages.slice(i, i + BATCH);
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(chunk),
      });
      const json = await res.json().catch(() => ({}));
      // Tickets come back in order. Drop tokens Expo says are dead.
      const dead = [];
      (json.data || []).forEach((ticket, j) => {
        if (ticket?.status === 'error' && ticket?.details?.error === 'DeviceNotRegistered') dead.push(chunk[j].to);
      });
      if (dead.length) await prisma.pushToken.deleteMany({ where: { token: { in: dead } } });
      if (!res.ok) console.warn('[notify] Expo push HTTP', res.status, JSON.stringify(json).slice(0, 300));
    } catch (e) {
      console.warn('[notify] push failed:', e.message);
    }
  }
}

/**
 * @param {number[]|number} userIds  recipients
 * @param {{ kind, title, body, data?, email? }} n
 *   data  { screen, params } — where tapping should open in the app
 *   email true → also email recipients who have NO push device registered
 */
async function notify(userIds, { kind = 'system', title, body, data = null, email = false }) {
  try {
    const ids = [...new Set([].concat(userIds).map(Number).filter(Number.isInteger))];
    if (!ids.length || !title) return;
    const users = await prisma.user.findMany({
      where: { id: { in: ids }, isActive: true },
      select: { id: true, email: true, fullName: true },
    });
    if (!users.length) return;
    const recipients = users.map((u) => u.id);

    await prisma.notification.createMany({
      data: recipients.map((userId) => ({ userId, kind, title, body: body || '', data })),
    });

    const tokens = (await prisma.pushToken.findMany({ where: { userId: { in: recipients } } }))
      .filter((t) => isExpoToken(t.token));
    const messages = tokens.map((t) => ({
      to: t.token,
      title,
      body: body || '',
      data: { ...(data || {}), kind },
      sound: 'default',
      channelId: 'default',
      priority: 'high',
    }));
    if (messages.length) await sendPush(messages);

    if (email) {
      const withDevice = new Set(tokens.map((t) => t.userId));
      for (const u of users) {
        if (withDevice.has(u.id) || !u.email) continue;
        await sendMail({
          to: u.email,
          subject: title,
          text: `${body || ''}\n\nOpen the SESS app for details.`,
          html: `<div style="font-family:Arial,sans-serif;max-width:480px"><p style="font-size:16px;font-weight:bold">${escapeHtml(title)}</p>`
            + `<p>${escapeHtml(body || '')}</p><p style="color:#6B7280;font-size:13px">Open the SESS app for details.</p></div>`,
        });
      }
    }
  } catch (e) {
    console.error('[notify] failed:', e.message);
  }
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Admins, plus users whose role holds `perm` (e.g. 'leave' for leave requests).
async function adminIds(perm) {
  return require('./permissions').idsWithPermission(perm);
}

module.exports = { notify, adminIds, isExpoToken };
