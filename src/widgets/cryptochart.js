import { register } from '../widget-registry.js';
import { escapeHtml } from '../utils.js';

// Crypto chart — bare CoinGecko frame, nothing else. The widget body holds a
// single full-bleed <gecko-coin-price-chart-widget>. No padding, no header,
// no extra text — the CoinGecko frame already renders its own coin name,
// price, range tabs, etc. We just give it room to live.
//
// Default size targets CoinGecko's documented constraints: min width 300 px
// for the chart to lay out properly, and ~380 px tall so the range tabs sit
// below the chart without being squeezed.
//
// Manifest needs:
//   - host permission for widgets.coingecko.com (script load + CDN)
//   - CSP allowing script-src https://widgets.coingecko.com

const SCRIPT_URL  = 'https://widgets.coingecko.com/gecko-coin-price-chart-widget.js';
const ELEMENT_TAG = 'gecko-coin-price-chart-widget';

let scriptPromise = null;
function ensureScript() {
  if (window.customElements && window.customElements.get(ELEMENT_TAG)) {
    return Promise.resolve();
  }
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${SCRIPT_URL}"]`);
    if (existing) {
      existing.addEventListener('load',  () => resolve());
      existing.addEventListener('error', () => reject(new Error('Widget script failed to load')));
      return;
    }
    const s = document.createElement('script');
    s.src = SCRIPT_URL;
    s.async = true;
    s.onload  = () => resolve();
    s.onerror = () => {
      scriptPromise = null;
      reject(new Error('Widget script failed to load'));
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

const SYMBOL_TO_ID = {
  BTC: 'bitcoin',  ETH: 'ethereum',   SOL: 'solana',     ADA: 'cardano',
  DOT: 'polkadot', XRP: 'ripple',     DOGE: 'dogecoin',  AVAX: 'avalanche-2',
  MATIC: 'matic-network', LINK: 'chainlink', LTC: 'litecoin',  BCH: 'bitcoin-cash',
  ATOM: 'cosmos',  NEAR: 'near',      APT: 'aptos',      ARB: 'arbitrum',
  OP: 'optimism',  UNI: 'uniswap',    TRX: 'tron',       SHIB: 'shiba-inu',
  PEPE: 'pepe',    BNB: 'binancecoin', SUI: 'sui',       TON: 'the-open-network'
};

function normalizeCoinId(raw) {
  const s = (raw || '').trim();
  if (!s) return '';
  const upper = s.toUpperCase();
  if (SYMBOL_TO_ID[upper]) return SYMBOL_TO_ID[upper];
  return s.toLowerCase().replace(/[^a-z0-9-]/g, '');
}

register({
  type: 'cryptochart',
  title: 'Crypto Chart',
  icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 17 9 11 13 15 21 7"/><circle cx="6" cy="14.5" r="1.2" fill="currentColor" stroke="none"/><circle cx="11.2" cy="12.8" r="1.2" fill="currentColor" stroke="none"/><circle cx="15.5" cy="13.5" r="1.2" fill="currentColor" stroke="none"/></svg>',
  category: 'finance',
  // 340×310 fits the CoinGecko frame's chart + range tabs snugly at spawn.
  defaultSize: { w: 340, h: 310 },
  minSize:     { w: 300, h: 260 },

  defaultData: () => ({}),

  defaultSettings: () => ({
    coinId: 'bitcoin',
    currency: 'usd',
    darkMode: false,
    transparent: true,
    outlined: false
  }),
  settingsSchema: [
    { key: 'coinId',      type: 'text',   label: 'Coin',
      placeholder: 'bitcoin, eth, solana, shiba-inu…' },
    { key: 'currency',    type: 'select', label: 'Currency', options: [
      { value: 'usd', label: 'USD' }, { value: 'eur', label: 'EUR' },
      { value: 'gbp', label: 'GBP' }, { value: 'jpy', label: 'JPY' },
      { value: 'chf', label: 'CHF' }, { value: 'btc', label: 'BTC' },
      { value: 'eth', label: 'ETH' }
    ]},
    { key: 'darkMode',    type: 'toggle', label: 'Dark mode' },
    { key: 'transparent', type: 'toggle', label: 'Transparent background' },
    { key: 'outlined',    type: 'toggle', label: 'Outlined' }
  ],

  render(body, ctx) {
    const { settings } = ctx;
    let destroyed = false;
    ctx.onCleanup(() => { destroyed = true; });

    const coinId   = normalizeCoinId(settings.coinId);
    const currency = (settings.currency || 'usd').toLowerCase();

    // Body is the bare frame. Loading/empty state is rendered inline and
    // replaced once the script + custom element are ready.
    body.innerHTML = `
      <div class="cgchart-frame">
        <div class="cgchart-empty">${coinId ? 'Loading chart…' : 'Set a coin in settings.'}</div>
      </div>`;
    const frame = body.querySelector('.cgchart-frame');
    if (!coinId) return;

    ensureScript().then(() => {
      if (destroyed) return;
      if (!body.contains(frame)) return;
      frame.innerHTML = '';
      const el = document.createElement(ELEMENT_TAG);
      el.setAttribute('coin-id', coinId);
      el.setAttribute('currency', currency);
      el.setAttribute('locale', 'en');
      if (settings.darkMode)    el.setAttribute('dark-mode', '');
      if (settings.transparent) el.setAttribute('transparent-background', '');
      if (settings.outlined)    el.setAttribute('outlined', '');
      el.style.display = 'block';
      el.style.width  = '100%';
      el.style.height = '100%';
      frame.appendChild(el);
    }).catch(err => {
      if (destroyed) return;
      frame.innerHTML = `<div class="cgchart-empty">Failed to load CoinGecko widget: ${escapeHtml(err.message || 'unknown error')}</div>`;
    });
  }
});
