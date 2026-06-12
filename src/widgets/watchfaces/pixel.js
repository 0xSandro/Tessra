import { registerFace } from './registry.js';

// Pixel — chunky retro LED-style digital readout. Uses a monospace font with
// a tight box-shadow glow to evoke 80s segmented displays. Two color tones
// per digit (the lit foreground and a faint "off segment" ghost layer) hint
// at unused segments behind each visible character.

registerFace({
  id: 'pixel',
  label: 'Pixel',
  mount(host, settings) {
    host.innerHTML = `
      <div class="clock-face clock-pixel">
        <div class="pixel-ghost"></div>
        <div class="pixel-time"></div>
        <div class="pixel-date clock-date"></div>
      </div>`;
    const ghostEl = host.querySelector('.pixel-ghost');
    const timeEl  = host.querySelector('.pixel-time');
    const dateEl  = host.querySelector('.pixel-date');

    const fmt = {
      hour: '2-digit',
      minute: '2-digit',
      hour12: settings.format === '12h'
    };
    if (settings.showSeconds) fmt.second = '2-digit';

    // The ghost layer mirrors the shape of the readout but always renders
    // the "all segments lit" pattern (8 8 : 8 8). Sits behind the live time
    // at low opacity, giving that classic dim-when-off-segments LCD look.
    const ghostText = settings.showSeconds ? '88:88:88' : '88:88';
    ghostEl.textContent = ghostText;

    return (now) => {
      timeEl.textContent = now.toLocaleTimeString([], fmt);
      dateEl.textContent = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
    };
  }
});
