import { register } from '../widget-registry.js';

// Standard left-to-right calculator (no operator precedence — same as iOS).
// State:
//   display        current value shown
//   prev           previously entered operand
//   op             pending operator ('+', '-', '*', '/') or null
//   waiting        true after pressing an operator; next digit starts a fresh operand
//   justEvaluated  true right after '=' so the next digit clears the display

register({
  type: 'calculator',
  title: 'Calculator',
  icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><circle cx="8" cy="11" r="0.6" fill="currentColor"/><circle cx="12" cy="11" r="0.6" fill="currentColor"/><circle cx="16" cy="11" r="0.6" fill="currentColor"/><circle cx="8" cy="15" r="0.6" fill="currentColor"/><circle cx="12" cy="15" r="0.6" fill="currentColor"/><circle cx="16" cy="15" r="0.6" fill="currentColor"/><circle cx="8" cy="19" r="0.6" fill="currentColor"/><circle cx="12" cy="19" r="0.6" fill="currentColor"/><circle cx="16" cy="19" r="0.6" fill="currentColor"/></svg>',
  category: 'productivity',
  defaultSize: { w: 240, h: 320 },
  minSize:     { w: 200, h: 280 },

  defaultData: () => ({
    display: '0',
    prev: null,
    op: null,
    waiting: false,
    justEvaluated: false
  }),

  render(body, ctx) {
    const { data } = ctx;
    body.innerHTML = `
      <div class="calc">
        <div class="calc-display"></div>
        <div class="calc-buttons">
          <button class="calc-btn calc-fn" data-action="clear">AC</button>
          <button class="calc-btn calc-fn" data-action="negate">±</button>
          <button class="calc-btn calc-fn" data-action="percent">%</button>
          <button class="calc-btn calc-op" data-op="/">÷</button>
          <button class="calc-btn" data-digit="7">7</button>
          <button class="calc-btn" data-digit="8">8</button>
          <button class="calc-btn" data-digit="9">9</button>
          <button class="calc-btn calc-op" data-op="*">×</button>
          <button class="calc-btn" data-digit="4">4</button>
          <button class="calc-btn" data-digit="5">5</button>
          <button class="calc-btn" data-digit="6">6</button>
          <button class="calc-btn calc-op" data-op="-">−</button>
          <button class="calc-btn" data-digit="1">1</button>
          <button class="calc-btn" data-digit="2">2</button>
          <button class="calc-btn" data-digit="3">3</button>
          <button class="calc-btn calc-op" data-op="+">+</button>
          <button class="calc-btn calc-zero" data-digit="0">0</button>
          <button class="calc-btn" data-digit=".">.</button>
          <button class="calc-btn calc-op" data-action="equal">=</button>
        </div>
      </div>`;

    const displayEl = body.querySelector('.calc-display');

    function fmt(n) {
      if (!isFinite(n)) return 'Error';
      const abs = Math.abs(n);
      if (abs !== 0 && (abs < 1e-4 || abs >= 1e10)) return n.toExponential(4);
      return parseFloat(n.toPrecision(10)).toString();
    }
    function evaluate(a, b, op) {
      if (op === '+') return a + b;
      if (op === '-') return a - b;
      if (op === '*') return a * b;
      if (op === '/') return b === 0 ? Infinity : a / b;
      return b;
    }
    function update() {
      let v = data.display === '' || data.display === undefined ? '0' : data.display;
      // Don't reformat in-progress entry that ends with '.' or has trailing zeros after '.'
      if (!/\.\d*$/.test(v) && !v.endsWith('.')) {
        const n = parseFloat(v);
        if (!isNaN(n)) v = fmt(n);
      }
      displayEl.textContent = v;
    }
    function press(kind, value) {
      if (kind === 'digit') {
        if (data.justEvaluated || data.waiting) {
          data.display = value === '.' ? '0.' : value;
          data.justEvaluated = false;
          data.waiting = false;
        } else {
          if (value === '.' && data.display.includes('.')) return;
          if (data.display === '0' && value !== '.') data.display = value;
          else data.display += value;
        }
      } else if (kind === 'op') {
        const cur = parseFloat(data.display);
        if (data.op !== null && !data.waiting) {
          const r = evaluate(data.prev, cur, data.op);
          data.display = fmt(r);
          data.prev = r;
        } else {
          data.prev = cur;
        }
        data.op = value;
        data.waiting = true;
        data.justEvaluated = false;
      } else if (kind === 'equal') {
        if (data.op === null) return;
        const cur = parseFloat(data.display);
        const r = evaluate(data.prev, cur, data.op);
        data.display = fmt(r);
        data.prev = null;
        data.op = null;
        data.waiting = false;
        data.justEvaluated = true;
      } else if (kind === 'clear') {
        data.display = '0';
        data.prev = null; data.op = null;
        data.waiting = false; data.justEvaluated = false;
      } else if (kind === 'negate') {
        const n = parseFloat(data.display);
        data.display = fmt(-n);
      } else if (kind === 'percent') {
        const n = parseFloat(data.display);
        data.display = fmt(n / 100);
      }
      update();
      ctx.save();
    }

    body.querySelectorAll('[data-digit]').forEach(b => b.addEventListener('click', () => press('digit', b.dataset.digit)));
    body.querySelectorAll('[data-op]').forEach(b => b.addEventListener('click', () => press('op', b.dataset.op)));
    body.querySelectorAll('[data-action]').forEach(b => b.addEventListener('click', () => press(b.dataset.action)));
    update();
  }
});
