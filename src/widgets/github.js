import { register } from '../widget-registry.js';
import { escapeHtml } from '../utils.js';

// GitHub contribution graph. We can't hit GitHub's GraphQL contribution
// calendar without a token, so we use jogruber's public proxy
// (github-contributions-api.jogruber.de) which scrapes the same public
// profile page and returns clean JSON. Free, no auth, stable for years.
//
// Response shape:
//   {
//     "total": { "2024": 1234, "lastYear": 1234 },
//     "contributions": [{ "date": "2024-01-01", "count": 0, "level": 0 }, ...]
//   }
// `level` is 0–4 like GitHub itself. We honor it directly so empty / low /
// medium / high / max bins match the user's profile.

function pad2(n) { return String(n).padStart(2, '0'); }

async function fetchContributions(username, range) {
  const u = encodeURIComponent(username);
  let url = `https://github-contributions-api.jogruber.de/v4/${u}`;
  // ?y=last → rolling 12 months; ?y=2024 → a specific year; no param → all years
  if (range === 'last')      url += '?y=last';
  else if (range === 'all')  { /* no param */ }
  else if (/^\d{4}$/.test(range)) url += `?y=${range}`;
  else url += '?y=last';
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    if (res.status === 404) throw new Error('User not found');
    throw new Error(`HTTP ${res.status}`);
  }
  return await res.json();
}

// Group contribution days into weeks (columns). Weeks start on Sunday to
// match GitHub. Pad the first/last week with nulls so every column has 7 rows.
function toWeeks(contributions) {
  if (!contributions.length) return [];
  const weeks = [[]];
  const firstDow = new Date(contributions[0].date + 'T00:00:00').getDay(); // 0..6, Sun..Sat
  for (let i = 0; i < firstDow; i++) weeks[0].push(null);
  contributions.forEach(c => {
    const cur = weeks[weeks.length - 1];
    if (cur.length === 7) weeks.push([c]);
    else cur.push(c);
  });
  while (weeks[weeks.length - 1].length < 7) weeks[weeks.length - 1].push(null);
  return weeks;
}

function totalFor(data, range) {
  if (!data || !data.total) return 0;
  if (range === 'last' || range === 'all') return data.total.lastYear ?? 0;
  return data.total[range] ?? data.total.lastYear ?? 0;
}

function formatNumber(n) {
  try { return new Intl.NumberFormat().format(n); } catch { return String(n); }
}

function formatAge(ms) {
  if (!ms) return '';
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60)   return `Updated ${s}s ago`;
  if (s < 3600) return `Updated ${Math.round(s / 60)}m ago`;
  return `Updated ${Math.round(s / 3600)}h ago`;
}

function rangeLabel(range) {
  if (range === 'last') return 'in the last year';
  if (range === 'all')  return 'in total';
  return `in ${range}`;
}

// Build current year and N-1 prior years for the range dropdown
function yearOptions() {
  const now = new Date();
  const y = now.getFullYear();
  const out = [
    { value: 'last', label: 'Last 12 months' }
  ];
  for (let i = 0; i < 4; i++) out.push({ value: String(y - i), label: String(y - i) });
  out.push({ value: 'all', label: 'All time' });
  return out;
}

