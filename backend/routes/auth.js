const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const prisma = require('../lib/prisma');
const { sendOtpEmail, maskEmail } = require('../lib/mailer');
const router = express.Router();

/* ---- Per-IP rate limits on the auth surface ----
 * Defence-in-depth on top of the per-phone throttles: blunts password
 * brute-force on /login, phone enumeration on /check-phone, and OTP-request
 * flooding. NOTE: behind a reverse proxy (Caddy in production) the app must set
 * `app.set('trust proxy', 1)` or every request looks like it comes from the
 * proxy IP — see server.js. */
const limiterOpts = { standardHeaders: true, legacyHeaders: false };
const authLimiter = rateLimit({
  ...limiterOpts, windowMs: 15 * 60 * 1000, limit: 40,
  message: { message: 'Too many requests. Please try again in a few minutes.' },
});
// Sending a WhatsApp OTP costs a real message + Meta fee, so the send path gets
// a tighter per-IP cap in addition to the per-phone cooldown/daily limits.
const otpSendLimiter = rateLimit({
  ...limiterOpts, windowMs: 15 * 60 * 1000, limit: 6,
  message: { message: 'Too many code requests. Please try again later.' },
});
router.use(authLimiter);

const EMPLOYEE_TOKEN_DAYS = 90;

function issueTokens(user, roles, days) {
  const accessToken = jwt.sign(
    { sub: user.id, username: user.username, roles },
    process.env.JWT_SECRET, { expiresIn: `${days}d` });
  const refreshToken = jwt.sign(
    { sub: user.id, type: 'refresh' },
    process.env.JWT_SECRET, { expiresIn: `${days * 2}d` });
  return {
    accessToken, refreshToken,
    expiresAt: new Date(Date.now() + days * 24 * 3600 * 1000).toISOString(),
    roles, fullName: user.fullName, phone: user.phone || null,
  };
}

// ===== Password login (admin fallback) =====
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password)
      return res.status(400).json({ message: 'Username and password required' });

    const user = await prisma.user.findFirst({
      where: { username: username.trim(), isActive: true },
      include: { roles: { include: { role: true } } },
    });
    if (!user || !(await bcrypt.compare(password, user.passwordHash)))
      return res.status(401).json({ message: 'Invalid username or password' });

    const roles = user.roles.map((ur) => ur.role.name);
    res.json(issueTokens(user, roles, 1)); // admin password session: 1 day
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

/* ===================== PIN LOGIN (employees) =====================
 * 1. /check-phone  — is this a registered email? has the user set a PIN?
 * 2. /verify-pin   — normal login: email + 4-digit PIN -> 90-day session
 * 3. /request-otp  — email a 6-digit code (first-time setup / forgot PIN)
 * 4. /verify-otp   — code -> short-lived pin-reset token
 * 5. /set-pin      — store the new PIN. REQUIRES the reset token from step 4,
 *                    so knowing someone's email alone can never take over
 *                    their account.
 * Sessions are unchanged: same issueTokens, same 90-day expiry as before. */

const PIN_RE = /^\d{4}$/;

/* Login identifier: EMAIL ONLY. Phone-number login was removed — employees
 * sign in with their registered email address; OTP codes go out by email.
 * Everything downstream (OTP rows, throttles, reset tokens, PIN lookups) is
 * keyed by the normalised email — the otp_codes.phone column holds the email. */
