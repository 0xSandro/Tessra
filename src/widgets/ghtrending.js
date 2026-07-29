import { register } from '../widget-registry.js';
import { escapeHtml, isSafeUrl } from '../utils.js';

// GitHub Trending Repos — GitHub has no public "trending" endpoint, so we
// approximate it with the Search API: repos created within a recent window,
// sorted by stars. Not identical to github.com/trending's velocity-based
// ranking, but a solid free/no-auth proxy for "what's hot lately".
// Endpoint: https://api.github.com/search/repositories?q=created:>{date}...
// Unauthenticated search is rate-limited to ~10 req/min — refresh is slow
// by default and cached between opens via fetchKey/fetchedAt.

function sinceDate(range) {
  const d = new Date();
  if (range === 'day')   d.setDate(d.getDate() - 1);
  else if (range === 'month') d.setMonth(d.getMonth() - 1);
  else                   d.setDate(d.getDate() - 7); // 'week' default
  return d.toISOString().slice(0, 10);
}

async function fetchTrending(range, language, count) {
  let q = `created:>${sinceDate(range)}`;
  if (language && language.trim()) q += ` language:${language.trim()}`;
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=${Math.max(1, Math.min(20, count))}`;
  const res = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } });
  if (!res.ok) {
    if (res.status === 403) throw new Error('Rate limited — try again later');
    throw new Error(`HTTP ${res.status}`);
  }
  const json = await res.json();
  return json.items || [];
}

function formatStars(n) {
  if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'k';
  return String(n);
}

// GitHub's own linguist colors for the most common languages. Falls back to
// a neutral grey dot for anything not listed rather than guessing a color.
const LANG_COLORS = {
  JavaScript: '#f1e05a', TypeScript: '#3178c6', Python: '#3572A5', Go: '#00ADD8',
  Rust: '#dea584', Java: '#b07219', 'C++': '#f34b7d', C: '#555555', 'C#': '#178600',
  Ruby: '#701516', PHP: '#4F5D95', Swift: '#F05138', Kotlin: '#A97BFF', Shell: '#89e051',
  HTML: '#e34c26', CSS: '#563d7c', Vue: '#41b883', 'Jupyter Notebook': '#DA5B0B',
  Dart: '#00B4AB', Scala: '#c22d40', Haskell: '#5e5086', Elixir: '#6e4a7e', Lua: '#000080'
};
function langColor(lang) {
  return LANG_COLORS[lang] || '#8b8b8b';
}

const STAR_ICON = '<svg viewBox="0 0 16 16" width="11" height="11" fill="currentColor"><path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z"/></svg>';

function formatAge(ms) {
  if (!ms) return '';
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  return `${Math.round(s / 3600)}h ago`;
}

register({
  type: 'ghtrending',
  title: 'GitHub Trending',
  icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>',
  category: 'developer',
  defaultSize: { w: 360, h: 340 },
  minSize:     { w: 280, h: 220 },

  defaultData: () => ({
    repos: null,
    fetchKey: '',
    fetchedAt: 0,
    error: null
  }),

  defaultSettings: () => ({
    range: 'week',
    language: '',
    count: 6,
    refreshInterval: 3600
  }),
  settingsSchema: [
    { key: 'range', type: 'select', label: 'Since', options: [
      { value: 'day',   label: 'Today' },
      { value: 'week',  label: 'This week' },
      { value: 'month', label: 'This month' }
    ]},
    { key: 'language', type: 'text', label: 'Language filter', placeholder: 'e.g. python (blank = all)' },
    { key: 'count', type: 'slider', label: 'Repos shown', min: 3, max: 15, step: 1 },
    { key: 'refreshInterval', type: 'slider', label: 'Refresh', min: 1800, max: 21600, step: 300, unit: 's' }
  ],

  render(body, ctx) {
    const { data, settings } = ctx;
    let cancelled = false;
    ctx.onCleanup(() => { cancelled = true; });

    body.innerHTML = `
      <div class="ght">
        <ul class="ght-list"></ul>
        <div class="ght-meta"></div>
      </div>`;
    const listEl = body.querySelector('.ght-list');
    const metaEl = body.querySelector('.ght-meta');

    function fetchKey() {
      return `${settings.range}|${(settings.language || '').trim().toLowerCase()}|${settings.count}`;
    }

    function paint() {
      if (data.error && !data.repos) {
        listEl.innerHTML = `<li class="ght-empty ght-error">${escapeHtml(data.error)}</li>`;
        metaEl.textContent = '';
        return;
      }
      if (!data.repos) {
        listEl.innerHTML = '<li class="ght-empty">Loading…</li>';
        return;
      }
      if (!data.repos.length) {
        listEl.innerHTML = '<li class="ght-empty">No repos found.</li>';
        metaEl.textContent = '';
        return;
      }
      listEl.innerHTML = data.repos.map(r => {
        const avatarUrl = isSafeUrl(r.owner?.avatar_url) ? r.owner.avatar_url : '';
        const repoUrl = isSafeUrl(r.html_url) ? r.html_url : '#';
        return `
        <li class="ght-item">
          <img class="ght-avatar" src="${escapeHtml(avatarUrl)}" alt="" loading="lazy"/>
          <div class="ght-info">
            <a class="ght-name" href="${escapeHtml(repoUrl)}" rel="noopener" target="_blank">${escapeHtml(r.full_name)}</a>
            ${r.description ? `<div class="ght-desc">${escapeHtml(r.description)}</div>` : ''}
            <div class="ght-sub">
              ${r.language ? `<span class="ght-lang"><i class="ght-lang-dot" style="background:${langColor(r.language)}"></i>${escapeHtml(r.language)}</span>` : ''}
              <span class="ght-stars">${STAR_ICON}${formatStars(r.stargazers_count || 0)}</span>
            </div>
          </div>
        </li>`;
      }).join('');
      metaEl.textContent = data.fetchedAt ? `Updated ${formatAge(data.fetchedAt)}` : '';
      ctx.setStale(!!data.error && !!data.repos);
    }

    async function refresh() {
      if (cancelled) return;
      const refreshMs = Math.max(1800, settings.refreshInterval || 3600) * 1000;
      const key = fetchKey();
      const stale = !data.repos
        || data.fetchKey !== key
        || (Date.now() - (data.fetchedAt || 0)) > refreshMs;
      if (!stale) { paint(); return; }
      if (!data.repos) paint();

      try {
        const repos = await fetchTrending(settings.range, settings.language, settings.count);
        if (cancelled) return;
        data.repos = repos;
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
    const interval = setInterval(refresh, Math.max(1800, settings.refreshInterval || 3600) * 1000);
    ctx.onCleanup(() => clearInterval(interval));
    const ageInterval = setInterval(() => {
      if (data.fetchedAt) metaEl.textContent = `Updated ${formatAge(data.fetchedAt)}`;
    }, 30 * 1000);
    ctx.onCleanup(() => clearInterval(ageInterval));
  }
});
