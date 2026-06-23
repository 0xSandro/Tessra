import { register } from '../widget-registry.js';
import { escapeHtml } from '../utils.js';
import { notionFetch, pageTitle, formatRelativeISO } from './_notion.js';

// Notion Recent Pages — pulls the most-recently-edited pages across
// everything the integration has been granted access to. Uses /search with
// last_edited_time sorting. Clicking a row opens the page in Notion.

register({
  type: 'notion-recent',
  title: 'Notion Recent',
  icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h13l3 3v13H4z"/><path d="M14 4v4h4"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>',
  category: 'integrations',
  subcategory: 'notion',
  defaultSize: { w: 360, h: 320 },
  minSize:     { w: 260, h: 200 },

  defaultData: () => ({
    pages: null,
    fetchKey: '',
    fetchedAt: 0,
    error: null
  }),

  defaultSettings: () => ({
    limit: 8,
    refreshInterval: 300
  }),
  settingsSchema: [
    { key: 'limit', type: 'slider', label: 'Show pages', min: 3,  max: 25,   step: 1 },
    { key: 'refreshInterval', type: 'slider', label: 'Refresh', min: 60, max: 3600, step: 30, unit: 's' }
  ],

  render(body, ctx) {
    const { data, settings } = ctx;
    let cancelled = false;
    ctx.onCleanup(() => { cancelled = true; });

    body.innerHTML = `
      <div class="nrp">
        <ul class="nrp-list"></ul>
        <div class="nrp-foot"></div>
      </div>`;
    const listEl = body.querySelector('.nrp-list');
    const footEl = body.querySelector('.nrp-foot');

    function getToken() {
      return (window.tessraIntegration && window.tessraIntegration('notion', 'token')) || '';
    }

    function fetchKey() {
      return `${(getToken() || '').slice(-8)}|${settings.limit}`;
    }

    function paint() {
      const token = getToken();
      if (!token) {
        listEl.innerHTML = `
          <li class="nrp-empty">
            Open the side panel → <em>Integrations → Notion</em> and paste a token from
            <a href="https://www.notion.so/my-integrations" rel="noopener">notion.so/my-integrations</a>,
            then share pages with the integration in Notion.
          </li>`;
        footEl.textContent = '';
        return;
      }
      if (data.error && !data.pages) {
        listEl.innerHTML = `<li class="nrp-empty nrp-error">${escapeHtml(data.error)}</li>`;
        return;
      }
      if (!data.pages) {
        listEl.innerHTML = '<li class="nrp-empty">Loading…</li>';
        return;
      }
      if (!data.pages.length) {
        listEl.innerHTML = '<li class="nrp-empty">No pages shared with this integration yet.</li>';
        return;
      }

      listEl.innerHTML = data.pages.map(p => {
        const title = pageTitle(p);
        const edited = formatRelativeISO(p.last_edited_time);
        return `
          <li class="nrp-item">
            <a class="nrp-title" href="${escapeHtml(p.url || '')}" rel="noopener" title="${escapeHtml(title)}">${escapeHtml(title)}</a>
            <span class="nrp-time">${escapeHtml(edited)}</span>
          </li>`;
      }).join('');
      footEl.textContent = `${data.pages.length} ${data.pages.length === 1 ? 'page' : 'pages'}`;
      ctx.setStale(!!data.error && !!data.pages && data.pages.length > 0);
    }

    async function refresh() {
      if (cancelled) return;
      const tok = getToken().trim();
      if (!tok) { paint(); return; }

      const refreshMs = Math.max(60, settings.refreshInterval || 300) * 1000;
      const key = fetchKey();
      const stale = !data.pages
        || data.fetchKey !== key
        || (Date.now() - (data.fetchedAt || 0)) > refreshMs;
      if (!stale) { paint(); return; }
      if (!data.pages) paint();

      try {
        const limit = Math.max(1, Math.min(50, settings.limit || 8));
        const result = await notionFetch(tok, '/search', {
          method: 'POST',
          body: JSON.stringify({
            sort: { direction: 'descending', timestamp: 'last_edited_time' },
            filter: { value: 'page', property: 'object' },
            page_size: limit
          })
        });
        if (cancelled) return;
        // Notion's /search returns both pages and database items — keep only
        // the ones that aren't workspace pages where the title would be empty.
        data.pages = (result.results || []).filter(p => p.object === 'page');
        data.fetchKey = key;
        data.fetchedAt = Date.now();
        data.error = null;
        ctx.save();
        paint();
      } catch (err) {
        if (cancelled) return;
        data.error = err.message || 'Notion fetch failed';
        paint();
        ctx.save();
      }
    }

    paint();
    const debounce = setTimeout(refresh, 400);
    ctx.onCleanup(() => clearTimeout(debounce));
    const intervalMs = Math.max(60, settings.refreshInterval || 300) * 1000;
    const interval = setInterval(refresh, intervalMs);
    ctx.onCleanup(() => clearInterval(interval));
  }
});
