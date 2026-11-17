const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const { ADMIN, BASE_TO_PERM, permissionsForRoles } = require('../lib/permissions');

// A 90-day PIN token must stop working the day an employee is deactivated —
// and must not keep a role the employee no longer has. So every request
// re-reads is_active and the CURRENT role (the role inside the token is only
// what it was at login). Cached briefly so a screen full of images doesn't
// turn into a DB query per <Image>.
const ACTIVE_TTL_MS = 60 * 1000;
const activeCache = new Map(); // userId -> { ok, roles, until }

async function liveUser(userId) {
  const hit = activeCache.get(userId);
  const now = Date.now();
  if (hit && hit.until > now) return hit;
  const u = await prisma.user.findUnique({
    where: { id: userId }, select: { isActive: true, role: { select: { name: true } } },
  });
  const entry = { ok: !!u?.isActive, roles: u?.role ? [u.role.name] : [], until: now + ACTIVE_TTL_MS };
  activeCache.set(userId, entry);
  return entry;
}
const clearUserCache = () => activeCache.clear();

// Shared tail of both guards: active check, live role, permissions.
async function attachUser(req, res, payload, next) {
  try {
    const live = await liveUser(Number(payload.sub));
    if (!live.ok) return res.status(401).json({ message: 'This account has been disabled' });
    req.user = { ...payload, roles: live.roles, perms: await permissionsForRoles(live.roles) };
  } catch (e) {
    console.error('auth check failed:', e);
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
  next();
}

// Returns the verified access-token payload, or null for anything else.
// Special-purpose tokens (refresh, pin-reset) share the signing secret but are
// NOT access tokens — carrying a `type` marks them as such.
function verifyAccessToken(token) {
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.type || !payload.sub) return null;
    return payload; // { sub, username, roles }
  } catch {
    return null;
  }
}

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'No token provided' });

  const payload = verifyAccessToken(token);
  if (!payload) return res.status(401).json({ message: 'Invalid or expired token' });
  return attachUser(req, res, payload, next);
}

// Same gate for /uploads. <img>/<Image> tags cannot send an Authorization
// header, so the file URL may instead carry the access token as ?t=<jwt>
// (clients build these via their fileUrl() helpers).
async function requireAuthFile(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ')
    ? header.slice(7)
    : (typeof req.query.t === 'string' && req.query.t ? req.query.t : null);
  if (!token) return res.status(401).json({ message: 'Sign in to view this file' });

  const payload = verifyAccessToken(token);
  if (!payload) return res.status(401).json({ message: 'Invalid or expired token' });
  return attachUser(req, res, payload, next);
}

/* requireRole('Admin') also admits a non-admin whose role holds the
 * permission for the router this request is in (BASE_TO_PERM, keyed by the
 * mount path). That one rule turns every existing admin guard into a
 * per-area permission check. */
function requireRole(...allowed) {
  return (req, res, next) => {
    const roles = req.user?.roles || [];
    if (roles.some((r) => allowed.includes(r))) return next();
    const perm = allowed.includes(ADMIN) ? BASE_TO_PERM[req.baseUrl] : null;
    if (perm && (req.user?.perms || []).includes(perm)) return next();
    return res.status(403).json({ message: 'Access denied' });
  };
}

// The Admin role itself — for managing roles & permissions, which a
// delegated permission must never be able to widen.
function requireAdminRole(req, res, next) {
  if ((req.user?.roles || []).includes(ADMIN)) return next();
  return res.status(403).json({ message: 'Only an Admin can do this' });
}

module.exports = { requireAuth, requireAuthFile, requireRole, requireAdminRole, clearUserCache };
