import { register } from '../widget-registry.js';
import { escapeHtml } from '../utils.js';
import { fetchYahoo, formatAge, formatChangePct, MARKET_STATE_LABELS } from './_quotes.js';

// ETFs ride the same Yahoo pipeline as stocks but ship with broad-market
// default holdings (SPY, QQQ, VTI, VOO, VEA). Functionally a sibling of
// the stocks widget — the catalog separation is a UX nicety, not a code one.

function formatPrice(price, currency) {
  if (price == null || isNaN(price)) return '—';
  const upper = (currency || 'USD').toUpperCase();
  try {
    return new Intl.NumberFormat([], {
      style: 'currency',
      currency: upper,
      maximumFractionDigits: 2,
      minimumFractionDigits: 2
    }).format(price);
  } catch {
    return price.toFixed(2) + ' ' + upper;
  }
}

register({
  type: 'etfs',
  title: 'ETFs',
  icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 3v9l6.5 3.75"/><path d="M12 12L5.5 15.75"/></svg>',
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
    symbols: 'SPY,QQQ,VTI,VOO,VEA',
    showChange: true,
    showName: true,
    refreshInterval: 60
  }),
  settingsSchema: [
    { key: 'symbols',    type: 'text',   label: 'Tickers', placeholder: 'SPY, QQQ, VTI' },
    { key: 'showChange', type: 'toggle', label: 'Show daily change' },
    { key: 'showName',   type: 'toggle', label: 'Show fund name' },
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
          <button class="stocks-add">+ Add ETF</button>
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
    function fetchKey() { return getSymbols().slice().sort().join(','); }

    function paint() {
      const syms = getSymbols();
      if (!syms.length) {
        listEl.innerHTML = '<div class="stocks-empty">No ETFs. Use “+ Add ETF” below.</div>';
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
        const changeStr = formatChangePct(q.changePct);
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

      if (!data.quotes) paint();
      try {
        const results = await Promise.all(syms.map(s =>
          fetchYahoo(s).catch(err => ({ ok: false, symbol: s, error: err.message }))
        ));
        if (cancelled) return;
        data.quotes    = results;
        data.quotesKey = key;
        data.fetchedAt = Date.now();
        const anyOk = results.some(r => r.ok);
        data.error = anyOk ? null : 'Failed to load ETFs';
        ctx.save();
        paint();
      } catch (err) {
        if (cancelled) return;
        data.error = err.message || 'Failed to load ETFs';
        paint();
        ctx.save();
      }
    }

    addBt.addEventListener('click', () => {
      const input = prompt('ETF ticker (e.g. SPY, QQQ, VTI):');
      if (!input) return;
      const sym = input.trim().toUpperCase();
      if (!sym) return;
      const syms = getSymbols();
      if (syms.includes(sym)) return;
      setSymbols([...syms, sym]);
      data.quotes = null;
      refresh();
    });

    const intervalMs = Math.max(30, settings.refreshInterval || 60) * 1000;
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
