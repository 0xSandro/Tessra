import { register } from '../widget-registry.js';
import { escapeHtml } from '../utils.js';

// Lucky Wheel — spin-the-wheel replacement for the old text picker.
// One SVG <g> holds the slice paths and labels; we animate `transform: rotate`
// on that group via CSS transition + cubic-bezier easing for a satisfying
// momentum spin-down. The random landing is computed first; the CSS animation
// just plays the trip from the current angle to (full rotations + landing
// angle), and a `transitionend` listener flips the result text on arrival.
//
// We keep the widget `type: 'picker'` so existing instances keep working —
// the data field rename (`options` stays) means no migration is needed beyond
// defaulting `rotation` to 0.

const SVG_NS = 'http://www.w3.org/2000/svg';
// 10 evenly-spaced hues that look balanced together. Cycled when there are
// more entries than colors.
const SLICE_HUES = [354, 25, 45, 75, 130, 175, 205, 250, 290, 320];

function sliceColor(i, total) {
  // If we have more entries than the palette length, fall back to evenly
  // distributed HSL so a wheel of 20 still looks like a wheel.
  if (total <= SLICE_HUES.length) {
    return `hsl(${SLICE_HUES[i % SLICE_HUES.length]}, 70%, 62%)`;
  }
  return `hsl(${Math.round((i / total) * 360)}, 68%, 60%)`;
}

// Build the SVG `d` attribute for a single pie slice. We work in a 200×200
// viewBox with a center at (100,100) and outer radius 95. Angles are clockwise
// from 12 o'clock so visual reasoning matches the spin direction.
function slicePath(startDeg, endDeg, r = 95, cx = 100, cy = 100) {
  const startRad = (startDeg - 90) * Math.PI / 180;
  const endRad   = (endDeg   - 90) * Math.PI / 180;
  const x1 = cx + r * Math.cos(startRad);
  const y1 = cy + r * Math.sin(startRad);
  const x2 = cx + r * Math.cos(endRad);
  const y2 = cy + r * Math.sin(endRad);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return `M${cx},${cy} L${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 ${largeArc} 1 ${x2.toFixed(2)},${y2.toFixed(2)} Z`;
}

