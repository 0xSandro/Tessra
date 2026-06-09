import { register } from '../widget-registry.js';

const CATEGORIES = {
  length: {
    label: 'Length',
    units: {
      mm: { label: 'mm', factor: 0.001 },
      cm: { label: 'cm', factor: 0.01 },
      m:  { label: 'm',  factor: 1 },
      km: { label: 'km', factor: 1000 },
      in: { label: 'in', factor: 0.0254 },
      ft: { label: 'ft', factor: 0.3048 },
      yd: { label: 'yd', factor: 0.9144 },
      mi: { label: 'mi', factor: 1609.344 }
    },
    default: { from: 'm', to: 'ft' }
  },
  weight: {
    label: 'Weight',
    units: {
      mg:  { label: 'mg', factor: 0.001 },
      g:   { label: 'g',  factor: 1 },
      kg:  { label: 'kg', factor: 1000 },
      oz:  { label: 'oz', factor: 28.3495 },
      lb:  { label: 'lb', factor: 453.592 },
      ton: { label: 't',  factor: 1e6 }
    },
    default: { from: 'kg', to: 'lb' }
  },
  temperature: {
    label: 'Temperature',
    units: {
      C: { label: '°C' },
      F: { label: '°F' },
      K: { label: 'K'  }
    },
    default: { from: 'C', to: 'F' }
  }
};

function convert(value, fromUnit, toUnit, category) {
  if (category === 'temperature') {
    let c;
    if (fromUnit === 'C') c = value;
    else if (fromUnit === 'F') c = (value - 32) * 5/9;
    else c = value - 273.15; // K
    if (toUnit === 'C') return c;
    if (toUnit === 'F') return c * 9/5 + 32;
    return c + 273.15; // K
  }
  const cat = CATEGORIES[category];
  const f = cat.units[fromUnit].factor;
  const t = cat.units[toUnit].factor;
  return value * f / t;
}

function fmt(n) {
  if (!isFinite(n)) return 'Error';
  return parseFloat(n.toPrecision(8)).toString();
}

register({
  type: 'converter',
  title: 'Unit Converter',
  icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 16V4"/><path d="M3 8l4-4 4 4"/><path d="M17 8v12"/><path d="M21 16l-4 4-4-4"/></svg>',
  category: 'productivity',
  defaultSize: { w: 280, h: 240 },
  minSize:     { w: 220, h: 200 },

  defaultData: () => ({
    category: 'length',
    fromUnit: 'm',
    toUnit:   'ft',
    value: '1'
  }),

  render(body, ctx) {
    const { data } = ctx;
    body.innerHTML = `
      <div class="conv">
        <select class="conv-category select-input"></select>
        <div class="conv-row">
          <input class="conv-input conv-from" type="text" inputmode="decimal"/>
          <select class="conv-unit conv-from-unit select-input"></select>
        </div>
        <button class="conv-swap" title="Swap units">⇅</button>
        <div class="conv-row">
          <input class="conv-input conv-to" type="text" inputmode="decimal" readonly/>
          <select class="conv-unit conv-to-unit select-input"></select>
        </div>
      </div>`;
    const catSel    = body.querySelector('.conv-category');
    const fromInput = body.querySelector('.conv-from');
    const fromUnit  = body.querySelector('.conv-from-unit');
    const toInput   = body.querySelector('.conv-to');
    const toUnit    = body.querySelector('.conv-to-unit');
    const swapBt    = body.querySelector('.conv-swap');

    function populateCategory() {
      catSel.innerHTML = Object.entries(CATEGORIES).map(([k, v]) =>
        `<option value="${k}">${v.label}</option>`
      ).join('');
      catSel.value = data.category;
    }
    function populateUnits() {
      const cat = CATEGORIES[data.category];
      const opts = Object.entries(cat.units).map(([k, v]) =>
        `<option value="${k}">${v.label}</option>`
      ).join('');
      fromUnit.innerHTML = opts;
      toUnit.innerHTML   = opts;
      if (!cat.units[data.fromUnit]) data.fromUnit = cat.default.from;
      if (!cat.units[data.toUnit])   data.toUnit   = cat.default.to;
      fromUnit.value = data.fromUnit;
      toUnit.value   = data.toUnit;
    }
    function compute() {
      const v = parseFloat(data.value);
      if (isNaN(v)) { toInput.value = ''; return; }
      toInput.value = fmt(convert(v, data.fromUnit, data.toUnit, data.category));
    }

    catSel.addEventListener('change', () => {
      data.category = catSel.value;
      const cat = CATEGORIES[data.category];
      data.fromUnit = cat.default.from;
      data.toUnit   = cat.default.to;
      populateUnits();
      compute();
      ctx.save();
    });
    fromUnit.addEventListener('change', () => { data.fromUnit = fromUnit.value; compute(); ctx.save(); });
    toUnit.addEventListener('change',   () => { data.toUnit   = toUnit.value;   compute(); ctx.save(); });
    fromInput.addEventListener('input', () => { data.value = fromInput.value;   compute(); ctx.save(); });
    swapBt.addEventListener('click', () => {
      [data.fromUnit, data.toUnit] = [data.toUnit, data.fromUnit];
      fromUnit.value = data.fromUnit;
      toUnit.value   = data.toUnit;
      compute();
      ctx.save();
    });

    populateCategory();
    populateUnits();
    fromInput.value = data.value;
    compute();
  }
});
