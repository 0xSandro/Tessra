import { register } from '../widget-registry.js';

// Moon Phase — calculated locally using Conway's approximation. Returns a
// phase index 0–7 (New → Waxing Crescent → First Quarter → Waxing Gibbous
// → Full → Waning Gibbous → Last Quarter → Waning Crescent), illumination
// percentage, and predicts the next full/new moon by stepping forward.
//
// Synodic month length used: 29.53059 days. Accurate to within a few hours
// over the next few cycles — plenty for a glanceable widget.

const SYNODIC = 29.53059;
const NEW_MOON_REF = Date.UTC(2000, 0, 6, 18, 14, 0); // Known new moon: 2000-01-06 18:14 UTC

const PHASES = [
  { id: 'new',         label: 'New Moon',          emoji: '🌑' },
  { id: 'waxCrescent', label: 'Waxing Crescent',   emoji: '🌒' },
  { id: 'firstQ',      label: 'First Quarter',     emoji: '🌓' },
  { id: 'waxGibbous',  label: 'Waxing Gibbous',    emoji: '🌔' },
  { id: 'full',        label: 'Full Moon',         emoji: '🌕' },
  { id: 'wanGibbous',  label: 'Waning Gibbous',    emoji: '🌖' },
  { id: 'lastQ',       label: 'Last Quarter',      emoji: '🌗' },
  { id: 'wanCrescent', label: 'Waning Crescent',   emoji: '🌘' }
];

function lunarAgeDays(date) {
  const days = (date.getTime() - NEW_MOON_REF) / 86_400_000;
  return ((days % SYNODIC) + SYNODIC) % SYNODIC;
}

function phaseIndex(age) {
  // 8 evenly-spaced bins
  return Math.floor((age / SYNODIC) * 8) % 8;
}

function illumination(age) {
  // Illuminated fraction: (1 - cos(2π * age / synodic)) / 2
  return (1 - Math.cos(2 * Math.PI * age / SYNODIC)) / 2;
}

// Step forward from `from` to the next time the lunar age matches `targetAge`
// (in days). We sample one day at a time, then refine with a 1-hour pass.
function nextOccurrence(from, targetAge) {
  // Days until first crossing
  const startAge = lunarAgeDays(from);
  let dayDelta = (targetAge - startAge + SYNODIC) % SYNODIC;
  // Coarse pass: jump close
  let d = new Date(from.getTime() + dayDelta * 86_400_000);
  // Refine to nearest hour
  let best = d, bestErr = Math.abs(lunarAgeDays(d) - targetAge);
  for (let h = -6; h <= 6; h++) {
    const cand = new Date(d.getTime() + h * 3_600_000);
    const e = Math.min(Math.abs(lunarAgeDays(cand) - targetAge),
                       Math.abs(lunarAgeDays(cand) - targetAge + SYNODIC));
    if (e < bestErr) { best = cand; bestErr = e; }
  }
  return best;
}

function fmtDate(d) {
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

register({
  type: 'moon',
  title: 'Moon Phase',
  icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>',
  category: 'info',
  defaultSize: { w: 280, h: 280 },
  minSize:     { w: 220, h: 220 },

  defaultData: () => ({}),
  defaultSettings: () => ({}),

  render(body, ctx) {
    body.innerHTML = `
      <div class="moon">
        <div class="moon-emoji"></div>
        <div class="moon-label"></div>
        <div class="moon-illum"></div>
        <div class="moon-next">
          <div class="moon-next-row"><span class="moon-next-label">Next full</span><span class="moon-next-val" data-key="full"></span></div>
          <div class="moon-next-row"><span class="moon-next-label">Next new</span><span class="moon-next-val" data-key="new"></span></div>
        </div>
      </div>`;

    const emojiEl = body.querySelector('.moon-emoji');
    const labelEl = body.querySelector('.moon-label');
    const illumEl = body.querySelector('.moon-illum');
    const nextFull = body.querySelector('[data-key="full"]');
    const nextNew  = body.querySelector('[data-key="new"]');

    function paint() {
      const now = new Date();
      const age = lunarAgeDays(now);
      const phase = PHASES[phaseIndex(age)];
      const illum = illumination(age);
      emojiEl.textContent = phase.emoji;
      labelEl.textContent = phase.label;
      illumEl.textContent = `${Math.round(illum * 100)}% illuminated`;
      const full = nextOccurrence(now, SYNODIC / 2);  // full moon at age ≈ half cycle
      const news = nextOccurrence(now, 0);             // new moon at age 0
      nextFull.textContent = fmtDate(full);
      nextNew .textContent = fmtDate(news);
    }

    paint();
    // Recalculate hourly — moon age changes slowly
    const interval = setInterval(paint, 3600 * 1000);
    ctx.onCleanup(() => clearInterval(interval));
  }
});
