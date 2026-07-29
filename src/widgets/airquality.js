import { register } from '../widget-registry.js';
import { escapeHtml } from '../utils.js';

// Air Quality — Open-Meteo's air-quality endpoint at
// `air-quality-api.open-meteo.com`. Returns particulates (PM2.5, PM10),
// NO2, O3, plus the US AQI computed from the same dataset.
//
// Banding follows the US EPA standard (0-50 Good, 51-100 Moderate, …).

function bandFor(aqi) {
  if (aqi == null || isNaN(aqi)) return { id: 'unknown', label: '—', color: '#94a3b8' };
  if (aqi <= 50)  return { id: 'good',         label: 'Good',                            color: '#22c55e' };
  if (aqi <= 100) return { id: 'moderate',     label: 'Moderate',                        color: '#eab308' };
  if (aqi <= 150) return { id: 'usg',          label: 'Unhealthy for Sensitive Groups',  color: '#f97316' };
  if (aqi <= 200) return { id: 'unhealthy',    label: 'Unhealthy',                       color: '#ef4444' };
  if (aqi <= 300) return { id: 'veryUnhealthy',label: 'Very Unhealthy',                  color: '#a855f7' };
  return                  { id: 'hazardous',   label: 'Hazardous',                       color: '#7f1d1d' };
}

function num(v, dp = 0) {
  if (v == null || isNaN(v)) return '—';
  return Number(v).toFixed(dp);
}

function formatAge(ms) {
  if (!ms) return '';
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60)   return `Updated ${s}s ago`;
  if (s < 3600) return `Updated ${Math.round(s / 60)}m ago`;
  return `Updated ${Math.round(s / 3600)}h ago`;
}

register({
  type: 'airquality',
  title: 'Air Quality',
  icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9.6 4.6A2 2 0 1 1 11 8H2"/><path d="M12.6 19.4A2 2 0 1 0 14 16H2"/><path d="M17.7 7.7A2.5 2.5 0 1 1 19.5 12H2"/></svg>',
  category: 'info',
  defaultSize: { w: 320, h: 260 },
  minSize:     { w: 240, h: 200 },

  defaultData: () => ({
    resolved: null,
    payload: null,
    fetchedAt: 0,
    error: null
  }),

  defaultSettings: () => ({
    location: ''
  }),
  settingsSchema: [
    { key: 'location', type: 'text', label: 'Location', placeholder: 'e.g. Berlin' }
  ],

  render(body, ctx) {
    const { data, settings } = ctx;
    let cancelled = false;
    ctx.onCleanup(() => { cancelled = true; });

    body.innerHTML = `
      <div class="aq">
        <div class="aq-loc"></div>
        <div class="aq-hero">
          <div class="aq-aqi"></div>
          <div class="aq-band"></div>
        </div>
        <div class="aq-grid">
          <div class="aq-cell"><span class="aq-cell-label">PM2.5</span><span class="aq-cell-val" data-key="pm25"></span><span class="aq-cell-unit">µg/m³</span></div>
          <div class="aq-cell"><span class="aq-cell-label">PM10</span><span class="aq-cell-val" data-key="pm10"></span><span class="aq-cell-unit">µg/m³</span></div>
          <div class="aq-cell"><span class="aq-cell-label">NO₂</span><span class="aq-cell-val" data-key="no2"></span><span class="aq-cell-unit">µg/m³</span></div>
          <div class="aq-cell"><span class="aq-cell-label">O₃</span><span class="aq-cell-val" data-key="o3"></span><span class="aq-cell-unit">µg/m³</span></div>
        </div>
        <div class="aq-updated"></div>
      </div>`;

    const locEl  = body.querySelector('.aq-loc');
    const aqiEl  = body.querySelector('.aq-aqi');
    const bandEl = body.querySelector('.aq-band');
    const heroEl = body.querySelector('.aq-hero');
    const upEl   = body.querySelector('.aq-updated');
    const cells = {
      pm25: body.querySelector('[data-key="pm25"]'),
      pm10: body.querySelector('[data-key="pm10"]'),
      no2:  body.querySelector('[data-key="no2"]'),
      o3:   body.querySelector('[data-key="o3"]')
    };

    function paint() {
      const loc = (settings.location || '').trim();
      if (!loc) {
        locEl.textContent = 'Set a location in settings';
        aqiEl.textContent = '—';
        bandEl.textContent = '';
        Object.values(cells).forEach(c => c.textContent = '—');
        upEl.textContent = '';
        return;
      }
      locEl.textContent = data.resolved
        ? `${data.resolved.name}${data.resolved.country ? `, ${data.resolved.country}` : ''}`
        : loc;
      if (data.error && !data.payload) {
        aqiEl.textContent = '—';
        bandEl.textContent = data.error;
        bandEl.classList.add('aq-error');
        return;
      }
      bandEl.classList.remove('aq-error');
      if (!data.payload) {
        aqiEl.textContent = '…';
        bandEl.textContent = 'Loading…';
        return;
      }
      const cur = data.payload.current || {};
      const aqi = cur.us_aqi;
      const band = bandFor(aqi);
      aqiEl.textContent = (aqi == null || isNaN(aqi)) ? '—' : Math.round(aqi);
      bandEl.textContent = band.label;
      heroEl.style.setProperty('--aq-band', band.color);
      cells.pm25.textContent = num(cur.pm2_5, 1);
      cells.pm10.textContent = num(cur.pm10,  1);
      cells.no2 .textContent = num(cur.nitrogen_dioxide, 1);
      cells.o3  .textContent = num(cur.ozone, 0);
      upEl.textContent = data.fetchedAt ? formatAge(data.fetchedAt) : '';
      ctx.setStale(!!data.error && !!data.payload);
    }

    async function refresh() {
      if (cancelled) return;
      const loc = (settings.location || '').trim();
      if (!loc) { paint(); return; }
      try {
        if (!data.resolved || data.resolved.query !== loc) {
          const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(loc)}&count=1&language=en&format=json`);
          if (cancelled) return;
          if (!r.ok) throw new Error(`Geocoding failed (${r.status})`);
          const j = await r.json();
          if (!j.results || !j.results.length) throw new Error(`Location not found: ${loc}`);
          const g = j.results[0];
          data.resolved = { query: loc, name: g.name, country: g.country, lat: g.latitude, lon: g.longitude };
          data.payload = null;
        }
        const stale = !data.payload || (Date.now() - data.fetchedAt) > 30 * 60_000;
        if (stale) {
          const { lat, lon } = data.resolved;
          const u = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=pm2_5,pm10,nitrogen_dioxide,ozone,us_aqi&timezone=auto`;
          const r = await fetch(u);
          if (cancelled) return;
          if (!r.ok) throw new Error(`AQ fetch failed (${r.status})`);
          const j = await r.json();
          data.payload = j;
          data.fetchedAt = Date.now();
          data.error = null;
        }
        ctx.save();
        paint();
      } catch (err) {
        if (cancelled) return;
        data.error = err.message || 'Failed to load';
        paint();
        ctx.save();
      }
    }

    paint();
    const debounce = setTimeout(refresh, 400);
    ctx.onCleanup(() => clearTimeout(debounce));
    const interval = setInterval(refresh, 30 * 60_000);
    ctx.onCleanup(() => clearInterval(interval));
    // Refresh "updated Xm ago" without re-fetching
    const ageInterval = setInterval(() => {
      if (data.fetchedAt) upEl.textContent = formatAge(data.fetchedAt);
    }, 30_000);
    ctx.onCleanup(() => clearInterval(ageInterval));
  }
});
