import { registerFace } from './registry.js';

// Vertical — three stacked giant blocks for HH / MM / SS, each labeled with
// a single small letter (H, M, S). Thin separator lines between blocks for
// the brutalist editorial feel.

registerFace({
  id: 'vertical',
  label: 'Vertical',
  mount(host, settings) {
    const showSec = !!settings.showSeconds;
    host.innerHTML = `
      <div class="clock-face clock-vertical">
        <div class="vert-block"><span class="vert-num" data-key="h"></span><span class="vert-lbl">H</span></div>
        <div class="vert-block"><span class="vert-num" data-key="m"></span><span class="vert-lbl">M</span></div>
        ${showSec ? '<div class="vert-block"><span class="vert-num" data-key="s"></span><span class="vert-lbl">S</span></div>' : ''}
      </div>`;
    const slots = {
      h: host.querySelector('[data-key="h"]'),
      m: host.querySelector('[data-key="m"]'),
      s: showSec ? host.querySelector('[data-key="s"]') : null
    };
    const pad = n => String(n).padStart(2, '0');
    return (now) => {
      let h = now.getHours();
      if (settings.format === '12h') h = (h % 12) || 12;
      slots.h.textContent = pad(h);
      slots.m.textContent = pad(now.getMinutes());
      if (slots.s) slots.s.textContent = pad(now.getSeconds());
    };
  }
});
