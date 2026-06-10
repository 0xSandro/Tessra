import { register } from '../widget-registry.js';
import { escapeHtml } from '../utils.js';

// CoinGecko free tier: ~30 requests/minute. Our refresh interval is 60s+,
// and results are cached on the widget instance, so multiple tabs share data
// via the same persisted state. Coin IDs are CoinGecko slugs (bitcoin, ethereum,
// solana, etc.) — find them at coingecko.com/en/coins.

function formatPrice(price, currency) {
  if (price == null || isNaN(price)) return '—';
  const upper = (currency || 'usd').toUpperCase();
  // Granularity scales with magnitude so sub-dollar coins still show meaningful digits
  let maxFrac = 2;
  if (price < 0.01) maxFrac = 8;
  else if (price < 1) maxFrac = 6;
  else if (price < 100) maxFrac = 4;
  try {
    return new Intl.NumberFormat([], {
      style: 'currency',
      currency: upper,
      maximumFractionDigits: maxFrac,
      minimumFractionDigits: 0
    }).format(price);
  } catch {
    // Crypto vs crypto denominators (BTC, ETH) — not ISO 4217
    return price.toLocaleString([], { maximumFractionDigits: maxFrac, minimumFractionDigits: 0 }) + ' ' + upper;
  }
}

function formatChange(change) {
  if (change == null || isNaN(change)) return '';
  const sign = change >= 0 ? '+' : '';
  return sign + change.toFixed(2) + '%';
}

function formatMarketCap(mcap, currency) {
  if (mcap == null || isNaN(mcap)) return '';
  const upper = (currency || 'usd').toUpperCase();
  const isFiat = ['USD','EUR','GBP','JPY','CNY','CAD','AUD','CHF'].includes(upper);
  let sym = isFiat ? '' : '';
  try { sym = new Intl.NumberFormat([], { style: 'currency', currency: upper }).formatToParts(0).find(p => p.type === 'currency')?.value || ''; } catch {}
  if (mcap >= 1e12) return `${sym}${(mcap / 1e12).toFixed(2)}T`;
  if (mcap >= 1e9)  return `${sym}${(mcap / 1e9).toFixed(2)}B`;
  if (mcap >= 1e6)  return `${sym}${(mcap / 1e6).toFixed(2)}M`;
  if (mcap >= 1e3)  return `${sym}${(mcap / 1e3).toFixed(2)}K`;
  return `${sym}${mcap.toFixed(0)}`;
}

function formatAge(ms) {
  if (!ms) return '';
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60)   return `Updated ${s}s ago`;
  if (s < 3600) return `Updated ${Math.round(s / 60)}m ago`;
  return `Updated ${Math.round(s / 3600)}h ago`;
}

