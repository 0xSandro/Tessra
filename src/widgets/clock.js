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
  icon: '◷',
  category: 'time',
  defaultSize: { w: 280, h: 140 },
  minSize:     { w: 160, h: 80  },
  defaultData: () => ({}),

  defaultSettings: () => ({
    watchface: 'digital',
    format: '24h',     // '24h' | '12h'
    showSeconds: true
  }),
  settingsSchema: [
    { key: 'watchface', type: 'select', label: 'Watchface',
      options: () => allFaces().map(f => ({ value: f.id, label: f.label }))
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
    // move smoothly), or when flip (chunky seconds matter). Otherwise we can
    // get away with 15s, which is plenty for minute-only displays and saves
    // a few hundred timer fires an hour.
    const fast = s.showSeconds || face.id === 'analog' || face.id === 'flip';
    const interval = setInterval(() => tick(new Date()), fast ? 1000 : 15000);
    ctx.onCleanup(() => clearInterval(interval));
  }
});
