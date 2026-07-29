import { register } from '../widget-registry.js';
import { escapeHtml, isSafeUrl } from '../utils.js';
import { notionFetch, propertyText, normalizeDatabaseId, localTodayISO } from './_notion.js';

// Notion Today — filtered task-database view: rows where the configured
// date property is today-or-overdue AND the configured checkbox property
// is unchecked. Clicking the checkbox PATCHes the page back to Notion to
// mark it done, then optimistically removes the row from the widget.

register({
  type: 'notion-today',
  title: 'Notion Today',
  icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18"/><path d="M8 3v4"/><path d="M16 3v4"/><polyline points="8 14 11 17 16 12"/></svg>',
  category: 'integrations',
  subcategory: 'notion',
  comingSoon: true, // Notion integration isn't fully working yet — greyed out in the catalog
  defaultSize: { w: 360, h: 340 },
  minSize:     { w: 260, h: 220 },

  defaultData: () => ({
    pages: null,
    fetchKey: '',
    fetchedAt: 0,
    error: null
  }),

  defaultSettings: () => ({
    databaseId: '',
    dueProperty:  'Due',
    doneProperty: 'Done',
    includeOverdue: true,
    refreshInterval: 180
  }),
  settingsSchema: [
    { key: 'databaseId',     type: 'text',   label: 'Tasks database',    placeholder: '32-char ID or full URL' },
    { key: 'dueProperty',    type: 'text',   label: 'Due property',      placeholder: 'Due' },
    { key: 'doneProperty',   type: 'text',   label: 'Done property',     placeholder: 'Done' },
    { key: 'includeOverdue', type: 'toggle', label: 'Include overdue items' },
    { key: 'refreshInterval', type: 'slider', label: 'Refresh', min: 60, max: 1800, step: 30, unit: 's' }
  ],

  render(body, ctx) {
    const { data, settings } = ctx;
    let cancelled = false;
    ctx.onCleanup(() => { cancelled = true; });

    body.innerHTML = `
      <div class="ntd">
        <div class="ntd-header"></div>
        <ul class="ntd-list"></ul>
        <div class="ntd-foot"></div>
      </div>`;
    const headerEl = body.querySelector('.ntd-header');
    const listEl   = body.querySelector('.ntd-list');
    const footEl   = body.querySelector('.ntd-foot');

    function getToken() {
      return (window.tessraIntegration && window.tessraIntegration('notion', 'token')) || '';
    }

    function fetchKey() {
      return `${(getToken() || '').slice(-8)}|${normalizeDatabaseId(settings.databaseId)}|${settings.dueProperty}|${settings.doneProperty}|${settings.includeOverdue ? 1 : 0}`;
    }

    function paint() {
      const now = new Date();
      headerEl.textContent = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
      const token = getToken();
      if (!token || !settings.databaseId) {
        listEl.innerHTML = `
          <li class="ntd-empty">
            Open the side panel → <em>Integrations → Notion</em>, paste your token,
            then set the tasks database ID in this widget's settings.
          </li>`;
        footEl.textContent = '';
        return;
      }
      if (data.error && !data.pages) {
        listEl.innerHTML = `<li class="ntd-empty ntd-error">${escapeHtml(data.error)}</li>`;
        return;
      }
      if (!data.pages) {
        listEl.innerHTML = '<li class="ntd-empty">Loading…</li>';
        return;
      }
      if (!data.pages.length) {
        listEl.innerHTML = '<li class="ntd-empty ntd-done">Nothing due today 🎉</li>';
        footEl.textContent = '';
        return;
      }

      listEl.innerHTML = data.pages.map(page => {
        const props = page.properties || {};
        const titleEntry = Object.entries(props).find(([, p]) => p.type === 'title');
        const title = titleEntry ? propertyText(titleEntry[1]) : '(untitled)';
        const due = props[settings.dueProperty];
        const dueStr = due ? propertyText(due) : '';
        const overdue = due && due.date && due.date.start && due.date.start < localTodayISO();
        const pageUrl = isSafeUrl(page.url) ? page.url : '';
        return `
          <li class="ntd-item" data-id="${escapeHtml(page.id)}" data-url="${escapeHtml(pageUrl)}">
            <input type="checkbox" class="ntd-check"/>
            <a class="ntd-title" href="${escapeHtml(pageUrl)}" rel="noopener">${escapeHtml(title || '(untitled)')}</a>
            ${dueStr ? `<span class="ntd-due ${overdue ? 'ntd-overdue' : ''}">${escapeHtml(dueStr)}</span>` : ''}
          </li>`;
      }).join('');

      // Two-way sync: ticking the box PATCHes the page to set the configured
      // done-property to true, then removes the item locally on success.
      listEl.querySelectorAll('.ntd-item').forEach(li => {
        const checkbox = li.querySelector('.ntd-check');
        checkbox.addEventListener('click', async (e) => {
          e.preventDefault();
          if (checkbox.disabled) return;
          checkbox.disabled = true;
          checkbox.checked = true;
          li.classList.add('ntd-marking');
          try {
            await notionFetch(getToken(), `/pages/${li.dataset.id}`, {
              method: 'PATCH',
              body: JSON.stringify({
                properties: {
                  [settings.doneProperty]: { checkbox: true }
                }
              })
            });
            if (cancelled) return;
            // Drop the row from local state — we know it's done now.
            data.pages = (data.pages || []).filter(p => p.id !== li.dataset.id);
            ctx.save();
            paint();
          } catch (err) {
            // Roll back the optimistic check on failure
            checkbox.checked = false;
            checkbox.disabled = false;
            li.classList.remove('ntd-marking');
            footEl.textContent = `Could not update Notion: ${err.message || err}`;
          }
        });
      });
      footEl.textContent = `${data.pages.length} ${data.pages.length === 1 ? 'task' : 'tasks'} due`;
      ctx.setStale(!!data.error && !!data.pages && data.pages.length > 0);
    }

    async function refresh() {
      if (cancelled) return;
      const tok  = getToken().trim();
      const dbId = normalizeDatabaseId(settings.databaseId);
      if (!tok || !dbId) { paint(); return; }

      const refreshMs = Math.max(60, settings.refreshInterval || 180) * 1000;
      const key = fetchKey();
      const stale = !data.pages
        || data.fetchKey !== key
        || (Date.now() - (data.fetchedAt || 0)) > refreshMs;
      if (!stale) { paint(); return; }
      if (!data.pages) paint();

      // Filter: due-property on_or_before today (today-and-overdue) AND
      // done-property checkbox false. When includeOverdue is off we narrow
      // to "equals today".
      const today = localTodayISO();
      const dateFilter = settings.includeOverdue
        ? { property: settings.dueProperty, date: { on_or_before: today } }
        : { property: settings.dueProperty, date: { equals: today } };
      const filter = {
        and: [
          dateFilter,
          { property: settings.doneProperty, checkbox: { equals: false } }
        ]
      };
      try {
        const result = await notionFetch(tok, `/databases/${dbId}/query`, {
          method: 'POST',
          body: JSON.stringify({
            filter,
            sorts: [{ property: settings.dueProperty, direction: 'ascending' }],
            page_size: 50
          })
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
    const intervalMs = Math.max(60, settings.refreshInterval || 180) * 1000;
    const interval = setInterval(refresh, intervalMs);
    ctx.onCleanup(() => clearInterval(interval));
  }
});
