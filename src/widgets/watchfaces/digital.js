import { registerFace } from './registry.js';

// Minimal Digital — the original clock look. Big light-weight time numerals,
// muted date underneath. Toggles 12/24-hour and seconds via shared clock
// settings.

registerFace({
  id: 'digital',
  label: 'Minimal Digital',
  mount(host, settings) {
    host.innerHTML = `
      <div class="clock-face clock-digital">
        <div class="clock-time"></div>
        <div class="clock-date"></div>
      </div>`;
    const timeEl = host.querySelector('.clock-time');
    const dateEl = host.querySelector('.clock-date');
    const fmt = {
      hour: '2-digit',
      minute: '2-digit',
      hour12: settings.format === '12h'
    };
    if (settings.showSeconds) fmt.second = '2-digit';
    return (now) => {
      timeEl.textContent = now.toLocaleTimeString([], fmt);
      dateEl.textContent = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
    };
  }
});
