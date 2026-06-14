import { register } from '../widget-registry.js';
import { escapeHtml } from '../utils.js';

// WMO weather code mapping (label + emoji). Mirrors the base weather widget.
const weatherInfo = {
  0:  { label: 'Clear',                emoji: '☀️', emojiNight: '🌙' },
  1:  { label: 'Mainly clear',         emoji: '🌤️', emojiNight: '🌙' },
  2:  { label: 'Partly cloudy',        emoji: '⛅' },
  3:  { label: 'Overcast',             emoji: '☁️' },
  45: { label: 'Fog',                  emoji: '🌫️' },
  48: { label: 'Rime fog',             emoji: '🌫️' },
  51: { label: 'Light drizzle',        emoji: '🌦️' },
  53: { label: 'Drizzle',              emoji: '🌦️' },
  55: { label: 'Heavy drizzle',        emoji: '🌧️' },
  56: { label: 'Freezing drizzle',     emoji: '🌧️' },
  57: { label: 'Freezing drizzle',     emoji: '🌧️' },
  61: { label: 'Light rain',           emoji: '🌦️' },
  63: { label: 'Rain',                 emoji: '🌧️' },
  65: { label: 'Heavy rain',           emoji: '🌧️' },
  66: { label: 'Freezing rain',        emoji: '🌧️' },
  67: { label: 'Freezing rain',        emoji: '🌧️' },
  71: { label: 'Light snow',           emoji: '🌨️' },
  73: { label: 'Snow',                 emoji: '🌨️' },
  75: { label: 'Heavy snow',           emoji: '❄️' },
  77: { label: 'Snow grains',          emoji: '❄️' },
  80: { label: 'Light showers',        emoji: '🌦️' },
  81: { label: 'Showers',              emoji: '🌧️' },
  82: { label: 'Heavy showers',        emoji: '🌧️' },
  85: { label: 'Snow showers',         emoji: '🌨️' },
  86: { label: 'Heavy snow showers',   emoji: '❄️' },
  95: { label: 'Thunderstorm',         emoji: '⛈️' },
  96: { label: 'Thunderstorm + hail',  emoji: '⛈️' },
  99: { label: 'Thunderstorm + hail',  emoji: '⛈️' }
};

// Map a code+day/night flag to a high-level "condition" the themed gradients use.
function conditionFor(code, isDay) {
  if (code === 0 || code === 1) return isDay ? 'clear-day' : 'clear-night';
  if (code === 2)                return isDay ? 'partly-cloudy-day' : 'partly-cloudy-night';
  if (code === 3)                return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 51 && code <= 57)   return 'drizzle';
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95 && code <= 99)   return 'storm';
  return 'unknown';
}

const windUnitLabel = u => u === 'mph' ? 'mph' : u === 'ms' ? 'm/s' : 'km/h';
const formatHour = t => t.toLocaleTimeString([], { hour: 'numeric' }).toLowerCase().replace(' ', '');
const formatTime = t => t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

