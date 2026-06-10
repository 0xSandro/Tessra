import { register } from '../widget-registry.js';
import { escapeHtml } from '../utils.js';
import { fetchYahoo, formatAge, formatChangePct } from './_quotes.js';

// Forex pairs via Yahoo (=X suffix). Users type pairs as EURUSD or EUR/USD;
// we normalize to EURUSD=X for the API and display them as EUR/USD.

// Accept "EURUSD", "EUR/USD", "eur-usd", or full "EURUSD=X"
function normalizePair(raw) {
  let s = (raw || '').trim().toUpperCase().replace(/[\s\-_/]/g, '');
  if (!s) return '';
  if (!/=X$/.test(s)) s += '=X';
  return s;
}

// Render "EURUSD=X" as "EUR/USD"
function displayPair(yahooSymbol) {
  const base = (yahooSymbol || '').replace(/=X$/i, '');
  if (base.length === 6) return base.slice(0, 3) + '/' + base.slice(3);
  return base || yahooSymbol;
}

// FX rates need more decimals than equities. Most majors trade at 4-5 dp,
// JPY pairs at 2-3, and exotic crosses can dip below 0.01.
function formatRate(price) {
  if (price == null || isNaN(price)) return '—';
  let dp = 4;
  if (price >= 100)   dp = 2;
  else if (price >= 10) dp = 3;
  else if (price < 0.01) dp = 6;
  return price.toFixed(dp);
}

register({
  type: 'forex',
  title: 'Forex',
  icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8h13l-3-3"/><path d="M21 16H8l3 3"/></svg>',
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
    pairs: 'EURUSD,GBPUSD,USDJPY,USDCHF',
    showChange: true,
    showName: false,
    refreshInterval: 60
  }),
  settingsSchema: [
    { key: 'pairs',      type: 'text',   label: 'Pairs', placeholder: 'EURUSD, USDJPY' },
    { key: 'showChange', type: 'toggle', label: 'Show daily change' },
    { key: 'showName',   type: 'toggle', label: 'Show full name' },
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
          <button class="stocks-add">+ Add pair</button>
          <span class="stocks-updated"></span>
        </div>
      </div>`;
    const listEl    = body.querySelector('.stocks-list');
    const updatedEl = body.querySelector('.stocks-updated');
    const addBt     = body.querySelector('.stocks-add');

    function getPairs() {
      return (settings.pairs || '')
        .split(',')
        .map(s => normalizePair(s))
        .filter(Boolean);
    }
    function setPairs(arr) {
      settings.pairs = arr.map(displayPair).join(',');
      ctx.save();
    }
    function fetchKey() { return getPairs().slice().sort().join(','); }

    function paint() {
      const pairs = getPairs();
      if (!pairs.length) {
        listEl.innerHTML = '<div class="stocks-empty">No pairs. Use “+ Add pair” below.</div>';
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

      const items = pairs.map(s => byId[s] || { ok: false, symbol: s });
      listEl.innerHTML = items.map(q => {
        if (!q.ok) {
          return `
            <div class="stocks-item stocks-item-error" data-symbol="${escapeHtml(q.symbol)}">
              <div class="stocks-info">
                <div class="stocks-symbol">${escapeHtml(displayPair(q.symbol))}</div>
                <div class="stocks-name stocks-name-error">Couldn't load</div>
              </div>
              <button class="stocks-del" title="Remove">×</button>
            </div>`;
        }
        const changeStr = formatChangePct(q.changePct);
        const changeCls = q.change != null ? (q.change >= 0 ? 'positive' : 'negative') : '';
        return `
          <div class="stocks-item" data-symbol="${escapeHtml(q.symbol)}">
            <div class="stocks-info">
              <div class="stocks-symbol-row">
                <span class="stocks-symbol">${escapeHtml(displayPair(q.symbol))}</span>
              </div>
              ${settings.showName ? `<div class="stocks-name">${escapeHtml(q.name)}</div>` : ''}
            </div>
            <div class="stocks-stats">
              <div class="stocks-price">${escapeHtml(formatRate(q.price))}</div>
              ${settings.showChange && changeStr ? `<div class="stocks-change ${changeCls}">${escapeHtml(changeStr)}</div>` : ''}
            </div>
            <button class="stocks-del" title="Remove">×</button>
          </div>`;
      }).join('');

      listEl.querySelectorAll('.stocks-del').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          const s = btn.closest('.stocks-item').dataset.symbol;
          setPairs(getPairs().filter(x => x !== s));
          paint();
        });
      });
      updatedEl.textContent = data.fetchedAt ? formatAge(data.fetchedAt) : '';
    }

    async function refresh() {
      if (cancelled) return;
      const pairs = getPairs();
      if (!pairs.length) { paint(); return; }

      const refreshMs = Math.max(30, settings.refreshInterval || 60) * 1000;
      const key = fetchKey();
      const stale = !data.quotes
        || data.quotesKey !== key
        || (Date.now() - (data.fetchedAt || 0)) > refreshMs;
      if (!stale) { paint(); return; }

      if (!data.quotes) paint();
      try {
        const results = await Promise.all(pairs.map(s =>
          fetchYahoo(s).catch(err => ({ ok: false, symbol: s, error: err.message }))
        ));
        if (cancelled) return;
        data.quotes    = results;
        data.quotesKey = key;
        data.fetchedAt = Date.now();
        const anyOk = results.some(r => r.ok);
        data.error = anyOk ? null : 'Failed to load rates';
        ctx.save();
        paint();
      } catch (err) {
        if (cancelled) return;
        data.error = err.message || 'Failed to load rates';
        paint();
        ctx.save();
      }
    }

    addBt.addEventListener('click', () => {
      const input = prompt('Forex pair (e.g. EURUSD, USDJPY, EUR/GBP):');
      if (!input) return;
      const sym = normalizePair(input);
      if (!sym) return;
      const pairs = getPairs();
      if (pairs.includes(sym)) return;
      setPairs([...pairs, sym]);
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
