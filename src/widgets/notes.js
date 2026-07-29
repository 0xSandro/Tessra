import { register } from '../widget-registry.js';

// Plain editable notes. Single textarea, no tabs. Widget title (in the header)
// doubles as the rename hook. Migration from the old tabbed shape lives in
// main.js's migrate() — we just need to defensively coerce here in case a
// legacy payload sneaks past.

function flattenLegacyTabs(tabs) {
  if (!Array.isArray(tabs) || !tabs.length) return '';
  if (tabs.length === 1) return tabs[0]?.content || '';
  return tabs
    .filter(t => (t?.content || '').trim().length)
    .map(t => `== ${t.title || 'Untitled'} ==\n${t.content || ''}`)
    .join('\n\n');
}

register({
  type: 'notes',
  title: 'Notes',
  icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="13" y2="16"/></svg>',
  category: 'productivity',
  defaultSize: { w: 360, h: 280 },
  minSize:     { w: 220, h: 140 },
  autoNumber:  true,

  defaultData: () => ({ content: '' }),

  render(body, ctx) {
    const { data } = ctx;

    // Defensive migration in case a tabbed payload reaches us directly.
    if (Array.isArray(data.tabs)) {
      data.content = flattenLegacyTabs(data.tabs);
      delete data.tabs;
      delete data.activeTabId;
      ctx.save();
    }
    if (typeof data.content !== 'string') data.content = '';

    body.innerHTML = `
      <div class="notes">
        <textarea class="notes-textarea" placeholder="Type here…" spellcheck="false"></textarea>
      </div>`;

    const textEl = body.querySelector('.notes-textarea');
    textEl.value = data.content;

    textEl.addEventListener('input', () => {
      data.content = textEl.value;
      ctx.save();
    });
    textEl.addEventListener('mousedown', e => e.stopPropagation());
  }
});
