import { register } from '../widget-registry.js';
import { escapeHtml } from '../utils.js';

// Imported/shared layouts (Presets → Import/Paste) write data.colors
// directly, bypassing the add-flow's regex check below — re-validate at
// render time so a crafted preset can't smuggle in something other than a
// plain hex color via the swatch's inline `style` or text content.
function isHexColor(v) {
  return typeof v === 'string' && /^#[0-9A-Fa-f]{6}$/.test(v);
}

register({
  type: 'palette',
  title: 'Color Palette',
  icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c1 0 1.5-.5 1.5-1.3 0-.7-.5-1.2-1.2-1.5-.7-.3-1.3-.8-1.3-1.5 0-1 1-2 2-2H15c2.8 0 5-2.2 5-5C20 6 16 2 12 2z"/><circle cx="7.5" cy="11" r="1.2" fill="currentColor" stroke="none"/><circle cx="11" cy="7" r="1.2" fill="currentColor" stroke="none"/><circle cx="15.5" cy="9" r="1.2" fill="currentColor" stroke="none"/></svg>',
  category: 'productivity',
  defaultSize: { w: 280, h: 220 },
  minSize:     { w: 200, h: 160 },

  defaultData: () => ({
    colors: [
      { hex: '#2563EB' },
      { hex: '#16A34A' },
      { hex: '#F59E0B' },
      { hex: '#EF4444' }
    ]
  }),

  render(body, ctx) {
    const { data } = ctx;
    body.innerHTML = `
      <div class="palette">
        <div class="palette-grid"></div>
        <button class="palette-add">+ Add color</button>
      </div>`;
    const grid   = body.querySelector('.palette-grid');
    const addBt  = body.querySelector('.palette-add');

    function renderAll() {
      grid.innerHTML = '';
      data.colors.forEach((color, idx) => {
        const hex = isHexColor(color.hex) ? color.hex : '#000000';
        const item = document.createElement('div');
        item.className = 'palette-item';
        item.innerHTML = `
          <button class="palette-swatch" style="background:${hex}" title="Copy ${hex}"></button>
          <div class="palette-hex">${escapeHtml(hex)}</div>
          <button class="palette-del" title="Remove">×</button>`;
        const swatch = item.querySelector('.palette-swatch');
        const hexEl  = item.querySelector('.palette-hex');
        const copy = () => {
          navigator.clipboard.writeText(color.hex).then(() => {
            const orig = hexEl.textContent;
            hexEl.textContent = 'Copied!';
            hexEl.classList.add('palette-copied');
            setTimeout(() => {
              hexEl.textContent = orig;
              hexEl.classList.remove('palette-copied');
            }, 900);
          }).catch(() => alert('Could not copy to clipboard.'));
        };
        swatch.addEventListener('click', copy);
        hexEl.addEventListener('click', copy);
        item.querySelector('.palette-del').addEventListener('click', e => {
          e.stopPropagation();
          data.colors.splice(idx, 1);
          renderAll();
          ctx.save();
        });
        grid.appendChild(item);
      });
    }

    addBt.addEventListener('click', () => {
      const input = prompt('Hex color (e.g. #ff0000):');
      if (!input) return;
      const v = input.trim();
      const hex = (v.startsWith('#') ? v : '#' + v).toUpperCase();
      if (!/^#[0-9A-F]{6}$/.test(hex)) {
        alert('Invalid hex color (use #RRGGBB).');
        return;
      }
      data.colors.push({ hex });
      renderAll();
      ctx.save();
    });

    renderAll();
  }
});
