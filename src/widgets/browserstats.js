import { register } from '../widget-registry.js';
import { escapeHtml } from '../utils.js';

// Uses Firefox WebExtension APIs: browser.tabs, browser.bookmarks,
// browser.topSites, browser.sessions. Each section degrades to "—" if the
// corresponding permission is missing or the API is unavailable.

const api = (typeof browser !== 'undefined') ? browser
         : (typeof chrome  !== 'undefined') ? chrome
         : null;

register({
  type: 'browserstats',
  title: 'Browser Stats',
  icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="20" x2="6" y2="14"/><line x1="12" y1="20" x2="12" y2="8"/><line x1="18" y1="20" x2="18" y2="11"/><line x1="3" y1="20" x2="21" y2="20"/></svg>',
  category: 'info',
  defaultSize: { w: 320, h: 360 },
  minSize:     { w: 260, h: 240 },

  defaultData: () => ({}),

  defaultSettings: () => ({
    listSize: 5
  }),
  settingsSchema: [
    { key: 'listSize', type: 'slider', label: 'Items per list', min: 3, max: 10, step: 1 }
  ],

  render(body, ctx) {
    const { settings } = ctx;
    body.innerHTML = `
      <div class="bstats">
        <div class="bstats-stats">
          <div class="bstats-stat">
            <div class="bstats-num" data-key="tabs">—</div>
            <div class="bstats-num-label">Open tabs</div>
          </div>
          <div class="bstats-stat">
            <div class="bstats-num" data-key="bookmarks">—</div>
            <div class="bstats-num-label">Bookmarks</div>
          </div>
        </div>
        <div class="bstats-section">
          <h4>Most visited</h4>
          <ul class="bstats-list" data-key="topsites"></ul>
        </div>
        <div class="bstats-section">
          <h4>Recently closed</h4>
          <ul class="bstats-list" data-key="recent"></ul>
        </div>
      </div>`;

    const limit = Math.max(3, Math.min(10, +settings.listSize || 5));

    function setNum(key, val) {
      const el = body.querySelector(`[data-key="${key}"]`);
      if (el) el.textContent = val;
    }
    function setList(key, items) {
      const el = body.querySelector(`[data-key="${key}"]`);
      if (!el) return;
      if (!items || !items.length) {
        el.innerHTML = '<li class="bstats-empty">Nothing here yet.</li>';
        return;
      }
      el.innerHTML = items.map(it => {
        const host = (() => { try { return new URL(it.url).hostname; } catch { return ''; } })();
        return `
          <li>
            <a href="${escapeHtml(it.url)}" rel="noopener" title="${escapeHtml(it.title || it.url)}">
              <span class="bstats-list-favicon" style="${host ? `background-image:url('https://www.google.com/s2/favicons?domain=${host}&sz=32')` : ''}"></span>
              <span class="bstats-list-title">${escapeHtml(it.title || host || it.url)}</span>
              ${it.meta ? `<span class="bstats-list-meta">${escapeHtml(it.meta)}</span>` : ''}
            </a>
          </li>`;
      }).join('');
    }

    if (!api) {
      setNum('tabs', '?');
      setNum('bookmarks', '?');
      setList('topsites', []);
      setList('recent', []);
      return;
    }

    // ---- Open tabs (live) ----
    async function updateTabs() {
      try {
        const tabs = await api.tabs.query({});
        setNum('tabs', tabs.length);
      } catch {
        setNum('tabs', '—');
      }
    }
    updateTabs();
    if (api.tabs && api.tabs.onCreated && api.tabs.onRemoved) {
      api.tabs.onCreated.addListener(updateTabs);
      api.tabs.onRemoved.addListener(updateTabs);
      ctx.onCleanup(() => {
        try { api.tabs.onCreated.removeListener(updateTabs); } catch {}
        try { api.tabs.onRemoved.removeListener(updateTabs); } catch {}
      });
    }

    // ---- Bookmark count ----
    function countBookmarks(tree) {
      let count = 0;
      const stack = [...tree];
      while (stack.length) {
        const node = stack.pop();
        if (node.url) count++;
        if (node.children) stack.push(...node.children);
      }
      return count;
    }
    if (api.bookmarks && api.bookmarks.getTree) {
      api.bookmarks.getTree()
        .then(tree => setNum('bookmarks', countBookmarks(tree)))
        .catch(() => setNum('bookmarks', '—'));
    } else {
      setNum('bookmarks', '—');
    }

    // ---- Most visited (topSites; falls back to history sort) ----
    async function loadTopSites() {
      try {
        if (api.topSites && api.topSites.get) {
          const sites = await api.topSites.get({ limit, includeFavicon: false });
          setList('topsites', sites.map(s => ({ url: s.url, title: s.title })));
          return;
        }
      } catch {}
      try {
        if (api.history && api.history.search) {
          const since = Date.now() - 30 * 86400000;
          const results = await api.history.search({ text: '', startTime: since, maxResults: 200 });
          const sorted = results
            .filter(r => r.url && /^https?:/.test(r.url))
            .sort((a, b) => (b.visitCount || 0) - (a.visitCount || 0))
            .slice(0, limit);
          setList('topsites', sorted.map(r => ({
            url: r.url,
            title: r.title,
            meta: `${r.visitCount} visits`
          })));
          return;
        }
      } catch {}
      setList('topsites', []);
    }
    loadTopSites();

    // ---- Recently closed ----
    async function loadRecent() {
      try {
        if (api.sessions && api.sessions.getRecentlyClosed) {
          const entries = await api.sessions.getRecentlyClosed({ maxResults: limit });
          const items = [];
          for (const e of entries) {
            if (e.tab) {
              items.push({ url: e.tab.url, title: e.tab.title });
            } else if (e.window && e.window.tabs && e.window.tabs.length) {
              const t = e.window.tabs[0];
              items.push({ url: t.url, title: `Window — ${t.title || 'untitled'}` });
            }
            if (items.length >= limit) break;
          }
          setList('recent', items);
          return;
        }
      } catch {}
      setList('recent', []);
    }
    loadRecent();
  }
});
