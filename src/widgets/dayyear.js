import { register } from '../widget-registry.js';

// Day/Year Progress — two slim horizontal bars showing how much of today
// and the year are gone. Updates per second so the day bar visibly creeps
// rather than ticking once a minute.

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function startOfYear(d) {
  return new Date(d.getFullYear(), 0, 1);
}
function startOfNextYear(d) {
  return new Date(d.getFullYear() + 1, 0, 1);
}
function fmtPct(p, dp = 1) {
  if (p >= 1) return '100%';
  if (p <= 0) return '0%';
  return (p * 100).toFixed(dp) + '%';
}

register({
  type: 'dayyear',
  title: 'Day & Year Progress',
  icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="4" rx="2"/><rect x="3" y="14" width="18" height="4" rx="2"/><line x1="3" y1="6" x2="13" y2="6" stroke="currentColor" stroke-width="3"/><line x1="3" y1="14" x2="9" y2="14" stroke="currentColor" stroke-width="3"/></svg>',
  category: 'time',
  defaultSize: { w: 300, h: 160 },
  minSize:     { w: 220, h: 120 },

  defaultData: () => ({}),

  defaultSettings: () => ({
    showRemaining: false,
    showWeek: false
  }),
  settingsSchema: [
    { key: 'showRemaining', type: 'toggle', label: 'Show time remaining' },
    { key: 'showWeek',      type: 'toggle', label: 'Show week progress' }
  ],

  render(body, ctx) {
    const { settings } = ctx;

    const rows = [];
    rows.push({ key: 'day',  label: 'Day' });
    if (settings.showWeek) rows.push({ key: 'week', label: 'Week' });
    rows.push({ key: 'year', label: 'Year' });

    body.innerHTML = `
      <div class="dyp">
        ${rows.map(r => `
          <div class="dyp-row" data-key="${r.key}">
            <div class="dyp-head">
              <span class="dyp-label">${r.label}</span>
              <span class="dyp-pct"></span>
            </div>
            <div class="dyp-track"><div class="dyp-fill"></div></div>
            ${settings.showRemaining ? '<div class="dyp-rem"></div>' : ''}
          </div>`).join('')}
      </div>`;

    const wraps = {};
    rows.forEach(r => {
      const row = body.querySelector(`.dyp-row[data-key="${r.key}"]`);
      wraps[r.key] = {
        pct:  row.querySelector('.dyp-pct'),
        fill: row.querySelector('.dyp-fill'),
        rem:  row.querySelector('.dyp-rem')
      };
    });

    function setRow(key, progress, remainingLabel) {
      const w = wraps[key];
      if (!w) return;
      w.pct.textContent  = fmtPct(progress);
      w.fill.style.width = (Math.min(1, Math.max(0, progress)) * 100).toFixed(3) + '%';
      if (w.rem) w.rem.textContent = remainingLabel;
    }

    function tick() {
      const now = new Date();

      // Day
      const d0 = startOfDay(now).getTime();
      const dProg = (now.getTime() - d0) / 86_400_000;
      const dLeftMs = 86_400_000 - (now.getTime() - d0);
      const hLeft = Math.floor(dLeftMs / 3_600_000);
      const mLeft = Math.floor((dLeftMs % 3_600_000) / 60_000);
      setRow('day', dProg, `${hLeft}h ${mLeft}m left`);

      // Week (Mon = 0; treat Mon-Sun as the week)
      if (wraps.week) {
        const dow = (now.getDay() + 6) % 7; // 0=Mon..6=Sun
        const weekStart = startOfDay(now).getTime() - dow * 86_400_000;
        const weekTotal = 7 * 86_400_000;
        const wProg = (now.getTime() - weekStart) / weekTotal;
        const wLeftMs = weekTotal - (now.getTime() - weekStart);
        const dLeft = Math.floor(wLeftMs / 86_400_000);
        const hLeftW = Math.floor((wLeftMs % 86_400_000) / 3_600_000);
        setRow('week', wProg, `${dLeft}d ${hLeftW}h left`);
      }

      // Year
      const y0 = startOfYear(now).getTime();
      const y1 = startOfNextYear(now).getTime();
      const yProg = (now.getTime() - y0) / (y1 - y0);
      const yLeftMs = y1 - now.getTime();
      const daysLeft = Math.ceil(yLeftMs / 86_400_000);
      setRow('year', yProg, `${daysLeft} days left`);
    }

    tick();
    const interval = setInterval(tick, 1000);
    ctx.onCleanup(() => clearInterval(interval));
  }
});
