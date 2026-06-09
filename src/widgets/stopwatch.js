import { register } from '../widget-registry.js';

// Count-up stopwatch with optional lap recording. Persists across reloads.
//   running:    bool
//   startedAt:  epoch ms when current run started (null when paused)
//   elapsedMs:  accumulated time *before* current run (so elapsed = running ? now-startedAt+elapsedMs : elapsedMs)
//   laps:       array of { ms } captured by Lap button

register({
  type: 'stopwatch',
  title: 'Stopwatch',
  icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="14" r="7"/><path d="M12 11v3l2 2"/><path d="M9 2h6"/><path d="M12 2v4"/><path d="M20 5l-2 2"/></svg>',
  category: 'time',
  defaultSize: { w: 300, h: 260 },
  minSize:     { w: 220, h: 180 },

  defaultData: () => ({
    running: false,
    startedAt: null,
    elapsedMs: 0,
    laps: []
  }),

  defaultSettings: () => ({
    showMs: true
  }),
  settingsSchema: [
    { key: 'showMs', type: 'toggle', label: 'Show milliseconds' }
  ],

  render(body, ctx) {
    const { data, settings } = ctx;

    const currentMs = () => {
      if (!data.running) return data.elapsedMs || 0;
      return (data.elapsedMs || 0) + (Date.now() - data.startedAt);
    };

    const pad = (n, w = 2) => String(n).padStart(w, '0');
    const fmt = ms => {
      const totalCs = Math.floor(ms / 10);
      const cs = totalCs % 100;
      const s  = Math.floor(totalCs / 100) % 60;
      const m  = Math.floor(totalCs / 6000) % 60;
      const h  = Math.floor(totalCs / 360000);
      const main = h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
      return settings.showMs ? `${main}.${pad(cs)}` : main;
    };

    body.innerHTML = `
      <div class="stopwatch">
        <div class="stopwatch-display"></div>
        <div class="stopwatch-controls">
          <button class="stopwatch-toggle"></button>
          <button class="stopwatch-lap">Lap</button>
          <button class="stopwatch-reset" title="Reset">↺</button>
        </div>
        <ul class="stopwatch-laps"></ul>
      </div>`;

    const displayEl = body.querySelector('.stopwatch-display');
    const toggleBt  = body.querySelector('.stopwatch-toggle');
    const lapBt     = body.querySelector('.stopwatch-lap');
    const resetBt   = body.querySelector('.stopwatch-reset');
    const lapsEl    = body.querySelector('.stopwatch-laps');

    function updateDisplay() {
      displayEl.textContent = fmt(currentMs());
      toggleBt.textContent = data.running ? 'Pause' : (data.elapsedMs > 0 ? 'Resume' : 'Start');
      toggleBt.classList.toggle('is-running', !!data.running);
      lapBt.disabled = !data.running;
    }

    function renderLaps() {
      lapsEl.innerHTML = '';
      const items = data.laps.slice().reverse(); // newest first
      const lapsCount = data.laps.length;
      items.forEach((lap, revIdx) => {
        const idx = lapsCount - 1 - revIdx;
        const prevLap = idx > 0 ? data.laps[idx - 1].ms : 0;
        const lapDiff = lap.ms - prevLap;
        const li = document.createElement('li');
        li.innerHTML = `
          <span class="lap-num">Lap ${idx + 1}</span>
          <span class="lap-time">${fmt(lap.ms)}</span>
          <span class="lap-diff">+${fmt(lapDiff)}</span>`;
        lapsEl.appendChild(li);
      });
    }

    toggleBt.addEventListener('click', () => {
      if (data.running) {
        // Pause: roll current run into elapsedMs
        data.elapsedMs = (data.elapsedMs || 0) + (Date.now() - data.startedAt);
        data.running = false;
        data.startedAt = null;
      } else {
        // Start or resume
        data.startedAt = Date.now();
        data.running = true;
      }
      updateDisplay();
      ctx.save();
    });

    lapBt.addEventListener('click', () => {
      if (!data.running) return;
      data.laps.push({ ms: currentMs() });
      renderLaps();
      ctx.save();
    });

    resetBt.addEventListener('click', () => {
      data.running = false;
      data.startedAt = null;
      data.elapsedMs = 0;
      data.laps = [];
      updateDisplay();
      renderLaps();
      ctx.save();
    });

    updateDisplay();
    renderLaps();
    const interval = setInterval(updateDisplay, settings.showMs ? 50 : 250);
    ctx.onCleanup(() => clearInterval(interval));
  }
});