// Pre-compute the label point along the angular midline. We position labels
// at ~62% of the radius so they sit comfortably inside the slice.
function labelPos(midDeg, r = 60, cx = 100, cy = 100) {
  const rad = (midDeg - 90) * Math.PI / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

register({
  type: 'picker',
  title: 'Lucky Wheel',
  icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 3 v9 l6.5 4"/><path d="M12 12 L5.5 8"/><path d="M12 12 L12 21" opacity="0.5"/></svg>',
  category: 'random',
  defaultSize: { w: 280, h: 460 },
  minSize:     { w: 220, h: 340 },

  defaultData: () => ({
    options: ['Pizza', 'Burger', 'Sushi', 'Tacos', 'Salad'],
    last: null,
    rotation: 0  // accumulated wheel angle in degrees
  }),

  defaultSettings: () => ({
    removeAfterPick: false,
    spinDurationMs: 4200
  }),
  settingsSchema: [
    { key: 'removeAfterPick', type: 'toggle', label: 'Remove winner after spin' },
    { key: 'spinDurationMs',  type: 'slider', label: 'Spin duration', min: 1500, max: 8000, step: 100, unit: 'ms' }
  ],

  render(body, ctx) {
    const { data, settings } = ctx;
    if (!Array.isArray(data.options)) data.options = [];
    if (typeof data.rotation !== 'number') data.rotation = 0;

    body.innerHTML = `
      <div class="wheel">
        <div class="wheel-stage">
          <div class="wheel-pointer" aria-hidden="true"></div>
          <svg class="wheel-svg" viewBox="0 0 200 200" preserveAspectRatio="xMidYMid meet">
            <g class="wheel-spinner">
              <g class="wheel-slices"></g>
              <g class="wheel-labels"></g>
            </g>
            <circle class="wheel-rim" cx="100" cy="100" r="95"/>
            <circle class="wheel-hub" cx="100" cy="100" r="9"/>
          </svg>
        </div>
        <div class="wheel-result"></div>
        <button class="wheel-spin picker-pick">Spin</button>
        <div class="wheel-entries">
          <input class="wheel-input picker-input" placeholder="Add option, press Enter"/>
          <ul class="wheel-list picker-list"></ul>
        </div>
      </div>`;

    const spinnerEl = body.querySelector('.wheel-spinner');
    const slicesEl  = body.querySelector('.wheel-slices');
    const labelsEl  = body.querySelector('.wheel-labels');
    const resultEl  = body.querySelector('.wheel-result');
    const spinBt    = body.querySelector('.wheel-spin');
    const listEl    = body.querySelector('.wheel-list');
    const inputEl   = body.querySelector('.wheel-input');

    let spinning = false;

    function drawWheel() {
      slicesEl.innerHTML = '';
      labelsEl.innerHTML = '';
      const n = data.options.length;
      if (n === 0) {
        // Render a dimmed full-circle placeholder so the rim still has shape.
        const c = document.createElementNS(SVG_NS, 'circle');
        c.setAttribute('cx', '100'); c.setAttribute('cy', '100'); c.setAttribute('r', '95');
        c.setAttribute('fill', 'rgba(0,0,0,0.05)');
        slicesEl.appendChild(c);
        return;
      }
      if (n === 1) {
        // Single entry — full circle filled with the first hue. SVG arc paths
        // can't draw a full 360° arc with a single move, so use a circle.
        const c = document.createElementNS(SVG_NS, 'circle');
        c.setAttribute('cx', '100'); c.setAttribute('cy', '100'); c.setAttribute('r', '95');
        c.setAttribute('fill', sliceColor(0, 1));
        slicesEl.appendChild(c);
        const t = document.createElementNS(SVG_NS, 'text');
        t.setAttribute('x', '100'); t.setAttribute('y', '100');
        t.setAttribute('text-anchor', 'middle');
        t.setAttribute('dominant-baseline', 'middle');
        t.setAttribute('class', 'wheel-label');
        t.textContent = data.options[0];
        labelsEl.appendChild(t);
        return;
      }
      const step = 360 / n;
      data.options.forEach((opt, i) => {
        const start = i * step;
        const end   = start + step;
        const mid   = start + step / 2;

        const p = document.createElementNS(SVG_NS, 'path');
        p.setAttribute('d', slicePath(start, end));
        p.setAttribute('fill', sliceColor(i, n));
        p.setAttribute('class', 'wheel-slice');
        slicesEl.appendChild(p);

        const pos = labelPos(mid);
        const t = document.createElementNS(SVG_NS, 'text');
        t.setAttribute('x', pos.x.toFixed(2));
        t.setAttribute('y', pos.y.toFixed(2));
        t.setAttribute('text-anchor', 'middle');
        t.setAttribute('dominant-baseline', 'middle');
        t.setAttribute('class', 'wheel-label');
        // Rotate label so it follows the slice's angular midline. Flip on
        // the bottom half so text isn't upside down.
        const flip = mid > 90 && mid < 270 ? 180 : 0;
        t.setAttribute('transform', `rotate(${mid + flip} ${pos.x.toFixed(2)} ${pos.y.toFixed(2)})`);
        const short = opt.length > 14 ? opt.slice(0, 13) + '…' : opt;
        t.textContent = short;
        labelsEl.appendChild(t);
      });
    }

    function applyRotation(deg, animate, durationMs) {
      // Reset the transition so we can either snap or animate; we *always* set
      // transform after the next animation frame so the previous transform is
      // committed first (otherwise the browser may collapse the change into a
      // single style update and skip the animation).
      spinnerEl.style.transition = animate
        ? `transform ${durationMs}ms cubic-bezier(0.17, 0.67, 0.16, 1)`
        : 'none';
      spinnerEl.style.transform = `rotate(${deg}deg)`;
    }

    function renderList() {
      listEl.innerHTML = '';
      data.options.forEach((opt, idx) => {
        const li = document.createElement('li');
        li.innerHTML = `
          <span class="picker-opt">${escapeHtml(opt)}</span>
          <button class="picker-del" title="Remove">×</button>`;
        li.querySelector('.picker-del').addEventListener('click', () => {
          data.options.splice(idx, 1);
          renderList();
          drawWheel();
          ctx.save();
        });
        listEl.appendChild(li);
      });
      spinBt.disabled = data.options.length === 0 || spinning;
    }

    function refreshResult() {
      resultEl.textContent = data.last || ' ';
      resultEl.classList.toggle('wheel-result-empty', !data.last);
    }

    function spin() {
      if (spinning || !data.options.length) return;
      spinning = true;
      spinBt.disabled = true;

      const n = data.options.length;
      const step = 360 / n;
      // Pick a winner uniformly. Account for current accumulated rotation so
      // we end up with the chosen slice's midline pointing at the top pointer.
      // The pointer is at 0deg (12 o'clock). Slice i covers [i*step, (i+1)*step]
      // before rotation. We want the slice's midline (i*step + step/2) to align
      // with the pointer at 0deg after the spin, i.e. rotation = -mid (mod 360).
      const winnerIdx = Math.floor(Math.random() * n);
      const midDeg = winnerIdx * step + step / 2;
      // Add a small random offset within the slice so we don't always land
      // dead-center — looks more like a real spin.
      const jitter = (Math.random() - 0.5) * (step * 0.6);
      const targetMod = (360 - midDeg + jitter + 360) % 360;
      // Add 5-7 full rotations on top of the current angle for visual weight.
      const fullSpins = 5 + Math.floor(Math.random() * 3);
      const current = data.rotation % 360;
      const delta = ((targetMod - current) + 360) % 360 + fullSpins * 360;
      const final = data.rotation + delta;
      data.rotation = final;

      const dur = Math.max(800, settings.spinDurationMs || 4200);
      applyRotation(final, true, dur);

      const onEnd = () => {
        spinnerEl.removeEventListener('transitionend', onEnd);
        spinning = false;
        data.last = data.options[winnerIdx];
        if (settings.removeAfterPick) {
          data.options.splice(winnerIdx, 1);
          // Normalize accumulated rotation so it doesn't grow forever
          data.rotation = data.rotation % 360;
          renderList();
          drawWheel();
          applyRotation(data.rotation, false);
        }
        refreshResult();
        // Flash the result text
        resultEl.classList.remove('wheel-flash');
        void resultEl.offsetWidth;
        resultEl.classList.add('wheel-flash');
        spinBt.disabled = data.options.length === 0;
        ctx.save();
      };
      spinnerEl.addEventListener('transitionend', onEnd);
    }

    spinBt.addEventListener('click', spin);
    inputEl.addEventListener('keydown', e => {
      if (e.key === 'Enter' && inputEl.value.trim()) {
        data.options.push(inputEl.value.trim());
        inputEl.value = '';
        renderList();
        drawWheel();
        ctx.save();
      }
    });

    // Initial paint
    drawWheel();
    applyRotation(data.rotation, false);
    refreshResult();
    renderList();
  }
});
