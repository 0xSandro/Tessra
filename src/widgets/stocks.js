import { register } from '../widget-registry.js';
import { escapeHtml } from '../utils.js';

// Yahoo Finance's v8 chart endpoint. Unofficial but widely used; returns
// enough metadata to compute current price + change without an API key.
// We fetch one symbol per request and parallelize. Results are cached on
// data.quotes between renders so opening multiple tabs doesn't re-fetch
// until the data is stale.

const MARKET_STATE_LABELS = {
  PRE: 'Pre',
  POST: 'After',
  POSTPOST: 'After',
  PREPRE: 'Pre',
  CLOSED: 'Closed'
};

function formatPrice(price, currency) {
  if (price == null || isNaN(price)) return '—';
  let maxFrac = 2;
  if (price < 1)   maxFrac = 4;
  if (price < 0.1) maxFrac = 6;
  const upper = (currency || 'USD').toUpperCase();
  try {
    return new Intl.NumberFormat([], {
      style: 'currency',
      currency: upper,
      maximumFractionDigits: maxFrac,
      minimumFractionDigits: maxFrac >= 2 ? 2 : 0
    }).format(price);
  } catch {
    return price.toFixed(maxFrac) + ' ' + upper;
  }
}

function formatChange(change, pct) {
  if (change == null || isNaN(change)) return '';
  const sign = change >= 0 ? '+' : '';
  const pctStr = (pct != null && !isNaN(pct)) ? `${sign}${pct.toFixed(2)}%` : '';
  return pctStr;
}

function formatAge(ms) {
  if (!ms) return '';
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60)   return `Updated ${s}s ago`;
  if (s < 3600) return `Updated ${Math.round(s / 60)}m ago`;
  return `Updated ${Math.round(s / 3600)}h ago`;
}

async function fetchOneSymbol(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  if (j.chart?.error) throw new Error(j.chart.error.description || 'Yahoo error');
  const r = j.chart?.result?.[0];
  if (!r || !r.meta) throw new Error('No data');
  const m = r.meta;
  const price = m.regularMarketPrice;
  const prev  = m.chartPreviousClose ?? m.previousClose;
  let change = null, changePct = null;
  if (price != null && prev != null) {
    change = price - prev;
    changePct = prev !== 0 ? (change / prev) * 100 : 0;
  }
  return {
    ok: true,
    symbol: m.symbol || symbol,
    name: m.longName || m.shortName || m.symbol || symbol,
    exchange: m.fullExchangeName || m.exchangeName || '',
    currency: m.currency || 'USD',
    price,
    prev,
    change,
    changePct,
    marketState: m.marketState || 'CLOSED'
  };
}

