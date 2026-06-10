import { register } from '../widget-registry.js';

// Tally counter. Plus/minus buttons, configurable step, and a reset.

register({
  type: 'counter',
  title: 'Counter',
  icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>',
  category: 'productivity',
  defaultSize: { w: 240, h: 240 },
  minSize:     { w: 200, h: 200 },

  defaultData: () => ({ count: 0 }),

  defaultSettings: () => ({
    label: '',
    step: 1
  }),
  settingsSchema: [
    { key: 'label', type: 'text',   label: 'Label', placeholder: 'e.g. Pages read' },
    { key: 'step',  type: 'slider', label: 'Step',  min: 1, max: 100, step: 1 }
  ],

  render(body, ctx) {
    const { data, settings } = ctx;
    body.innerHTML = `
      <div class="counter">
        <div class="counter-label"></div>
        <div class="counter-display"></div>
        <div class="counter-controls">
          <button class="counter-dec" title="Decrement">−</button>
          <button class="counter-inc" title="Increment">+</button>
        </div>
        <button class="counter-reset">Reset</button>
      </div>`;

    const labelEl   = body.querySelector('.counter-label');
    const displayEl = body.querySelector('.counter-display');
    const incBt     = body.querySelector('.counter-inc');
    const decBt     = body.querySelector('.counter-dec');
    const resetBt   = body.querySelector('.counter-reset');

    function update() {
      const lbl = (settings.label || '').trim();
      labelEl.textContent = lbl;
      labelEl.style.display = lbl ? '' : 'none';
      displayEl.textContent = data.count;
    }

    incBt.addEventListener('click', () => {
      data.count = (data.count || 0) + (Number(settings.step) || 1);
      update();
      ctx.save();
    });
    decBt.addEventListener('click', () => {
      data.count = (data.count || 0) - (Number(settings.step) || 1);
      update();
      ctx.save();
    });
    resetBt.addEventListener('click', () => {
      data.count = 0;
      update();
      ctx.save();
    });

    update();
  }
});
