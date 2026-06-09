import { register } from '../widget-registry.js';

// Single-shot countdown timer. State is wall-clock-based (epoch ms) so it
// keeps running across tab close/reopen.
//   running:       bool
//   startedAt:     epoch ms when the current run started (null when paused)
//   remainingMs:   ms left in this run (null = use the configured total)
//   finished:      true once the timer has hit 0; reset by clicking Start again

register({
  type: 'timer',
  title: 'Timer',
  icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2"/><path d="M5 3L2 6"/><path d="M19 3l3 3"/><path d="M10 2h4"/></svg>',
  category: 'time',
  defaultSize: { w: 280, h: 220 },
  minSize:     { w: 220, h: 180 },

  defaultData: () => ({
    running: false,
    startedAt: null,
    remainingMs: null,
    finished: false
  }),

  defaultSettings: () => ({
    minutes: 5,
    seconds: 0
  }),
  settingsSchema: [
    { key: 'minutes', type: 'slider', label: 'Minutes', min: 0, max: 60, step: 1, unit: 'min' },
    { key: 'seconds', type: 'slider', label: 'Seconds', min: 0, max: 59, step: 5, unit: 'sec' }
  ],

  render(body, ctx) {
    const { data, settings } = ctx;

    const totalMs = () => (settings.minutes * 60 + settings.seconds) * 1000;
    const currentMs = () => {
      if (data.running) {
        return Math.max(0, (data.remainingMs ?? totalMs()) - (Date.now() - data.startedAt));
      }
      return data.remainingMs ?? totalMs();
    };

    body.innerHTML = `
      <div class="timer">
        <div class="timer-display"></div>
        <div class="timer-progress"><div class="timer-progress-fill"></div></div>
        <div class="timer-controls">
          <button class="timer-toggle"></button>
          <button class="timer-reset" title="Reset">↺</button>
        </div>
      </div>`;

    const displayEl = body.querySelector('.timer-display');
    const fillEl    = body.querySelector('.timer-progress-fill');
    const toggleBt  = body.querySelector('.timer-toggle');
    const resetBt   = body.querySelector('.timer-reset');

    const fmt = ms => {
      const t = Math.ceil(ms / 1000);
      const h = Math.floor(t / 3600);
      const m = Math.floor((t % 3600) / 60);
      const s = t % 60;
      const pad = n => String(n).padStart(2, '0');
      return h > 0
        ? `${h}:${pad(m)}:${pad(s)}`
        : `${pad(m)}:${pad(s)}`;
    };

    function update() {
      const ms = currentMs();
      const total = totalMs();

      // Just hit zero?
      if (data.running && ms <= 0) {
        data.running = false;
        data.remainingMs = 0;
        data.startedAt = null;
        data.finished = true;
        ctx.save();
      }

      displayEl.textContent = fmt(ms);
      fillEl.style.width = total > 0 ? `${(1 - ms / total) * 100}%` : '0%';
      displayEl.classList.toggle('timer-finished', !!data.finished);
      toggleBt.textContent = data.running ? 'Pause' : (data.finished ? 'Restart' : 'Start');
      toggleBt.classList.toggle('is-running', !!data.running);
    }

    toggleBt.addEventListener('click', () => {
      if (data.running) {
        // Pause: snapshot remaining
        data.remainingMs = currentMs();
        data.running = false;
        data.startedAt = null;
      } else {
        // Start (or restart after finish)
        if (data.finished || !data.remainingMs || data.remainingMs <= 0) {
          data.remainingMs = totalMs();
          data.finished = false;
        }
        if (data.remainingMs <= 0) return; // duration is 0:00 — nothing to time
        data.startedAt = Date.now();
        data.running = true;
      }
      update();
      ctx.save();
    });

    resetBt.addEventListener('click', () => {
      data.running = false;
      data.startedAt = null;
      data.remainingMs = null;
      data.finished = false;
      update();
      ctx.save();
    });

    update();
    const interval = setInterval(update, 250);
    ctx.onCleanup(() => clearInterval(interval));
  }
});
