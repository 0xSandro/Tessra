import { registerFace } from './registry.js';

// Binary Clock — six BCD columns. Each digit of HH:MM:SS becomes a column
// of 4 dots (8/4/2/1). Hour tens column only needs 2 dots; we still show
// 4 for visual rhythm and dim the unused bits via CSS.
//
// Lit dots are accent-colored; unlit dots are muted. Looks great on glass
// when the muted dot picks up the surface through transparency.

const POSITIONS = [
  { key: 'h1', max: 2 },  // hour tens   (0–2)
  { key: 'h2', max: 9 },  // hour units  (0–9)
  { key: 'm1', max: 5 },  // minute tens (0–5)
  { key: 'm2', max: 9 },  // minute units(0–9)
  { key: 's1', max: 5 },  // second tens (0–5)
  { key: 's2', max: 9 }   // second units(0–9)
];

registerFace({
  id: 'binary',
  label: 'Binary',
  mount(host, settings) {
    host.innerHTML = `
      <div class="clock-face clock-binary">
        <div class="bin-grid"></div>
        <div class="bin-date clock-date"></div>
      </div>`;
    const grid = host.querySelector('.bin-grid');
    const dateEl = host.querySelector('.bin-date');

    // Build columns once; we'll update dot classes per tick rather than
    // rebuilding HTML (cheaper and avoids transition flashes).
    let html = '';
    POSITIONS.forEach(pos => {
      html += `<div class="bin-col" data-key="${pos.key}">`;
      for (let bit = 3; bit >= 0; bit--) {
        const weight = 1 << bit;
        // Dim bits that can never light for this column's max value
        const reachable = weight <= pos.max;
        html += `<div class="bin-dot${reachable ? '' : ' bin-unreach'}" data-bit="${bit}"></div>`;
      }
      html += '</div>';
    });
    grid.innerHTML = html;

    // Cache dot references
    const dotsByCol = {};
    POSITIONS.forEach(pos => {
      dotsByCol[pos.key] = Array.from(grid.querySelectorAll(`[data-key="${pos.key}"] .bin-dot`));
    });

    function setColumn(key, value) {
      const dots = dotsByCol[key];
      if (!dots) return;
      // dots[0] is MSB (bit 3), dots[3] is LSB (bit 0)
      for (let i = 0; i < 4; i++) {
        const bit = 3 - i;
        const on = (value >> bit) & 1;
        dots[i].classList.toggle('on', !!on);
      }
    }

    return (now) => {
      const h = now.getHours();
      const m = now.getMinutes();
      const s = now.getSeconds();
      setColumn('h1', Math.floor(h / 10));
      setColumn('h2', h % 10);
      setColumn('m1', Math.floor(m / 10));
      setColumn('m2', m % 10);
      if (settings.showSeconds) {
        setColumn('s1', Math.floor(s / 10));
        setColumn('s2', s % 10);
      } else {
        setColumn('s1', 0);
        setColumn('s2', 0);
      }
      dateEl.textContent = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
    };
  }
});
