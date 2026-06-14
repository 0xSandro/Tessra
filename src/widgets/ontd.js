import { register } from '../widget-registry.js';
import { escapeHtml } from '../utils.js';

// On This Day — Wikipedia's REST "feed" endpoint returns historical events,
// births, deaths, and holidays for a given MM/DD. Free, no auth, CORS-OK.
// Endpoint: https://en.wikipedia.org/api/rest_v1/feed/onthisday/{type}/{MM}/{DD}
// We default to "events" (the most evocative bucket) but allow toggling
// births and deaths via settings.

function pad(n) { return String(n).padStart(2, '0'); }

function dateKey(d) {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

async function fetchOntd(type, month, day) {
  const url = `https://en.wikipedia.org/api/rest_v1/feed/onthisday/${type}/${pad(month)}/${pad(day)}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return await r.json();
}

register({
  type: 'ontd',
  title: 'On This Day',
  icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18"/><path d="M8 3v4"/><path d="M16 3v4"/><circle cx="12" cy="14" r="2" fill="currentColor" stroke="none"/></svg>',
  category: 'info',
  defaultSize: { w: 360, h: 320 },
  minSize:     { w: 280, h: 220 },

  defaultData: () => ({
    payload: null,
    fetchedKey: '',
    fetchedAt: 0,
    error: null
  }),

  defaultSettings: () => ({
    type: 'events',
    count: 5
  }),
  settingsSchema: [
    { key: 'type',  type: 'select', label: 'Show', options: [
      { value: 'events', label: 'Events' },
      { value: 'births', label: 'Births' },
      { value: 'deaths', label: 'Deaths' },
      { value: 'holidays', label: 'Holidays' }
    ]},
    { key: 'count', type: 'slider', label: 'Items', min: 3, max: 12, step: 1 }
  ],

  render(body, ctx) {
    const { data, settings } = ctx;
    let cancelled = false;
    ctx.onCleanup(() => { cancelled = true; });

    body.innerHTML = `
      <div class="ontd">
        <div class="ontd-date"></div>
        <ul class="ontd-list"></ul>
        <div class="ontd-empty hidden">No events found.</div>
        <div class="ontd-meta"></div>
      </div>`;

    const dateEl  = body.querySelector('.ontd-date');
    const listEl  = body.querySelector('.ontd-list');
    const emptyEl = body.querySelector('.ontd-empty');
    const metaEl  = body.querySelector('.ontd-meta');

    function paint() {
      const now = new Date();
      dateEl.textContent = now.toLocaleDateString([], { month: 'long', day: 'numeric' });

      if (data.error && !data.payload) {
        listEl.innerHTML = '';
        emptyEl.classList.remove('hidden');
        emptyEl.textContent = data.error;
        emptyEl.classList.add('ontd-error');
        metaEl.textContent = '';
        return;
      }
      emptyEl.classList.remove('ontd-error');
      if (!data.payload) {
        listEl.innerHTML = '';
        emptyEl.classList.remove('hidden');
        emptyEl.textContent = 'Loading…';
        return;
      }

      const items = (data.payload[settings.type] || []).slice();
      // Sort events/births/deaths by year desc so the most recent feels first
      items.sort((a, b) => (b.year || 0) - (a.year || 0));
      const take = items.slice(0, Math.max(3, settings.count || 5));
      if (!take.length) {
        listEl.innerHTML = '';
        emptyEl.classList.remove('hidden');
        emptyEl.textContent = 'No items found.';
        return;
      }
      emptyEl.classList.add('hidden');

      listEl.innerHTML = take.map(item => {
        const year = item.year != null ? String(item.year) : '';
        const text = item.text || (item.pages && item.pages[0]?.titles?.normalized) || '';
        const page = item.pages && item.pages[0];
        const url  = page ? `https://en.wikipedia.org/wiki/${encodeURIComponent(page.titles?.canonical || '')}` : '';
        return `
          <li class="ontd-item">
            ${year ? `<span class="ontd-year">${escapeHtml(year)}</span>` : ''}
            ${url ? `<a class="ontd-text" href="${escapeHtml(url)}" rel="noopener">${escapeHtml(text)}</a>` : `<span class="ontd-text">${escapeHtml(text)}</span>`}
          </li>`;
      }).join('');

      metaEl.textContent = `via Wikipedia · ${items.length} total`;
      ctx.setStale(!!data.error && !!data.payload);
    }

    async function refresh() {
      if (cancelled) return;
      const now = new Date();
      const key = `${settings.type}:${dateKey(now)}`;
      if (data.payload && data.fetchedKey === key) { paint(); return; }
      try {
        const j = await fetchOntd(settings.type, now.getMonth() + 1, now.getDate());
        if (cancelled) return;
        data.payload   = j;
        data.fetchedKey = key;
        data.fetchedAt = Date.now();
        data.error = null;
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
    refresh();
    // Re-check every hour; Wikipedia events for "today" change at local
    // midnight (more or less). An hourly poll cleanly bridges that.
    const interval = setInterval(refresh, 60 * 60 * 1000);
    ctx.onCleanup(() => clearInterval(interval));
  }
});