register({
  type: 'crypto',
  title: 'Crypto Prices',
  icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="9" r="6"/><circle cx="15" cy="15" r="6"/></svg>',
  category: 'finance',
  defaultSize: { w: 320, h: 320 },
  minSize:     { w: 240, h: 220 },

  defaultData: () => ({
    prices: null,
    priceKey: '',   // hash of the params the cache was fetched for
    fetchedAt: 0,
    error: null
  }),

  defaultSettings: () => ({
    coins: 'bitcoin,ethereum,solana',
    vsCurrency: 'usd',
    show24hChange: true,
    showMarketCap: false,
    refreshInterval: 60
  }),
  settingsSchema: [
    { key: 'coins',     type: 'text',   label: 'Coin IDs', placeholder: 'bitcoin, ethereum, solana' },
    { key: 'vsCurrency', type: 'select', label: 'Currency', options: [
      { value: 'usd', label: 'USD ($)' },
      { value: 'eur', label: 'EUR (€)' },
      { value: 'gbp', label: 'GBP (£)' },
      { value: 'jpy', label: 'JPY (¥)' },
      { value: 'cny', label: 'CNY (¥)' },
      { value: 'cad', label: 'CAD' },
      { value: 'aud', label: 'AUD' },
      { value: 'chf', label: 'CHF' },
      { value: 'btc', label: 'BTC' },
      { value: 'eth', label: 'ETH' }
    ]},
    { key: 'show24hChange', type: 'toggle', label: 'Show 24h change' },
    { key: 'showMarketCap', type: 'toggle', label: 'Show market cap' },
    { key: 'refreshInterval', type: 'slider', label: 'Refresh', min: 30, max: 600, step: 30, unit: 's' }
  ],

  render(body, ctx) {
    const { data, settings } = ctx;
    let cancelled = false;
    ctx.onCleanup(() => { cancelled = true; });

    body.innerHTML = `
      <div class="crypto">
        <div class="crypto-list"></div>
        <div class="crypto-footer">
          <button class="crypto-add">+ Add coin</button>
          <span class="crypto-updated"></span>
        </div>
      </div>`;
    const listEl    = body.querySelector('.crypto-list');
    const updatedEl = body.querySelector('.crypto-updated');
    const addBt     = body.querySelector('.crypto-add');

    function getCoinIds() {
      return (settings.coins || '')
        .split(',')
        .map(s => s.trim().toLowerCase())
        .filter(Boolean);
    }
    function setCoinIds(ids) {
      settings.coins = ids.join(',');
      ctx.save();
    }
    function fetchKey() {
      return getCoinIds().sort().join(',') + '|' + (settings.vsCurrency || 'usd');
    }

    function paint() {
      const ids = getCoinIds();
      if (!ids.length) {
        listEl.innerHTML = '<div class="crypto-empty">No coins added. Use “+ Add coin” below.</div>';
        updatedEl.textContent = '';
        return;
      }
      if (data.error && !data.prices) {
        listEl.innerHTML = `<div class="crypto-empty crypto-error">${escapeHtml(data.error)}</div>`;
        return;
      }
      if (!data.prices) {
        listEl.innerHTML = '<div class="crypto-empty">Loading…</div>';
        updatedEl.textContent = '';
        return;
      }
      // Preserve user-defined order
      const byId = {};
      data.prices.forEach(c => { byId[c.id] = c; });
      const items = ids.map(id => byId[id]).filter(Boolean);
      const missing = ids.filter(id => !byId[id]);

      if (!items.length) {
        listEl.innerHTML = `<div class="crypto-empty">No matching coins. Check your IDs at coingecko.com.</div>`;
        return;
      }
      let html = items.map(coin => {
        const sym = (coin.symbol || coin.id).toUpperCase();
        const price = formatPrice(coin.current_price, settings.vsCurrency);
        const change = coin.price_change_percentage_24h;
        const changeStr = formatChange(change);
        const changeCls = changeStr ? (change >= 0 ? 'positive' : 'negative') : '';
        return `
          <div class="crypto-item" data-id="${escapeHtml(coin.id)}">
            ${coin.image
                ? `<img class="crypto-icon" src="${escapeHtml(coin.image)}" alt="" onerror="this.style.visibility='hidden'"/>`
                : `<div class="crypto-icon"></div>`}
            <div class="crypto-info">
              <div class="crypto-symbol">${escapeHtml(sym)}</div>
              <div class="crypto-name">${escapeHtml(coin.name || coin.id)}</div>
            </div>
            <div class="crypto-stats">
              <div class="crypto-price">${escapeHtml(price)}</div>
              ${settings.show24hChange && changeStr ? `<div class="crypto-change ${changeCls}">${escapeHtml(changeStr)}</div>` : ''}
              ${settings.showMarketCap && coin.market_cap ? `<div class="crypto-mcap">${escapeHtml(formatMarketCap(coin.market_cap, settings.vsCurrency))}</div>` : ''}
            </div>
            <button class="crypto-del" title="Remove">×</button>
          </div>`;
      }).join('');
      if (missing.length) {
        html += `<div class="crypto-missing">Not found: ${escapeHtml(missing.join(', '))}</div>`;
      }
      listEl.innerHTML = html;

      listEl.querySelectorAll('.crypto-del').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          const id = btn.closest('.crypto-item').dataset.id;
          setCoinIds(getCoinIds().filter(c => c !== id));
          paint();
        });
      });
      updatedEl.textContent = data.fetchedAt ? formatAge(data.fetchedAt) : '';
    }

    async function refresh() {
      if (cancelled) return;
      const ids = getCoinIds();
      if (!ids.length) { paint(); return; }

      const refreshMs = Math.max(30, settings.refreshInterval || 60) * 1000;
      const key = fetchKey();
      const stale = !data.prices
        || data.priceKey !== key
        || (Date.now() - (data.fetchedAt || 0)) > refreshMs;

      if (!stale) { paint(); return; }

      try {
        if (!data.prices) paint(); // initial loading state
        const params = new URLSearchParams({
          vs_currency: settings.vsCurrency || 'usd',
          ids: ids.join(','),
          order: 'market_cap_desc',
          sparkline: 'false',
          price_change_percentage: '24h'
        });
        const url = `https://api.coingecko.com/api/v3/coins/markets?${params.toString()}`;
        const res = await fetch(url);
        if (cancelled) return;
        if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
        const j = await res.json();
        if (cancelled) return;
        data.prices    = j;
        data.priceKey  = key;
        data.fetchedAt = Date.now();
        data.error     = null;
        ctx.save();
        paint();
      } catch (err) {
        if (cancelled) return;
        data.error = err.message || 'Failed to load prices';
        paint();
        ctx.save();
      }
    }

    addBt.addEventListener('click', async () => {
      const input = prompt('CoinGecko ID (e.g. bitcoin, ethereum, dogecoin):');
      if (!input) return;
      const id = input.trim().toLowerCase();
      if (!id) return;
      const ids = getCoinIds();
      if (ids.includes(id)) return;
      setCoinIds([...ids, id]);
      data.prices = null; // force refetch with the new id
      refresh();
    });

    // Periodic background refresh
    const intervalMs = Math.max(30, settings.refreshInterval || 60) * 1000;
    const interval = setInterval(refresh, intervalMs);
    ctx.onCleanup(() => clearInterval(interval));

    // Soft "updated N min ago" tick so the footer label stays current without
    // needing a re-fetch
    const ageInterval = setInterval(() => {
      if (data.fetchedAt) updatedEl.textContent = formatAge(data.fetchedAt);
    }, 30 * 1000);
    ctx.onCleanup(() => clearInterval(ageInterval));

    paint();    // immediate paint from cached data
    refresh();  // possibly refetch
  }
});
