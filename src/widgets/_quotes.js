// Shared helpers for Yahoo Finance v8 chart-backed widgets.
// Used by: stocks (eventually), etfs, forex, commodities.
// Unofficial endpoint but stable; one fetch per symbol, parallelize in caller.

export const MARKET_STATE_LABELS = {
  PRE: 'Pre',
  POST: 'After',
  POSTPOST: 'After',
  PREPRE: 'Pre',
  CLOSED: 'Closed'
};

export function formatChangePct(pct) {
  if (pct == null || isNaN(pct)) return '';
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(2)}%`;
}

export function formatAge(ms) {
  if (!ms) return '';
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60)   return `Updated ${s}s ago`;
  if (s < 3600) return `Updated ${Math.round(s / 60)}m ago`;
  return `Updated ${Math.round(s / 3600)}h ago`;
}

// Fetch one Yahoo Finance symbol. Returns a normalized quote object.
// `symbol` should already be Yahoo-formatted (e.g. AAPL, EURUSD=X, GC=F).
export async function fetchYahoo(symbol) {
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
  // Daily closes for the 5-day window — feeds the row sparklines. Yahoo
  // returns nulls for non-trading days; strip them so the path stays smooth.
  const closes = (r.indicators?.quote?.[0]?.close || []).filter(c => c != null && !isNaN(c));
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
    closes,
    marketState: m.marketState || 'CLOSED'
  };
}

// Tiny SVG sparkline. Returns an HTML string ready to drop into innerHTML.
// `closes` is an array of numbers; `dir` is 'up' | 'down' | 'flat' and drives
// the CSS color via a class. Output viewBox is fixed at 80×24 with
// preserveAspectRatio="none" so the SVG stretches cleanly when CSS sizes the
// container differently — line stroke uses non-scaling-stroke to stay crisp.
export function sparklineSvg(closes, dir) {
  if (!Array.isArray(closes) || closes.length < 2) {
    return '<svg class="sparkline sparkline-empty" viewBox="0 0 80 24"></svg>';
  }
  const W = 80, H = 24, PAD = 2;
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = (max - min) || 1;
  const innerH = H - PAD * 2;
  let line = '';
  closes.forEach((c, i) => {
    const x = (i / (closes.length - 1)) * W;
    const y = PAD + innerH - ((c - min) / range) * innerH;
    line += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1);
  });
  const area = line + ` L${W},${H} L0,${H} Z`;
  const cls = 'sparkline sparkline-' + (dir === 'down' ? 'down' : dir === 'flat' ? 'flat' : 'up');
  return `<svg class="${cls}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    <path class="sparkline-area" d="${area}"/>
    <path class="sparkline-line" d="${line}"/>
  </svg>`;
}

// Convenience: derive sparkline direction from change sign.
export function sparkDir(change) {
  if (change == null || isNaN(change)) return 'flat';
  if (change > 0) return 'up';
  if (change < 0) return 'down';
  return 'flat';
}
