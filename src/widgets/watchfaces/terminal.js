import { registerFace } from './registry.js';

// Terminal — fake CLI prompt with the time printed as a command output.
// Blinks a cursor on the last prompt line. Monospace font, green-on-dark
// classic terminal palette via CSS variables.

registerFace({
  id: 'terminal',
  label: 'Terminal',
  mount(host, settings) {
    host.innerHTML = `
      <div class="clock-face clock-terminal">
        <div class="term-line"><span class="term-prompt">~ $</span> <span class="term-cmd">date</span></div>
        <div class="term-out"></div>
        <div class="term-line"><span class="term-prompt">~ $</span> <span class="term-cursor">█</span></div>
      </div>`;
    const outEl = host.querySelector('.term-out');
    const fmt = {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
      hour12: settings.format === '12h'
    };
    if (settings.showSeconds) fmt.second = '2-digit';
    return (now) => {
      outEl.textContent = now.toLocaleString([], fmt);
    };
  }
});
