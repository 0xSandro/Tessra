import { register } from '../widget-registry.js';
import { escapeHtml } from '../utils.js';

register({
  type: 'picker',
  title: 'Random Picker',
  icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>',
  category: 'random',
  defaultSize: { w: 280, h: 280 },
  minSize:     { w: 220, h: 200 },

  defaultData: () => ({
    options: ['Yes', 'No', 'Maybe'],
    last: null
  }),

  defaultSettings: () => ({
    removeAfterPick: false
  }),
  settingsSchema: [
    { key: 'removeAfterPick', type: 'toggle', label: 'Remove after picking' }
  ],

  render(body, ctx) {
    const { data, settings } = ctx;
    body.innerHTML = `
      <div class="picker">
        <div class="picker-result"></div>
        <button class="picker-pick">Pick</button>
        <ul class="picker-list"></ul>
        <input class="picker-input" placeholder="Add option, press Enter"/>
      </div>`;
    const resultEl = body.querySelector('.picker-result');
    const pickBtn  = body.querySelector('.picker-pick');
    const listEl   = body.querySelector('.picker-list');
    const inputEl  = body.querySelector('.picker-input');

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
          ctx.save();
        });
        listEl.appendChild(li);
      });
      pickBtn.disabled = data.options.length === 0;
    }

    function refreshResult() {
      resultEl.textContent = data.last || '?';
      resultEl.classList.toggle('picker-result-empty', !data.last);
    }

    pickBtn.addEventListener('click', () => {
      if (!data.options.length) return;
      const idx = Math.floor(Math.random() * data.options.length);
      data.last = data.options[idx];
      if (settings.removeAfterPick) {
        data.options.splice(idx, 1);
        renderList();
      }
      refreshResult();
      // Restart the flash animation even if the picked value is the same as before
      resultEl.classList.remove('picker-flash');
      void resultEl.offsetWidth; // force reflow
      resultEl.classList.add('picker-flash');
      ctx.save();
    });

    inputEl.addEventListener('keydown', e => {
      if (e.key === 'Enter' && inputEl.value.trim()) {
        data.options.push(inputEl.value.trim());
        inputEl.value = '';
        renderList();
        ctx.save();
      }
    });

    refreshResult();
    renderList();
  }
});
