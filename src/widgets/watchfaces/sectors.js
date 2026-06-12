import { registerFace } from './registry.js';

// Sectors — three concentric rings. Outer = hour progress, middle = minute,
// inner = second. Each ring fills clockwise as its cycle advances; the
// thickest ring is the seconds for an immediately visible "alive" feel.
//
// SVG strokes use stroke-dasharray + stroke-dashoffset to render arc fills
// without expensive path recomputation each tick. Each ring's total length
// is its circumference (2πr); offset is `len * (1 - progress)`.

const SVG_NS = 'http://www.w3.org/2000/svg';

// Ring geometry — radii chosen so that thick strokes don't overlap.
const RINGS = [
  { key: 'h', r: 42, width: 6  },  // outermost — hour
  { key: 'm', r: 32, width: 6  },  // middle — minute
  { key: 's', r: 22, width: 6  }   // innermost — second
];

function buildRing(r, cls) {
  const track = document.createElementNS(SVG_NS, 'circle');
  track.setAttribute('cx', '50'); track.setAttribute('cy', '50');
  track.setAttribute('r', r);
  track.setAttribute('class', 'sector-track');
  const fill = document.createElementNS(SVG_NS, 'circle');
  fill.setAttribute('cx', '50'); fill.setAttribute('cy', '50');
  fill.setAttribute('r', r);
  fill.setAttribute('class', 'sector-fill ' + cls);
  // Sweep clockwise from 12 o'clock: rotate -90° around the center
  fill.setAttribute('transform', 'rotate(-90 50 50)');
  const circumference = 2 * Math.PI * r;
  fill.setAttribute('stroke-dasharray', circumference.toFixed(2));
  fill.setAttribute('stroke-dashoffset', circumference.toFixed(2));
  fill.dataset.circumference = circumference.toFixed(2);
  return { track, fill, circumference };
}

registerFace({
  id: 'sectors',
  label: 'Sectors',
  mount(host, settings) {
    host.innerHTML = `
      <div class="clock-face clock-sectors">
        <div class="sectors-wrap">
          <svg class="sectors-svg" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet"></svg>
          <div class="sectors-center"></div>
        </div>
        <div class="sectors-date clock-date"></div>
      </div>`;
    const svg = host.querySelector('.sectors-svg');
    const centerEl = host.querySelector('.sectors-center');
    const dateEl = host.querySelector('.sectors-date');

    const rings = {};
    RINGS.forEach(({ key, r, width }) => {
      const built = buildRing(r, 'sector-' + key);
      built.track.setAttribute('stroke-width', width);
      built.fill.setAttribute('stroke-width', width);
      svg.appendChild(built.track);
      svg.appendChild(built.fill);
      rings[key] = built;
    });

    function setProgress(key, progress) {
      const ring = rings[key];
      if (!ring) return;
      ring.fill.setAttribute('stroke-dashoffset', (ring.circumference * (1 - progress)).toFixed(2));
    }

    return (now) => {
      const h = now.getHours();
      const m = now.getMinutes();
      const s = now.getSeconds();
      const ms = now.getMilliseconds();
      const hMax = settings.format === '12h' ? 12 : 24;
      const hVal = settings.format === '12h' ? (h % 12) : h;
      setProgress('h', hVal / hMax);
      setProgress('m', m / 60);
      // Sub-second accuracy on seconds for a smooth sweep — costs nothing
      setProgress('s', (s + ms / 1000) / 60);

      const pad = n => String(n).padStart(2, '0');
      const display = settings.format === '12h'
        ? `${(h % 12) || 12}:${pad(m)}`
        : `${pad(h)}:${pad(m)}`;
      centerEl.textContent = display;

      dateEl.textContent = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
    };
  }
});
