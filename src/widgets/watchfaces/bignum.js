import { registerFace } from './registry.js';

// Big Number — Apple Watch X-Large vibes. Time numerals fill the widget;
// font scales with viewport height so the number stays huge regardless of
// how big the user resizes the widget.

registerFace({
  id: 'bignum',
  label: 'Big Number',
  mount(host, settings) {
    host.innerHTML = `
      <div class="clock-face clock-bignum">
        <div class="bignum-time"></div>
        <div class="bignum-date clock-date"></div>
      </div>`;
    const timeEl = host.querySelector('.bignum-time');
    const dateEl = host.querySelector('.bignum-date');
    const fmt = {
      hour: 'numeric',
      minute: '2-digit',
      hour12: settings.format === '12h'
    };
    if (settings.showSeconds) fmt.second = '2-digit';
    return (now) => {
      timeEl.textContent = now.toLocaleTimeString([], fmt);
      dateEl.textContent = now.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
    };
  }
});
