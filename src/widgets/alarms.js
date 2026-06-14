import { register } from '../widget-registry.js';
import { escapeHtml } from '../utils.js';

// Multi-Alarm — N alarms with HH:MM trigger times. Fires a short beep + a
// visual flash when the local clock hits a saved time, then auto-disables
// the alarm (or rearms it for tomorrow if recurring). Beep is synthesized
// inline via WebAudio so no audio file is shipped.
//
// State per alarm:
//   { id, time: 'HH:MM', label, enabled, recurring, lastFiredDay }
// lastFiredDay tracks the date integer (YYYYMMDD) the alarm last triggered
// so we don't refire when the tab is open across the minute boundary.

function uid() { return Math.random().toString(36).slice(2, 9); }

function dayKey(d) {
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

function beep(durationMs = 600, freq = 880) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq;
    osc.type = 'sine';
    gain.gain.value = 0;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const t0 = ctx.currentTime;
    // Brief envelope: attack, sustain, release. Avoids click on start/stop.
    gain.gain.linearRampToValueAtTime(0.25, t0 + 0.02);
    gain.gain.setValueAtTime(0.25, t0 + durationMs / 1000 - 0.05);
    gain.gain.linearRampToValueAtTime(0, t0 + durationMs / 1000);
    osc.start(t0);
    osc.stop(t0 + durationMs / 1000 + 0.05);
    setTimeout(() => ctx.close(), durationMs + 200);
  } catch { /* audio unavailable — silent fail */ }
}

register({
  type: 'alarms',
  title: 'Alarms',
  icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 5l3-3"/><path d="M19 5l-3-3"/><circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2"/></svg>',
  category: 'time',
  defaultSize: { w: 280, h: 260 },
  minSize:     { w: 220, h: 180 },

  defaultData: () => ({ alarms: [] }),

  defaultSettings: () => ({
    soundEnabled: true
  }),
  settingsSchema: [
    { key: 'soundEnabled', type: 'toggle', label: 'Play sound when triggered' }
  ],

  render(body, ctx) {
    const { data, settings } = ctx;
    if (!Array.isArray(data.alarms)) data.alarms = [];

    body.innerHTML = `
      <div class="alarms">
        <div class="alarms-add">
          <input type="time" class="alarms-time" required/>
          <input type="text" class="alarms-label" placeholder="Label (optional)" maxlength="40"/>
          <button class="alarms-add-btn" title="Add alarm">+</button>
        </div>
        <ul class="alarms-list"></ul>
        <div class="alarms-flash" hidden></div>
      </div>`;

    const timeIn  = body.querySelector('.alarms-time');
    const labelIn = body.querySelector('.alarms-label');
    const addBt   = body.querySelector('.alarms-add-btn');
    const listEl  = body.querySelector('.alarms-list');
    const flashEl = body.querySelector('.alarms-flash');

    function renderList() {
      listEl.innerHTML = '';
      const sorted = data.alarms.slice().sort((a, b) => a.time.localeCompare(b.time));
      sorted.forEach(a => {
        const li = document.createElement('li');
        li.className = 'alarms-item' + (a.enabled ? '' : ' alarms-disabled');
        li.dataset.id = a.id;
        li.innerHTML = `
          <label class="alarms-toggle">
            <input type="checkbox" ${a.enabled ? 'checked' : ''}/>
          </label>
          <div class="alarms-info">
            <div class="alarms-time-label">${escapeHtml(a.time)}</div>
            ${a.label ? `<div class="alarms-name">${escapeHtml(a.label)}</div>` : ''}
          </div>
          <button class="alarms-recur ${a.recurring ? 'on' : ''}" title="${a.recurring ? 'Recurring (fires daily)' : 'One-shot (auto-disables after firing)'}">${a.recurring ? '↻' : '1×'}</button>
          <button class="alarms-del" title="Remove">×</button>`;
        li.querySelector('input').addEventListener('change', e => {
          a.enabled = e.target.checked;
          // Manually re-enabling resets the fire history so it can fire today
          if (a.enabled) a.lastFiredDay = null;
          li.classList.toggle('alarms-disabled', !a.enabled);
          ctx.save();
        });
        li.querySelector('.alarms-recur').addEventListener('click', () => {
          a.recurring = !a.recurring;
          ctx.save();
          renderList();
        });
        li.querySelector('.alarms-del').addEventListener('click', () => {
          const i = data.alarms.findIndex(x => x.id === a.id);
          if (i >= 0) data.alarms.splice(i, 1);
          ctx.save();
          renderList();
        });
        listEl.appendChild(li);
      });
      if (!sorted.length) {
        const empty = document.createElement('li');
        empty.className = 'alarms-empty';
        empty.textContent = 'No alarms yet.';
        listEl.appendChild(empty);
      }
    }

    function addAlarm() {
      const t = (timeIn.value || '').trim();
      if (!/^\d{2}:\d{2}$/.test(t)) return;
      data.alarms.push({
        id: uid(),
        time: t,
        label: labelIn.value.trim(),
        enabled: true,
        recurring: false,
        lastFiredDay: null
      });
      timeIn.value = '';
      labelIn.value = '';
      ctx.save();
      renderList();
    }

    addBt.addEventListener('click', addAlarm);
    labelIn.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); addAlarm(); }
    });

    function fire(alarm) {
      if (settings.soundEnabled) beep();
      // OS-level notification when the tab isn't focused. main.js exposes
      // a helper that auto-requests permission on first use and silently
      // falls back to in-page flash if denied or unsupported.
      if (typeof window.notifyIfBackground === 'function') {
        window.notifyIfBackground(
          alarm.label ? `⏰ ${alarm.label}` : '⏰ Alarm',
          `Tessra alarm fired at ${alarm.time}`
        );
      }
      // Visual: flash overlay 1.2s
      flashEl.hidden = false;
      flashEl.textContent = alarm.label ? `⏰ ${alarm.label}` : '⏰ Alarm';
      flashEl.classList.add('alarms-flash-on');
      clearTimeout(fire._t);
      fire._t = setTimeout(() => {
        flashEl.classList.remove('alarms-flash-on');
        setTimeout(() => { flashEl.hidden = true; }, 200);
      }, 1800);
    }

    function check() {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      const todayKey = dayKey(now);
      const cur = `${hh}:${mm}`;
      let dirty = false;
      data.alarms.forEach(a => {
        if (!a.enabled) return;
        if (a.time !== cur) return;
        // Don't refire if we already fired this alarm today
        if (a.lastFiredDay === todayKey) return;
        a.lastFiredDay = todayKey;
        fire(a);
        if (!a.recurring) {
          a.enabled = false;
        }
        dirty = true;
      });
      if (dirty) {
        ctx.save();
        renderList();
      }
    }

    renderList();
    check();
    // Tick every 5s — alarms snap to HH:MM, so sub-minute precision isn't
    // needed and the cheaper interval is friendlier to a busy tab.
    const interval = setInterval(check, 5000);
    ctx.onCleanup(() => clearInterval(interval));
  }
});
