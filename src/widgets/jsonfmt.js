import { register } from '../widget-registry.js';

register({
  type: 'jsonfmt',
  title: 'JSON Formatter',
  icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H6a2 2 0 0 0-2 2v4a2 2 0 0 1-2 2 2 2 0 0 1 2 2v4a2 2 0 0 0 2 2h2"/><path d="M16 21h2a2 2 0 0 0 2-2v-4a2 2 0 0 1 2-2 2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-2"/></svg>',
  category: 'developer',
  defaultSize: { w: 380, h: 320 },
  minSize:     { w: 260, h: 200 },

  defaultData: () => ({ text: '' }),

  defaultSettings: () => ({ indent: '2' }),
  settingsSchema: [
    { key: 'indent', type: 'select', label: 'Indent', options: [
      { value: '2',   label: '2 spaces' },
      { value: '4',   label: '4 spaces' },
      { value: 'tab', label: 'Tab' }
    ]}
  ],

  render(body, ctx) {
    const { data, settings } = ctx;
    body.innerHTML = `
      <div class="jsonfmt">
        <textarea class="jsonfmt-input" placeholder="Paste JSON…" spellcheck="false"></textarea>
        <div class="jsonfmt-error"></div>
        <div class="jsonfmt-actions">
          <button class="jsonfmt-btn jsonfmt-format">Format</button>
          <button class="jsonfmt-btn jsonfmt-minify">Minify</button>
          <button class="jsonfmt-btn jsonfmt-copy">Copy</button>
        </div>
      </div>`;
    const inputEl   = body.querySelector('.jsonfmt-input');
    const errorEl   = body.querySelector('.jsonfmt-error');
    const formatBt  = body.querySelector('.jsonfmt-format');
    const minifyBt  = body.querySelector('.jsonfmt-minify');
    const copyBt    = body.querySelector('.jsonfmt-copy');
    inputEl.value = data.text || '';

    function indentValue() {
      if (settings.indent === 'tab') return '\t';
      return Math.max(0, Math.min(8, +settings.indent || 2));
    }

    inputEl.addEventListener('input', () => {
      data.text = inputEl.value;
      errorEl.textContent = '';
      ctx.save();
    });

    function transform(indent) {
      try {
        const obj = JSON.parse(inputEl.value);
        inputEl.value = JSON.stringify(obj, null, indent);
        data.text = inputEl.value;
        errorEl.textContent = '';
        ctx.save();
      } catch (err) {
        errorEl.textContent = err.message;
      }
    }

    formatBt.addEventListener('click', () => transform(indentValue()));
    minifyBt.addEventListener('click', () => transform(undefined));
    copyBt.addEventListener('click', () => {
      navigator.clipboard.writeText(inputEl.value).then(() => {
        const orig = copyBt.textContent;
        copyBt.textContent = 'Copied!';
        copyBt.classList.add('copied');
        setTimeout(() => {
          copyBt.textContent = orig;
          copyBt.classList.remove('copied');
        }, 800);
      });
    });
  }
});
