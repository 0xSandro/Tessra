import { register } from '../widget-registry.js';

// Crypto Chart — temporarily disabled (see comingSoon below). The previous
// implementation injected CoinGecko's remote widget script
// (widgets.coingecko.com/gecko-coin-price-chart-widget.js) into the page,
// which runs against Mozilla's Add-on Policy against loading/executing
// remote code. Pulled out entirely — not just gated — so there's no
// remaining script-src CSP exception or host permission to justify in
// review. Re-add once there's a self-hosted/bundled charting approach.

register({
  type: 'cryptochart',
  title: 'Crypto Chart',
  icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9.5"/><path d="M10 7.5h3.3a2 2 0 0 1 0 4h-3.3"/><path d="M10 11.5h3.6a2 2 0 0 1 0 4h-3.6"/><line x1="10" y1="7.5" x2="10" y2="15.5"/><line x1="11.6" y1="5.5" x2="11.6" y2="7.5"/><line x1="11.6" y1="15.5" x2="11.6" y2="17.5"/></svg>',
  category: 'finance',
  comingSoon: true, // remote-script CoinGecko embed removed — see note above
  defaultSize: { w: 340, h: 360 },
  minSize:     { w: 300, h: 300 },

  defaultData: () => ({}),

  render(body) {
    body.innerHTML = '<div class="cgchart-empty">Crypto Chart is coming back soon.</div>';
  }
});
