// Create (or reset) an Admin login for the web console — needed once on a fresh
// database, which has no users at all.
//
//   npm run create-admin -- <username> <password> ["Full Name"] [email]
//
// Running it again for an existing username resets that user's password and
// makes sure they are an active Admin.
require('dotenv').config();
const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');

(async () => {
  const [username, password, fullName, email] = process.argv.slice(2);
  if (!username || !password) {
    console.log('Usage: npm run create-admin -- <username> <password> ["Full Name"] [email]');
    process.exit(1);
  }
  if (password.length < 8) {
    console.log('Use a password of at least 8 characters.');
    process.exit(1);
  }
  const role = await prisma.role.upsert({ where: { name: 'Admin' }, update: {}, create: { name: 'Admin' } });
  const data = {
    passwordHash: await bcrypt.hash(password, 10),
    roleId: role.id,
    isActive: true,
    ...(fullName ? { fullName } : {}),
    ...(email ? { email: email.toLowerCase() } : {}),
  };
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    await prisma.user.update({ where: { id: existing.id }, data });
    console.log(`Admin "${username}" updated (password reset, Admin role, active).`);
  } else {
    await prisma.user.create({ data: { username, fullName: fullName || username, ...data } });
    console.log(`Admin "${username}" created. Sign in to the web console with this username and password.`);
  }
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error('Could not create the admin:', e.message);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
