import { register } from '../widget-registry.js';
import { escapeHtml } from '../utils.js';

// ISS Tracker — current International Space Station position via the
// wheretheiss.at public API. Pass predictions require orbital propagation,
// which would be a lot of code for this widget — instead we show:
//
//   * Current ISS lat/lon and altitude/velocity
//   * Distance from a user-set location
//   * A simple "overhead now" badge when distance < 1500 km
//
// The API returns ISS state every couple of seconds; we poll every 5 s so
// the position visibly drifts but we don't hammer the endpoint.

const KM_PER_DEG = 111.32;

// Geocode using Open-Meteo (we already have host permission for it)
async function geocode(name) {
  const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=en&format=json`);
  if (!r.ok) throw new Error(`Geocoding failed (${r.status})`);
  const j = await r.json();
  if (!j.results || !j.results.length) throw new Error(`Location not found: ${name}`);
  const g = j.results[0];
  return { name: g.name, country: g.country, lat: g.latitude, lon: g.longitude };
}

function haversineKm(a, b) {
  const toRad = x => x * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(s));
}

function formatLat(lat) {
  if (lat == null) return '—';
  const dir = lat >= 0 ? 'N' : 'S';
  return `${Math.abs(lat).toFixed(2)}° ${dir}`;
}
function formatLon(lon) {
  if (lon == null) return '—';
  const dir = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lon).toFixed(2)}° ${dir}`;
}

register({
  type: 'iss',
  title: 'ISS Tracker',
  icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="10" x2="12" y2="4"/><circle cx="12" cy="3" r="1" fill="currentColor" stroke="none"/><rect x="9" y="10" width="6" height="6" rx="1.2"/><line x1="9" y1="13" x2="7" y2="13"/><rect x="1" y="11.3" width="6" height="3.4" rx="0.6"/><line x1="15" y1="13" x2="17" y2="13"/><rect x="17" y="11.3" width="6" height="3.4" rx="0.6"/></svg>',
  category: 'info',
  defaultSize: { w: 320, h: 280 },
  minSize:     { w: 240, h: 220 },

  defaultData: () => ({
    resolved: null,
    iss: null,        // { lat, lon, altKm, velKmh, ts }
    fetchedAt: 0,
    error: null
  }),

  defaultSettings: () => ({
    location: ''
  }),
  settingsSchema: [
    { key: 'location', type: 'text', label: 'Your location', placeholder: 'e.g. Berlin' }
  ],

  render(body, ctx) {
    const { data, settings } = ctx;
    let cancelled = false;
    ctx.onCleanup(() => { cancelled = true; });

    body.innerHTML = `
      <div class="iss">
        <div class="iss-status"></div>
        <div class="iss-coords">
          <div class="iss-coord"><span class="iss-coord-label">LAT</span><span class="iss-coord-val" data-key="lat"></span></div>
          <div class="iss-coord"><span class="iss-coord-label">LON</span><span class="iss-coord-val" data-key="lon"></span></div>
        </div>
        <div class="iss-stats">
          <div class="iss-stat"><span class="iss-stat-label">Altitude</span><span class="iss-stat-val" data-key="alt"></span></div>
          <div class="iss-stat"><span class="iss-stat-label">Velocity</span><span class="iss-stat-val" data-key="vel"></span></div>
        </div>
        <div class="iss-dist" data-key="dist"></div>
        <div class="iss-meta"></div>
      </div>`;

    const statusEl = body.querySelector('.iss-status');
    const cells = {
      lat:  body.querySelector('[data-key="lat"]'),
      lon:  body.querySelector('[data-key="lon"]'),
      alt:  body.querySelector('[data-key="alt"]'),
      vel:  body.querySelector('[data-key="vel"]'),
      dist: body.querySelector('[data-key="dist"]')
    };
    const metaEl = body.querySelector('.iss-meta');

    function paint() {
      if (data.error && !data.iss) {
        statusEl.textContent = data.error;
        statusEl.classList.add('iss-error');
        return;
      }
      statusEl.classList.remove('iss-error');
      if (!data.iss) {
        statusEl.textContent = 'Locating ISS…';
        return;
      }
      const { lat, lon, altKm, velKmh } = data.iss;
      cells.lat.textContent = formatLat(lat);
      cells.lon.textContent = formatLon(lon);
      cells.alt.textContent = `${Math.round(altKm)} km`;
      cells.vel.textContent = `${Math.round(velKmh).toLocaleString()} km/h`;

      // Distance + overhead-now status
      if (data.resolved) {
        const dist = haversineKm({ lat: data.resolved.lat, lon: data.resolved.lon }, { lat, lon });
        cells.dist.textContent = `${Math.round(dist).toLocaleString()} km from ${data.resolved.name}`;
        cells.dist.classList.toggle('iss-overhead', dist < 1500);
        if (dist < 1500) {
          statusEl.textContent = '🛰️ Overhead now';
          statusEl.classList.add('iss-overhead-now');
        } else {
          statusEl.textContent = 'Live position';
          statusEl.classList.remove('iss-overhead-now');
        }
      } else {
        cells.dist.textContent = '';
        statusEl.textContent = 'Live position';
      }

      const updated = data.fetchedAt
        ? new Date(data.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        : '';
      metaEl.textContent = updated ? `Last update ${updated}` : '';
      ctx.setStale(!!data.error && !!data.iss);
    }

    async function refresh() {
      if (cancelled) return;
      const loc = (settings.location || '').trim();
      try {
        if (loc && (!data.resolved || data.resolved.query !== loc)) {
          const g = await geocode(loc);
          if (cancelled) return;
          data.resolved = { query: loc, ...g };
        } else if (!loc) {
          data.resolved = null;
        }
        const r = await fetch('https://api.wheretheiss.at/v1/satellites/25544');
        if (cancelled) return;
        if (!r.ok) throw new Error(`ISS fetch failed (${r.status})`);
        const j = await r.json();
        data.iss = {
          lat: j.latitude,
          lon: j.longitude,
          altKm: j.altitude,
          velKmh: j.velocity,
          ts: j.timestamp
        };
        data.fetchedAt = Date.now();
        data.error = null;
        ctx.save();
        paint();
      } catch (err) {
        if (cancelled) return;
        data.error = err.message || 'Failed to load';
        paint();
      }
    }

    paint();
    refresh();
    // Poll every 5s — ISS travels ~7.7 km/s, so even 5 s shows visible drift
    const interval = setInterval(refresh, 5000);
    ctx.onCleanup(() => clearInterval(interval));
  }
});
