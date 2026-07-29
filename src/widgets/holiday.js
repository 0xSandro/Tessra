import { register } from '../widget-registry.js';
import { escapeHtml } from '../utils.js';

// Public Holiday Countdown — Nager.Date's public holiday API is free, no
// auth, CORS-open. We fetch the full current + next year for the chosen
// country (so we always have a future holiday even in late December), then
// pick the soonest one that hasn't passed yet.
// Endpoint: https://date.nager.at/api/v3/PublicHolidays/{year}/{countryCode}

const COUNTRIES = [
  ['US', 'United States'], ['GB', 'United Kingdom'], ['DE', 'Germany'], ['FR', 'France'],
  ['ES', 'Spain'], ['IT', 'Italy'], ['NL', 'Netherlands'], ['BE', 'Belgium'], ['CH', 'Switzerland'],
  ['AT', 'Austria'], ['SE', 'Sweden'], ['NO', 'Norway'], ['DK', 'Denmark'], ['FI', 'Finland'],
  ['IE', 'Ireland'], ['PT', 'Portugal'], ['PL', 'Poland'], ['CZ', 'Czechia'], ['GR', 'Greece'],
  ['HU', 'Hungary'], ['RO', 'Romania'], ['UA', 'Ukraine'], ['CA', 'Canada'], ['MX', 'Mexico'],
  ['BR', 'Brazil'], ['AR', 'Argentina'], ['CL', 'Chile'], ['CO', 'Colombia'], ['JP', 'Japan'],
  ['KR', 'South Korea'], ['CN', 'China'], ['IN', 'India'], ['SG', 'Singapore'], ['AU', 'Australia'],
  ['NZ', 'New Zealand'], ['ZA', 'South Africa']
];

