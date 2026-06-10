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
