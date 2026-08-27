import { register } from '../widget-registry.js';
import { getFace, allFaces } from './watchfaces/registry.js';
import './watchfaces/index.js';  // triggers face registration as a side effect

// The Clock widget is a thin shell. Each watchface owns its DOM and update
// logic; the shell just picks which face to mount, runs a 1-second timer,
// and exposes shared settings (watchface, 12/24-hour, show seconds).
//
// Adding a new face later: create a file in widgets/watchfaces/, register it,
// import it from widgets/watchfaces/index.js. The dropdown picks it up
// automatically via allFaces().

register({
  type: 'clock',
  title: 'Clock',
  icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg>',
  category: 'time',
  defaultSize: { w: 280, h: 140 },
  // Shared across every watchface (registry has no per-face minSize hook).
  // Must fit the widest face's worst case: Flip Clock with seconds shown
  // (H:M:S digit groups + AM/PM + date row) — measured to need ~336x100px
  // before it starts clipping horizontally/vertically.
  minSize:     { w: 340, h: 110 },
  defaultData: () => ({}),

  defaultSettings: () => ({
    watchface: 'digital',
    format: '24h',     // '24h' | '12h'
    showSeconds: true
  }),
  settingsSchema: [
    // Watchface gallery — a horizontally-scrollable strip of mini previews.
    // Each card mounts the actual watchface into a small preview stage with
    // the current time, so you can see the visual style before picking it.
    // Click a card to select. The active card gets an accent ring.
    {
      key: 'watchface',
      type: 'panel',
      label: 'Watchface',
      render(host, current, set, settings) {
        host.innerHTML = '<div class="wf-gallery"></div>';
        const gallery = host.querySelector('.wf-gallery');
        const now = new Date();
        allFaces().forEach(face => {
          const card = document.createElement('button');
          card.type = 'button';
          card.className = 'wf-card' + (face.id === current ? ' wf-active' : '');
          card.title = face.label;
          card.innerHTML = `
            <div class="wf-preview" data-face="${face.id}"></div>
            <div class="wf-label">${face.label}</div>`;
          const preview = card.querySelector('.wf-preview');
          // Mini preview gets a frozen snapshot — no live tick. Cheaper and
          // avoids having to clean up intervals when the popover closes.
          // Force showSeconds on the preview so faces that gate seconds
          // (analog, flip, binary) still show their second hand/digits.
          const previewSettings = Object.assign({}, settings, { showSeconds: true });
          try {
            const tick = face.mount(preview, previewSettings);
            tick(now);
          } catch (err) {
            preview.textContent = face.label;
          }
          card.addEventListener('click', () => {
            gallery.querySelectorAll('.wf-card').forEach(c => c.classList.remove('wf-active'));
            card.classList.add('wf-active');
            set(face.id);
          });
          gallery.appendChild(card);
        });
      }
    },
    { key: 'format', type: 'select', label: 'Format', options: [
      { value: '24h', label: '24-hour' },
      { value: '12h', label: '12-hour' }
    ]},
    { key: 'showSeconds', type: 'toggle', label: 'Show seconds' }
  ],

  render(body, ctx) {
    const s = ctx.settings;
    const face = getFace(s.watchface) || getFace('digital') || allFaces()[0];
    if (!face) {
      body.innerHTML = '<div class="clock-face"><div class="clock-date">No watchface available</div></div>';
      return;
    }

    const tick = face.mount(body, s);
    tick(new Date());

    // Tick every second when seconds are visible, when analog (so the hands
    // move smoothly), when flip (chunky seconds matter), or when binary
    // (BCD dots animate by second). Otherwise we can get away with 15s,
    // which is plenty for minute-only displays and saves a few hundred
    // timer fires an hour.
    // Faces that need per-second updates regardless of the showSeconds
    // toggle: analog (smooth hands), flip (chunky digit feel), binary (BCD
    // dots), sectors (smooth ring sweep), bars (continuous progress).
    const ALWAYS_FAST = new Set(['analog', 'flip', 'binary', 'sectors', 'bars']);
    const fast = s.showSeconds || ALWAYS_FAST.has(face.id);
    const interval = setInterval(() => tick(new Date()), fast ? 1000 : 15000);
    ctx.onCleanup(() => clearInterval(interval));
  }
});