function formatAge(ms) {
  if (!ms) return '';
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

function flagEmoji(code) {
  if (!code || code.length !== 2) return '';
  return code.toUpperCase().replace(/./g, c => String.fromCodePoint(127397 + c.charCodeAt(0)));
}

async function fetchYear(country, year) {
  const url = `https://date.nager.at/api/v3/PublicHolidays/${year}/${encodeURIComponent(country)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

register({
  type: 'holiday',
  title: 'Public Holiday Countdown',
  icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18"/><path d="M8 3v4"/><path d="M16 3v4"/><path d="m12 12 1 2 2 .3-1.5 1.4.4 2.1-1.9-1-1.9 1 .4-2.1L8.6 14.3l2-.3z" fill="currentColor" stroke="none"/></svg>',
  category: 'time',
  defaultSize: { w: 300, h: 360 },
  minSize:     { w: 240, h: 260 },

  defaultData: () => ({
    holidays: null, // combined current+next year list
    fetchKey: '',
    fetchedAt: 0,
    error: null
  }),

  defaultSettings: () => ({
    country: 'US',
    upcomingCount: 3,
    refreshInterval: 21600
  }),
  settingsSchema: [
    { key: 'country', type: 'select', label: 'Country', options: COUNTRIES.map(([value, label]) => ({ value, label })) },
    { key: 'upcomingCount', type: 'slider', label: 'Upcoming list', min: 0, max: 6, step: 1 },
    { key: 'refreshInterval', type: 'slider', label: 'Refresh', min: 3600, max: 86400, step: 3600, unit: 's' }
  ],

  render(body, ctx) {
    const { data, settings } = ctx;
    let cancelled = false;
    ctx.onCleanup(() => { cancelled = true; });

    body.innerHTML = `
      <div class="hol">
        <div class="hol-hero"></div>
        <div class="hol-section-label">Upcoming</div>
        <ul class="hol-list"></ul>
        <div class="hol-meta"></div>
      </div>`;
    const nextEl = body.querySelector('.hol-hero');
    const labelEl = body.querySelector('.hol-section-label');
    const listEl = body.querySelector('.hol-list');
    const metaEl = body.querySelector('.hol-meta');

    function fetchKey() {
      return `${settings.country}|${new Date().getFullYear()}`;
    }

    // The API can return more than one entry for the same date (e.g. a
    // region-restricted "Public" holiday plus a nationwide "Bank" holiday
    // sharing the same name) — collapse those into a single row.
    function dedupe(holidays) {
      const seen = new Set();
      const out = [];
      for (const h of holidays) {
        const key = `${h.date}|${h.localName || h.name}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(h);
      }
      return out;
    }

    function upcomingFrom(holidays) {
      const todayISO = new Date().toISOString().slice(0, 10);
      return dedupe(holidays || [])
        .filter(h => h.date >= todayISO)
        .sort((a, b) => a.date.localeCompare(b.date));
    }

    function daysUntil(dateISO) {
      const target = new Date(dateISO + 'T00:00:00');
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return Math.round((target - today) / 86400000);
    }

    function paint() {
      labelEl.classList.add('hidden');
      if (data.error && !data.holidays) {
        nextEl.innerHTML = `<div class="hol-error">${escapeHtml(data.error)}</div>`;
        listEl.innerHTML = '';
        metaEl.textContent = '';
        return;
      }
      if (!data.holidays) {
        nextEl.innerHTML = '<div class="hol-loading">Loading…</div>';
        listEl.innerHTML = '';
        return;
      }
      const upcoming = upcomingFrom(data.holidays);
      if (!upcoming.length) {
        nextEl.innerHTML = '<div class="hol-loading">No upcoming holidays found.</div>';
        listEl.innerHTML = '';
        return;
      }
      const next = upcoming[0];
      const d = daysUntil(next.date);
      const dateStr = new Date(next.date + 'T00:00:00').toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
      nextEl.innerHTML = `
        <div class="hol-flag">${flagEmoji(settings.country)}</div>
        <div class="hol-days-row">
          <span class="hol-days-num">${d === 0 ? 'Today' : d}</span>
          ${d === 0 ? '' : `<span class="hol-days-word">${d === 1 ? 'day' : 'days'}</span>`}
        </div>
        <div class="hol-name">${escapeHtml(next.localName || next.name)}</div>
        <div class="hol-date">${escapeHtml(dateStr)}</div>`;

      const rest = upcoming.slice(1, 1 + Math.max(0, settings.upcomingCount ?? 3));
      if (rest.length) {
        labelEl.classList.remove('hidden');
        listEl.innerHTML = rest.map(h => `
          <li class="hol-item">
            <span class="hol-item-date">${escapeHtml(new Date(h.date + 'T00:00:00').toLocaleDateString([], { month: 'short', day: 'numeric' }))}</span>
            <span class="hol-item-name">${escapeHtml(h.localName || h.name)}</span>
          </li>`).join('');
      } else {
        listEl.innerHTML = '';
      }
      metaEl.textContent = data.fetchedAt ? `Updated ${formatAge(data.fetchedAt)}` : '';
      ctx.setStale(!!data.error && !!data.holidays);
    }

    async function refresh() {
      if (cancelled) return;
      const refreshMs = Math.max(3600, settings.refreshInterval || 21600) * 1000;
      const key = fetchKey();
      const stale = !data.holidays
        || data.fetchKey !== key
        || (Date.now() - (data.fetchedAt || 0)) > refreshMs;
      if (!stale) { paint(); return; }
      if (!data.holidays) paint();

      try {
        const year = new Date().getFullYear();
        const [curYear, nextYear] = await Promise.all([
          fetchYear(settings.country, year),
          fetchYear(settings.country, year + 1)
        ]);
        if (cancelled) return;
        data.holidays = [...curYear, ...nextYear];
        data.fetchKey = key;
        data.fetchedAt = Date.now();
        data.error = null;
        ctx.save();
        paint();
      } catch (err) {
        if (cancelled) return;
        data.error = err.message || 'Failed to load holidays';
        paint();
        ctx.save();
      }
    }

    paint();
    refresh();
    const interval = setInterval(refresh, Math.max(3600, settings.refreshInterval || 21600) * 1000);
    ctx.onCleanup(() => clearInterval(interval));
    // Re-paint at local midnight-ish cadence so the "days until" ticks down
    // without waiting for a full refetch.
    const dayTick = setInterval(paint, 60 * 60 * 1000);
    ctx.onCleanup(() => clearInterval(dayTick));
  }
});
