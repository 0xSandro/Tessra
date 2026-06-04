import { register } from '../widget-registry.js';

register({
  type: 'clock',
  title: 'Clock',
  icon: '◷',
  category: 'time',
  defaultSize: { w: 280, h: 140 },
  defaultData: () => ({}),
  render(body, ctx) {
    body.innerHTML = '<div class="clock-time"></div><div class="clock-date"></div>';
    const timeEl = body.querySelector('.clock-time');
    const dateEl = body.querySelector('.clock-date');
    const tick = () => {
      const now = new Date();
      timeEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      dateEl.textContent = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
    };
    tick();
    const interval = setInterval(tick, 15000);
    ctx.onCleanup(() => clearInterval(interval));
  }
});
