import { register } from '../widget-registry.js';

// Water Tracker — N clickable glass icons. Click an empty glass to fill it,
// click a filled one to empty (and the ones above it stay empty). Daily
// reset at midnight: the counter is keyed by date integer, so opening the
// widget on a new day shows zero glasses filled even if persistence kept
// yesterday's tally.

function dayKey(d) {
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

// Glass SVG — a filled variant uses currentColor for the water column.
const GLASS_EMPTY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12l-1.5 17a1 1 0 0 1-1 .9h-7a1 1 0 0 1-1-.9z"/></svg>';
const GLASS_FULL  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12l-1.5 17a1 1 0 0 1-1 .9h-7a1 1 0 0 1-1-.9z"/><path d="M6.5 9h11l-1 11a1 1 0 0 1-1 .9h-7a1 1 0 0 1-1-.9z" fill="currentColor" fill-opacity="0.8" stroke="none"/></svg>';

register({
  type: 'water',
  title: 'Water Tracker',
  icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 C 6 11 5 15 8 19 a 5 5 0 0 0 8 0 c 3 -4 2 -8 -4 -16z"/></svg>',
  category: 'productivity',
  defaultSize: { w: 280, h: 200 },
  minSize:     { w: 200, h: 160 },

  defaultData: () => ({ filled: 0, day: 0 }),

  defaultSettings: () => ({
    goal: 8,
    cupMl: 250
  }),
  settingsSchema: [
    { key: 'goal',  type: 'slider', label: 'Daily goal (glasses)', min: 1,   max: 16,  step: 1 },
    { key: 'cupMl', type: 'slider', label: 'Glass size',           min: 100, max: 500, step: 25, unit: 'ml' }
  ],

  render(body, ctx) {
    const { data, settings } = ctx;
    if (typeof data.filled !== 'number') data.filled = 0;

    // Daily rollover. We refresh on every render plus a 1-min interval so
    // crossing midnight in an open tab resets the count without action.
    function resetIfNewDay() {
      const k = dayKey(new Date());
      if (data.day !== k) {
        data.day = k;
        data.filled = 0;
        return true;
      }
      return false;
    }

    body.innerHTML = `
      <div class="water">
        <div class="water-stats">
          <span class="water-count"></span>
          <span class="water-vol"></span>
        </div>
        <div class="water-bar"><div class="water-bar-fill"></div></div>
        <div class="water-glasses"></div>
      </div>`;

    const countEl   = body.querySelector('.water-count');
    const volEl     = body.querySelector('.water-vol');
    const barFillEl = body.querySelector('.water-bar-fill');
    const glassesEl = body.querySelector('.water-glasses');

    function paint() {
      const goal = Math.max(1, settings.goal || 8);
      const filled = Math.max(0, Math.min(goal, data.filled));
      countEl.textContent = `${filled} / ${goal}`;
      const mlPerCup = settings.cupMl || 250;
      const ml = filled * mlPerCup;
      volEl.textContent = ml >= 1000 ? `${(ml / 1000).toFixed(1)} L` : `${ml} ml`;
      barFillEl.style.width = (filled / goal * 100).toFixed(1) + '%';

      glassesEl.innerHTML = '';
      for (let i = 0; i < goal; i++) {
        const btn = document.createElement('button');
        btn.className = 'water-glass' + (i < filled ? ' water-glass-full' : '');
        btn.innerHTML = i < filled ? GLASS_FULL : GLASS_EMPTY;
        btn.title = i < filled ? `Click to unfill #${i + 1}` : `Click to fill #${i + 1}`;
        btn.addEventListener('click', () => {
          if (i < data.filled) {
            // Click a filled one → drop down to (i) glasses
            data.filled = i;
          } else {
            data.filled = i + 1;
          }
          ctx.save();
          paint();
        });
        glassesEl.appendChild(btn);
      }
    }

    resetIfNewDay();
    paint();
    const interval = setInterval(() => {
      if (resetIfNewDay()) { ctx.save(); paint(); }
    }, 60_000);
    ctx.onCleanup(() => clearInterval(interval));
  }
});
