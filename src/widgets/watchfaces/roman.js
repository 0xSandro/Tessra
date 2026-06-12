import { registerFace } from './registry.js';

// Roman Numerals — analog dial with I…XII labels at each hour position.
// Built on the same SVG/viewBox conventions as the Analog Classic face but
// swaps the tick marks for serif-style Roman text.
// Convention: clock IV is rendered "IIII" (the watchmaker's tradition).

const SVG_NS = 'http://www.w3.org/2000/svg';
const ROMAN = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];

function buildSvg() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('class', 'analog-svg roman-svg');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  // Outer ring stays subtle so the numerals can be the focal point
  const ring = document.createElementNS(SVG_NS, 'circle');
  ring.setAttribute('cx', '50'); ring.setAttribute('cy', '50'); ring.setAttribute('r', '48');
  ring.setAttribute('class', 'roman-ring');
  svg.appendChild(ring);

  // Numerals placed on a circle of radius 40
  const labels = document.createElementNS(SVG_NS, 'g');
  labels.setAttribute('class', 'roman-labels');
  for (let i = 0; i < 12; i++) {
    const angle = (i * 30 - 90) * Math.PI / 180;
    const x = 50 + 40 * Math.cos(angle);
    const y = 50 + 40 * Math.sin(angle);
    const t = document.createElementNS(SVG_NS, 'text');
    t.setAttribute('x', x.toFixed(2));
    t.setAttribute('y', y.toFixed(2));
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('dominant-baseline', 'middle');
    t.setAttribute('class', 'roman-label');
    t.textContent = ROMAN[i];
    labels.appendChild(t);
  }
  svg.appendChild(labels);

  // Hands — same geometry as Analog Classic so the rotation math is shared
  const hour = document.createElementNS(SVG_NS, 'line');
  hour.setAttribute('class', 'roman-hour');
  hour.setAttribute('x1', '50'); hour.setAttribute('y1', '50');
  hour.setAttribute('x2', '50'); hour.setAttribute('y2', '32');
  svg.appendChild(hour);

  const min = document.createElementNS(SVG_NS, 'line');
  min.setAttribute('class', 'roman-minute');
  min.setAttribute('x1', '50'); min.setAttribute('y1', '50');
  min.setAttribute('x2', '50'); min.setAttribute('y2', '22');
  svg.appendChild(min);

  const sec = document.createElementNS(SVG_NS, 'line');
  sec.setAttribute('class', 'roman-second');
  sec.setAttribute('x1', '50'); sec.setAttribute('y1', '54');
  sec.setAttribute('x2', '50'); sec.setAttribute('y2', '18');
  svg.appendChild(sec);

  const cap = document.createElementNS(SVG_NS, 'circle');
  cap.setAttribute('cx', '50'); cap.setAttribute('cy', '50'); cap.setAttribute('r', '2');
  cap.setAttribute('class', 'roman-center');
  svg.appendChild(cap);

  return { svg, hour, min, sec };
}

registerFace({
  id: 'roman',
  label: 'Roman',
  mount(host, settings) {
    host.innerHTML = '<div class="clock-face clock-roman"><div class="roman-wrap"></div><div class="roman-date clock-date"></div></div>';
    const wrap   = host.querySelector('.roman-wrap');
    const dateEl = host.querySelector('.roman-date');

    const { svg, hour, min, sec } = buildSvg();
    wrap.appendChild(svg);

    return (now) => {
      const h = now.getHours() % 12;
      const m = now.getMinutes();
      const s = now.getSeconds();
      const hourAngle = h * 30 + m * 0.5 + s * (0.5 / 60);
      const minAngle  = m * 6  + s * 0.1;
      const secAngle  = settings.showSeconds ? s * 6 : 0;
      hour.setAttribute('transform', `rotate(${hourAngle} 50 50)`);
      min .setAttribute('transform', `rotate(${minAngle}  50 50)`);
      sec .setAttribute('transform', `rotate(${secAngle}  50 50)`);
      sec.style.display = settings.showSeconds ? '' : 'none';
      dateEl.textContent = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
    };
  }
});
