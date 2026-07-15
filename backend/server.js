const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', app: 'SESS RN API', time: new Date().toISOString() });
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/me', require('./routes/me'));
app.use('/api/users', require('./routes/users'));

const PORT = process.env.PORT || 4000;
app.listen(PORT, '0.0.0.0', () => console.log('API running on http://localhost:' + PORT));
