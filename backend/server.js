const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
// In production the app sits behind Caddy (reverse proxy). Trust the first hop
// so req.ip is the real client IP — required for per-IP rate limiting to work.
app.set('trust proxy', 1);

// CORS. The mobile app sends no Origin header and passes untouched; this only
// gates BROWSERS. With CORS_ORIGINS set (comma-separated exact origins, e.g.
// "https://hr.example.com") only those are allowed — set it in production.
// Unset (development), any localhost/private-LAN origin is allowed so the Vite
// console keeps working from other devices without config.
const envOrigins = (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
const DEV_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/i;
app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true); // native apps, curl, same-origin
    cb(null, envOrigins.length ? envOrigins.includes(origin) : DEV_ORIGIN.test(origin));
  },
}));

// Punch selfies now arrive as multipart (see routes/attendance.js), so plain
// JSON bodies never need more than 1 MB.
// Biometric punch-file imports can be a few MB of text; everything else stays small.
app.use('/api/biometric/import', express.json({ limit: '8mb' }));
app.use(express.json({ limit: '1mb' }));

const path = require('path');
const { requireAuthFile } = require('./middleware/auth');
// Uploaded files (punch selfies, bills, chat media) are private: a valid login
// is required (header or ?t=). The headers stop anything that slipped past an
// upload filter from ever EXECUTING in a browser — files here are bytes, not
// documents.
app.use(
  '/uploads',
  requireAuthFile,
  (req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'");
    next();
  },
  express.static(path.join(__dirname, 'uploads')),
);

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', app: 'SESS RN API', time: new Date().toISOString() });
});

// Audit trail for every change made through the API (see lib/audit.js).
app.use('/api', require('./lib/audit').auditMiddleware);

app.use('/api/auth', require('./routes/auth'));
app.use('/api/me', require('./routes/me'));
app.use('/api/users', require('./routes/users'));
app.use('/api/attendance', require('./routes/attendance'));
app.use('/api/location', require('./routes/location'));
app.use('/api/holidays', require('./routes/holidays'));
app.use('/api/leaves', require('./routes/leaves'));
app.use('/api/ot', require('./routes/ot'));
app.use('/api/compoff', require('./routes/compoff'));
app.use('/api/sites', require('./routes/sites'));
app.use('/api/geo', require('./routes/geo'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/notes', require('./routes/notes'));
app.use('/api/expenses', require('./routes/expenses'));
app.use('/api/shifts', require('./routes/shifts'));
app.use('/api/team', require('./routes/team'));
app.use('/api/payroll', require('./routes/payroll'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/announcements', require('./routes/announcements'));
app.use('/api/helpdesk', require('./routes/helpdesk'));
app.use('/api/assets', require('./routes/assets'));
app.use('/api/documents', require('./routes/documents'));
app.use('/api/exits', require('./routes/exits'));
app.use('/api/roles', require('./routes/roles'));
app.use('/api/branches', require('./routes/branches'));
app.use('/api/audit', require('./routes/audit'));
app.use('/api/biometric', require('./routes/biometric'));
app.use('/api/recruitment', require('./routes/recruitment'));
app.use('/api/training', require('./routes/training'));
app.use('/api/compliance', require('./routes/compliance'));
// Biometric devices (ZKTeco / eSSL ADMS "push") talk plain text to /iclock.
// No user login: only registered device serial numbers are accepted.
app.use('/iclock', require('./routes/iclock'));

const PORT = process.env.PORT || 4000;
app.listen(PORT, '0.0.0.0', () => console.log('API running on http://localhost:' + PORT));
