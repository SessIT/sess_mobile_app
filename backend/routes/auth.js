const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const router = express.Router();

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
    const accessToken = jwt.sign(
      { sub: user.id, username: user.username, roles },
      process.env.JWT_SECRET, { expiresIn: '12h' });
    const refreshToken = jwt.sign(
      { sub: user.id, type: 'refresh' },
      process.env.JWT_SECRET, { expiresIn: '30d' });

    res.json({
      accessToken, refreshToken,
      expiresAt: new Date(Date.now() + 12 * 3600 * 1000).toISOString(),
      roles, fullName: user.fullName,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
