import { register } from '../widget-registry.js';
import { escapeHtml } from '../utils.js';

// Sunset Countdown — geocodes a place name to coordinates (Open-Meteo
// geocoder), then pulls today's + tomorrow's sunrise/sunset from the
// forecast endpoint. Renders the time-until-next-sunset, and when the sun
// is already down for today, rolls forward to tomorrow's sunset
// automatically.

function formatRemaining(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(sec).padStart(2, '0')}s`;
  return `${sec}s`;
}

function formatTime(d) {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

register({
  type: 'sunset',
  title: 'Sunset Countdown',
  icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 18a6 6 0 0 1 12 0"/><line x1="2" y1="18" x2="22" y2="18"/><line x1="12" y1="6" x2="12" y2="8.5"/><line x1="5.5" y1="10.5" x2="7.2" y2="12.2"/><line x1="18.5" y1="10.5" x2="16.8" y2="12.2"/></svg>',
  category: 'time',
  defaultSize: { w: 280, h: 220 },
  minSize:     { w: 220, h: 160 },

  defaultData: () => ({
    resolved: null,
    times: null,   // { today: {sunrise, sunset}, tomorrow: {sunrise, sunset} }
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
      <div class="sunset">
        <div class="sunset-loc"></div>
        <div class="sunset-count"></div>
        <div class="sunset-when"></div>
        <div class="sunset-rise"></div>
      </div>`;

    const locEl   = body.querySelector('.sunset-loc');
    const countEl = body.querySelector('.sunset-count');
    const whenEl  = body.querySelector('.sunset-when');
    const riseEl  = body.querySelector('.sunset-rise');

    function paint() {
      const loc = (settings.location || '').trim();
      if (!loc) {
        locEl.textContent = 'Set a location in settings';
        countEl.textContent = '—';
        whenEl.textContent = '';
        riseEl.textContent = '';
        return;
      }
      if (data.error && !data.times) {
        locEl.textContent = data.resolved?.name || loc;
        countEl.textContent = '—';
        whenEl.textContent = data.error;
        whenEl.classList.add('sunset-error');
        riseEl.textContent = '';
        return;
      }
      whenEl.classList.remove('sunset-error');
      if (!data.times) {
        locEl.textContent = loc;
        countEl.textContent = '…';
        whenEl.textContent = 'Loading…';
        riseEl.textContent = '';
        return;
      }
      locEl.textContent = data.resolved
        ? `${data.resolved.name}${data.resolved.country ? `, ${data.resolved.country}` : ''}`
        : loc;

      const now = Date.now();
      // Pick today's sunset if still in the future, otherwise tomorrow's.
      const todaySS    = data.times.today.sunset    ? new Date(data.times.today.sunset).getTime()    : 0;
      const tomorrowSS = data.times.tomorrow.sunset ? new Date(data.times.tomorrow.sunset).getTime() : 0;
      const tomorrowSR = data.times.tomorrow.sunrise ? new Date(data.times.tomorrow.sunrise).getTime() : 0;
      let nextSS = todaySS > now ? todaySS : tomorrowSS;
      let nextLabel = todaySS > now ? 'today' : 'tomorrow';

      if (!nextSS) {
        countEl.textContent = '—';
        whenEl.textContent = 'No sunset data';
        return;
      }
      const remaining = nextSS - now;
      countEl.textContent = formatRemaining(remaining);
      whenEl.textContent = `Sunset ${nextLabel} at ${formatTime(new Date(nextSS))}`;

      // Show next sunrise as supporting info
      if (tomorrowSR > now) {
        riseEl.textContent = `Next sunrise ${formatTime(new Date(tomorrowSR))}`;
      } else if (data.times.today.sunrise) {
        const tsR = new Date(data.times.today.sunrise).getTime();
        riseEl.textContent = `Sunrise today was ${formatTime(new Date(tsR))}`;
      } else {
        riseEl.textContent = '';
      }
      ctx.setStale(!!data.error && !!data.times);
    }

    async function refresh() {
      if (cancelled) return;
      const loc = (settings.location || '').trim();
      if (!loc) { paint(); return; }
      try {
        // Geocode only when the location string changed
        if (!data.resolved || data.resolved.query !== loc) {
          const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(loc)}&count=1&language=en&format=json`);
          if (cancelled) return;
          if (!r.ok) throw new Error(`Geocoding failed (${r.status})`);
          const j = await r.json();
          if (!j.results || !j.results.length) throw new Error(`Location not found: ${loc}`);
          const g = j.results[0];
          data.resolved = { query: loc, name: g.name, country: g.country, lat: g.latitude, lon: g.longitude };
          data.times = null;
        }
        // Fetch (or refetch when stale > 6h)
        const stale = !data.times || (Date.now() - data.fetchedAt) > 6 * 3_600_000;
        if (stale) {
          const { lat, lon } = data.resolved;
          const u = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=sunrise,sunset&forecast_days=2&timezone=auto`;
          const r = await fetch(u);
          if (cancelled) return;
          if (!r.ok) throw new Error(`Sunset fetch failed (${r.status})`);
          const j = await r.json();
          const sr = j.daily?.sunrise || [];
          const ss = j.daily?.sunset  || [];
          data.times = {
            today:    { sunrise: sr[0], sunset: ss[0] },
            tomorrow: { sunrise: sr[1], sunset: ss[1] }
          };
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
    // Re-render the countdown every second, but only re-fetch once an hour
    const tick = setInterval(paint, 1000);
    const refetch = setInterval(refresh, 60 * 60 * 1000);
    ctx.onCleanup(() => { clearInterval(tick); clearInterval(refetch); });
  }
});
