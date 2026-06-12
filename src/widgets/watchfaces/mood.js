import { registerFace } from './registry.js';

// Mood — full-bleed gradient that shifts color through the day. Interpolates
// between palette stops keyed on hour: deep purple at midnight, dusky pre-
// dawn, peach sunrise, sky blue noon, orange sunset, violet dusk. The time
// sits on top in white with a soft text shadow so it stays legible against
// any palette state.

const STOPS = [
  { h: 0,  c: [ 60,  30,  90] },   // midnight
  { h: 5,  c: [120,  60, 130] },   // pre-dawn
  { h: 7,  c: [250, 140, 110] },   // sunrise
  { h: 12, c: [120, 180, 240] },   // noon
  { h: 17, c: [240, 140,  80] },   // sunset
  { h: 20, c: [ 80,  50, 130] },   // dusk
  { h: 24, c: [ 60,  30,  90] }    // wraps back to midnight
];

function paletteAt(hours) {
  let i = 0;
  while (i < STOPS.length - 1 && STOPS[i + 1].h <= hours) i++;
  const a = STOPS[i];
  const b = STOPS[i + 1] || a;
  const span = (b.h - a.h) || 1;
  const f = Math.max(0, Math.min(1, (hours - a.h) / span));
  const lerp = (x, y) => Math.round(x + (y - x) * f);
  return [lerp(a.c[0], b.c[0]), lerp(a.c[1], b.c[1]), lerp(a.c[2], b.c[2])];
}

function rgb(c) { return `rgb(${c[0]}, ${c[1]}, ${c[2]})`; }
function lighten(c, amt) {
  return [Math.min(255, c[0] + amt), Math.min(255, c[1] + amt), Math.min(255, c[2] + amt)];
}

registerFace({
  id: 'mood',
  label: 'Mood',
  mount(host, settings) {
    host.innerHTML = `
      <div class="clock-face clock-mood">
        <div class="mood-time"></div>
        <div class="mood-date clock-date"></div>
      </div>`;
    const faceEl = host.querySelector('.clock-mood');
    const timeEl = host.querySelector('.mood-time');
    const dateEl = host.querySelector('.mood-date');
    const fmt = {
      hour: 'numeric', minute: '2-digit',
      hour12: settings.format === '12h'
    };
    if (settings.showSeconds) fmt.second = '2-digit';
    return (now) => {
      const hours = now.getHours() + now.getMinutes() / 60;
      const base   = paletteAt(hours);
      const accent = lighten(base, 40);
      faceEl.style.background = `linear-gradient(135deg, ${rgb(accent)} 0%, ${rgb(base)} 100%)`;
      timeEl.textContent = now.toLocaleTimeString([], fmt);
      dateEl.textContent = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
    };
  }
});
