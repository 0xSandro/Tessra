import { register } from '../widget-registry.js';

// One sticky note per widget. No widget-header — the sticky is the chrome.
// A small × in the top-right corner removes the widget (synthesizes a click
// on the hidden .widget-remove button so all the existing teardown logic
// runs untouched). A thin transparent strip across the top acts as the
// drag handle; the textarea below it intercepts mousedowns and won't drag.

const COLORS = [
  { id: 'yellow', bg: '#FFF59D', edge: '#F9A825' },
  { id: 'pink',   bg: '#F8BBD0', edge: '#D81B60' },
  { id: 'green',  bg: '#C8E6C9', edge: '#43A047' },
  { id: 'blue',   bg: '#BBDEFB', edge: '#1E88E5' },
  { id: 'purple', bg: '#E1BEE7', edge: '#8E24AA' },
  { id: 'orange', bg: '#FFCCBC', edge: '#E64A19' }
];

function colorFor(id) {
  return COLORS.find(c => c.id === id) || COLORS[0];
}
function nextColor(id) {
  const i = COLORS.findIndex(c => c.id === id);
  return COLORS[(i + 1) % COLORS.length];
}

function migrateLegacy(data) {
  if (!Array.isArray(data.notes)) return;
  const filled = data.notes.filter(n => (n?.text || '').trim().length);
  const merged = filled.map(n => n.text.trim()).join('\n\n');
  const head = filled.find(n => n.color);
  let colorId = 'yellow';
  if (head?.color) {
    const lc = String(head.color).toLowerCase();
    if (lc.includes('fce') || lc.includes('f8b')) colorId = 'pink';
    else if (lc.includes('d1f') || lc.includes('c8e')) colorId = 'green';
    else if (lc.includes('dbe') || lc.includes('bbd')) colorId = 'blue';
    else if (lc.includes('e9d') || lc.includes('e1b')) colorId = 'purple';
    else if (lc.includes('fed') || lc.includes('ffc')) colorId = 'orange';
  }
  const existing = typeof data.text === 'string' ? data.text : '';
  data.text = existing && merged ? existing + '\n\n' + merged : (existing || merged);
  data.colorId = data.colorId || colorId;
  delete data.notes;
}

register({
  type: 'stickies',
  title: 'Sticky Note',
  icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h12l4 4v12H4z"/><path d="M16 4v4h4"/></svg>',
  category: 'productivity',
  defaultSize: { w: 200, h: 180 },
  minSize:     { w: 140, h: 120 },

  defaultData: () => ({ text: '', colorId: 'yellow' }),

  render(body, ctx) {
    const { data } = ctx;
    migrateLegacy(data);
    if (typeof data.text !== 'string') data.text = '';
    if (!data.colorId) data.colorId = 'yellow';

    const color = colorFor(data.colorId);

    body.innerHTML = `
      <div class="sticky" data-color="${color.id}" style="--sticky-bg: ${color.bg}; --sticky-edge: ${color.edge};">
        <div class="sticky-grip" title="Drag"></div>
        <div class="sticky-actions">
          <button class="sticky-color-btn" title="Cycle color"></button>
          <button class="sticky-remove" title="Remove">×</button>
        </div>
        <textarea class="sticky-textarea" placeholder="Write something…" spellcheck="false"></textarea>
        <div class="sticky-curl"></div>
      </div>`;

    const stickyEl = body.querySelector('.sticky');
    const gripEl   = body.querySelector('.sticky-grip');
    const textEl   = body.querySelector('.sticky-textarea');
    const colorBt  = body.querySelector('.sticky-color-btn');
    const removeBt = body.querySelector('.sticky-remove');

    textEl.value = data.text;
    textEl.addEventListener('input', () => {
      data.text = textEl.value;
      ctx.save();
    });

    // Stop the widget drag handler from intercepting events fired on the
    // text or the controls. Grip and the empty padding area below stay
    // un-stopped so they keep dragging the widget normally.
    textEl.addEventListener('mousedown', e => e.stopPropagation());
    colorBt.addEventListener('mousedown', e => e.stopPropagation());
    removeBt.addEventListener('mousedown', e => e.stopPropagation());

    colorBt.addEventListener('click', () => {
      const next = nextColor(data.colorId);
      data.colorId = next.id;
      stickyEl.dataset.color = next.id;
      stickyEl.style.setProperty('--sticky-bg',   next.bg);
      stickyEl.style.setProperty('--sticky-edge', next.edge);
      ctx.save();
    });

    // Remove the widget by synthesizing a click on the hidden header X.
    // Keeps all the existing teardown/persistence logic in main.js untouched.
    removeBt.addEventListener('click', e => {
      e.stopPropagation();
      const widget = body.closest('.widget');
      const headerRemove = widget?.querySelector('.widget-remove');
      if (headerRemove) headerRemove.click();
    });

    // Cursor hint on the grip — the rest of the drag plumbing already lives
    // in main.js (it checks for buttons/inputs/textareas to skip).
    gripEl.style.cursor = 'grab';
  }
});
