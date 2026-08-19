const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const router = express.Router();
const ADMIN = 'Admin';

// Admin-only: this exists purely for the web Sites editor. Keeping it gated
// stops employee tokens from burning the shared Nominatim fair-use quota.
router.use(requireAuth, requireRole(ADMIN));

// Geocoding search proxy (OpenStreetMap Nominatim). Proxied server-side so we
// can send a proper User-Agent (browsers can't) and cache results to stay well
// within the free service's fair-use policy.
const cache = new Map(); // q -> { at, results }
const TTL_MS = 10 * 60 * 1000;
const UA = 'SESS-HR-Attendance/1.0 (customer-site geocoding; internal admin tool)';

// GET /api/geo/search?q=text — top matches as { name, displayName, lat, lng }
router.get('/search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 3) return res.json({ results: [] });

    const key = q.toLowerCase();
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) return res.json({ results: hit.results });

    const url =
      'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&countrycodes=in&q=' +
      encodeURIComponent(q);
    const r = await fetch(url, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) return res.status(502).json({ message: 'Location search is unavailable right now' });

    const data = await r.json();
    const results = (Array.isArray(data) ? data : [])
      .map((d) => ({
        name: d.name || String(d.display_name || '').split(',')[0],
        displayName: d.display_name,
        lat: parseFloat(d.lat),
        lng: parseFloat(d.lon),
        type: d.type,
      }))
      .filter((d) => Number.isFinite(d.lat) && Number.isFinite(d.lng));

    cache.set(key, { at: Date.now(), results });
    if (cache.size > 300) cache.delete(cache.keys().next().value); // bound the cache
    res.json({ results });
  } catch (e) {
    if (e.name === 'TimeoutError' || e.name === 'AbortError')
      return res.status(504).json({ message: 'Location search timed out' });
    console.error(e);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
