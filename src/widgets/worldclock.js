import { register } from '../widget-registry.js';
import { escapeHtml } from '../utils.js';

function isValidTz(tz) {
  try {
    new Date().toLocaleString('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

register({
  type: 'worldclock',
  title: 'World Clock',
  icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15 15 0 0 1 4 10 15 15 0 0 1-4 10 15 15 0 0 1-4-10 15 15 0 0 1 4-10z"/></svg>',
  category: 'time',
  defaultSize: { w: 280, h: 240 },
  minSize:     { w: 220, h: 160 },

  defaultData: () => ({
    zones: [
      { label: 'UTC', tz: 'UTC' }
    ]
  }),

  defaultSettings: () => ({
    format: '24h',
    showSeconds: false
  }),
  settingsSchema: [
    { key: 'format', type: 'select', label: 'Format', options: [
      { value: '24h', label: '24-hour' },
      { value: '12h', label: '12-hour' }
    ]},
    { key: 'showSeconds', type: 'toggle', label: 'Show seconds' }
  ],

  render(body, ctx) {
    const { data, settings } = ctx;

    const opts = {
      hour: '2-digit',
      minute: '2-digit',
      hour12: settings.format === '12h'
    };
    if (settings.showSeconds) opts.second = '2-digit';

    function renderList() {
      body.innerHTML = `<ul class="wc-list"></ul><button class="wc-add">+ Add timezone</button>`;
      const ul = body.querySelector('.wc-list');
      data.zones.forEach((z, idx) => {
        const li = document.createElement('li');
        li.className = 'wc-item';
        li.innerHTML = `
          <div class="wc-info">
            <div class="wc-label">${escapeHtml(z.label)}</div>
            <div class="wc-tz">${escapeHtml(z.tz)}</div>
          </div>
          <div class="wc-time" data-tz="${escapeHtml(z.tz)}">--:--</div>
          <button class="wc-del" title="Remove">×</button>`;
        li.querySelector('.wc-del').addEventListener('click', () => {
          data.zones.splice(idx, 1);
          ctx.save();
          renderList();
          tick();
        });
        ul.appendChild(li);
      });
      body.querySelector('.wc-add').addEventListener('click', () => {
        const label = prompt('Label (e.g. London):');
        if (!label || !label.trim()) return;
        const tz = prompt('IANA timezone (e.g. Europe/London):');
        if (!tz || !tz.trim()) return;
        const tzTrim = tz.trim();
        if (!isValidTz(tzTrim)) {
          alert(`Unknown timezone: "${tzTrim}". Use an IANA name like "Europe/Berlin".`);
          return;
        }
        data.zones.push({ label: label.trim(), tz: tzTrim });
        ctx.save();
        renderList();
        tick();
      });
    }

    function tick() {
      body.querySelectorAll('.wc-time').forEach(el => {
        const tz = el.dataset.tz;
        try {
          el.textContent = new Date().toLocaleTimeString([], { ...opts, timeZone: tz });
        } catch {
          el.textContent = '??';
        }
      });
    }

    renderList();
    tick();
    const interval = setInterval(tick, settings.showSeconds ? 1000 : 15000);
    ctx.onCleanup(() => clearInterval(interval));
  }
});
