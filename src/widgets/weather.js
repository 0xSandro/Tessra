import { register } from '../widget-registry.js';

// Open-Meteo WMO weather code mapping.
// https://open-meteo.com/en/docs#weathervariables
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

register({
  type: 'weather',
  title: 'Weather',
  icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>',
  category: 'info',
  defaultSize: { w: 300, h: 290 },
  minSize:     { w: 240, h: 200 },

  defaultData: () => ({
    resolved: null,      // { query, name, country, lat, lon }
    weather: null,       // raw Open-Meteo response
    weatherUnits: null,  // tracks the units the cached payload was fetched with
    fetchedAt: 0,
    error: null
  }),

  defaultSettings: () => ({
    location: '',
    units: 'celsius',
    showForecast: true
  }),
  settingsSchema: [
    { key: 'location',     type: 'text',   label: 'Location', placeholder: 'e.g. Berlin' },
    { key: 'units',        type: 'select', label: 'Units', options: [
      { value: 'celsius',    label: '°C' },
      { value: 'fahrenheit', label: '°F' }
    ]},
    { key: 'showForecast', type: 'toggle', label: '3-day forecast' }
  ],

  render(body, ctx) {
    const { data, settings } = ctx;
    let cancelled = false;
    ctx.onCleanup(() => { cancelled = true; });

    body.innerHTML = `
      <div class="weather">
        <div class="weather-loc"></div>
        <div class="weather-main">
          <div class="weather-icon"></div>
          <div class="weather-temp"></div>
        </div>
        <div class="weather-cond"></div>
        <div class="weather-detail"></div>
        <div class="weather-forecast"></div>
      </div>`;

    const locEl      = body.querySelector('.weather-loc');
    const iconEl     = body.querySelector('.weather-icon');
    const tempEl     = body.querySelector('.weather-temp');
    const condEl     = body.querySelector('.weather-cond');
    const detailEl   = body.querySelector('.weather-detail');
    const forecastEl = body.querySelector('.weather-forecast');

    function setStatus(msg, isError = false) {
      locEl.textContent = data.resolved?.name ? data.resolved.name : '';
      iconEl.textContent = '';
      tempEl.textContent = '';
      condEl.textContent = msg;
      condEl.className = 'weather-cond ' + (isError ? 'weather-error' : 'weather-loading');
      detailEl.innerHTML = '';
      forecastEl.innerHTML = '';
    }

    function paint() {
      if (!settings.location || !settings.location.trim()) {
        setStatus('Set a location in settings');
        return;
      }
      // Show error only when we have nothing cached to fall back to;
      // otherwise we render the cached weather + a "stale" badge via setStale.
      if (data.error && !data.weather) {
        setStatus(data.error, true);
        return;
      }
      if (!data.weather || !data.resolved) {
        setStatus('Loading…');
        return;
      }

      const cur = data.weather.current || {};
      const info = weatherInfo[cur.weather_code] || { label: 'Unknown', emoji: '❓' };
      const emoji = (!cur.is_day && info.emojiNight) ? info.emojiNight : info.emoji;
      const unitSym = settings.units === 'fahrenheit' ? '°F' : '°C';

      locEl.textContent = data.resolved.name + (data.resolved.country ? `, ${data.resolved.country}` : '');
      iconEl.textContent = emoji;
      tempEl.textContent = Math.round(cur.temperature_2m) + unitSym;
      condEl.textContent = info.label;
      condEl.className = 'weather-cond';
      detailEl.innerHTML = `
        <span>Feels ${Math.round(cur.apparent_temperature)}${unitSym}</span>
        <span>Hum ${cur.relative_humidity_2m}%</span>
        <span>Wind ${Math.round(cur.wind_speed_10m)} km/h</span>`;

      if (settings.showForecast && data.weather.daily?.time?.length > 1) {
        const d = data.weather.daily;
        forecastEl.innerHTML = d.time.slice(1).map((date, i) => {
          const idx = i + 1;
          const code = d.weather_code[idx];
          const max = d.temperature_2m_max[idx];
          const min = d.temperature_2m_min[idx];
          const dInfo = weatherInfo[code] || { emoji: '❓' };
          const dayName = new Date(date).toLocaleDateString([], { weekday: 'short' });
          return `<div class="weather-day">
            <div class="weather-day-name">${dayName}</div>
            <div class="weather-day-icon">${dInfo.emoji}</div>
            <div class="weather-day-temps">${Math.round(max)}°/${Math.round(min)}°</div>
          </div>`;
        }).join('');
      } else {
        forecastEl.innerHTML = '';
      }
      ctx.setStale(!!data.error && !!data.weather);
    }

    async function refresh() {
      if (cancelled) return;
      const loc = (settings.location || '').trim();
      if (!loc) { paint(); return; }

      data.error = null;
      try {
        // Geocode if location string changed since last resolution
        if (!data.resolved || data.resolved.query !== loc) {
          paint();
          const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(loc)}&count=1&language=en&format=json`;
          const res = await fetch(url);
          if (cancelled) return;
          if (!res.ok) throw new Error(`Geocoding failed (${res.status})`);
          const j = await res.json();
          if (!j.results || !j.results.length) throw new Error(`Location not found: ${loc}`);
          const r = j.results[0];
          data.resolved = {
            query: loc,
            name: r.name,
            country: r.country,
            lat: r.latitude,
            lon: r.longitude
          };
          data.weather = null;  // force refetch for new coords
        }

        // Refetch if missing, units changed, or cache is older than 10 min
        const stale = !data.weather
          || data.weatherUnits !== settings.units
          || (Date.now() - (data.fetchedAt || 0)) > 10 * 60 * 1000;

        if (stale) {
          paint();
          const { lat, lon } = data.resolved;
          const units = settings.units || 'celsius';
          const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
                      `&current=temperature_2m,apparent_temperature,is_day,weather_code,wind_speed_10m,relative_humidity_2m` +
                      `&daily=weather_code,temperature_2m_max,temperature_2m_min` +
                      `&forecast_days=4` +
                      `&temperature_unit=${units}` +
                      `&wind_speed_unit=kmh` +
                      `&timezone=auto`;
          const res = await fetch(url);
          if (cancelled) return;
          if (!res.ok) throw new Error(`Weather fetch failed (${res.status})`);
          const j = await res.json();
          if (cancelled) return;
          data.weather = j;
          data.weatherUnits = units;
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

    // Initial paint from cached data
    paint();
    // Debounce the fetch a little so typing in the Location field doesn't refetch per keystroke
    const debounce = setTimeout(refresh, 400);
    ctx.onCleanup(() => clearTimeout(debounce));
    // Auto-refresh every 10 minutes while the tab is open
    const interval = setInterval(refresh, 10 * 60 * 1000);
    ctx.onCleanup(() => clearInterval(interval));
  }
});
