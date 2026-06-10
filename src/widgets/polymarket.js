import { register } from '../widget-registry.js';
import { escapeHtml } from '../utils.js';

// Polymarket Gamma API (gamma-api.polymarket.com) — public, no auth.
// Two modes:
//   - Pinned: settings.slugs lists specific market slugs. One fetch per slug.
//   - Top:    empty slugs → fetch top markets by 24h volume.
// `outcomes` and `outcomePrices` are JSON-encoded strings in the response,
// which is a long-standing Polymarket quirk; we parse defensively.

function parseOutcomes(market) {
  let labels = [], prices = [];
  try { labels = JSON.parse(market.outcomes || '[]'); } catch {}
  try { prices = JSON.parse(market.outcomePrices || '[]').map(Number); } catch {}
  if (!Array.isArray(labels)) labels = [];
  if (!Array.isArray(prices)) prices = [];
  return labels.map((label, i) => ({ label, price: prices[i] ?? 0 }));
}

function formatVolume(v) {
  const n = Number(v) || 0;
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
  return '$' + n.toFixed(0);
}

function formatEnd(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const diff = d.getTime() - Date.now();
  const days = Math.floor(diff / 86400000);
  if (days > 30) return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  if (days >  1) return `${days}d left`;
  if (days === 1) return 'tomorrow';
  if (days === 0) return 'today';
  return 'ended';
}

function formatCents(price) {
  if (price == null || isNaN(price)) return '—';
  return Math.round(price * 100) + '¢';
}

// Accept slug, partial URL, or full URL like https://polymarket.com/event/will-x
function extractSlug(input) {
  const s = (input || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) {
    try {
      const url = new URL(s);
      const parts = url.pathname.split('/').filter(Boolean);
      return parts[parts.length - 1] || '';
    } catch { /* fallthrough */ }
  }
  return s.toLowerCase().replace(/^\/+/, '');
}

function formatAge(ms) {
  if (!ms) return '';
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60)   return `Updated ${s}s ago`;
  if (s < 3600) return `Updated ${Math.round(s / 60)}m ago`;
  return `Updated ${Math.round(s / 3600)}h ago`;
}

