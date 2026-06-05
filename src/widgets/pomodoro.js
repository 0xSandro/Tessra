import { register } from '../widget-registry.js';

// State model (data):
//   mode:              'work' | 'break'
//   running:           bool
//   phaseStartedAt:    epoch ms when current phase started running (null when paused)
//   remainingOnPause:  ms remaining in current phase when paused (null when running)
//   cycle:             how many work sessions completed
//
// This means the timer continues correctly across tab close/reopen — when running,
// the remaining time is derived from `now - phaseStartedAt`.

register({
  type: 'pomodoro',
  title: 'Pomodoro',
  icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5"/><path d="M10 2h4M12 2v3"/></svg>',
  category: 'time',
  defaultSize: { w: 280, h: 220 },
  minSize:     { w: 220, h: 180 },

  defaultData: () => ({
    mode: 'work',
    running: false,
    phaseStartedAt: null,
    remainingOnPause: null,
    cycle: 0
  }),

  defaultSettings: () => ({
    workMinutes: 25,
    breakMinutes: 5,
    autoStart: false
  }),
  settingsSchema: [
    { key: 'workMinutes',  type: 'slider', label: 'Work',  min: 1, max: 60, step: 1, unit: 'min' },
    { key: 'breakMinutes', type: 'slider', label: 'Break', min: 1, max: 30, step: 1, unit: 'min' },
    { key: 'autoStart',    type: 'toggle', label: 'Auto-start next phase' }
  ],

  render(body, ctx) {
    const { data, settings } = ctx;

    const totalMs = () =>
      (data.mode === 'work' ? settings.workMinutes : settings.breakMinutes) * 60000;

    const remainingMs = () => {
      if (!data.running) return data.remainingOnPause ?? totalMs();
      return Math.max(0, totalMs() - (Date.now() - data.phaseStartedAt));
    };

    body.innerHTML = `
      <div class="pomo">
        <div class="pomo-mode"></div>
        <div class="pomo-time"></div>
        <div class="pomo-progress"><div class="pomo-progress-fill"></div></div>
        <div class="pomo-controls">
          <button class="pomo-toggle"></button>
          <button class="pomo-reset" title="Reset">↺</button>
        </div>
        <div class="pomo-cycle"></div>
      </div>`;

    const modeEl   = body.querySelector('.pomo-mode');
    const timeEl   = body.querySelector('.pomo-time');
    const fillEl   = body.querySelector('.pomo-progress-fill');
    const toggleBt = body.querySelector('.pomo-toggle');
    const resetBt  = body.querySelector('.pomo-reset');
    const cycleEl  = body.querySelector('.pomo-cycle');

    const fmt = ms => {
      const t = Math.ceil(ms / 1000);
      const m = Math.floor(t / 60);
      const s = t % 60;
      return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    };

    function update() {
      // Clamp stored pause-remaining if settings were shortened below it
      if (!data.running && data.remainingOnPause !== null && data.remainingOnPause > totalMs()) {
        data.remainingOnPause = totalMs();
      }

      const ms = remainingMs();
      const total = totalMs();
      modeEl.textContent = data.mode === 'work' ? 'Work' : 'Break';
      modeEl.className = 'pomo-mode pomo-' + data.mode;
      timeEl.textContent = fmt(ms);
      fillEl.style.width = (total ? ((total - ms) / total) * 100 : 0) + '%';
      toggleBt.textContent = data.running ? 'Pause' : 'Start';
      toggleBt.className = 'pomo-toggle ' + (data.running ? 'is-running' : '');
      cycleEl.textContent = data.cycle ? `${data.cycle} completed` : '';

      // Phase complete → advance
      if (data.running && ms <= 0) {
        data.mode = data.mode === 'work' ? 'break' : 'work';
        if (data.mode === 'work') data.cycle = (data.cycle || 0) + 1;
        if (settings.autoStart) {
          data.phaseStartedAt = Date.now();
          data.remainingOnPause = null;
        } else {
          data.running = false;
          data.remainingOnPause = totalMs();
          data.phaseStartedAt = null;
        }
        ctx.save();
        update(); // refresh display immediately for new phase
      }
    }

    toggleBt.addEventListener('click', () => {
      if (data.running) {
        // Pause: snapshot remaining
        data.remainingOnPause = remainingMs();
        data.running = false;
        data.phaseStartedAt = null;
      } else {
        // Start / resume: backdate phaseStartedAt so remaining matches what we had
        const remaining = data.remainingOnPause ?? totalMs();
        data.phaseStartedAt = Date.now() - (totalMs() - remaining);
        data.running = true;
        data.remainingOnPause = null;
      }
      update();
      ctx.save();
    });

    resetBt.addEventListener('click', () => {
      data.mode = 'work';
      data.running = false;
      data.phaseStartedAt = null;
      data.remainingOnPause = null;
      data.cycle = 0;
      update();
      ctx.save();
    });

    update();
    const interval = setInterval(update, 1000);
    ctx.onCleanup(() => clearInterval(interval));
  }
});
