const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const router = express.Router();

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
 * 1. /check-phone  — is this a registered number? has the user set a PIN?
 * 2. /verify-pin   — normal login: phone + 4-digit PIN -> 90-day session
 * 3. /set-pin      — first-time PIN setup AND "forgot PIN" reset
 * Sessions are unchanged: same issueTokens, same 90-day expiry as before. */

const PIN_RE = /^\d{4}$/;

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

// ===== Step 1: check the mobile number =====
router.post('/check-phone', async (req, res) => {
  try {
    const phone = String(req.body?.phone || '').replace(/\D/g, '');
    if (phone.length !== 10)
      return res.status(400).json({ message: 'Enter a valid 10-digit mobile number' });

    const user = await prisma.user.findFirst({
      where: { phone, isActive: true },
      select: { fullName: true, username: true, pinHash: true },
    });
    if (!user)
      return res.status(404).json({ message: 'Phone not registered. Contact your admin.' });

    res.json({
      ok: true,
      hasPin: !!user.pinHash,
      name: (user.fullName || user.username || '').split(' ')[0],
    });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// ===== Step 2a: login with PIN =====
router.post('/verify-pin', async (req, res) => {
  try {
    const phone = String(req.body?.phone || '').replace(/\D/g, '');
    const pin = String(req.body?.pin || '').trim();
    if (phone.length !== 10 || !PIN_RE.test(pin))
      return res.status(400).json({ message: 'Phone and 4-digit PIN required' });
    if (isLocked(phone))
      return res.status(429).json({ message: 'Too many wrong attempts. Try again after 10 minutes.' });

    const user = await prisma.user.findFirst({
      where: { phone, isActive: true },
      include: { roles: { include: { role: true } } },
    });
    if (!user) return res.status(404).json({ message: 'Phone not registered. Contact your admin.' });
    if (!user.pinHash) return res.status(409).json({ message: 'No PIN set yet. Please create your PIN.' });

    const ok = await bcrypt.compare(pin, user.pinHash);
    if (!ok) {
      recordFail(phone);
      return res.status(401).json({ message: 'Incorrect PIN' });
    }
    pinAttempts.delete(phone);

    const roles = user.roles.map((ur) => ur.role.name);
    res.json(issueTokens(user, roles, EMPLOYEE_TOKEN_DAYS)); // 90-day session (unchanged)
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// ===== Step 2b: set / reset PIN (first-time setup + "forgot PIN") =====
// Stores the new PIN and logs the user straight in.
router.post('/set-pin', async (req, res) => {
  try {
    const phone = String(req.body?.phone || '').replace(/\D/g, '');
    const pin = String(req.body?.pin || '').trim();
    if (phone.length !== 10)
      return res.status(400).json({ message: 'Enter a valid 10-digit mobile number' });
    if (!PIN_RE.test(pin))
      return res.status(400).json({ message: 'PIN must be exactly 4 digits' });

    const user = await prisma.user.findFirst({
      where: { phone, isActive: true },
      include: { roles: { include: { role: true } } },
    });
    if (!user) return res.status(404).json({ message: 'Phone not registered. Contact your admin.' });

    await prisma.user.update({
      where: { id: user.id },
      data: { pinHash: await bcrypt.hash(pin, 10) },
    });
    pinAttempts.delete(phone);

    const roles = user.roles.map((ur) => ur.role.name);
    res.json(issueTokens(user, roles, EMPLOYEE_TOKEN_DAYS)); // 90-day session (unchanged)
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

module.exports = router;
