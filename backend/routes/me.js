const express = require('express');
const prisma = require('../lib/prisma');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.sub },
    select: { id: true, username: true, fullName: true, isActive: true, createdAt: true },
  });
  if (!user || !user.isActive) return res.status(401).json({ message: 'User not found' });
  res.json({ ...user, roles: req.user.roles });
});

module.exports = router;