import { registerFace } from './registry.js';

// Analog Classic — round face, 12 hour ticks (heavier at 12/3/6/9),
// hour/minute/second hands. Second hand uses --accent and ticks once per
// second; the minute and hour hands move with second precision so they glide
// instead of jumping, like a quartz watch.
//
// The SVG uses a 100×100 viewBox; CSS scales it to the widget body while
// preserving the square aspect ratio. All hand transforms come from a single
// setAttribute per tick — no full innerHTML rebuild, no garbage.

const SVG_NS = 'http://www.w3.org/2000/svg';

function buildSvg() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('class', 'analog-svg');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  // Hour ticks. 12 lines around the dial; quarter marks are longer + heavier.
  const marks = document.createElementNS(SVG_NS, 'g');
  marks.setAttribute('class', 'analog-marks');
  for (let i = 0; i < 12; i++) {
    const line = document.createElementNS(SVG_NS, 'line');
    const isMajor = i % 3 === 0;
    line.setAttribute('x1', '50');
    line.setAttribute('y1', isMajor ? '6'  : '7');
    line.setAttribute('x2', '50');
    line.setAttribute('y2', isMajor ? '12' : '10');
    line.setAttribute('class', isMajor ? 'analog-mark-major' : 'analog-mark-minor');
    line.setAttribute('transform', `rotate(${i * 30} 50 50)`);
    marks.appendChild(line);
  }
  svg.appendChild(marks);

  // Hands. y2 is the tip; rotation pivot is the center (50,50).
  const hour = document.createElementNS(SVG_NS, 'line');
  hour.setAttribute('class', 'analog-hour');
  hour.setAttribute('x1', '50'); hour.setAttribute('y1', '50');
  hour.setAttribute('x2', '50'); hour.setAttribute('y2', '30');
  svg.appendChild(hour);

  const min = document.createElementNS(SVG_NS, 'line');
  min.setAttribute('class', 'analog-minute');
  min.setAttribute('x1', '50'); min.setAttribute('y1', '50');
  min.setAttribute('x2', '50'); min.setAttribute('y2', '18');
  svg.appendChild(min);

  const sec = document.createElementNS(SVG_NS, 'line');
  sec.setAttribute('class', 'analog-second');
  sec.setAttribute('x1', '50'); sec.setAttribute('y1', '56');
  sec.setAttribute('x2', '50'); sec.setAttribute('y2', '14');
  svg.appendChild(sec);

  // Center cap covers the hand pivot.
  const cap = document.createElementNS(SVG_NS, 'circle');
  cap.setAttribute('cx', '50'); cap.setAttribute('cy', '50');
  cap.setAttribute('r', '2.2');
  cap.setAttribute('class', 'analog-center');
  svg.appendChild(cap);

  return { svg, hour, min, sec };
}

registerFace({
  id: 'analog',
  label: 'Analog Classic',
  mount(host, settings) {
    host.innerHTML = '<div class="clock-face clock-analog"><div class="analog-wrap"></div><div class="clock-date analog-date"></div></div>';
    const wrap   = host.querySelector('.analog-wrap');
    const dateEl = host.querySelector('.analog-date');

    const { svg, hour, min, sec } = buildSvg();
    wrap.appendChild(svg);

    return (now) => {
      const h = now.getHours() % 12;
      const m = now.getMinutes();
      const s = now.getSeconds();
      // Smooth sweep: hour hand also moves through the minute, minute hand
      // through the second. Avoids the "jumping" cheap-clock look.
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
