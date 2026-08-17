import { getAuth } from './auth';

export const API_URL = 'http://192.168.68.116:4000/api';

export async function api(path, options = {}) {
  const auth = await getAuth();

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