async function fetchTop(limit) {
  const url = `https://gamma-api.polymarket.com/markets?limit=${encodeURIComponent(limit)}&active=true&closed=false&order=volume24hr&ascending=false`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

async function fetchBySlug(slug) {
  const url = `https://gamma-api.polymarket.com/markets?slug=${encodeURIComponent(slug)}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  return Array.isArray(j) ? j[0] : null;
}

register({
  type: 'polymarket',
  title: 'Polymarket',
  icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="4" height="9"/><rect x="10" y="6" width="4" height="14"/><rect x="16" y="13" width="4" height="7"/><line x1="2" y1="20" x2="22" y2="20"/></svg>',
  category: 'finance',
  defaultSize: { w: 380, h: 380 },
  minSize:     { w: 280, h: 260 },

  defaultData: () => ({
    markets: null,
    fetchKey: '',
    fetchedAt: 0,
    error: null
  }),

  defaultSettings: () => ({
    slugs: '',
    limit: 5,
    refreshInterval: 120
  }),
  settingsSchema: [
    { key: 'slugs', type: 'text',   label: 'Pinned slugs', placeholder: 'leave empty for top markets' },
    { key: 'limit', type: 'slider', label: 'Show top',     min: 3, max: 15, step: 1 },
    { key: 'refreshInterval', type: 'slider', label: 'Refresh', min: 60, max: 600, step: 30, unit: 's' }
  ],

  render(body, ctx) {
    const { data, settings } = ctx;
    let cancelled = false;
    ctx.onCleanup(() => { cancelled = true; });

    body.innerHTML = `
      <div class="poly">
        <div class="poly-list"></div>
        <div class="poly-footer">
          <button class="poly-add">+ Pin market</button>
          <span class="poly-updated"></span>
        </div>
      </div>`;
    const listEl    = body.querySelector('.poly-list');
    const updatedEl = body.querySelector('.poly-updated');
    const addBt     = body.querySelector('.poly-add');

    function getSlugs() {
      return (settings.slugs || '').split(',').map(s => s.trim()).filter(Boolean);
    }
    function setSlugs(arr) {
      settings.slugs = arr.join(',');
      ctx.save();
    }
    function fetchKey() {
      const slugs = getSlugs().slice().sort();
      return slugs.length ? 'p:' + slugs.join(',') : 'top:' + (settings.limit || 5);
    }

    function paint() {
      if (data.error && !data.markets) {
        listEl.innerHTML = `<div class="poly-empty poly-error">${escapeHtml(data.error)}</div>`;
        return;
      }
      if (!data.markets) {
        listEl.innerHTML = '<div class="poly-empty">Loading…</div>';
        updatedEl.textContent = '';
        return;
      }
      if (!data.markets.length) {
        listEl.innerHTML = '<div class="poly-empty">No markets found.</div>';
        return;
      }

      const pinned = new Set(getSlugs());

      listEl.innerHTML = data.markets.map(m => {
        if (!m) return '';
        const pairs = parseOutcomes(m).sort((a, b) => b.price - a.price);
        if (!pairs.length) return '';
        const top = pairs[0];
        const isBinary = pairs.length === 2
          && pairs.some(p => /^yes$/i.test(p.label))
          && pairs.some(p => /^no$/i.test(p.label));

        // Bar shows the leading outcome's probability
        let barPct = Math.round((top.price || 0) * 100);
        if (isBinary) {
          const yes = pairs.find(p => /^yes$/i.test(p.label));
          barPct = Math.round((yes?.price || 0) * 100);
        }

        let outcomesHtml = '';
        if (isBinary) {
          const yes = pairs.find(p => /^yes$/i.test(p.label));
          const no  = pairs.find(p => /^no$/i.test(p.label));
          const yesLeading = (yes?.price || 0) >= (no?.price || 0);
          outcomesHtml = `
            <div class="poly-outcome poly-outcome-yes ${yesLeading ? 'leading' : ''}">
              <span class="poly-outcome-label">Yes</span>
              <span class="poly-outcome-price">${formatCents(yes?.price)}</span>
            </div>
            <div class="poly-outcome poly-outcome-no ${!yesLeading ? 'leading' : ''}">
              <span class="poly-outcome-label">No</span>
              <span class="poly-outcome-price">${formatCents(no?.price)}</span>
            </div>`;
        } else {
          outcomesHtml = pairs.slice(0, 3).map((p, i) => `
            <div class="poly-outcome ${i === 0 ? 'leading poly-outcome-multi' : ''}">
              <span class="poly-outcome-label">${escapeHtml(p.label)}</span>
              <span class="poly-outcome-price">${formatCents(p.price)}</span>
            </div>`).join('');
        }

        const vol = formatVolume(m.volume24hr || m.volume);
        const endStr = formatEnd(m.endDate || m.end_date_iso);
        const url = `https://polymarket.com/event/${escapeHtml(m.slug || '')}`;
        const isPinned = pinned.has(m.slug);

        return `
          <div class="poly-item" data-slug="${escapeHtml(m.slug || '')}">
            <a class="poly-question" href="${url}" rel="noopener" title="${escapeHtml(m.question || '')}">${escapeHtml(m.question || 'Untitled')}</a>
            <div class="poly-bar ${isBinary ? 'binary' : ''}">
              <div class="poly-bar-fill" style="width:${barPct}%"></div>
            </div>
            <div class="poly-outcomes">${outcomesHtml}</div>
            <div class="poly-meta">
              <span>Vol ${escapeHtml(vol)}</span>
              ${endStr ? `<span>${escapeHtml(endStr)}</span>` : ''}
            </div>
            ${isPinned ? '<button class="poly-del" title="Unpin">×</button>' : ''}
          </div>`;
      }).join('');

      listEl.querySelectorAll('.poly-del').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          const slug = btn.closest('.poly-item').dataset.slug;
          setSlugs(getSlugs().filter(s => s !== slug));
          data.markets = null;
          refresh();
        });
      });
      updatedEl.textContent = data.fetchedAt ? formatAge(data.fetchedAt) : '';
    }

    async function refresh() {
      if (cancelled) return;
      const refreshMs = Math.max(60, settings.refreshInterval || 120) * 1000;
      const key = fetchKey();
      const stale = !data.markets
        || data.fetchKey !== key
        || (Date.now() - (data.fetchedAt || 0)) > refreshMs;
      if (!stale) { paint(); return; }

      if (!data.markets) paint(); // loading state
      try {
        let markets;
        const slugs = getSlugs();
        if (slugs.length) {
          const results = await Promise.all(slugs.map(s => fetchBySlug(s).catch(() => null)));
          markets = results.filter(Boolean);
        } else {
          const limit = Math.max(3, settings.limit || 5);
          markets = await fetchTop(limit);
          if (!Array.isArray(markets)) markets = [];
        }
        if (cancelled) return;
        data.markets   = markets;
        data.fetchKey  = key;
        data.fetchedAt = Date.now();
        data.error     = null;
        ctx.save();
        paint();
      } catch (err) {
        if (cancelled) return;
        data.error = err.message || 'Failed to load markets';
        paint();
        ctx.save();
      }
    }

    addBt.addEventListener('click', () => {
      const input = prompt('Polymarket URL or slug (e.g. will-trump-win-2024):');
      if (!input) return;
      const slug = extractSlug(input);
      if (!slug) return;
      const slugs = getSlugs();
      if (slugs.includes(slug)) return;
      setSlugs([...slugs, slug]);
      data.markets = null;
      refresh();
    });

    const intervalMs = Math.max(60, settings.refreshInterval || 120) * 1000;
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
