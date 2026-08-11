const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
// In production the app sits behind Caddy (reverse proxy). Trust the first hop
// so req.ip is the real client IP — required for per-IP rate limiting to work.
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const path = require('path');
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', app: 'SESS RN API', time: new Date().toISOString() });
});

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

const PORT = process.env.PORT || 4000;
app.listen(PORT, '0.0.0.0', () => console.log('API running on http://localhost:' + PORT));