register({
  type: 'github',
  title: 'GitHub Commits',
  icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.4 3-.405 1.02.005 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>',
  category: 'developer',
  defaultSize: { w: 620, h: 200 },
  minSize:     { w: 320, h: 140 },

  defaultData: () => ({
    payload: null,
    fetchKey: '',
    fetchedAt: 0,
    error: null
  }),

  defaultSettings: () => ({
    username: 'torvalds',
    range: 'last',
    colorMode: 'github',
    showLegend: true,
    refreshInterval: 3600
  }),
  settingsSchema: [
    { key: 'username',  type: 'text',   label: 'GitHub username', placeholder: 'octocat' },
    { key: 'range',     type: 'select', label: 'Range',   options: yearOptions },
    { key: 'colorMode', type: 'select', label: 'Colors',  options: [
      { value: 'github', label: 'GitHub green' },
      { value: 'accent', label: 'Accent color' }
    ]},
    { key: 'showLegend', type: 'toggle', label: 'Show legend' },
    { key: 'refreshInterval', type: 'slider', label: 'Refresh', min: 600, max: 21600, step: 600, unit: 's' }
  ],

  render(body, ctx) {
    const { data, settings } = ctx;
    let cancelled = false;
    ctx.onCleanup(() => { cancelled = true; });

    body.innerHTML = `
      <div class="ghc ghc-color-${escapeHtml(settings.colorMode || 'github')}">
        <div class="ghc-header">
          <span class="ghc-total"></span>
          <span class="ghc-user"></span>
        </div>
        <div class="ghc-grid-wrap">
          <div class="ghc-grid"></div>
        </div>
        <div class="ghc-footer">
          <span class="ghc-legend"></span>
          <span class="ghc-updated"></span>
        </div>
      </div>`;
    const totalEl   = body.querySelector('.ghc-total');
    const userEl    = body.querySelector('.ghc-user');
    const gridEl    = body.querySelector('.ghc-grid');
    const legendEl  = body.querySelector('.ghc-legend');
    const updatedEl = body.querySelector('.ghc-updated');

    function fetchKey() {
      return `${(settings.username || '').trim().toLowerCase()}|${settings.range || 'last'}`;
    }

    function paintLegend() {
      if (!settings.showLegend) { legendEl.innerHTML = ''; return; }
      legendEl.innerHTML = `
        <span class="ghc-legend-label">Less</span>
        <span class="ghc-cell ghc-level-0"></span>
        <span class="ghc-cell ghc-level-1"></span>
        <span class="ghc-cell ghc-level-2"></span>
        <span class="ghc-cell ghc-level-3"></span>
        <span class="ghc-cell ghc-level-4"></span>
        <span class="ghc-legend-label">More</span>`;
    }

    function paintHeader() {
      const user = (settings.username || '').trim();
      userEl.textContent = user ? `@${user}` : '';
      if (!data.payload) {
        totalEl.textContent = user ? 'Loading…' : '';
        return;
      }
      const total = totalFor(data.payload, settings.range);
      totalEl.textContent = `${formatNumber(total)} contributions ${rangeLabel(settings.range)}`;
    }

    function paintGrid() {
      gridEl.innerHTML = '';
      if (data.error && !data.payload) {
        gridEl.innerHTML = `<div class="ghc-empty ghc-error">${escapeHtml(data.error)}</div>`;
        return;
      }
      if (!data.payload) {
        if (!(settings.username || '').trim()) {
          gridEl.innerHTML = '<div class="ghc-empty">Set a GitHub username in settings.</div>';
        } else {
          gridEl.innerHTML = '<div class="ghc-empty">Loading…</div>';
        }
        return;
      }
      const weeks = toWeeks(data.payload.contributions || []);
      if (!weeks.length) {
        gridEl.innerHTML = '<div class="ghc-empty">No contributions in this range.</div>';
        return;
      }
      // grid-auto-flow: column + grid-template-rows: repeat(7,1fr) → items
      // fill row 1 col 1, row 2 col 1, ... row 7 col 1, row 1 col 2, ...
      // So we iterate weeks then days in each week.
      const frag = document.createDocumentFragment();
      weeks.forEach(week => {
        week.forEach(day => {
          const cell = document.createElement('div');
          if (!day) {
            cell.className = 'ghc-cell ghc-cell-empty';
          } else {
            cell.className = `ghc-cell ghc-level-${day.level || 0}`;
            const dateStr = new Date(day.date + 'T00:00:00').toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
            const cStr = day.count === 1 ? '1 contribution' : `${formatNumber(day.count)} contributions`;
            cell.title = `${cStr} on ${dateStr}`;
          }
          frag.appendChild(cell);
        });
      });
      gridEl.appendChild(frag);
    }

    function paint() {
      paintHeader();
      paintGrid();
      paintLegend();
      updatedEl.textContent = data.fetchedAt ? formatAge(data.fetchedAt) : '';
    }

    async function refresh() {
      if (cancelled) return;
      const user = (settings.username || '').trim();
      if (!user) { paint(); return; }

      const refreshMs = Math.max(300, settings.refreshInterval || 3600) * 1000;
      const key = fetchKey();
      const stale = !data.payload
        || data.fetchKey !== key
        || (Date.now() - (data.fetchedAt || 0)) > refreshMs;
      if (!stale) { paint(); return; }

      if (!data.payload) paint();
      try {
        const json = await fetchContributions(user, settings.range || 'last');
        if (cancelled) return;
        data.payload   = json;
        data.fetchKey  = key;
        data.fetchedAt = Date.now();
        data.error     = null;
        ctx.save();
        paint();
      } catch (err) {
        if (cancelled) return;
        data.error = err.message || 'Failed to load';
        paint();
        ctx.save();
      }
    }

    const intervalMs = Math.max(300, settings.refreshInterval || 3600) * 1000;
    const interval = setInterval(refresh, intervalMs);
    ctx.onCleanup(() => clearInterval(interval));
    const ageInterval = setInterval(() => {
      if (data.fetchedAt) updatedEl.textContent = formatAge(data.fetchedAt);
    }, 30 * 1000);
    ctx.onCleanup(() => clearInterval(ageInterval));

    paint();
    refresh();
  }
});
