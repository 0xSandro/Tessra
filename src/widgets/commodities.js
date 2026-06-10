import { register } from '../widget-registry.js';
import { escapeHtml } from '../utils.js';
import { fetchYahoo, formatAge, formatChangePct, MARKET_STATE_LABELS } from './_quotes.js';

// Commodities via Yahoo futures tickers (=F suffix). Defaults are continuous
// front-month contracts: gold (GC), silver (SI), WTI crude (CL), nat gas (NG).
// We map the cryptic root symbol to a friendly display name + unit hint.

const COMMODITY_META = {
  'GC=F':  { name: 'Gold',        unit: '/oz'    },
  'SI=F':  { name: 'Silver',      unit: '/oz'    },
  'PL=F':  { name: 'Platinum',    unit: '/oz'    },
  'PA=F':  { name: 'Palladium',   unit: '/oz'    },
  'HG=F':  { name: 'Copper',      unit: '/lb'    },
  'CL=F':  { name: 'Crude Oil',   unit: '/bbl'   },
  'BZ=F':  { name: 'Brent Oil',   unit: '/bbl'   },
  'NG=F':  { name: 'Natural Gas', unit: '/MMBtu' },
  'RB=F':  { name: 'Gasoline',    unit: '/gal'   },
  'HO=F':  { name: 'Heating Oil', unit: '/gal'   },
  'ZC=F':  { name: 'Corn',        unit: '/bu'    },
  'ZW=F':  { name: 'Wheat',       unit: '/bu'    },
  'ZS=F':  { name: 'Soybeans',    unit: '/bu'    },
  'KC=F':  { name: 'Coffee',      unit: '/lb'    },
  'SB=F':  { name: 'Sugar',       unit: '/lb'    },
  'CC=F':  { name: 'Cocoa',       unit: '/t'     },
  'CT=F':  { name: 'Cotton',      unit: '/lb'    },
  'LE=F':  { name: 'Live Cattle', unit: '/lb'    },
  'HE=F':  { name: 'Lean Hogs',   unit: '/lb'    }
};

// Accept "gold", "GC", "GC=F", "GC F" — normalize to Yahoo's "GC=F" form.
function normalizeCommodity(raw) {
  let s = (raw || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!s) return '';
  // Friendly name → ticker (only matches the canonical defaults)
  const byName = {
    GOLD: 'GC=F', SILVER: 'SI=F', PLATINUM: 'PL=F', PALLADIUM: 'PA=F',
    COPPER: 'HG=F', OIL: 'CL=F', CRUDE: 'CL=F', WTI: 'CL=F', BRENT: 'BZ=F',
    GAS: 'NG=F', NATGAS: 'NG=F', GASOLINE: 'RB=F',
    CORN: 'ZC=F', WHEAT: 'ZW=F', SOYBEANS: 'ZS=F', SOY: 'ZS=F',
    COFFEE: 'KC=F', SUGAR: 'SB=F', COCOA: 'CC=F', COTTON: 'CT=F'
  };
  if (byName[s]) return byName[s];
  if (!/=F$/.test(s)) s += '=F';
  return s;
}

function displayName(yahooSymbol, fallback) {
  return COMMODITY_META[yahooSymbol]?.name || fallback || yahooSymbol.replace(/=F$/, '');
}
function displayUnit(yahooSymbol) {
  return COMMODITY_META[yahooSymbol]?.unit || '';
}

function formatPrice(price, currency) {
  if (price == null || isNaN(price)) return '—';
  const upper = (currency || 'USD').toUpperCase();
  const dp = price < 10 ? 3 : 2;
  try {
    return new Intl.NumberFormat([], {
      style: 'currency',
      currency: upper,
      maximumFractionDigits: dp,
      minimumFractionDigits: dp
    }).format(price);
  } catch {
    return price.toFixed(dp) + ' ' + upper;
  }
}