register({
  type: 'advweather',
  title: 'Advanced Weather',
  icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="7" r="3"/><line x1="7" y1="1.5" x2="7" y2="3"/><line x1="1.5" y1="7" x2="3" y2="7"/><line x1="11" y1="3" x2="9.8" y2="4.2"/><line x1="3" y1="11" x2="4.2" y2="9.8"/><path d="M18 11h-1.26A8 8 0 1 0 9 21h9a5 5 0 0 0 0-10z"/></svg>',
  category: 'info',
  defaultSize: { w: 340, h: 460 },
  minSize:     { w: 280, h: 320 },

  defaultData: () => ({
    resolved: null,
    weather: null,
    weatherUnits: null,
    weatherWindUnit: null,
    fetchedAt: 0,
    error: null
  }),

  defaultSettings: () => ({
    location: '',
    temperatureUnit: 'celsius',
    windUnit: 'kmh',
    forecastDays: 5,
    showHourly: true,
    showDetails: true,
    showSunTimes: true,
    themedBackground: false
  }),

  settingsSchema: [
    { key: 'location', type: 'text', label: 'Location', placeholder: 'e.g. Berlin' },
    { key: 'temperatureUnit', type: 'select', label: 'Temperature', options: [
      { value: 'celsius',    label: '°C' },
      { value: 'fahrenheit', label: '°F' }
    ]},
    { key: 'windUnit', type: 'select', label: 'Wind', options: [
      { value: 'kmh', label: 'km/h' },
      { value: 'mph', label: 'mph' },
      { value: 'ms',  label: 'm/s'  }
    ]},
    { key: 'forecastDays', type: 'slider', label: 'Forecast days', min: 0, max: 7, step: 1 },
    { key: 'showHourly',       type: 'toggle', label: 'Hourly strip' },
    { key: 'showDetails',      type: 'toggle', label: 'UV / pressure / visibility' },
    { key: 'showSunTimes',     type: 'toggle', label: 'Sunrise / sunset' },
    { key: 'themedBackground', type: 'toggle', label: 'Themed background' }
  ],

  render(body, ctx) {
    const { data, settings } = ctx;
    let cancelled = false;
    ctx.onCleanup(() => { cancelled = true; });

    body.innerHTML = `<div class="adv-weather" data-condition="unknown"></div>`;
    const root = body.querySelector('.adv-weather');

    function paintLoading(msg, isError) {
      root.dataset.condition = 'unknown';
      root.classList.toggle('themed', false);
      root.innerHTML = `<div class="aw-msg${isError ? ' aw-error' : ''}">${escapeHtml(msg)}</div>`;
    }

    function paint() {
      if (!settings.location || !settings.location.trim()) {
        paintLoading('Set a location in settings'); return;
      }
      // Show error only when we have no cached weather to fall back to;
      // otherwise render the cached payload and let setStale flag it.
      if (data.error && !data.weather)        { paintLoading(data.error, true); return; }
      if (!data.weather || !data.resolved)    { paintLoading('Loading…');       return; }

      const cur = data.weather.current || {};
      const code = cur.weather_code;
      const isDay = !!cur.is_day;
      const info = weatherInfo[code] || { label: 'Unknown', emoji: '❓' };
      const emoji = (!isDay && info.emojiNight) ? info.emojiNight : info.emoji;
      const condition = conditionFor(code, isDay);
      const tempUnit = settings.temperatureUnit === 'fahrenheit' ? '°F' : '°C';
      const windLbl  = windUnitLabel(settings.windUnit);

      root.dataset.condition = condition;
      root.classList.toggle('themed', !!settings.themedBackground);

      let html = '';

      // Header
      html += `
        <div class="aw-header">
          <div class="aw-location">${escapeHtml(data.resolved.name)}${data.resolved.country ? `, ${escapeHtml(data.resolved.country)}` : ''}</div>
        </div>`;

      // Hero (icon + big temperature)
      html += `
        <div class="aw-hero">
          <div class="aw-icon">${emoji}</div>
          <div class="aw-hero-info">
            <div class="aw-temp">${Math.round(cur.temperature_2m)}${tempUnit}</div>
            <div class="aw-condition">${escapeHtml(info.label)}</div>
          </div>
        </div>`;

      // Stats row
      html += `<div class="aw-stats">`;
      html += `<div class="aw-stat"><span class="aw-stat-icon">🌡️</span><span class="aw-stat-value">${Math.round(cur.apparent_temperature)}${tempUnit}</span><span class="aw-stat-label">Feels</span></div>`;
      html += `<div class="aw-stat"><span class="aw-stat-icon">💧</span><span class="aw-stat-value">${cur.relative_humidity_2m}%</span><span class="aw-stat-label">Humidity</span></div>`;
      html += `<div class="aw-stat"><span class="aw-stat-icon">💨</span><span class="aw-stat-value">${Math.round(cur.wind_speed_10m)} ${windLbl}</span><span class="aw-stat-label">Wind</span></div>`;
      if (settings.showDetails) {
        if (cur.uv_index !== undefined && cur.uv_index !== null) {
          html += `<div class="aw-stat"><span class="aw-stat-icon">☀️</span><span class="aw-stat-value">${cur.uv_index.toFixed(1)}</span><span class="aw-stat-label">UV</span></div>`;
        }
        if (cur.surface_pressure !== undefined && cur.surface_pressure !== null) {
          html += `<div class="aw-stat"><span class="aw-stat-icon">🧭</span><span class="aw-stat-value">${Math.round(cur.surface_pressure)} hPa</span><span class="aw-stat-label">Pressure</span></div>`;
        }
        if (cur.visibility !== undefined && cur.visibility !== null) {
          html += `<div class="aw-stat"><span class="aw-stat-icon">👁️</span><span class="aw-stat-value">${(cur.visibility / 1000).toFixed(0)} km</span><span class="aw-stat-label">Visibility</span></div>`;
        }
      }
      html += `</div>`;

      // Hourly strip (next ~12 hours).
      // Strategy: parse each hourly time as a real Date (Open-Meteo returns
      // naive local-tz ISO strings — `new Date(...)` interprets those in the
      // viewer's local TZ, but for finding "the next 12 hours" relative to
      // an upcoming wall-clock, naive-as-local actually does the right thing).
      // Find the first hour that's still in the future or just started; from
      // there take 12 entries. No string slicing — cleaner and harder to
      // accidentally break across midnight/timezones.
      if (settings.showHourly) {
        const hourly = data.weather.hourly || {};
        const times  = Array.isArray(hourly.time) ? hourly.time : [];
        const temps  = Array.isArray(hourly.temperature_2m) ? hourly.temperature_2m : [];
        const codes  = Array.isArray(hourly.weather_code)   ? hourly.weather_code   : [];

        if (!times.length) {
          html += `<div class="aw-hourly-empty">Hourly forecast unavailable</div>`;
          // eslint-disable-next-line no-console
          console.warn('[advweather] hourly missing from payload', { hourlyKeys: Object.keys(hourly) });
        } else {
          // Match on Date object: the most recent hour whose start is <= now,
          // or the first future hour if we're somehow ahead of the whole array.
          const nowMs = Date.now();
          let startIdx = -1;
          for (let i = 0; i < times.length; i++) {
            const t = times[i];
            if (typeof t !== 'string') continue;
            const ms = new Date(t).getTime();
            if (isNaN(ms)) continue;
            // Hour is "current" if now is within [hour, hour + 1h)
            if (ms <= nowMs && nowMs < ms + 3600000) { startIdx = i; break; }
          }
          // Fall back to first future hour, then to 0
          if (startIdx < 0) {
            startIdx = times.findIndex(t => {
              if (typeof t !== 'string') return false;
              const ms = new Date(t).getTime();
              return !isNaN(ms) && ms >= nowMs;
            });
          }
          if (startIdx < 0) startIdx = 0;

          const slice = Math.min(12, times.length - startIdx);
          html += `<div class="aw-hourly">`;
          for (let i = 0; i < slice; i++) {
            const idx = startIdx + i;
            const timeStr = times[idx];
            if (!timeStr) continue;
            const parsed = new Date(timeStr);
            const label = i === 0
              ? 'Now'
              : (isNaN(parsed.getTime()) ? String(timeStr).slice(11, 16) : formatHour(parsed));
            const hCode  = codes[idx];
            const hInfo  = weatherInfo[hCode] || { emoji: '·' };
            const hTemp  = temps[idx];
            const tempStr = (hTemp == null || isNaN(hTemp)) ? '—' : Math.round(hTemp) + '°';
            html += `
              <div class="aw-hour">
                <div class="aw-hour-time">${escapeHtml(label)}</div>
                <div class="aw-hour-icon">${hInfo.emoji}</div>
                <div class="aw-hour-temp">${tempStr}</div>
              </div>`;
          }
          html += `</div>`;
        }
      }

      // Daily forecast
      const days = Math.max(0, Math.min(settings.forecastDays, (data.weather.daily?.time?.length || 1) - 1));
      if (days > 0 && data.weather.daily) {
        const d = data.weather.daily;
        html += `<div class="aw-daily">`;
        for (let i = 1; i <= days; i++) {
          const date = new Date(d.time[i]);
          const dayName = i === 1 ? 'Tomorrow' : date.toLocaleDateString([], { weekday: 'short' });
          const dCode = d.weather_code[i];
          const dInfo = weatherInfo[dCode] || { emoji: '?' };
          const dMax = Math.round(d.temperature_2m_max[i]);
          const dMin = Math.round(d.temperature_2m_min[i]);
          html += `
            <div class="aw-day">
              <span class="aw-day-name">${escapeHtml(dayName)}</span>
              <span class="aw-day-icon">${dInfo.emoji}</span>
              <span class="aw-day-temps"><strong>${dMax}°</strong> / ${dMin}°</span>
            </div>`;
        }
        html += `</div>`;
      }

      // Sunrise / sunset (today)
      if (settings.showSunTimes && data.weather.daily?.sunrise && data.weather.daily.sunrise[0]) {
        const sr = new Date(data.weather.daily.sunrise[0]);
        const ss = new Date(data.weather.daily.sunset[0]);
        html += `
          <div class="aw-suntimes">
            <span>🌅 ${formatTime(sr)}</span>
            <span>🌇 ${formatTime(ss)}</span>
          </div>`;
      }

      root.innerHTML = html;
      ctx.setStale(!!data.error && !!data.weather);
    }

    async function refresh() {
      if (cancelled) return;
      const loc = (settings.location || '').trim();
      if (!loc) { paint(); return; }
      data.error = null;
      try {
        // Geocode if location string changed
        if (!data.resolved || data.resolved.query !== loc) {
          paint();
          const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(loc)}&count=1&language=en&format=json`);
          if (cancelled) return;
          if (!res.ok) throw new Error(`Geocoding failed (${res.status})`);
          const j = await res.json();
          if (!j.results || !j.results.length) throw new Error(`Location not found: ${loc}`);
          const r = j.results[0];
          data.resolved = { query: loc, name: r.name, country: r.country, lat: r.latitude, lon: r.longitude };
          data.weather = null;
        }
        const stale = !data.weather
          || !data.weather.hourly?.time?.length   // cached payload missing hourly
          || !data.weather.daily?.time?.length    // ... or daily
          || data.weatherUnits   !== settings.temperatureUnit
          || data.weatherWindUnit !== settings.windUnit
          || (Date.now() - (data.fetchedAt || 0)) > 10 * 60 * 1000;
        if (stale) {
          paint();
          const { lat, lon } = data.resolved;
          const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`
            + `&current=temperature_2m,apparent_temperature,is_day,weather_code,wind_speed_10m,wind_direction_10m,relative_humidity_2m,surface_pressure,uv_index,visibility`
            + `&hourly=temperature_2m,weather_code`
            + `&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max,uv_index_max`
            + `&forecast_days=8`
            + `&temperature_unit=${settings.temperatureUnit}`
            + `&wind_speed_unit=${settings.windUnit}`
            + `&timezone=auto`;
          const res = await fetch(url);
          if (cancelled) return;
          if (!res.ok) throw new Error(`Weather fetch failed (${res.status})`);
          const j = await res.json();
          if (cancelled) return;
          data.weather = j;
          data.weatherUnits = settings.temperatureUnit;
          data.weatherWindUnit = settings.windUnit;
          data.fetchedAt = Date.now();
          data.error = null;
        }
        ctx.save();
        paint();
      } catch (err) {
        if (cancelled) return;
        data.error = err.message || 'Failed to load weather';
        paint();
        ctx.save();
      }
    }

    // Initial paint from any cached data, then debounced fetch so typing in
    // the Location field doesn't trigger a request per keystroke.
    paint();
    const debounce = setTimeout(refresh, 400);
    ctx.onCleanup(() => clearTimeout(debounce));
    const interval = setInterval(refresh, 10 * 60 * 1000);
    ctx.onCleanup(() => clearInterval(interval));
  }
});
