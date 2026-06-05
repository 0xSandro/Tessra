import { register } from '../widget-registry.js';

register({
  type: 'clock',
  title: 'Clock',
  icon: '◷',
  category: 'time',
  defaultSize: { w: 280, h: 140 },
  minSize:     { w: 160, h: 80  },
  defaultData: () => ({}),

  defaultSettings: () => ({
    format: '24h',     // '24h' | '12h'
    showSeconds: true
  }),
  settingsSchema: [
    { key: 'format', type: 'select', label: 'Format', options: [
      { value: '24h', label: '24-hour' },
      { value: '12h', label: '12-hour' }
    ]},
    { key: 'showSeconds', type: 'toggle', label: 'Show seconds' }
  ],

  render(body, ctx) {
    body.innerHTML = '<div class="clock-time"></div><div class="clock-date"></div>';
    const timeEl = body.querySelector('.clock-time');
    const dateEl = body.querySelector('.clock-date');
    const s = ctx.settings;
    const fmt = {
      hour: '2-digit',
      minute: '2-digit',
      hour12: s.format === '12h'
    };
    if (s.showSeconds) fmt.second = '2-digit';
    const tick = () => {
      const now = new Date();
      timeEl.textContent = now.toLocaleTimeString([], fmt);
      dateEl.textContent = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
    };
    tick();
    // Tick every second when showing seconds, otherwise every 15s is plenty
    const interval = setInterval(tick, s.showSeconds ? 1000 : 15000);
    ctx.onCleanup(() => clearInterval(interval));
  }
});
