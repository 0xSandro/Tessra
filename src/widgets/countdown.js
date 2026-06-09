import { register } from '../widget-registry.js';

register({
  type: 'countdown',
  title: 'Countdown',
  icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="16" y1="3" x2="16" y2="7"/></svg>',
  category: 'time',
  defaultSize: { w: 280, h: 180 },
  minSize:     { w: 200, h: 140 },

  defaultData: () => ({}),

  defaultSettings: () => ({
    label: 'My event',
    date: '',         // YYYY-MM-DD
    precision: 'days' // 'days' | 'detailed'
  }),
  settingsSchema: [
    { key: 'label', type: 'text', label: 'Label', placeholder: 'e.g. Vacation' },
    { key: 'date',  type: 'date', label: 'Date' },
    { key: 'precision', type: 'select', label: 'Show', options: [
      { value: 'days',     label: 'Days only' },
      { value: 'detailed', label: 'Days + time' }
    ]}
  ],

  render(body, ctx) {
    const { settings } = ctx;
    body.innerHTML = `
      <div class="cd">
        <div class="cd-number"></div>
        <div class="cd-suffix"></div>
        <div class="cd-label"></div>
      </div>`;
    const numEl = body.querySelector('.cd-number');
    const sufEl = body.querySelector('.cd-suffix');
    const labEl = body.querySelector('.cd-label');

    const pad = n => String(n).padStart(2, '0');

    function update() {
      labEl.textContent = settings.label || '';
      if (!settings.date) {
        numEl.className = 'cd-number';
        numEl.textContent = '—';
        sufEl.textContent = 'set a date';
        return;
      }
      const target = new Date(settings.date + 'T00:00:00');
      if (isNaN(target.getTime())) {
        numEl.className = 'cd-number';
        numEl.textContent = '?';
        sufEl.textContent = 'invalid date';
        return;
      }

      if (settings.precision === 'detailed') {
        const diffMs = target.getTime() - Date.now();
        const past = diffMs <= 0;
        const total = Math.abs(diffMs);
        const days    = Math.floor(total / 86400000);
        const hours   = Math.floor((total % 86400000) / 3600000);
        const minutes = Math.floor((total % 3600000) / 60000);
        const seconds = Math.floor((total % 60000) / 1000);
        numEl.className = 'cd-number cd-detail';
        numEl.textContent = days > 0
          ? `${days}d ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
          : `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
        sufEl.textContent = past ? 'ago' : 'remaining';
        return;
      }

      // Days-only mode (calendar-day difference, ignoring time of day)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const days = Math.round((target - today) / 86400000);
      numEl.className = 'cd-number';
      if (days === 0) {
        numEl.textContent = 'Today';
        sufEl.textContent = '';
      } else if (days > 0) {
        numEl.textContent = days;
        sufEl.textContent = days === 1 ? 'day until' : 'days until';
      } else {
        const ago = -days;
        numEl.textContent = ago;
        sufEl.textContent = ago === 1 ? 'day ago' : 'days ago';
      }
    }

    update();
    const tickMs = settings.precision === 'detailed' ? 1000 : 60000;
    const interval = setInterval(update, tickMs);
    ctx.onCleanup(() => clearInterval(interval));
  }
});
