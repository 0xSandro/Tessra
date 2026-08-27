import { register } from '../widget-registry.js';
import { escapeHtml, isSafeUrl } from '../utils.js';

// Hacker News — via the Algolia HN Search API (hn.algolia.com), a free,
// keyless, CORS-open index of Hacker News content. Returns full item data
// (title, url, points, comments) in a single request, unlike the official
// Firebase API which only gives IDs and needs one request per story.

async function fetchStories(sort, count) {
  const endpoint = sort === 'new' ? 'search_by_date' : 'search';
  const url = `https://hn.algolia.com/api/v1/${endpoint}?tags=${sort === 'new' ? 'story' : 'front_page'}&hitsPerPage=${Math.max(1, Math.min(30, count))}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.hits || [];
}

function formatPoints(n) {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(n);
}

function formatAge(ms) {
  if (!ms) return '';
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  return `${Math.round(s / 3600)}h ago`;
}

register({
  type: 'hackernews',
  title: 'Hacker News',
  icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4l4 5h-3v6h-2V9H8z" fill="currentColor" stroke="none"/><line x1="7" y1="18" x2="17" y2="18"/><line x1="9" y1="21" x2="15" y2="21"/></svg>',
  category: 'developer',
  defaultSize: { w: 340, h: 340 },
  minSize:     { w: 260, h: 200 },

  defaultData: () => ({
    stories: null,
    fetchKey: '',
    fetchedAt: 0,
    error: null
  }),

  defaultSettings: () => ({
    sort: 'front_page',
    count: 8,
    refreshInterval: 1800
  }),
  settingsSchema: [
    { key: 'sort', type: 'select', label: 'Show', options: [
      { value: 'front_page', label: 'Front page' },
      { value: 'new',        label: 'Newest' }
    ]},
    { key: 'count', type: 'slider', label: 'Stories shown', min: 3, max: 20, step: 1 },
    { key: 'refreshInterval', type: 'slider', label: 'Refresh', min: 900, max: 7200, step: 300, unit: 's' }
  ],

  render(body, ctx) {
    const { data, settings } = ctx;
    let cancelled = false;
    ctx.onCleanup(() => { cancelled = true; });

    body.innerHTML = `
      <div class="hn">
        <ul class="hn-list"></ul>
        <div class="hn-meta"></div>
      </div>`;
    const listEl = body.querySelector('.hn-list');
    const metaEl = body.querySelector('.hn-meta');

    function fetchKey() {
      return `${settings.sort}|${settings.count}`;
    }

    function paint() {
      if (data.error && !data.stories) {
        listEl.innerHTML = `<li class="hn-empty hn-error">${escapeHtml(data.error)}</li>`;
        metaEl.textContent = '';
        return;
      }
      if (!data.stories) {
        listEl.innerHTML = '<li class="hn-empty">Loading…</li>';
        return;
      }
      if (!data.stories.length) {
        listEl.innerHTML = '<li class="hn-empty">No stories found.</li>';
        metaEl.textContent = '';
        return;
      }
      listEl.innerHTML = data.stories.map((s, i) => {
        const discussionUrl = `https://news.ycombinator.com/item?id=${s.objectID}`;
        const storyUrl = isSafeUrl(s.url) ? s.url : discussionUrl;
        return `
        <li class="hn-item">
          <span class="hn-rank">${i + 1}</span>
          <div class="hn-info">
            <a class="hn-title" href="${escapeHtml(storyUrl)}" rel="noopener" target="_blank">${escapeHtml(s.title || '(untitled)')}</a>
            <div class="hn-sub">
              <span class="hn-points">▲ ${formatPoints(s.points || 0)}</span>
              <span class="hn-author">${escapeHtml(s.author || '')}</span>
              <a class="hn-comments" href="${escapeHtml(discussionUrl)}" rel="noopener" target="_blank">${s.num_comments || 0} comments</a>
            </div>
          </div>
        </li>`;
      }).join('');
      metaEl.textContent = data.fetchedAt ? `Updated ${formatAge(data.fetchedAt)}` : '';
      ctx.setStale(!!data.error && !!data.stories);
    }

    async function refresh() {
      if (cancelled) return;
      const refreshMs = Math.max(900, settings.refreshInterval || 1800) * 1000;
      const key = fetchKey();
      const stale = !data.stories
        || data.fetchKey !== key
        || (Date.now() - (data.fetchedAt || 0)) > refreshMs;
      if (!stale) { paint(); return; }
      if (!data.stories) paint();

      try {
        const stories = await fetchStories(settings.sort, settings.count);
        if (cancelled) return;
        data.stories = stories;
        data.fetchKey = key;
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
    const interval = setInterval(refresh, Math.max(900, settings.refreshInterval || 1800) * 1000);
    ctx.onCleanup(() => clearInterval(interval));
    const ageInterval = setInterval(() => {
      if (data.fetchedAt) metaEl.textContent = `Updated ${formatAge(data.fetchedAt)}`;
    }, 30 * 1000);
    ctx.onCleanup(() => clearInterval(ageInterval));
  }
});
