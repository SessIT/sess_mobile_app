// Central API client for the admin console.
// Mirrors mobile/lib/api.js but stores auth in localStorage (web) instead of SecureStore.

// Resolve the backend base URL.
//
//  - If VITE_API_URL is set to a real (non-localhost) URL — e.g. a deployed
//    backend — that wins.
//  - Otherwise we talk to the backend on the SAME host the page was opened from,
//    port 4000. This is what makes the console reachable from other devices on
//    the LAN: open http://192.168.68.104:5173 and the API is called at
//    http://192.168.68.104:4000 automatically. Using a hard-coded "localhost"
//    would break here, because on a phone/other PC "localhost" means that
//    device — not the server running the backend.
function resolveApiUrl() {
  // An explicit, non-localhost override (e.g. a deployed backend) always wins.
  const env = import.meta.env.VITE_API_URL;
  const isLocalEnv = env && /^https?:\/\/(localhost|127\.0\.0\.1)/i.test(env);
  if (env && !isLocalEnv) return env;

  // Dev: use a relative path. Requests go to the same origin that served the
  // page (e.g. 192.168.68.104:5173) and Vite proxies /api + /uploads to the
  // backend. This is what makes the console work from other devices on the LAN
  // without exposing port 4000 through the firewall.
  if (import.meta.env.DEV) return '/api';

  // Production build with no proxy: reach the backend on the same host, :4000.
  if (typeof window !== 'undefined' && window.location?.hostname) {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:4000/api`;
  }
  return 'http://localhost:4000/api';
}

export const API_URL = resolveApiUrl();

// Backend origin without the trailing /api — used to build absolute URLs for
// uploaded files (punch photos live under `${origin}/uploads/...`).
export const FILE_BASE = API_URL.replace(/\/api\/?$/, '');

export const STORAGE_KEY = 'sess_admin_auth';

export function getStoredAuth() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  } catch {
    return null;
  }
}

export function setStoredAuth(auth) {
  if (auth) localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
  else localStorage.removeItem(STORAGE_KEY);
}

/** Turn a stored file path (e.g. "uploads/attendance/u1_123.jpg") into an absolute URL. */
export function fileUrl(p) {
  if (!p) return null;
  if (/^https?:\/\//i.test(p)) return p;
  return `${FILE_BASE}/${String(p).replace(/^\/+/, '')}`;
}

/**
 * Fetch wrapper. Attaches the bearer token, parses JSON, throws on !ok.
 * On 401 it clears the session and bounces to /login.
 */
export async function api(path, options = {}) {
  const auth = getStoredAuth();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(auth?.accessToken ? { Authorization: `Bearer ${auth.accessToken}` } : {}),
      ...(options.headers || {}),
    },
  });

  const data = await res.json().catch(() => ({}));

  if (res.status === 401) {
    setStoredAuth(null);
    if (!location.pathname.startsWith('/login')) {
      location.href = '/login';
    }
    throw new Error(data.message || 'Session expired. Please sign in again.');
  }

  if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
  return data;
}

// Convenience helpers
export const apiGet = (path) => api(path);
export const apiPost = (path, body) => api(path, { method: 'POST', body: JSON.stringify(body) });
export const apiPatch = (path, body) => api(path, { method: 'PATCH', body: JSON.stringify(body) });
