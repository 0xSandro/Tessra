import { register } from '../widget-registry.js';
import { escapeHtml } from '../utils.js';
import { notionFetch, propertyText, inferProperties, findTitleProperty, normalizeDatabaseId } from './_notion.js';

// Notion Database — generic schema-aware viewer. Configure it once with a
// token + database ID, optionally pick which property names to show as
// columns, and it works for any kind of database (tasks, projects, reading
// list, CRM, journal, anything). The title property always gets surfaced as
// the first column; remaining columns come from `settings.columns` or, if
// blank, the first four non-title properties the database exposes.

function formatAge(ms) {
  if (!ms) return '';
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60)   return `Updated ${s}s ago`;
  if (s < 3600) return `Updated ${Math.round(s / 60)}m ago`;
  return `Updated ${Math.round(s / 3600)}h ago`;
}

register({
  type: 'notion-db',
  title: 'Notion Database',
  icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="9" x2="9" y2="20"/></svg>',
  category: 'integrations',
  subcategory: 'notion',
  defaultSize: { w: 520, h: 380 },
  minSize:     { w: 320, h: 220 },

  defaultData: () => ({
    pages: null,
    fetchKey: '',
    fetchedAt: 0,
    error: null
  }),

  defaultSettings: () => ({
    databaseId: '',
    columns: '',         // comma-separated property names; empty = first 4 non-title
    limit: 10,
    refreshInterval: 300
  }),
  settingsSchema: [
    { key: 'databaseId', type: 'text',   label: 'Database ID',       placeholder: '32-char ID or full URL' },
    { key: 'columns',    type: 'text',   label: 'Columns',           placeholder: 'Status, Priority, Due (leave empty for first 4)' },
    { key: 'limit',      type: 'slider', label: 'Show rows',         min: 5,  max: 50,   step: 1 },
    { key: 'refreshInterval', type: 'slider', label: 'Refresh',      min: 60, max: 3600, step: 30, unit: 's' }
  ],

  render(body, ctx) {
    const { data, settings } = ctx;
    let cancelled = false;
    ctx.onCleanup(() => { cancelled = true; });

    body.innerHTML = `
      <div class="ndb">
        <div class="ndb-list"></div>
        <div class="ndb-foot">
          <span class="ndb-count"></span>
          <span class="ndb-updated"></span>
        </div>
      </div>`;
    const listEl    = body.querySelector('.ndb-list');
    const countEl   = body.querySelector('.ndb-count');
    const updatedEl = body.querySelector('.ndb-updated');

    function getToken() {
      return (window.tessraIntegration && window.tessraIntegration('notion', 'token')) || '';
    }

    function fetchKey() {
      const tok = (getToken() || '').slice(-8);
      const id  = normalizeDatabaseId(settings.databaseId);
      return `${tok}|${id}|${settings.limit}`;
    }

    function paint() {
      const token = getToken();
      if (!token || !settings.databaseId) {
        listEl.innerHTML = `
          <div class="ndb-empty ndb-setup">
            <p><strong>How to connect</strong></p>
            <ol>
              <li>Open the side panel → <em>Integrations → Notion</em> and paste your <code>secret_…</code> token from <a href="https://www.notion.so/my-integrations" rel="noopener">notion.so/my-integrations</a></li>
              <li>In Notion, open the database → <em>…</em> → <em>Add connections</em> → pick your integration</li>
              <li>Paste the database ID (or full URL) in this widget's settings</li>
            </ol>
          </div>`;
        countEl.textContent = '';
        updatedEl.textContent = '';
        return;
      }
      if (data.error && !data.pages) {
        listEl.innerHTML = `<div class="ndb-empty ndb-error">${escapeHtml(data.error)}</div>`;
        countEl.textContent = '';
        return;
      }
      if (!data.pages) {
        listEl.innerHTML = '<div class="ndb-empty">Loading…</div>';
        return;
      }
      if (!data.pages.length) {
        listEl.innerHTML = '<div class="ndb-empty">No rows in this database.</div>';
        return;
      }

      // Pick columns: explicit setting wins; otherwise first 4 non-title props
      const titleName = findTitleProperty(data.pages[0]) || 'Name';
      const allProps  = inferProperties(data.pages);
      let cols = (settings.columns || '').split(',').map(s => s.trim()).filter(Boolean);
      if (!cols.length) {
        cols = allProps.filter(p => p.name !== titleName).slice(0, 4).map(p => p.name);
      }

      let html = `
        <table class="ndb-table">
          <thead>
            <tr>
              <th>${escapeHtml(titleName)}</th>
              ${cols.map(c => `<th>${escapeHtml(c)}</th>`).join('')}
            </tr>
          </thead>
          <tbody>`;
      data.pages.forEach(page => {
        const title = page.properties && page.properties[titleName] ? propertyText(page.properties[titleName]) : '(untitled)';
        html += `<tr data-url="${escapeHtml(page.url || '')}">
          <td class="ndb-title">${escapeHtml(title || '(untitled)')}</td>
          ${cols.map(c => `<td>${escapeHtml(propertyText(page.properties && page.properties[c]))}</td>`).join('')}
        </tr>`;
      });
      html += '</tbody></table>';
      listEl.innerHTML = html;
      listEl.querySelectorAll('tr[data-url]').forEach(tr => {
        if (!tr.dataset.url) return;
        tr.addEventListener('click', () => window.open(tr.dataset.url, '_blank', 'noopener'));
      });

      countEl.textContent = `${data.pages.length} ${data.pages.length === 1 ? 'row' : 'rows'}`;
      updatedEl.textContent = data.fetchedAt ? formatAge(data.fetchedAt) : '';
      ctx.setStale(!!data.error && !!data.pages && data.pages.length > 0);
    }

    async function refresh() {
      if (cancelled) return;
      const tok = getToken().trim();
      const dbId = normalizeDatabaseId(settings.databaseId);
      if (!tok || !dbId) { paint(); return; }

      const refreshMs = Math.max(60, settings.refreshInterval || 300) * 1000;
      const key = fetchKey();
      const stale = !data.pages
        || data.fetchKey !== key
        || (Date.now() - (data.fetchedAt || 0)) > refreshMs;
      if (!stale) { paint(); return; }
      if (!data.pages) paint();
      try {
        const limit = Math.max(1, Math.min(100, settings.limit || 10));
        const result = await notionFetch(tok, `/databases/${dbId}/query`, {
          method: 'POST',
          body: JSON.stringify({ page_size: limit })
        });
        if (cancelled) return;
        data.pages = result.results || [];
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
    const ageInterval = setInterval(() => {
      if (data.fetchedAt) updatedEl.textContent = formatAge(data.fetchedAt);
    }, 30 * 1000);
    ctx.onCleanup(() => clearInterval(ageInterval));
  }
});
