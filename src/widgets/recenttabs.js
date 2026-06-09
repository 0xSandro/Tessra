import { register } from '../widget-registry.js';
import { escapeHtml } from '../utils.js';

const api = (typeof browser !== 'undefined') ? browser
         : (typeof chrome  !== 'undefined') ? chrome
         : null;

register({
  type: 'recenttabs',
  title: 'Recent Tabs',
  icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>',
  category: 'web',
  defaultSize: { w: 320, h: 300 },
  minSize:     { w: 240, h: 200 },

  defaultData: () => ({}),

  defaultSettings: () => ({ count: 10 }),
  settingsSchema: [
    { key: 'count', type: 'slider', label: 'Items', min: 5, max: 25, step: 1 }
  ],

  render(body, ctx) {
    const { settings } = ctx;
    body.innerHTML = `<ul class="recent-tabs-list"></ul>`;
    const list = body.querySelector('.recent-tabs-list');

    if (!api || !api.sessions || !api.sessions.getRecentlyClosed) {
      list.innerHTML = '<li class="recent-tabs-empty">Sessions API unavailable.</li>';
      return;
    }

    async function load() {
      try {
        const limit = Math.max(1, Math.min(50, +settings.count || 10));
        const entries = await api.sessions.getRecentlyClosed({ maxResults: limit });

        // Flatten — windows can contain multiple tabs each with its own sessionId
        const tabs = [];
        for (const entry of entries) {
          if (entry.tab) tabs.push({ tab: entry.tab, fromWindow: false });
          else if (entry.window && entry.window.tabs) {
            entry.window.tabs.forEach(t => tabs.push({ tab: t, fromWindow: true, windowSession: entry.window.sessionId }));
          }
          if (tabs.length >= limit) break;
        }
        if (!tabs.length) {
          list.innerHTML = '<li class="recent-tabs-empty">No recently closed tabs.</li>';
          return;
        }

        list.innerHTML = '';
        tabs.slice(0, limit).forEach(({ tab, fromWindow, windowSession }) => {
          if (!tab.url) return;
          let host = '';
          try { host = new URL(tab.url).hostname; } catch {}
          const li = document.createElement('li');
          li.className = 'recent-tabs-item';
          li.innerHTML = `
            <button class="recent-tabs-restore" title="Restore tab">
              <span class="recent-tabs-favicon" style="${host ? `background-image:url('https://www.google.com/s2/favicons?domain=${host}&sz=32')` : ''}"></span>
              <span class="recent-tabs-info">
                <span class="recent-tabs-title">${escapeHtml(tab.title || host || tab.url)}</span>
                <span class="recent-tabs-host">${escapeHtml(host)}${fromWindow ? ' · window' : ''}</span>
              </span>
            </button>`;
          li.querySelector('button').addEventListener('click', async () => {
            const sessionId = tab.sessionId || windowSession;
            try {
              if (sessionId && api.sessions.restore) {
                await api.sessions.restore(sessionId);
                load(); // refresh after restore
              } else {
                window.open(tab.url, '_blank');
              }
            } catch {
              window.open(tab.url, '_blank');
            }
          });
          list.appendChild(li);
        });
      } catch {
        list.innerHTML = '<li class="recent-tabs-empty">Could not load recent tabs.</li>';
      }
    }

    load();

    // Refresh when a tab is closed (new entries appear) or sessions change
    if (api.tabs && api.tabs.onRemoved) {
      api.tabs.onRemoved.addListener(load);
      ctx.onCleanup(() => { try { api.tabs.onRemoved.removeListener(load); } catch {} });
    }
    if (api.sessions && api.sessions.onChanged) {
      api.sessions.onChanged.addListener(load);
      ctx.onCleanup(() => { try { api.sessions.onChanged.removeListener(load); } catch {} });
    }
  }
});