register({
  type: 'stocks',
  title: 'Stock Prices',
  icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 17 9 11 13 15 21 7"/><polyline points="14 7 21 7 21 14"/></svg>',
  category: 'finance',
  defaultSize: { w: 320, h: 320 },
  minSize:     { w: 240, h: 200 },

  defaultData: () => ({
    quotes: null,
    quotesKey: '',
    fetchedAt: 0,
    error: null
  }),

  defaultSettings: () => ({
    symbols: 'AAPL,MSFT,GOOGL,NVDA',
    showChange: true,
    showName: true,
    refreshInterval: 60
  }),
  settingsSchema: [
    { key: 'symbols',    type: 'text',   label: 'Symbols', placeholder: 'AAPL, MSFT, GOOGL' },
    { key: 'showChange', type: 'toggle', label: 'Show daily change' },
    { key: 'showName',   type: 'toggle', label: 'Show company name' },
    { key: 'refreshInterval', type: 'slider', label: 'Refresh', min: 30, max: 600, step: 30, unit: 's' }
  ],

  render(body, ctx) {
    const { data, settings } = ctx;
    let cancelled = false;
    ctx.onCleanup(() => { cancelled = true; });

    body.innerHTML = `
      <div class="stocks">
        <div class="stocks-list"></div>
        <div class="stocks-footer">
          <button class="stocks-add">+ Add symbol</button>
          <span class="stocks-updated"></span>
        </div>
      </div>`;
    const listEl    = body.querySelector('.stocks-list');
    const updatedEl = body.querySelector('.stocks-updated');
    const addBt     = body.querySelector('.stocks-add');

    function getSymbols() {
      return (settings.symbols || '')
        .split(',')
        .map(s => s.trim().toUpperCase())
        .filter(Boolean);
    }
    function setSymbols(syms) {
      settings.symbols = syms.join(',');
      ctx.save();
    }
    function fetchKey() { return getSymbols().sort().join(','); }

    function paint() {
      const syms = getSymbols();
      if (!syms.length) {
        listEl.innerHTML = '<div class="stocks-empty">No symbols. Use “+ Add symbol” below.</div>';
        updatedEl.textContent = '';
        return;
      }
      if (data.error && !data.quotes) {
        listEl.innerHTML = `<div class="stocks-empty stocks-error">${escapeHtml(data.error)}</div>`;
        return;
      }
      if (!data.quotes) {
        listEl.innerHTML = '<div class="stocks-empty">Loading…</div>';
        updatedEl.textContent = '';
        return;
      }

      // Preserve the user's order
      const byId = {};
      data.quotes.forEach(q => { if (q) byId[(q.symbol || '').toUpperCase()] = q; });

      const items = syms.map(s => byId[s] || { ok: false, symbol: s });
      listEl.innerHTML = items.map(q => {
        if (!q.ok) {
          return `
            <div class="stocks-item stocks-item-error" data-symbol="${escapeHtml(q.symbol)}">
              <div class="stocks-info">
                <div class="stocks-symbol">${escapeHtml(q.symbol)}</div>
                <div class="stocks-name stocks-name-error">Couldn't load</div>
              </div>
              <button class="stocks-del" title="Remove">×</button>
            </div>`;
        }
        const price = formatPrice(q.price, q.currency);
        const changeStr = formatChange(q.change, q.changePct);
        const changeCls = q.change != null ? (q.change >= 0 ? 'positive' : 'negative') : '';
        const marketLabel = MARKET_STATE_LABELS[q.marketState];
        return `
          <div class="stocks-item" data-symbol="${escapeHtml(q.symbol)}">
            <div class="stocks-info">
              <div class="stocks-symbol-row">
                <span class="stocks-symbol">${escapeHtml(q.symbol)}</span>
                ${marketLabel ? `<span class="stocks-market" data-state="${escapeHtml(q.marketState)}">${escapeHtml(marketLabel)}</span>` : ''}
              </div>
              ${settings.showName ? `<div class="stocks-name">${escapeHtml(q.name)}</div>` : ''}
            </div>
            <div class="stocks-stats">
              <div class="stocks-price">${escapeHtml(price)}</div>
              ${settings.showChange && changeStr ? `<div class="stocks-change ${changeCls}">${escapeHtml(changeStr)}</div>` : ''}
            </div>
            <button class="stocks-del" title="Remove">×</button>
          </div>`;
      }).join('');

      listEl.querySelectorAll('.stocks-del').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          const s = btn.closest('.stocks-item').dataset.symbol;
          setSymbols(getSymbols().filter(x => x !== s));
          paint();
        });
      });
      updatedEl.textContent = data.fetchedAt ? formatAge(data.fetchedAt) : '';
    }

    async function refresh() {
      if (cancelled) return;
      const syms = getSymbols();
      if (!syms.length) { paint(); return; }

      const refreshMs = Math.max(30, settings.refreshInterval || 60) * 1000;
      const key = fetchKey();
      const stale = !data.quotes
        || data.quotesKey !== key
        || (Date.now() - (data.fetchedAt || 0)) > refreshMs;
      if (!stale) { paint(); return; }

      if (!data.quotes) paint(); // initial loading state
      try {
        const results = await Promise.all(syms.map(s =>
          fetchOneSymbol(s).catch(err => ({ ok: false, symbol: s, error: err.message }))
        ));
        if (cancelled) return;
        data.quotes    = results;
        data.quotesKey = key;
        data.fetchedAt = Date.now();
        // Surface a global error only when every symbol failed
        const anyOk = results.some(r => r.ok);
        data.error = anyOk ? null : 'Failed to load quotes';
        ctx.save();
        paint();
      } catch (err) {
        if (cancelled) return;
        data.error = err.message || 'Failed to load quotes';
        paint();
        ctx.save();
      }
    }

    addBt.addEventListener('click', () => {
      const input = prompt('Stock symbol (e.g. AAPL, TSLA, NVDA):');
      if (!input) return;
      const sym = input.trim().toUpperCase();
      if (!sym) return;
      const syms = getSymbols();
      if (syms.includes(sym)) return;
      setSymbols([...syms, sym]);
      data.quotes = null;   // force refetch with the new symbol
      refresh();
    });

    const intervalMs = Math.max(30, settings.refreshInterval || 60) * 1000;
    const interval = setInterval(refresh, intervalMs);
    ctx.onCleanup(() => clearInterval(interval));
    // Soft tick to keep the "Updated N min ago" label fresh
    const ageInterval = setInterval(() => {
      if (data.fetchedAt) updatedEl.textContent = formatAge(data.fetchedAt);
    }, 30 * 1000);
    ctx.onCleanup(() => clearInterval(ageInterval));

    paint();
    refresh();
  }
});
