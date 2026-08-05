import { getAuth } from './auth';

const API_URL = 'http://54.160.132.104:5000/api';

export async function api(path, options = {}) {
  const auth = await getAuth();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(auth?.accessToken ? { Authorization: `Bearer ${auth.accessToken}` } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
  return data;
}

export async function apiUpload(path, formData) {
  const auth = await getAuth();
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: {
      ...(auth?.accessToken ? { Authorization: `Bearer ${auth.accessToken}` } : {}),
    },
    body: formData, // Content-Type auto (multipart boundary)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
  return data;
}