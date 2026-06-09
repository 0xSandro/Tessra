import { register } from '../widget-registry.js';

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

register({
  type: 'regex',
  title: 'Regex Tester',
  icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3v8"/><path d="M13.5 5.5l7 4M13.5 9.5l7-4"/><circle cx="7" cy="19" r="2" fill="currentColor" stroke="none"/></svg>',
  category: 'developer',
  defaultSize: { w: 380, h: 320 },
  minSize:     { w: 280, h: 220 },

  defaultData: () => ({
    pattern: '\\b\\w+@\\w+\\.\\w+\\b',
    flags: 'gi',
    text: 'Contact alice@example.com or bob@test.org for details.\nAnother line with no.email here.'
  }),

  render(body, ctx) {
    const { data } = ctx;
    body.innerHTML = `
      <div class="regex">
        <div class="regex-pattern-row">
          <span class="regex-slash">/</span>
          <input class="regex-pattern" placeholder="pattern" spellcheck="false" autocapitalize="off"/>
          <span class="regex-slash">/</span>
          <input class="regex-flags" placeholder="flags" maxlength="6" spellcheck="false" autocapitalize="off"/>
        </div>
        <textarea class="regex-text" placeholder="Test string…" spellcheck="false"></textarea>
        <div class="regex-status"></div>
        <div class="regex-output"></div>
      </div>`;
    const patternEl = body.querySelector('.regex-pattern');
    const flagsEl   = body.querySelector('.regex-flags');
    const textEl    = body.querySelector('.regex-text');
    const statusEl  = body.querySelector('.regex-status');
    const outputEl  = body.querySelector('.regex-output');

    patternEl.value = data.pattern || '';
    flagsEl.value   = data.flags   || '';
    textEl.value    = data.text    || '';

    function update() {
      const pattern = patternEl.value;
      const flags   = flagsEl.value;
      const text    = textEl.value;

      if (!pattern) {
        statusEl.textContent = '';
        statusEl.classList.remove('regex-error');
        outputEl.innerHTML = escapeHtml(text);
        return;
      }
      let re;
      try {
        re = new RegExp(pattern, flags);
      } catch (err) {
        statusEl.textContent = 'Invalid regex: ' + err.message;
        statusEl.classList.add('regex-error');
        outputEl.innerHTML = escapeHtml(text);
        return;
      }
      statusEl.classList.remove('regex-error');

      // Use a global variant internally so we can list all matches
      const globalRe = re.global ? re : new RegExp(pattern, flags + 'g');
      const matches = [];
      let m;
      let iter = 0;
      while ((m = globalRe.exec(text)) !== null) {
        matches.push({ index: m.index, length: m[0].length, text: m[0] });
        if (m.index === globalRe.lastIndex) globalRe.lastIndex++; // avoid empty-match infinite loop
        if (++iter > 10000) break; // safety cap
      }

      statusEl.textContent = matches.length
        ? `${matches.length} match${matches.length === 1 ? '' : 'es'}`
        : 'No matches';

      let html = '';
      let cursor = 0;
      matches.forEach(mt => {
        html += escapeHtml(text.slice(cursor, mt.index));
        html += `<mark>${escapeHtml(mt.text)}</mark>`;
        cursor = mt.index + mt.length;
      });
      html += escapeHtml(text.slice(cursor));
      outputEl.innerHTML = html;
    }

    patternEl.addEventListener('input', () => { data.pattern = patternEl.value; update(); ctx.save(); });
    flagsEl.addEventListener('input',   () => { data.flags   = flagsEl.value;   update(); ctx.save(); });
    textEl.addEventListener('input',    () => { data.text    = textEl.value;    update(); ctx.save(); });

    update();
  }
});
