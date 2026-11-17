// ZKTeco / eSSL "ADMS" push protocol (a.k.a. iclock / cloud server mode).
// Configure the device: Comm → Cloud Server Setting → server address = this
// backend's host, port = its port. The device then:
//   GET  /iclock/cdata?SN=…&options=all   handshake (we answer with options)
//   POST /iclock/cdata?SN=…&table=ATTLOG  punches, one per line:
//        PIN \t YYYY-MM-DD HH:MM:SS \t status \t verify …
//   GET  /iclock/getrequest?SN=…          polls for commands (we have none)
// Devices can't log in, so only serial numbers registered in Biometric
// devices are accepted; unknown ones are remembered so the admin can see and
// register them.
const express = require('express');
const prisma = require('../lib/prisma');
const { ingestMany, parseLocalTime } = require('../lib/biometric');
const router = express.Router();

router.use(express.text({ type: '*/*', limit: '2mb' }));

// Serial numbers that knocked but aren't registered (shown on the devices page).
const unknownSeen = new Map(); // sn -> { at, ip }

async function deviceFor(req) {
  const sn = String(req.query.SN || '').trim();
  if (!sn) return null;
  const d = await prisma.biometricDevice.findUnique({ where: { serialNo: sn } });
  if (!d || !d.isActive) {
    unknownSeen.set(sn, { at: new Date(), ip: req.ip });
    return null;
  }
  prisma.biometricDevice.update({ where: { id: d.id }, data: { lastSeenAt: new Date() } }).catch(() => {});
  return d;
}

router.get('/cdata', async (req, res) => {
  const d = await deviceFor(req).catch(() => null);
  res.type('text/plain');
  if (!d) return res.status(403).send('UNKNOWN DEVICE');
  res.send([
    `GET OPTION FROM: ${d.serialNo}`,
    'ATTLOGStamp=None', 'OPERLOGStamp=9999', 'ATTPHOTOStamp=None',
    'ErrorDelay=60', 'Delay=30', 'TransTimes=00:00;14:05', 'TransInterval=1',
    'TransFlag=TransData AttLog', 'Realtime=1', 'Encrypt=None',
  ].join('\n'));
});

router.post('/cdata', async (req, res) => {
  res.type('text/plain');
  try {
    const d = await deviceFor(req);
    if (!d) return res.status(403).send('UNKNOWN DEVICE');
    if (String(req.query.table || '').toUpperCase() !== 'ATTLOG') return res.send('OK'); // OPERLOG etc.
    const lines = String(req.body || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const punches = [];
    for (const line of lines) {
      const f = line.split('\t');
      const time = parseLocalTime(f[1]);
      if (f[0] && time) punches.push({ deviceSn: d.serialNo, pin: f[0], time, siteName: d.siteName, deviceName: d.name });
    }
    await ingestMany(punches);
    res.send(`OK: ${lines.length}`);
  } catch (e) {
    console.error('[iclock] cdata failed:', e);
    res.status(500).send('ERROR');
  }
});

router.get('/getrequest', async (req, res) => {
  await deviceFor(req).catch(() => null);
  res.type('text/plain').send('OK');
});
router.post('/devicecmd', (req, res) => res.type('text/plain').send('OK'));

module.exports = router;
module.exports.unknownSeen = unknownSeen;
