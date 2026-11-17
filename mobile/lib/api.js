import { getAuth } from './auth';

export const API_URL = 'http://192.168.68.114:4000/api';

// /uploads is authenticated now, but <Image> tags can't send headers — file
// URLs carry the token as ?t= instead. getAuth() is async (SecureStore) while
// render is sync, so the last token seen by api()/apiUpload() is cached here;
// any screen showing uploaded files has always fetched its data first.
let cachedToken = null;
const FILE_BASE = API_URL.replace(/\/api\/?$/, '');

/** Turn a stored path ("uploads/attendance/u1.jpg") into a fetchable URL. */
export function fileUrl(p) {
  if (!p) return null;
  if (/^https?:\/\//i.test(p)) return p;
  const base = `${FILE_BASE}/${String(p).replace(/^\/+/, '')}`;
  return cachedToken ? `${base}?t=${encodeURIComponent(cachedToken)}` : base;
}

export async function api(path, options = {}) {
  const auth = await getAuth();
  cachedToken = auth?.accessToken || cachedToken;

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(auth?.accessToken
        ? { Authorization: `Bearer ${auth.accessToken}` }
        : {}),
      ...(options.headers || {}),
    },
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw httpError(res.status, data.message);
  }

  return data;
}

// A rejected request and a dead network both surface as a thrown Error, so the
// HTTP status rides along: callers that must tell "the server said no" apart
// from "the request never landed" check `e.status` (absent on a fetch failure).
function httpError(status, message) {
  const err = new Error(message || `Request failed (${status})`);
  err.status = status;
  return err;
}

export async function apiUpload(path, formData) {
  const auth = await getAuth();
  cachedToken = auth?.accessToken || cachedToken;

  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: {
      ...(auth?.accessToken
        ? { Authorization: `Bearer ${auth.accessToken}` }
        : {}),
    },
    body: formData,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw httpError(res.status, data.message);
  }

  return data;
}