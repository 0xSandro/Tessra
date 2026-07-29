import { register } from '../widget-registry.js';

// Crypto Fear & Greed Index — alternative.me publishes a free, no-auth,
// CORS-open daily index (0 = Extreme Fear, 100 = Extreme Greed).
// Endpoint: https://api.alternative.me/fng/?limit=1&format=json

const BANDS = [
  { max: 24,  label: 'Extreme Fear',  color: '#DC2626' },
  { max: 44,  label: 'Fear',          color: '#F97316' },
  { max: 55,  label: 'Neutral',       color: '#EAB308' },
  { max: 75,  label: 'Greed',         color: '#84CC16' },
  { max: 100, label: 'Extreme Greed', color: '#16A34A' }
];

function bandFor(value) {
  return BANDS.find(b => value <= b.max) || BANDS[BANDS.length - 1];
}

// ----- Gauge geometry -----
// A CoinMarketCap-style half-donut: five equal 36° color bands sweeping
// from 180° (value 0, left) over the top to 0° (value 100, right), plus a
// dot marker positioned on the arc at the current value's angle.
const GAUGE_CX = 100, GAUGE_CY = 96, GAUGE_R = 76;

function pointOnArc(value) {
  const angleDeg = 180 - (value / 100) * 180;
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: GAUGE_CX + GAUGE_R * Math.cos(rad),
    y: GAUGE_CY - GAUGE_R * Math.sin(rad)
  };
}

function buildGaugeSvg() {
  const bandColors = ['#DC2626', '#F97316', '#EAB308', '#84CC16', '#16A34A'];
  const boundaries = [0, 20, 40, 60, 80, 100].map(pointOnArc);
  const segments = bandColors.map((color, i) => {
    const p0 = boundaries[i], p1 = boundaries[i + 1];
    return `<path class="fng-band" d="M${p0.x.toFixed(2)},${p0.y.toFixed(2)} A${GAUGE_R},${GAUGE_R} 0 0 1 ${p1.x.toFixed(2)},${p1.y.toFixed(2)}" stroke="${color}"/>`;
  }).join('');
  return `
    <svg class="fng-gauge-svg" viewBox="0 10 200 96">
      ${segments}
      <circle class="fng-dot-halo" r="8"/>
      <circle class="fng-dot" r="5"/>
    </svg>`;
}

async function fetchIndex() {
  const res = await fetch('https://api.alternative.me/fng/?limit=1&format=json');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const row = json?.data?.[0];
  if (!row) throw new Error('No data');
  return {
    value: Number(row.value),
    classification: row.value_classification,
    timestamp: Number(row.timestamp) * 1000
  };
}

function formatAge(ms) {
  if (!ms) return '';
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

register({
  type: 'feargreed',
  title: 'Crypto Fear & Greed',
  icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 16a8 8 0 1 1 16 0"/><line x1="12" y1="16" x2="16" y2="9.5"/><circle cx="12" cy="16" r="1.1" fill="currentColor" stroke="none"/></svg>',
  category: 'finance',
  defaultSize: { w: 300, h: 280 },
  minSize:     { w: 220, h: 220 },

  defaultData: () => ({
    value: null,
    classification: '',
    timestamp: 0,
    fetchedAt: 0,
    error: null
  }),

  defaultSettings: () => ({
    refreshInterval: 3600
  }),
  settingsSchema: [
    { key: 'refreshInterval', type: 'slider', label: 'Refresh', min: 900, max: 21600, step: 300, unit: 's' }
  ],

  render(body, ctx) {
    const { data, settings } = ctx;
    let cancelled = false;
    ctx.onCleanup(() => { cancelled = true; });

    body.innerHTML = `
      <div class="fng">
        ${buildGaugeSvg()}
        <div class="fng-value"></div>
        <div class="fng-label"></div>
        <div class="fng-meta"></div>
      </div>`;
    const valueEl  = body.querySelector('.fng-value');
    const labelEl  = body.querySelector('.fng-label');
    const dotEl    = body.querySelector('.fng-dot');
    const haloEl   = body.querySelector('.fng-dot-halo');
    const metaEl   = body.querySelector('.fng-meta');

    function setDot(value, color) {
      const p = pointOnArc(value);
      dotEl.setAttribute('cx', p.x.toFixed(2));
      dotEl.setAttribute('cy', p.y.toFixed(2));
      haloEl.setAttribute('cx', p.x.toFixed(2));
      haloEl.setAttribute('cy', p.y.toFixed(2));
      dotEl.style.fill = color;
    }

    function paint() {
      if (data.error && data.value == null) {
        valueEl.textContent = '—';
        labelEl.textContent = data.error;
        labelEl.className = 'fng-label fng-error';
        setDot(0, 'var(--muted)');
        metaEl.textContent = '';
        return;
      }
      if (data.value == null) {
        valueEl.textContent = '—';
        labelEl.textContent = 'Loading…';
        labelEl.className = 'fng-label';
        setDot(50, 'var(--muted)');
        return;
      }
      const band = bandFor(data.value);
      valueEl.textContent = data.value;
      valueEl.style.color = band.color;
      labelEl.textContent = data.classification || band.label;
      labelEl.className = 'fng-label';
      labelEl.style.color = band.color;
      setDot(data.value, band.color);
      metaEl.textContent = data.fetchedAt ? `Updated ${formatAge(data.fetchedAt)}` : '';
      ctx.setStale(!!data.error && data.value != null);
    }

    async function refresh() {
      if (cancelled) return;
      const refreshMs = Math.max(900, settings.refreshInterval || 3600) * 1000;
      const stale = data.value == null || (Date.now() - (data.fetchedAt || 0)) > refreshMs;
      if (!stale) { paint(); return; }
      if (data.value == null) paint();

      try {
        const r = await fetchIndex();
        if (cancelled) return;
        data.value = r.value;
        data.classification = r.classification;
        data.timestamp = r.timestamp;
        data.fetchedAt = Date.now();
        data.error = null;
        ctx.save();
        paint();
      } catch (err) {
        if (cancelled) return;
        data.error = err.message || 'Failed to load';
        paint();
        ctx.save();
      }
    }

    paint();
    refresh();
    const interval = setInterval(refresh, Math.max(900, settings.refreshInterval || 3600) * 1000);
    ctx.onCleanup(() => clearInterval(interval));
    const ageInterval = setInterval(() => {
      if (data.fetchedAt) metaEl.textContent = `Updated ${formatAge(data.fetchedAt)}`;
    }, 30 * 1000);
    ctx.onCleanup(() => clearInterval(ageInterval));
  }
});
