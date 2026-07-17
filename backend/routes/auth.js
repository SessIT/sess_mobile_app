const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
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

// ===== Step 1: request OTP =====
router.post('/request-otp', async (req, res) => {
  try {
    const phone = String(req.body?.phone || '').replace(/\D/g, '');
    if (phone.length !== 10)
      return res.status(400).json({ message: 'Enter a valid 10-digit phone number' });

    const user = await prisma.user.findFirst({ where: { phone, isActive: true } });
    if (!user)
      return res.status(404).json({ message: 'Phone not registered. Contact your admin.' });

    const otp = String(crypto.randomInt(100000, 999999));
    await prisma.otpCode.deleteMany({ where: { phone } });
    await prisma.otpCode.create({
      data: {
        phone,
        codeHash: await bcrypt.hash(otp, 8),
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });

    // DEV MODE: console + response. PRODUCTION: replace with SMS provider (MSG91/Fast2SMS)
    console.log(`\n?OTP for ${phone}: ${otp}\n`);
    res.json({ message: 'OTP sent', devOtp: otp }); // remove devOtp in production!
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// ===== Step 2: verify OTP =====
router.post('/verify-otp', async (req, res) => {
  try {
    const phone = String(req.body?.phone || '').replace(/\D/g, '');
    const otp = String(req.body?.otp || '').trim();
    if (phone.length !== 10 || otp.length !== 6)
      return res.status(400).json({ message: 'Phone and 6-digit OTP required' });

    const row = await prisma.otpCode.findFirst({
      where: { phone }, orderBy: { createdAt: 'desc' },
    });
    if (!row || row.expiresAt < new Date())
      return res.status(401).json({ message: 'OTP expired. Request a new one.' });
    if (row.attempts >= 5)
      return res.status(429).json({ message: 'Too many attempts. Request a new OTP.' });

    const ok = await bcrypt.compare(otp, row.codeHash);
    if (!ok) {
      await prisma.otpCode.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
      return res.status(401).json({ message: 'Incorrect OTP' });
    }

    await prisma.otpCode.deleteMany({ where: { phone } });
    const user = await prisma.user.findFirst({
      where: { phone, isActive: true },
      include: { roles: { include: { role: true } } },
    });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const roles = user.roles.map((ur) => ur.role.name);
    res.json(issueTokens(user, roles, EMPLOYEE_TOKEN_DAYS)); // 90-day session
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

module.exports = router;
