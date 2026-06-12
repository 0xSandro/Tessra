import { registerFace } from './registry.js';

// Progress Bars — three horizontal bars showing how far through the
// hour / minute / second cycles we are. Each row: label, track, fill, value.
// Fill width is computed from the modulo so the bars sweep smoothly and
// reset each cycle (00/00/00 at midnight = all bars empty).

registerFace({
  id: 'bars',
  label: 'Bars',
  mount(host, settings) {
    host.innerHTML = `
      <div class="clock-face clock-bars">
        <div class="bars-row" data-key="h">
          <span class="bars-label">H</span>
          <div class="bars-track"><div class="bars-fill"></div></div>
          <span class="bars-val"></span>
        </div>
        <div class="bars-row" data-key="m">
          <span class="bars-label">M</span>
          <div class="bars-track"><div class="bars-fill"></div></div>
          <span class="bars-val"></span>
        </div>
        <div class="bars-row" data-key="s">
          <span class="bars-label">S</span>
          <div class="bars-track"><div class="bars-fill"></div></div>
          <span class="bars-val"></span>
        </div>
        <div class="bars-date clock-date"></div>
      </div>`;

    const rows = {
      h: host.querySelector('.bars-row[data-key="h"]'),
      m: host.querySelector('.bars-row[data-key="m"]'),
      s: host.querySelector('.bars-row[data-key="s"]')
    };
    const dateEl = host.querySelector('.bars-date');
    const pad = n => String(n).padStart(2, '0');

    function setRow(row, value, max) {
      const fill = row.querySelector('.bars-fill');
      const val  = row.querySelector('.bars-val');
      const pct  = (value / max) * 100;
      fill.style.width = pct.toFixed(1) + '%';
      val.textContent = pad(value);
    }

    return (now) => {
      let h = now.getHours();
      const m = now.getMinutes();
      const s = now.getSeconds();
      let hMax = 24;
      if (settings.format === '12h') {
        hMax = 12;
        h = (h % 12) || 12;
      }
      setRow(rows.h, h, hMax);
      setRow(rows.m, m, 60);
      setRow(rows.s, s, 60);
      dateEl.textContent = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
    };
  }
});