register({
  type: 'commodities',
  title: 'Commodities',
  icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="10" width="18" height="6" rx="1"/><path d="M6 10V7"/><path d="M18 10V7"/><path d="M6 19v-3"/><path d="M18 19v-3"/></svg>',
  category: 'finance',
  defaultSize: { w: 340, h: 320 },
  minSize:     { w: 240, h: 200 },

  defaultData: () => ({
    quotes: null,
    quotesKey: '',
    fetchedAt: 0,
    error: null
  }),

  defaultSettings: () => ({
    symbols: 'GC=F,SI=F,CL=F,NG=F',
    showChange: true,
    showUnit: true,
    refreshInterval: 120
  }),
  settingsSchema: [
    { key: 'symbols',    type: 'text',   label: 'Tickers', placeholder: 'GC=F, CL=F, gold, oil' },
    { key: 'showChange', type: 'toggle', label: 'Show daily change' },
    { key: 'showUnit',   type: 'toggle', label: 'Show unit (/oz, /bbl…)' },
    { key: 'refreshInterval', type: 'slider', label: 'Refresh', min: 60, max: 600, step: 30, unit: 's' }
  ],

  render(body, ctx) {
    const { data, settings } = ctx;
    let cancelled = false;
    ctx.onCleanup(() => { cancelled = true; });

    body.innerHTML = `
      <div class="stocks">
        <div class="stocks-list"></div>
        <div class="stocks-footer">
          <button class="stocks-add">+ Add commodity</button>
          <span class="stocks-updated"></span>
        </div>
      </div>`;
    const listEl    = body.querySelector('.stocks-list');
    const updatedEl = body.querySelector('.stocks-updated');
    const addBt     = body.querySelector('.stocks-add');

    function getSymbols() {
      return (settings.symbols || '')
        .split(',')
        .map(normalizeCommodity)
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
        listEl.innerHTML = '<div class="stocks-empty">No commodities. Use “+ Add commodity” below.</div>';
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
                <div class="stocks-symbol">${escapeHtml(displayName(q.symbol))}</div>
                <div class="stocks-name stocks-name-error">Couldn't load</div>
              </div>
              <button class="stocks-del" title="Remove">×</button>
            </div>`;
        }
        const name = displayName(q.symbol, q.name);
        const unit = settings.showUnit ? displayUnit(q.symbol) : '';
        const priceStr = formatPrice(q.price, q.currency) + (unit ? `<span class="commodities-unit">${escapeHtml(unit)}</span>` : '');
        const changeStr = formatChangePct(q.changePct);
        const changeCls = q.change != null ? (q.change >= 0 ? 'positive' : 'negative') : '';
        const marketLabel = MARKET_STATE_LABELS[q.marketState];
        return `
          <div class="stocks-item" data-symbol="${escapeHtml(q.symbol)}">
            <div class="stocks-info">
              <div class="stocks-symbol-row">
                <span class="stocks-symbol">${escapeHtml(name)}</span>
                ${marketLabel ? `<span class="stocks-market" data-state="${escapeHtml(q.marketState)}">${escapeHtml(marketLabel)}</span>` : ''}
              </div>
              <div class="stocks-name">${escapeHtml(q.symbol)}</div>
            </div>
            <div class="stocks-stats">
              <div class="stocks-price">${priceStr}</div>
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

      const refreshMs = Math.max(60, settings.refreshInterval || 120) * 1000;
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
        data.error = anyOk ? null : 'Failed to load commodities';
        ctx.save();
        paint();
      } catch (err) {
        if (cancelled) return;
        data.error = err.message || 'Failed to load commodities';
        paint();
        ctx.save();
      }
    }

    addBt.addEventListener('click', () => {
      const input = prompt('Commodity name or ticker (e.g. gold, oil, GC=F, ZC=F):');
      if (!input) return;
      const sym = normalizeCommodity(input);
      if (!sym) return;
      const syms = getSymbols();
      if (syms.includes(sym)) return;
      setSymbols([...syms, sym]);
      data.quotes = null;
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
