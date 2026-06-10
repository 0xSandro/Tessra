import { register } from '../widget-registry.js';
import { escapeHtml } from '../utils.js';

// Crypto chart via CoinGecko's official Coin Price Chart Widget.
// We load https://widgets.coingecko.com/coingecko-coin-price-chart-widget.js
// once globally; it registers a <coingecko-coin-price-chart-widget> custom
// element, and the widget itself injects a sandboxed iframe pointing at
// CoinGecko's CDN. Cross-origin iframe content can't be themed by us, but
// CoinGecko already handles dark mode internally based on system preference.
//
// Manifest needs:
//   - host permission for widgets.coingecko.com (for the script)
//   - CSP allowing script-src https://widgets.coingecko.com

const SCRIPT_URL = 'https://widgets.coingecko.com/coingecko-coin-price-chart-widget.js';
const ELEMENT_TAG = 'coingecko-coin-price-chart-widget';

// Singleton loader — multiple chart widgets share the same script load.
let scriptPromise = null;
function ensureScript() {
  if (window.customElements && window.customElements.get(ELEMENT_TAG)) {
    return Promise.resolve();
  }
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${SCRIPT_URL}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Widget script failed to load')));
      return;
    }
    const s = document.createElement('script');
    s.src = SCRIPT_URL;
    s.async = true;
    s.onload  = () => resolve();
    s.onerror = () => {
      scriptPromise = null;  // allow retry next render
      reject(new Error('Widget script failed to load'));
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

// Most users type "BTC" or "Bitcoin"; CoinGecko wants the coin slug like
// "bitcoin". This is the same map crypto.js uses for the price widget,
// trimmed to the most common symbols. Anything else is passed through
// lowercased — if it's a valid slug it'll work, otherwise CoinGecko shows
// its own "coin not found" state inside the iframe.
const SYMBOL_TO_ID = {
  BTC: 'bitcoin',  ETH: 'ethereum',   SOL: 'solana',     ADA: 'cardano',
  DOT: 'polkadot', XRP: 'ripple',     DOGE: 'dogecoin',  AVAX: 'avalanche-2',
  MATIC: 'matic-network', LINK: 'chainlink', LTC: 'litecoin',  BCH: 'bitcoin-cash',
  ATOM: 'cosmos',  NEAR: 'near',      APT: 'aptos',      ARB: 'arbitrum',
  OP: 'optimism',  UNI: 'uniswap',    TRX: 'tron',       SHIB: 'shiba-inu',
  PEPE: 'pepe',    BNB: 'binancecoin', SUI: 'sui', TON: 'the-open-network'
};

function normalizeCoinId(raw) {
  const s = (raw || '').trim();
  if (!s) return '';
  const upper = s.toUpperCase();
  if (SYMBOL_TO_ID[upper]) return SYMBOL_TO_ID[upper];
  // Already a slug like "bitcoin" or "shiba-inu" — just lowercase + safe chars
  return s.toLowerCase().replace(/[^a-z0-9-]/g, '');
}

register({
  type: 'cryptochart',
  title: 'Crypto Chart',
  icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 17 9 11 13 15 21 7"/><circle cx="6" cy="14.5" r="1.2" fill="currentColor" stroke="none"/><circle cx="11.2" cy="12.8" r="1.2" fill="currentColor" stroke="none"/><circle cx="15.5" cy="13.5" r="1.2" fill="currentColor" stroke="none"/></svg>',
  category: 'finance',
  defaultSize: { w: 460, h: 320 },
  minSize:     { w: 300, h: 220 },

  defaultData: () => ({}),

  defaultSettings: () => ({
    coinId: 'bitcoin',
    currency: 'usd',
    transparent: true
  }),
  settingsSchema: [
    { key: 'coinId',   type: 'text',   label: 'Coin',
      placeholder: 'bitcoin, eth, solana, shiba-inu…' },
    { key: 'currency', type: 'select', label: 'Currency', options: [
      { value: 'usd', label: 'USD' },
      { value: 'eur', label: 'EUR' },
      { value: 'gbp', label: 'GBP' },
      { value: 'jpy', label: 'JPY' },
      { value: 'chf', label: 'CHF' },
      { value: 'btc', label: 'BTC' },
      { value: 'eth', label: 'ETH' }
    ]},
    { key: 'transparent', type: 'toggle', label: 'Transparent background' }
  ],

  render(body, ctx) {
    const { settings } = ctx;
    let destroyed = false;
    ctx.onCleanup(() => { destroyed = true; });

    const coinId = normalizeCoinId(settings.coinId);
    const currency = (settings.currency || 'usd').toLowerCase();

    body.innerHTML = `
      <div class="cgchart">
        <div class="cgchart-header">
          <span class="cgchart-coin">${escapeHtml(coinId || '—')}</span>
          <span class="cgchart-currency">${escapeHtml(currency.toUpperCase())}</span>
        </div>
        <div class="cgchart-frame-wrap">
          <div class="cgchart-empty">${coinId ? 'Loading chart…' : 'Set a coin in settings.'}</div>
        </div>
      </div>`;

    if (!coinId) return;
    const wrap = body.querySelector('.cgchart-frame-wrap');

    ensureScript().then(() => {
      if (destroyed) return;
      // Re-check container still exists (widget might have been rerendered)
      if (!body.contains(wrap)) return;

      // Replace the loading placeholder with the actual widget element.
      wrap.innerHTML = '';
      const el = document.createElement(ELEMENT_TAG);
      el.setAttribute('coin-id', coinId);
      el.setAttribute('currency', currency);
      el.setAttribute('locale', 'en');
      if (settings.transparent) el.setAttribute('transparent-background', '');
      // Fill the wrap; the widget's internal iframe respects width/height attrs
      el.style.display = 'block';
      el.style.width = '100%';
      el.style.height = '100%';
      wrap.appendChild(el);
    }).catch(err => {
      if (destroyed) return;
      wrap.innerHTML = `<div class="cgchart-empty">Failed to load CoinGecko widget: ${escapeHtml(err.message || 'unknown error')}</div>`;
    });
  }
});