const normIdent = (raw) => {
  const email = String(raw || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? { kind: 'email', value: email } : null;
};
const identWhere = (id) => ({ email: id.value });
const IDENT_MSG = 'Enter a valid email address';

// Brute-force guard: 5 wrong PINs locks the number for 10 minutes.
const pinAttempts = new Map(); // phone -> { fails, lockedUntil }
const isLocked = (phone) => {
  const a = pinAttempts.get(phone);
  return a?.lockedUntil && a.lockedUntil > Date.now();
};
const recordFail = (phone) => {
  const a = pinAttempts.get(phone) || { fails: 0, lockedUntil: 0 };
  a.fails += 1;
  if (a.fails >= 5) { a.fails = 0; a.lockedUntil = Date.now() + 10 * 60 * 1000; }
  pinAttempts.set(phone, a);
};

/* ---------------- Email OTP (guards PIN create/reset) ----------------
 * Codes live in the otp_codes table: bcrypt-hashed, single-use, 5-minute
 * expiry, 5 wrong guesses max. Sending is throttled per email (60s cooldown,
 * 8/day) so the endpoint can't be used to spam an employee's inbox. */
const OTP_TTL_MIN = 5;            // code lifetime
const OTP_MAX_ATTEMPTS = 5;       // wrong guesses per code
const OTP_RESEND_COOLDOWN_S = 60; // min gap between two sends
const OTP_MAX_PER_DAY = 8;        // sends per phone per 24h
const RESET_TOKEN_MIN = 10;       // verify-otp -> set-pin window

// Ties a pin-reset token to the user's PIN state at verify time. Because
// set-pin changes pinHash, a token minted for the old state stops matching
// once the PIN is set — making the reset token effectively single-use with no
// extra storage.
const pinBind = (pinHash) =>
  crypto.createHash('sha256').update(String(pinHash || 'none')).digest('hex').slice(0, 16);

// ===== Request a code: POST /auth/request-otp { identifier } =====
// The 6-digit code is emailed to the registered address.
router.post('/request-otp', otpSendLimiter, async (req, res) => {
  try {
    const ident = normIdent(req.body?.identifier ?? req.body?.phone);
    if (!ident) return res.status(400).json({ message: IDENT_MSG });

    const user = await prisma.user.findFirst({
      where: { ...identWhere(ident), isActive: true },
      select: { id: true, email: true },
    });
    if (!user)
      return res.status(404).json({ message: 'Not registered. Contact your admin.' });

    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    const codeHash = await bcrypt.hash(code, 10);

    // Reserve a send slot ATOMICALLY. A per-phone Postgres advisory lock
    // serialises concurrent /request-otp calls for the same number, so the
    // cooldown + daily-cap checks below cannot be raced by a burst of parallel
    // requests (which would otherwise all pass the read checks and spam the
    // victim's WhatsApp / run up Meta billing). The lock is held only for these
    // fast DB ops — the slow WhatsApp send happens AFTER it is released.
    const gate = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'otp:' + ident.value}))`;
      // Housekeeping: rows older than the 24h throttle window are dead weight.
      await tx.otpCode.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 24 * 3600 * 1000) } } });

      const latest = await tx.otpCode.findFirst({ where: { phone: ident.value }, orderBy: { id: 'desc' } });
      if (latest) {
        const since = (Date.now() - new Date(latest.createdAt).getTime()) / 1000;
        if (since < OTP_RESEND_COOLDOWN_S)
          return { blocked: 'cooldown', wait: Math.ceil(OTP_RESEND_COOLDOWN_S - since) };
      }
      if ((await tx.otpCode.count({ where: { phone: ident.value } })) >= OTP_MAX_PER_DAY)
        return { blocked: 'daily' };

      const row = await tx.otpCode.create({
        data: { phone: ident.value, codeHash, expiresAt: new Date(Date.now() + OTP_TTL_MIN * 60 * 1000) },
      });
      return { rowId: row.id };
    });

    if (gate.blocked === 'cooldown')
      return res.status(429).json({ message: `Please wait ${gate.wait}s before requesting another code`, retryIn: gate.wait });
    if (gate.blocked === 'daily')
      return res.status(429).json({ message: 'Too many codes requested today. Try again later or contact your admin.' });

    // Slot reserved — now actually send. If the send fails, release the slot so
    // a failed attempt doesn't burn the user's cooldown / daily budget.
    const sent = await sendOtpEmail(user.email, code);
    if (!sent.ok) {
      await prisma.otpCode.delete({ where: { id: gate.rowId } }).catch(() => {});
      return res.status(502).json({ message: 'Could not send the email code. Please try again.' });
    }
    res.json({
      ok: true, resendIn: OTP_RESEND_COOLDOWN_S, ttlMin: OTP_TTL_MIN,
      sentTo: maskEmail(user.email),
    });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// ===== Verify it: POST /auth/verify-otp { phone, otp } -> { resetToken } =====
router.post('/verify-otp', async (req, res) => {
  try {
    const ident = normIdent(req.body?.identifier ?? req.body?.phone);
    const otp = String(req.body?.otp || '').trim();
    if (!ident || !/^\d{6}$/.test(otp))
      return res.status(400).json({ message: 'Phone/email and 6-digit code required' });

    const row = await prisma.otpCode.findFirst({ where: { phone: ident.value }, orderBy: { id: 'desc' } });
    if (!row)
      return res.status(400).json({ message: 'No code was requested. Tap "Resend code" first.' });
    if (new Date(row.expiresAt) < new Date()) {
      await prisma.otpCode.delete({ where: { id: row.id } }).catch(() => {});
      return res.status(400).json({ message: 'Code expired. Request a new one.' });
    }
    // Atomically claim one guess: the conditional update only succeeds while
    // attempts < MAX, so a burst of concurrent guesses can't exceed the cap
    // (each UPDATE takes the row lock; at most OTP_MAX_ATTEMPTS ever pass).
    const claim = await prisma.otpCode.updateMany({
      where: { id: row.id, attempts: { lt: OTP_MAX_ATTEMPTS } },
      data: { attempts: { increment: 1 } },
    });
    if (claim.count === 0)
      return res.status(429).json({ message: 'Too many wrong attempts. Request a new code.' });

    const ok = await bcrypt.compare(otp, row.codeHash);
    if (!ok) {
      const left = OTP_MAX_ATTEMPTS - (row.attempts + 1);
      return res.status(401).json({
        message: left > 0 ? `Incorrect code — ${left} attempt(s) left` : 'Incorrect code. Request a new one.',
      });
    }

    // Correct code — burn THIS code only (single-use). We deliberately do NOT
    // delete the phone's other rows: the 24h send-count that powers the daily
    // cap must keep reflecting real sends, so verifying can't replenish it.
    await prisma.otpCode.delete({ where: { id: row.id } }).catch(() => {});

    const user = await prisma.user.findFirst({ where: { ...identWhere(ident), isActive: true }, select: { pinHash: true } });
    if (!user) return res.status(404).json({ message: 'Not registered. Contact your admin.' });
    const resetToken = jwt.sign(
      { phone: ident.value, type: 'pin-reset', bind: pinBind(user.pinHash) },
      process.env.JWT_SECRET, { expiresIn: `${RESET_TOKEN_MIN}m` });
    res.json({ ok: true, resetToken });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// ===== Step 1: check the mobile number / email =====
router.post('/check-phone', async (req, res) => {
  try {
    const ident = normIdent(req.body?.identifier ?? req.body?.phone);
    if (!ident) return res.status(400).json({ message: IDENT_MSG });

    const user = await prisma.user.findFirst({
      where: { ...identWhere(ident), isActive: true },
      select: { fullName: true, username: true, pinHash: true, email: true },
    });
    if (!user)
      return res.status(404).json({ message: 'Not registered. Contact your admin.' });

    res.json({
      ok: true,
      hasPin: !!user.pinHash,
      name: (user.fullName || user.username || '').split(' ')[0],
      // Lets the OTP screen offer "send to email instead" — masked, so the
      // response never leaks the full address for a merely-known phone number.
      emailHint: user.email ? maskEmail(user.email) : null,
    });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// ===== Step 2a: login with PIN =====
router.post('/verify-pin', async (req, res) => {
  try {
    const ident = normIdent(req.body?.identifier ?? req.body?.phone);
    const pin = String(req.body?.pin || '').trim();
    if (!ident || !PIN_RE.test(pin))
      return res.status(400).json({ message: 'Phone/email and 4-digit PIN required' });
    if (isLocked(ident.value))
      return res.status(429).json({ message: 'Too many wrong attempts. Try again after 10 minutes.' });

    const user = await prisma.user.findFirst({
      where: { ...identWhere(ident), isActive: true },
      include: { roles: { include: { role: true } } },
    });
    if (!user) return res.status(404).json({ message: 'Not registered. Contact your admin.' });
    if (!user.pinHash) return res.status(409).json({ message: 'No PIN set yet. Please create your PIN.' });

    const ok = await bcrypt.compare(pin, user.pinHash);
    if (!ok) {
      recordFail(ident.value);
      return res.status(401).json({ message: 'Incorrect PIN' });
    }
    pinAttempts.delete(ident.value);

    const roles = user.roles.map((ur) => ur.role.name);
    res.json(issueTokens(user, roles, EMPLOYEE_TOKEN_DAYS)); // 90-day session (unchanged)
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// ===== Step 2b: set / reset PIN (first-time setup + "forgot PIN") =====
// Requires a pin-reset token from /verify-otp — the WhatsApp OTP proves the
// caller actually holds this phone. Stores the new PIN and logs straight in.
router.post('/set-pin', async (req, res) => {
  try {
    const ident = normIdent(req.body?.identifier ?? req.body?.phone);
    const pin = String(req.body?.pin || '').trim();
    if (!ident) return res.status(400).json({ message: IDENT_MSG });
    if (!PIN_RE.test(pin))
      return res.status(400).json({ message: 'PIN must be exactly 4 digits' });

    // OTP gate: no valid reset token for THIS identifier -> no PIN change. Ever.
    let claim = null;
    try { claim = jwt.verify(String(req.body?.resetToken || ''), process.env.JWT_SECRET); } catch {}
    if (!claim || claim.type !== 'pin-reset' || claim.phone !== ident.value)
      return res.status(401).json({
        message: 'Verification expired. Please verify the code again.',
        code: 'OTP_REQUIRED',
      });

    const user = await prisma.user.findFirst({
      where: { ...identWhere(ident), isActive: true },
      include: { roles: { include: { role: true } } },
    });
    if (!user) return res.status(404).json({ message: 'Not registered. Contact your admin.' });

    // Single-use: the token was bound to the PIN state at verify time. If the
    // PIN has already been set with this token (or otherwise changed), the bind
    // no longer matches and the (possibly captured) token is refused.
    if (claim.bind !== pinBind(user.pinHash))
      return res.status(401).json({
        message: 'Verification expired. Please verify the WhatsApp code again.',
        code: 'OTP_REQUIRED',
      });

    await prisma.user.update({
      where: { id: user.id },
      data: { pinHash: await bcrypt.hash(pin, 10) },
    });
    pinAttempts.delete(ident.value);

    const roles = user.roles.map((ur) => ur.role.name);
    res.json(issueTokens(user, roles, EMPLOYEE_TOKEN_DAYS)); // 90-day session (unchanged)
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

module.exports = router;
