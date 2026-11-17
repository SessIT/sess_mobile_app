// Audit trail: every POST / PUT / PATCH / DELETE under /api is recorded once
// the response is sent — who (from requireAuth), what (method + path +
// redacted body), outcome (status). Writing never blocks or fails the request.
const prisma = require('./prisma');

// High-volume or personal traffic that would drown the log.
const SKIP = [
  /^\/api\/auth\//, /^\/api\/location/, /^\/api\/chat/, /^\/api\/notifications/,
  /^\/api\/attendance\/punch-(in|out)$/, /\/upload$/, /^\/iclock/,
];
// Never stored, at any depth.
const SECRET = /pass(word)?|pin|otp|token|secret|photoBase64|bankAccount|account|pan(Number)?|aadhaar/i;

function redact(v, depth = 0) {
  if (v == null || depth > 3) return v ?? null;
  if (typeof v === 'string') return v.length > 200 ? `${v.slice(0, 200)}…` : v;
  if (Array.isArray(v)) return v.length > 20 ? [...v.slice(0, 20).map((x) => redact(x, depth + 1)), `…+${v.length - 20}`] : v.map((x) => redact(x, depth + 1));
  if (typeof v === 'object') {
    const out = {};
    for (const [k, val] of Object.entries(v)) out[k] = SECRET.test(k) ? '[redacted]' : redact(val, depth + 1);
    return out;
  }
  return v;
}

function auditMiddleware(req, res, next) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  const path = req.originalUrl.split('?')[0];
  if (SKIP.some((re) => re.test(path))) return next();
  res.on('finish', () => {
    // Only requests that reached a handler with a signed-in user, plus failed
    // attempts on admin areas (403) which are worth seeing too.
    if (!req.user && res.statusCode !== 403) return;
    const parts = path.replace(/^\/api\//, '').split('/');
    const entityId = parts.find((p) => /^\d+$/.test(p)) || null;
    prisma.auditLog.create({
      data: {
        userId: req.user?.sub ?? null,
        userName: req.user?.username ?? null,
        method: req.method,
        path: path.slice(0, 300),
        entity: parts[0] || null,
        entityId,
        status: res.statusCode,
        ip: (req.ip || '').slice(0, 64) || null,
        summary: req.is('application/json') && req.body && Object.keys(req.body).length ? redact(req.body) : undefined,
      },
    }).catch((e) => console.error('[audit] write failed:', e.message));
  });
  next();
}

module.exports = { auditMiddleware, redact };
