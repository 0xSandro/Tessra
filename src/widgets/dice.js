import { register } from '../widget-registry.js';

register({
  type: 'dice',
  title: 'Dice Roller',
  icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1" fill="currentColor" stroke="none"/><circle cx="16" cy="16" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/></svg>',
  category: 'random',
  defaultSize: { w: 280, h: 240 },
  minSize:     { w: 220, h: 180 },

  defaultData: () => ({ lastRolls: [] }),

  defaultSettings: () => ({
    count: 2,
    sides: '6'   // strings because <select> values are strings
  }),
  settingsSchema: [
    { key: 'count', type: 'slider', label: 'Dice',  min: 1, max: 10, step: 1 },
    { key: 'sides', type: 'select', label: 'Sides', options: [
      { value: '4',   label: 'd4'   },
      { value: '6',   label: 'd6'   },
      { value: '8',   label: 'd8'   },
      { value: '10',  label: 'd10'  },
      { value: '12',  label: 'd12'  },
      { value: '20',  label: 'd20'  },
      { value: '100', label: 'd100' }
    ]}
  ],

  render(body, ctx) {
    const { data, settings } = ctx;
    const sides = +settings.sides || 6;
    const count = +settings.count || 1;

    body.innerHTML = `
      <div class="dice">
        <div class="dice-results"></div>
        <div class="dice-total"></div>
        <button class="dice-roll">Roll ${count}d${sides}</button>
      </div>`;
    const resultsEl = body.querySelector('.dice-results');
    const totalEl   = body.querySelector('.dice-total');
    const rollBtn   = body.querySelector('.dice-roll');

    function refresh() {
      if (!data.lastRolls || !data.lastRolls.length) {
        resultsEl.innerHTML = '<div class="dice-placeholder">Roll the dice</div>';
        totalEl.textContent = '';
        return;
      }
      resultsEl.innerHTML = data.lastRolls
        .map(n => `<div class="dice-die">${n}</div>`)
        .join('');
      totalEl.textContent = data.lastRolls.length > 1
        ? `Total: ${data.lastRolls.reduce((a, b) => a + b, 0)}`
        : '';
    }

    rollBtn.addEventListener('click', () => {
      const rolls = [];
      for (let i = 0; i < count; i++) {
        rolls.push(Math.floor(Math.random() * sides) + 1);
      }
      data.lastRolls = rolls;
      refresh();
      ctx.save();
    });

    refresh();
  }
});
