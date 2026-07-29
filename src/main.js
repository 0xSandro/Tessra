// Tessra — Custom Starting Page
// Entry point. Owns: state, persistence, board, edit mode, drag-to-place,
// theme, color picker. Widget rendering is delegated to the registry.
//
// Add new widgets: drop a file into ./widgets/ and import it from
// ./widgets/index.js — no edits to this file required.

import './widgets/index.js';         // side effect: registers all widgets
import * as registry from './widget-registry.js';
import { escapeHtml } from './utils.js';

// ----- Constants -----
const GRID = 20;
const STORAGE_KEY = 'tessra.state.v1';
const LEGACY_KEY  = 'widgetNewTab.state.v1';

// ----- Storage shim (browser.storage.local with localStorage fallback) -----
const store = (() => {
  const api = (typeof browser !== 'undefined' && browser.storage)
    ? browser.storage.local
    : (typeof chrome !== 'undefined' && chrome.storage ? chrome.storage.local : null);
  return {
    async get(key) {
      if (api) { const o = await api.get(key); return o[key] || null; }
      try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
    },
    async set(key, data) {
      if (api) return api.set({ [key]: data });
      localStorage.setItem(key, JSON.stringify(data));
    }
  };
})();

// ----- Defaults -----
const defaultTheme = () => ({
  bgType: 'dots',
  bgColor: '#fafafa',
  bgImage: null,
  bgImageName: null,
  bgImageWidth: null,
  bgImageHeight: null,
  widgetBg: '#ffffff',
  widgetBorder: '#e5e5e5',
  widgetBorderWidth: 1,
  widgetRadius: 10,
  widgetShadow: 40,
  showHeaders: true,
  trafficLights: false,   // macOS-style colored dots; only effective when showHeaders is true
  accent: '#2563eb',      // global accent (buttons, toggles, focus rings, sliders)
  panelSide: 'right',     // 'right' | 'left'
  darkMode: false,        // dark UI variant
  surfaceStyle: 'liquid', // 'flat' | 'glass' | 'liquid'
  glassBlur: 9,           // backdrop-filter blur in px (only used when glass/liquid)
  glassAlpha: 30,         // background opacity 10-90 (translated to 0.10-0.90 in CSS)
  fontFamily: 'system',   // 'system' | 'inter' | 'geist' | 'jetbrains' | 'serif' | 'mono' | 'custom'
  customFontDataUrl: null,// data: URL for an uploaded font file
  customFontName: null,   // user-visible name of the uploaded font
  zoom: 100                // interface scale %, applied like browser zoom — helps small/high-PPI screens
});

function id() { return Math.random().toString(36).slice(2, 9); }
function snap(v) { return Math.round(v / GRID) * GRID; }

// The whole page is scaled via CSS `zoom` (see applyTheme) so the Zoom
// setting behaves like the browser's own Ctrl +/-. That property scales
// rendering AND layout for everything under <html>, but raw mouse-event
// coordinates (clientX/clientY), window.innerWidth/innerHeight, and
// getBoundingClientRect() all keep reporting true physical pixels — only
// state.widgets' stored x/y/w/h (and anything derived from them, like
// node.style.left) live in "logical" pre-zoom pixels. Any code that turns a
// physical measurement into a logical one (or vice versa) must go through
// this factor, or the board will drift out from under the cursor at any
// zoom level other than 100%.
function zoomFactor() { return ((state && state.theme && state.theme.zoom) || 100) / 100; }

function makeWidget(type, opts = {}) {
  const def = registry.get(type);
  if (!def) throw new Error(`Unknown widget type: ${type}`);
  return {
    id: opts.id || id(),
    type,
    x: opts.x ?? 40,
    y: opts.y ?? 80,
    w: opts.w ?? def.defaultSize.w,
    h: opts.h ?? def.defaultSize.h,
    z: opts.z ?? 1,
    title:    opts.title,                                                 // optional user-rename
    data:     opts.data     ?? def.defaultData(),
    settings: opts.settings ?? (def.defaultSettings ? def.defaultSettings() : {})
  };
}

// Pick the next "Base N" title for a widget type that opts into autoNumber.
// Scans existing widgets of this type, finds the highest trailing number,
// and returns Base (max+1). Treats a bare "Base" as N=1.
function nextAutoTitle(type) {
  const def = registry.get(type);
  if (!def) return undefined;
  const base = def.title;
  let maxN = 0;
  state.widgets.forEach(w => {
    if (w.type !== type) return;
    const t = w.title || def.title;
    if (t === base) { maxN = Math.max(maxN, 1); return; }
    if (t.startsWith(base + ' ')) {
      const n = parseInt(t.slice(base.length + 1), 10);
      if (!isNaN(n)) maxN = Math.max(maxN, n);
    }
  });
  return `${base} ${maxN + 1}`;
}

function defaultState() {
  const widgets = [
    makeWidget('clock',     { x: 40,  y: 80,  z: 1 }),
    makeWidget('search',    { x: 340, y: 80,  z: 2 }),
    makeWidget('shortcuts', { x: 40,  y: 240, z: 3, data: { items: [
      { label: 'GitHub',      url: 'https://github.com' },
      { label: 'Hacker News', url: 'https://news.ycombinator.com' },
      { label: 'YouTube',     url: 'https://youtube.com' }
    ]}}),
    makeWidget('todo',  { x: 520, y: 180, z: 4 }),
    makeWidget('notes', { x: 860, y: 180, z: 5, title: 'Notes 1' })
  ];
  return { maxZ: widgets.length, widgets, theme: defaultTheme(), favorites: [], quickSpawn: ['stickies'], onboardingComplete: false, integrations: { notion: { token: '' } } };
}

// Schema for the Integrations side-panel pane. Each provider has a name + one
// or more credentials shared across every widget under that subcategory in
// the catalog. Adding a new provider here is enough to surface a fresh card
// in the Integrations tab — no extra DOM wiring required.
const INTEGRATIONS = {
  notion: {
    name: 'Notion',
    icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/><polyline points="14 8 14 16 18 16"/></svg>',
    fields: [
      { key: 'token', label: 'Integration token', placeholder: 'secret_…', type: 'password' }
    ],
    setupHint: 'Create an internal integration at <a href="https://www.notion.so/my-integrations" target="_blank" rel="noopener">notion.so/my-integrations</a>, then share pages with it in Notion. This token is used by every Notion widget.'
  }
};

// ----- Migration -----
function migrate(s) {
  if (!s) return s;
  // A hand-edited or corrupted storage blob (or one missing `widgets`
  // entirely) would otherwise reach init()'s `state.widgets.forEach(...)`
  // and crash the whole new-tab page with nothing to recover from.
  if (!Array.isArray(s.widgets)) { s.widgets = []; return s; }
  const out = [];
  for (const w of s.widgets) {
    // Legacy v0.x: combined notes widget that held both notes text and todos.
    if (w.type === 'notes' && w.data && (w.data.mode || w.data.todos)) {
      out.push({ id: id(), type: 'notes', x: w.x, y: w.y, w: w.w, h: w.h,
                 data: { notes: w.data.notes || '' } });
      if (Array.isArray(w.data.todos) && w.data.todos.length) {
        out.push({ id: id(), type: 'todo', x: w.x + 40, y: w.y + 40, w: w.w, h: w.h,
                   data: { todos: w.data.todos } });
      }
    } else {
      // Backfill missing data with the widget's default shape
      if (!w.data) {
        const def = registry.get(w.type);
        if (def) w.data = def.defaultData();
      }
      out.push(w);
    }
  }
  // ---- Shape migrations for renamed/restructured widgets ----
  // Notes is now a single editable textarea — { content: 'string' }.
  // Several legacy shapes (tabbed notes, old single-string notes, standalone
  // Tabs widget, standalone Collapsible widget) all flatten into { content }
  // so users coming from any prior version keep their text.
  const flattenTabs = tabs => {
    if (!Array.isArray(tabs) || !tabs.length) return '';
    const filled = tabs.filter(t => (t?.content || '').trim().length);
    if (filled.length <= 1) return filled[0]?.content || tabs[0]?.content || '';
    return filled
      .map(t => `== ${t.title || 'Untitled'} ==\n${t.content || ''}`)
      .join('\n\n');
  };
  out.forEach(w => {
    // Old tabbed notes payload → { content }
    if (w.type === 'notes' && w.data && Array.isArray(w.data.tabs)) {
      w.data = { content: flattenTabs(w.data.tabs) };
    }
    // Older single-string notes payload → { content }
    if (w.type === 'notes' && w.data && typeof w.data.notes === 'string' && typeof w.data.content !== 'string') {
      w.data = { content: w.data.notes };
    }
    // Old standalone Tabs widget — flatten tabs and retype as notes
    if (w.type === 'tabs' && w.data && Array.isArray(w.data.tabs)) {
      w.type = 'notes';
      w.data = { content: flattenTabs(w.data.tabs) };
    }
    // Old Collapsible widget — flatten sections and retype as notes
    if (w.type === 'sections' && w.data && Array.isArray(w.data.sections)) {
      const tabs = w.data.sections.map(sec => ({
        title: sec.title || 'Section',
        content: sec.content || ''
      }));
      w.type = 'notes';
      w.data = { content: flattenTabs(tabs) };
    }
  });

  // Defensively drop unknown widget types (e.g. uninstalled extensions in future)
  s.widgets = out.filter(w => registry.has(w.type));
  // Backfill settings on every widget; merge over defaults so new schema keys
  // get default values while user-set values are preserved.
  s.widgets.forEach(w => {
    const def = registry.get(w.type);
    if (def && def.defaultSettings) {
      w.settings = Object.assign(def.defaultSettings(), w.settings || {});
    } else if (!w.settings) {
      w.settings = {};
    }
    // Coerce locked flag — legacy payloads never set it
    w.locked = !!w.locked;
  });
  s.theme = Object.assign(defaultTheme(), s.theme || {});
  // Integrations: shared credentials per provider, used by every widget under
  // a given subcategory. Backfill the structure for users coming from a build
  // that pre-dated the integrations panel.
  s.integrations = s.integrations || {};
  if (!s.integrations.notion || typeof s.integrations.notion !== 'object') {
    s.integrations.notion = { token: '' };
  }
  // Sweep legacy per-widget Notion tokens up into the shared state. Older
  // builds stored a separate token on each Notion widget's settings; the
  // first one we find seeds the shared slot if it's still empty.
  if (!s.integrations.notion.token) {
    const legacy = s.widgets.find(w =>
      (w.type === 'notion-db' || w.type === 'notion-today' || w.type === 'notion-recent')
      && w.settings && w.settings.token
    );
    if (legacy) s.integrations.notion.token = legacy.settings.token;
  }
  // Strip the now-unused per-widget token so it doesn't sit in storage.
  s.widgets.forEach(w => {
    if (w.settings && (w.type === 'notion-db' || w.type === 'notion-today' || w.type === 'notion-recent')) {
      delete w.settings.token;
    }
  });
  // Favorites is a list of widget type IDs the user pinned to the top of
  // the catalog. Filter out any types no longer in the registry so a removed
  // widget doesn't leave a ghost in the favorites section.
  s.favorites = Array.isArray(s.favorites)
    ? s.favorites.filter(t => registry.has(t))
    : [];
  // Quick-access spawn list — types pinned to the round buttons under the
  // Edit toggle. Default seed includes Sticky Note so the first thing the
  // user sees after install has something useful in it. Unknown types are
  // filtered out so removing a widget from the registry doesn't break the
  // toolbar.
  s.quickSpawn = Array.isArray(s.quickSpawn)
    ? s.quickSpawn.filter(t => registry.has(t))
    : (registry.has('stickies') ? ['stickies'] : []);
  // Existing users (any saved state already present) have implicitly seen the
  // app — don't surprise them with a tour. Only fresh installs (defaultState
  // returning false) get to see it.
  if (s.onboardingComplete === undefined) s.onboardingComplete = true;
  // Normalize z-order on load: renumber widgets 1..N by their existing z
  // (preserves stacking order). Keeps maxZ small so it can never out-stack
  // chrome layers like the side panel or settings popover.
  s.maxZ = s.maxZ || 0;
  s.widgets.forEach(w => { if (!w.z) w.z = ++s.maxZ; });
  const sortedByZ = s.widgets.slice().sort((a, b) => (a.z || 0) - (b.z || 0));
  sortedByZ.forEach((w, i) => { w.z = i + 1; });
  s.maxZ = sortedByZ.length;
  return s;
}

// ----- State + save -----
let state = null;

function bringToFront(w, node) {
  state.maxZ = (state.maxZ || 0) + 1;
  w.z = state.maxZ;
  if (node) node.style.zIndex = w.z;
}

// Send a widget to the back. Renumbers all widget z-orders so the target
// gets z = 1 and everyone else holds their relative stacking order. Keeps
// maxZ tight so it can never collide with the chrome z-indexes (10000+).
function sendToBack(w) {
  const sorted = state.widgets.slice().sort((a, b) => (a.z || 0) - (b.z || 0));
  // Pull this widget out, then place it at the bottom of the stack
  const rest = sorted.filter(x => x.id !== w.id);
  let z = 1;
  w.z = z++;
  rest.forEach(o => { o.z = z++; });
  state.maxZ = z - 1;
  document.querySelectorAll('#board .widget').forEach(n => {
    const widget = state.widgets.find(x => x.id === n.dataset.id);
    if (widget) n.style.zIndex = widget.z;
  });
}

// Background-aware OS notification. No-ops when the tab is focused (the
// in-page flash is enough) or when the user has denied permission. On the
// first call we lazily request permission; subsequent calls just fire.
async function notifyIfBackground(title, body) {
  if (!('Notification' in window)) return;
  if (!document.hidden) return; // tab focused — UI is visible
  try {
    if (Notification.permission === 'default') {
      await Notification.requestPermission();
    }
    if (Notification.permission !== 'granted') return;
    new Notification(title, { body, icon: 'icons/icon-96.svg', silent: false });
  } catch { /* notification API can throw on some browsers — silent fail */ }
}
// Expose globally so widgets can fire notifications without import gymnastics
window.notifyIfBackground = notifyIfBackground;

// Shared integrations getter — widgets read their provider credentials here
// instead of carrying per-widget tokens. Returns '' for any unknown provider
// so widgets can blindly call this without null-checking.
window.tessraIntegration = function (provider, field) {
  if (!state || !state.integrations) return '';
  const p = state.integrations[provider];
  if (!p) return '';
  return (typeof field === 'string') ? (p[field] || '') : p;
};

// Auto-arrange. Sort widgets by their current visual order (top-then-left so
// the rearrangement matches what the user roughly sees), then bin-pack into
// rows from left to right, wrapping when the next widget would overflow the
// usable viewport. Each widget keeps its own w/h — only x/y change.
function autoArrange() {
  if (!state.widgets.length) return;
  const PAD     = 40;
  const GUTTER  = 20;
  const TOP     = 80;
  // Leave room on the right for the (open) side panel; otherwise use the
  // full viewport. The button lives in the panel so it's likely open.
  const panelOpen = document.body.classList.contains('edit-mode');
  const usableW = (window.innerWidth / zoomFactor() - (panelOpen ? 340 : 0)) - PAD;

  const ordered = state.widgets.slice().sort((a, b) => {
    // Treat positions within 30 px of each other as "same row"
    if (Math.abs((a.y || 0) - (b.y || 0)) > 30) return (a.y || 0) - (b.y || 0);
    return (a.x || 0) - (b.x || 0);
  });

  let cx = PAD, cy = TOP, rowH = 0;
  ordered.forEach(w => {
    if (cx + w.w > usableW && cx > PAD) {
      // wrap to next row
      cx = PAD;
      cy += rowH + GUTTER;
      rowH = 0;
    }
    w.x = cx;
    w.y = cy;
    cx += w.w + GUTTER;
    if (w.h > rowH) rowH = w.h;
  });

  // Reflect the new positions in the DOM
  state.widgets.forEach(w => {
    const n = document.querySelector(`#board .widget[data-id="${w.id}"]`);
    if (n) {
      n.style.left = w.x + 'px';
      n.style.top  = w.y + 'px';
    }
  });
  scheduleSave();
}

// Reference-counted "user is currently dragging/resizing something" flag.
// Glass/liquid mode pays a large per-frame cost for backdrop-filter blur;
// while the user is interacting we strip those filters via CSS and add a
// `will-change: transform` hint so Firefox composites moved widgets on
// their own GPU layer. Count instead of boolean so overlapping interactions
// (rare, but catalog-drag + something else) don't clear the flag early.
let interactCount = 0;
function setInteracting(on) {
  if (on) {
    if (interactCount++ === 0) document.body.classList.add('is-interacting');
  } else {
    if (--interactCount <= 0) {
      interactCount = 0;
      document.body.classList.remove('is-interacting');
    }
  }
}

// ----- Multi-select state -----
// In-memory only — selection doesn't persist across reloads. A page-marquee
// drag that ends with a non-trivial rectangle commits the selection; a click
// on empty page (zero-area marquee) clears it. Dragging a selected widget
// moves the whole group; the Delete key removes them all.
let selectedIds = new Set();

function setSelection(ids) {
  selectedIds = new Set(ids);
  document.querySelectorAll('.widget').forEach(node => {
    node.classList.toggle('selected', selectedIds.has(node.dataset.id));
  });
}
function clearSelection() { setSelection([]); }

// ----- Snap-guide helpers -----
// Figma/Keynote-style alignment guides. While a widget is dragged we test
// its edges (left/right/centerX/top/bottom/centerY) against every other
// widget's edges and the viewport midlines. When the closest candidate per
// axis is within SNAP px, we snap to it and draw a pink dashed line spanning
// from the dragged widget to the matched reference, so the user can SEE the
// alignment, not just feel it.
const SNAP_PX = 6;
const snapGuidesEl = () => document.getElementById('snap-guides');

function clearSnapGuides() {
  const el = snapGuidesEl();
  if (el) el.innerHTML = '';
}

function renderSnapGuides(g) {
  const el = snapGuidesEl();
  if (!el) return;
  let html = '';
  if (g.x != null) {
    html += `<line x1="${g.x.at}" y1="${g.x.y0}" x2="${g.x.at}" y2="${g.x.y1}" class="snap-line"/>`;
  }
  if (g.y != null) {
    html += `<line x1="${g.y.x0}" y1="${g.y.at}" x2="${g.y.x1}" y2="${g.y.at}" class="snap-line"/>`;
  }
  el.innerHTML = html;
}

// Given a tentative dragged rect (page coords), the list of "other" widget
// rects, and viewport dims — compute the best X and Y snap candidates within
// SNAP_PX. Returns deltas to add to the dragged rect's left/top, plus the
// guide-line endpoints to draw.
function computeSnap(d, others, vw, vh) {
  // d: { left, top, right, bottom, w, h, cx, cy }
  // Candidates: each is { axis, delta, at, span0, span1 }
  let bestX = null, bestY = null;

  const considerX = (target, dragEdge, oTop, oBot) => {
    const delta = target - dragEdge;
    if (Math.abs(delta) > SNAP_PX) return;
    const y0 = Math.min(d.top + delta, oTop);
    const y1 = Math.max(d.bottom + delta, oBot);
    if (!bestX || Math.abs(delta) < Math.abs(bestX.delta)) {
      bestX = { delta, at: target, y0, y1 };
    }
  };
  const considerY = (target, dragEdge, oLeft, oRight) => {
    const delta = target - dragEdge;
    if (Math.abs(delta) > SNAP_PX) return;
    const x0 = Math.min(d.left + delta, oLeft);
    const x1 = Math.max(d.right + delta, oRight);
    if (!bestY || Math.abs(delta) < Math.abs(bestY.delta)) {
      bestY = { delta, at: target, x0, x1 };
    }
  };

  // Other widgets — each contributes left/right/centerX targets (X) and
  // top/bottom/centerY targets (Y). Each gets matched against the dragged
  // widget's three corresponding edges.
  for (const o of others) {
    const ocx = (o.left + o.right) / 2;
    const ocy = (o.top + o.bottom) / 2;
    [o.left, o.right, ocx].forEach(target => {
      considerX(target, d.left,  o.top, o.bottom);
      considerX(target, d.right, o.top, o.bottom);
      considerX(target, d.cx,    o.top, o.bottom);
    });
    [o.top, o.bottom, ocy].forEach(target => {
      considerY(target, d.top,    o.left, o.right);
      considerY(target, d.bottom, o.left, o.right);
      considerY(target, d.cy,     o.left, o.right);
    });
  }

  // Viewport midlines — draw a full-screen guide
  considerX(vw / 2, d.cx, 0, vh);
  considerY(vh / 2, d.cy, 0, vw);

  return { bestX, bestY };
}

// Build an AABB rect record for a widget (page coords).
function rectFor(w) {
  return {
    left: w.x, top: w.y,
    right: w.x + w.w, bottom: w.y + w.h,
    w: w.w, h: w.h,
    cx: w.x + w.w / 2, cy: w.y + w.h / 2
  };
}

// JSON-safe snapshot. Strips runtime fields (DOM refs, cleanup arrays, etc.)
function serialize() {
  return {
    maxZ: state.maxZ || 0,
    widgets: state.widgets.map(w => ({
      id: w.id, type: w.type,
      x: w.x, y: w.y, w: w.w, h: w.h,
      z: w.z || 0,
      title: w.title || undefined,
      locked: w.locked ? true : undefined,
      data:     w.data     ? JSON.parse(JSON.stringify(w.data))     : undefined,
      settings: w.settings ? JSON.parse(JSON.stringify(w.settings)) : undefined
    })),
    theme: state.theme ? JSON.parse(JSON.stringify(state.theme)) : null,
    favorites:  Array.isArray(state.favorites)  ? state.favorites.slice()  : [],
    quickSpawn: Array.isArray(state.quickSpawn) ? state.quickSpawn.slice() : [],
    onboardingComplete: state.onboardingComplete !== false  // default true if not explicitly false

  };
}

let saveTimer = null;
function saveNow() {
  clearTimeout(saveTimer);
  saveTimer = null;
  try {
    const snapshot = serialize();
    return store.set(STORAGE_KEY, snapshot).catch(err => console.error('[Tessra] save failed:', err));
  } catch (err) {
    console.error('[Tessra] serialize failed:', err);
  }
}
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 200);
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveNow(); });
window.addEventListener('beforeunload', () => { saveNow(); });
window.addEventListener('pagehide', () => { saveNow(); });

// ----- DOM refs -----
const board     = document.getElementById('board');
const tpl       = document.getElementById('tpl-widget');
const panel     = document.getElementById('side-panel');
const editBtn   = document.getElementById('edit-toggle');
const editLabel = editBtn.querySelector('.edit-label');
const closeBtn  = document.getElementById('panel-close');

// ----- Widget rendering -----
function renderWidget(w) {
  const def = registry.get(w.type);
  const node = tpl.content.firstElementChild.cloneNode(true);
  node.dataset.id = w.id;
  node.dataset.type = w.type;
  node.style.left   = w.x + 'px';
  node.style.top    = w.y + 'px';
  node.style.width  = w.w + 'px';
  node.style.height = w.h + 'px';
  node.style.zIndex = w.z || 1;
  const titleEl = node.querySelector('.widget-title');
  const defaultTitle = def ? def.title : `(${w.type})`;
  titleEl.textContent = w.title || defaultTitle;
  // Editable title — typing updates w.title; Enter / blur commits; Escape reverts
  titleEl.addEventListener('blur', () => {
    const next = (titleEl.textContent || '').trim();
    if (!next || next === defaultTitle) {
      delete w.title;
      titleEl.textContent = defaultTitle;
    } else {
      w.title = next;
    }
    scheduleSave();
  });
  titleEl.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); titleEl.blur(); }
    if (e.key === 'Escape') {
      e.preventDefault();
      titleEl.textContent = w.title || defaultTitle;
      titleEl.blur();
    }
  });
  // Stop drag from starting when clicking inside the title
  titleEl.addEventListener('mousedown', e => e.stopPropagation());
  const body = node.querySelector('.widget-body');

  // Cleanup runs both on rerender and on remove. The widget's render() can
  // register teardown via ctx.onCleanup (timers, listeners, etc.).
  let cleanups = [];
  function runCleanups() {
    cleanups.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
    cleanups = [];
  }

  function rerender() {
    runCleanups();
    body.innerHTML = '';
    if (!def) {
      body.textContent = `Unknown widget: ${w.type}`;
      return;
    }
    if (!w.settings) w.settings = def.defaultSettings ? def.defaultSettings() : {};
    const ctx = {
      data:      w.data,
      settings:  w.settings,
      save:      scheduleSave,
      onCleanup: fn => cleanups.push(fn),
      rerender,
      // Mark the widget as displaying cached/stale data — the widget's render
      // function should call this when a fetch failed but cached data is
      // available. CSS adds a small "offline" badge and dims the body so the
      // user knows what they're seeing isn't live.
      setStale: (isStale) => { node.classList.toggle('stale', !!isStale); }
    };
    try { def.render(body, ctx); }
    catch (err) {
      console.error(`[Tessra] render failed for "${w.type}":`, err);
      body.textContent = 'Widget error.';
    }
    node._cleanups = cleanups;
  }

  // Expose rerender on the DOM node so external code (e.g. the integrations
  // pane broadcasting a credential change) can ask a live widget to refresh
  // without having to know about its internal closure.
  node._rerender = rerender;
  rerender();

  // Settings icon: shown only when (a) widget declares a settings schema
  // AND (b) the page is in edit mode. CSS handles the edit-mode gate via
  // body.edit-mode .widget.has-settings .widget-settings.
  const settingsBtn = node.querySelector('.widget-settings');
  if (def && Array.isArray(def.settingsSchema) && def.settingsSchema.length) {
    node.classList.add('has-settings');
    settingsBtn.addEventListener('click', e => {
      e.stopPropagation();
      SettingsPopover.open(settingsBtn, def, w, () => {
        rerender();
        scheduleSave();
      });
    });
  }

  // Lock toggle. Persisted on the widget object. CSS handles the icon swap
  // (open ↔ closed padlock) and gates the resize handle / × button.
  if (w.locked) node.classList.add('locked');
  // Z-order popover trigger (Bring to front / Send to back)
  const zorderBtn = node.querySelector('.widget-zorder');
  if (zorderBtn) {
    zorderBtn.addEventListener('mousedown', e => e.stopPropagation());
    zorderBtn.addEventListener('click', e => {
      e.stopPropagation();
      openZOrderPopover(zorderBtn, w, node);
    });
  }
  const lockBtn = node.querySelector('.widget-lock');
  if (lockBtn) {
    lockBtn.addEventListener('mousedown', e => e.stopPropagation());
    lockBtn.addEventListener('click', e => {
      e.stopPropagation();
      w.locked = !w.locked;
      node.classList.toggle('locked', !!w.locked);
      lockBtn.title = w.locked ? 'Unlock' : 'Lock';
      scheduleSave();
    });
    lockBtn.title = w.locked ? 'Unlock' : 'Lock';
  }

  node.querySelector('.widget-remove').addEventListener('click', () => {
    if (w.locked) return;                          // locked widgets can't be removed
    runCleanups();
    node._dragCleanup?.();
    node._resizeCleanup?.();
    state.widgets = state.widgets.filter(x => x.id !== w.id);
    selectedIds.delete(w.id);
    node.remove();
    scheduleSave();
  });

  // Stored on the node so any other teardown path (multi-delete, layout
  // import/paste) can release these window-level listeners too — see the
  // leak warning on enableDrag's definition.
  node._dragCleanup = enableDrag(node, w);
  node._resizeCleanup = enableResize(node, w);
  board.appendChild(node);
  return node;
}

// Returns a cleanup function that removes this widget's window-level drag
// listeners — callers must invoke it when the widget's node is destroyed
// (deleted, or torn down on layout import/paste), otherwise the closure
// keeps the dead node/widget alive for the rest of the session.
function enableDrag(node, w) {
  let startX, startY, ox, oy, dragging = false;
  // Group offsets: captured at drag-start when this widget is part of a
  // multi-selection. Each entry { widget, node, dx, dy } encodes the
  // selected widget's position relative to the actively-dragged one, so on
  // each move we can keep the group rigid.
  let groupOffsets = null;
  // Snap candidates only change with the selection/board contents, not on
  // every pixel of mouse movement — computed once in start(), reused for
  // the whole drag instead of re-filtering state.widgets on every mousemove.
  let others = null;

  const start = (clientX, clientY, target) => {
    if (w.locked) return;                          // hard stop — locked widget
    const inEdit = document.body.classList.contains('edit-mode');
    const inWindowMode = document.body.classList.contains('always-headers');
    const isSticky = w.type === 'stickies';
    if (!inEdit) {
      if (isSticky) {
        if (!target.closest('.sticky-grip')) return;
      } else if (inWindowMode) {
        if (!target.closest('.widget-header')) return;
      } else {
        return;
      }
    }
    if (target.closest('button, input, textarea, a, select, .widget-resize, [contenteditable]')) return;
    dragging = true;
    startX = clientX; startY = clientY;
    ox = w.x; oy = w.y;
    node.classList.add('dragging');
    bringToFront(w, node);
    setInteracting(true);

    // Multi-select coordination. If the dragged widget is part of the active
    // selection, keep that selection and capture relative offsets so the
    // group moves rigidly. If it isn't, the user grabbed something outside
    // the box — collapse selection to just this widget for the drag.
    if (selectedIds.has(w.id) && selectedIds.size > 1) {
      groupOffsets = [];
      state.widgets.forEach(other => {
        if (other.id === w.id || !selectedIds.has(other.id)) return;
        if (other.locked) return;                 // locked group members hold still
        const otherNode = document.querySelector(`.widget[data-id="${other.id}"]`);
        if (otherNode) groupOffsets.push({ widget: other, node: otherNode, dx: other.x - w.x, dy: other.y - w.y });
      });
    } else {
      groupOffsets = null;
      // Drag a widget that wasn't in the box → drop the box. Feels natural
      // because the user is clearly working with a single widget now.
      if (selectedIds.size > 0) clearSelection();
    }

    // Snap candidates: every other widget (skipping group members so the
    // moving group doesn't snap to itself), computed once for the whole
    // drag rather than re-filtered on every mousemove. Sticky notes don't
    // snap at all, so skip building the list for them entirely.
    if (w.type !== 'stickies') {
      const skipIds = new Set([w.id]);
      if (groupOffsets) groupOffsets.forEach(g => skipIds.add(g.widget.id));
      others = state.widgets
        .filter(x => !skipIds.has(x.id) && x.type !== 'stickies') // ignore stickies as snap targets too
        .map(rectFor);
    } else {
      others = null;
    }
  };

  const move = (clientX, clientY) => {
    if (!dragging) return;
    const z = zoomFactor();
    const nx = snap(ox + (clientX - startX) / z);
    const ny = snap(oy + (clientY - startY) / z);

    // Sticky notes drag freely without snap or alignment guides — they're
    // tossed onto the desktop intentionally and the tilt makes edge-snaps
    // look wrong anyway. Other widgets snap to neighbors + viewport midlines.
    const isSticky = w.type === 'stickies';
    let bestX = null, bestY = null;
    if (!isSticky) {
      const d = {
        left: nx, top: ny,
        right: nx + w.w, bottom: ny + w.h,
        w: w.w, h: w.h,
        cx: nx + w.w / 2, cy: ny + w.h / 2
      };
      ({ bestX, bestY } = computeSnap(d, others, window.innerWidth / z, window.innerHeight / z));
    }

    const fx = Math.max(0, nx + (bestX ? bestX.delta : 0));
    const fy = Math.max(0, ny + (bestY ? bestY.delta : 0));
    w.x = fx; w.y = fy;
    node.style.left = fx + 'px';
    node.style.top  = fy + 'px';

    // Group members ride along
    if (groupOffsets) {
      groupOffsets.forEach(g => {
        g.widget.x = Math.max(0, fx + g.dx);
        g.widget.y = Math.max(0, fy + g.dy);
        g.node.style.left = g.widget.x + 'px';
        g.node.style.top  = g.widget.y + 'px';
      });
    }

    renderSnapGuides({ x: bestX, y: bestY });
  };

  const end = () => {
    if (!dragging) return;
    dragging = false;
    groupOffsets = null;
    node.classList.remove('dragging');
    clearSnapGuides();
    setInteracting(false);
    scheduleSave();
  };
  const onMouseDown = e => { start(e.clientX, e.clientY, e.target); if (dragging) e.preventDefault(); };
  const onMouseMove = e => move(e.clientX, e.clientY);
  node.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', end);
  return () => {
    node.removeEventListener('mousedown', onMouseDown);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', end);
  };
}

// Returns a cleanup function — see enableDrag's note above; same leak risk
// applies here since this also attaches window-level listeners per widget.
function enableResize(node, w) {
  const handle = node.querySelector('.widget-resize');
  if (!handle) return () => {};
  const def = registry.get(w.type);
  const min = (def && def.minSize) || { w: 160, h: 80 };
  const max = (def && def.maxSize) || { w: 4000, h: 4000 };

  let startX, startY, ow, oh, resizing = false;

  const onHandleMouseDown = e => {
    if (!document.body.classList.contains('edit-mode')) return;
    if (w.locked) return;                          // hard stop — locked widget
    e.preventDefault();
    e.stopPropagation(); // prevent widget drag from also starting
    resizing = true;
    startX = e.clientX; startY = e.clientY;
    ow = w.w; oh = w.h;
    node.classList.add('resizing');
    bringToFront(w, node);
    setInteracting(true);
  };
  const onMouseMove = e => {
    if (!resizing) return;
    const z = zoomFactor();
    const nw = Math.max(min.w, Math.min(max.w, snap(ow + (e.clientX - startX) / z)));
    const nh = Math.max(min.h, Math.min(max.h, snap(oh + (e.clientY - startY) / z)));
    w.w = nw; w.h = nh;
    node.style.width  = nw + 'px';
    node.style.height = nh + 'px';
  };
  const onMouseUp = () => {
    if (!resizing) return;
    resizing = false;
    node.classList.remove('resizing');
    setInteracting(false);
    scheduleSave();
  };
  handle.addEventListener('mousedown', onHandleMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  return () => {
    handle.removeEventListener('mousedown', onHandleMouseDown);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
  };
}

// ----- Catalog (grouped by category, with search) -----
const CATEGORY_ORDER  = ['time', 'productivity', 'finance', 'web', 'info', 'developer', 'random', 'integrations', 'other'];
const CATEGORY_LABELS = {
  time:         'Time',
  productivity: 'Productivity',
  finance:      'Finance',
  web:          'Web',
  info:         'Info',
  developer:    'Developer',
  random:       'Random',
  integrations: 'Integrations',
  other:        'Other'
};
// Optional label overrides for subcategory headers shown inside a category
// section. Falls back to titlecasing the key when a label isn't listed here.
const SUBCATEGORY_LABELS = {
  notion: 'Notion'
};

// Star icon used for the favorite toggle on each catalog card. One SVG with
// a class that flips between filled (favorite) and outlined (not favorite).
const STAR_SVG = '<svg viewBox="0 0 24 24" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26"/></svg>';

function isFavorite(type) {
  return Array.isArray(state.favorites) && state.favorites.includes(type);
}

function toggleFavorite(type) {
  if (!Array.isArray(state.favorites)) state.favorites = [];
  const i = state.favorites.indexOf(type);
  if (i >= 0) state.favorites.splice(i, 1);
  else state.favorites.push(type);
  scheduleSave();
  populateCatalog();
  // Re-apply any active search filter so the user doesn't lose their state
  const search = document.getElementById('catalog-search');
  if (search && search.value) search.dispatchEvent(new Event('input'));
}

// Build a single catalog card. Used by both the Favorites section and the
// category sections — same DOM, same drag behavior, same star toggle.
function buildCard(def) {
  const card = document.createElement('div');
  const comingSoon = !!def.comingSoon;
  card.className = 'widget-card' + (isFavorite(def.type) ? ' fav' : '') + (comingSoon ? ' coming-soon' : '');
  card.dataset.type  = def.type;
  card.dataset.label = (def.title || def.type).toLowerCase();
  card.innerHTML = `
    <button class="card-star ${isFavorite(def.type) ? 'on' : ''}" aria-label="Favorite" title="${isFavorite(def.type) ? 'Unfavorite' : 'Favorite'}">${STAR_SVG}</button>
    <div class="card-icon">${def.icon || '◻'}</div>
    <div class="card-label">${def.title}</div>
    ${comingSoon ? '<div class="card-badge">Coming soon</div>' : ''}`;
  // Star click toggles favorite; stopPropagation so the card's drag handler
  // doesn't pick it up.
  const star = card.querySelector('.card-star');
  star.addEventListener('mousedown', e => e.stopPropagation());
  star.addEventListener('click', e => {
    e.stopPropagation();
    toggleFavorite(def.type);
  });
  card.addEventListener('mousedown', e => {
    if (comingSoon) return;                     // not placeable yet
    if (e.target.closest('.card-star')) return; // star handles its own click
    e.preventDefault();
    startCatalogDrag(def.type, e);
  });
  return card;
}

function populateCatalog() {
  const host = document.getElementById('widget-catalog');
  if (!host) return;

  // Group registered widgets by category
  const byCategory = {};
  for (const def of registry.all()) {
    const cat = def.category || 'other';
    (byCategory[cat] ||= []).push(def);
  }

  // Render sections in fixed order; any unknown category goes under 'Other' at the end
  host.innerHTML = '';
  const seen = new Set();

  // --- Favorites section pinned to the top ---
  // Show only when at least one widget is favorited. Favorited widgets still
  // appear in their original category section below — the favorites row is a
  // shortcut, not a relocation.
  const favs = Array.isArray(state.favorites) ? state.favorites : [];
  const favDefs = favs.map(t => registry.get(t)).filter(Boolean);
  if (favDefs.length) {
    const section = document.createElement('div');
    section.className = 'catalog-section catalog-favorites';
    section.dataset.category = 'favorites';
    section.innerHTML = '<h4 class="catalog-section-title">Favorites</h4>';
    const grid = document.createElement('div');
    grid.className = 'catalog-grid';
    favDefs.forEach(def => grid.appendChild(buildCard(def)));
    section.appendChild(grid);
    host.appendChild(section);
  }

  const renderSection = (cat) => {
    const defs = byCategory[cat];
    if (!defs || !defs.length) return;
    const section = document.createElement('div');
    section.className = 'catalog-section';
    section.dataset.category = cat;
    section.innerHTML = `<h4 class="catalog-section-title">${CATEGORY_LABELS[cat] || cat}</h4>`;
    // Split into subcategories when at least one widget under this category
    // declares a subcategory. Mixed cases (some with, some without) render
    // any "uncategorized" widgets first as a plain grid, then group the
    // tagged ones under labeled sub-sections.
    const hasSub = defs.some(d => d.subcategory);
    if (hasSub) {
      const bySub = {};
      const plain = [];
      defs.forEach(d => {
        if (d.subcategory) (bySub[d.subcategory] ||= []).push(d);
        else plain.push(d);
      });
      if (plain.length) {
        const grid = document.createElement('div');
        grid.className = 'catalog-grid';
        plain.forEach(def => grid.appendChild(buildCard(def)));
        section.appendChild(grid);
      }
      Object.keys(bySub).sort().forEach(sub => {
        const sub_wrap = document.createElement('div');
        sub_wrap.className = 'catalog-subsection';
        sub_wrap.dataset.subcategory = sub;
        const label = SUBCATEGORY_LABELS[sub] || sub.charAt(0).toUpperCase() + sub.slice(1);
        sub_wrap.innerHTML = `<h5 class="catalog-subsection-title">${label}</h5>`;
        const subGrid = document.createElement('div');
        subGrid.className = 'catalog-grid';
        bySub[sub].forEach(def => subGrid.appendChild(buildCard(def)));
        sub_wrap.appendChild(subGrid);
        section.appendChild(sub_wrap);
      });
    } else {
      const grid = document.createElement('div');
      grid.className = 'catalog-grid';
      defs.forEach(def => grid.appendChild(buildCard(def)));
      section.appendChild(grid);
    }
    host.appendChild(section);
    seen.add(cat);
  };
  CATEGORY_ORDER.forEach(renderSection);
  // Catch any custom category that isn't in CATEGORY_ORDER
  Object.keys(byCategory).filter(c => !seen.has(c)).forEach(renderSection);

  // Wire up the search input (idempotent — only attaches once)
  const search = document.getElementById('catalog-search');
  const empty  = document.querySelector('.catalog-empty');
  if (search && !search._wired) {
    search._wired = true;
    const apply = () => {
      const q = search.value.toLowerCase().trim();
      let anyVisible = false;
      document.querySelectorAll('.widget-card').forEach(card => {
        const match = !q || card.dataset.label.includes(q);
        card.classList.toggle('hidden', !match);
        if (match) anyVisible = true;
      });
      document.querySelectorAll('.catalog-subsection').forEach(sub => {
        const subHas = sub.querySelector('.widget-card:not(.hidden)');
        sub.classList.toggle('hidden', !subHas);
      });
      document.querySelectorAll('.catalog-section').forEach(section => {
        const sectionHas = section.querySelector('.widget-card:not(.hidden)');
        section.classList.toggle('hidden', !sectionHas);
      });
      if (empty) empty.classList.toggle('hidden', anyVisible || !q);
    };
    search.addEventListener('input', apply);
    search.addEventListener('keydown', e => {
      if (e.key === 'Escape') { search.value = ''; apply(); search.blur(); }
    });
  }
}

// ----- Edit mode + side panel -----
function setEditMode(on) {
  document.body.classList.toggle('edit-mode', on);
  editLabel.textContent = on ? 'Done' : 'Edit';
  panel.setAttribute('aria-hidden', on ? 'false' : 'true');
}
editBtn.addEventListener('click', () => setEditMode(!document.body.classList.contains('edit-mode')));
closeBtn.addEventListener('click', () => setEditMode(false));
// ----- Copy/paste + duplicate helpers -----
// Widget JSON envelope used for clipboard transfer. Includes only the fields
// that travel cleanly across workspaces (positions are *not* preserved —
// pasted widgets get re-positioned so they don't land on top of the
// original). data + settings + size + title carry the actual configuration.
const CLIP_FORMAT = 'tessra-widgets';
const CLIP_VERSION = 1;

function buildClipboardPayload(widgets) {
  return {
    format: CLIP_FORMAT,
    version: CLIP_VERSION,
    widgets: widgets.map(w => ({
      type: w.type,
      w: w.w, h: w.h,
      title: w.title || undefined,
      locked: w.locked ? true : undefined,
      data:     w.data     ? JSON.parse(JSON.stringify(w.data))     : undefined,
      settings: w.settings ? JSON.parse(JSON.stringify(w.settings)) : undefined
    }))
  };
}

// Spawn N widgets at a position that doesn't immediately overlap the source.
// `baseXY` is the first slot — subsequent ones are staggered diagonally so
// pasting multiple copies of the same widget makes the stack visible.
function spawnFromClipboardPayload(payload, baseXY) {
  if (!payload || payload.format !== CLIP_FORMAT || !Array.isArray(payload.widgets)) return [];
  const STAGGER = 22;
  const newIds = [];
  payload.widgets.forEach((src, i) => {
    const def = registry.get(src.type);
    if (!def) return;
    const x = (baseXY?.x ?? 80) + i * STAGGER;
    const y = (baseXY?.y ?? 100) + i * STAGGER;
    state.maxZ = (state.maxZ || 0) + 1;
    // src comes from the clipboard or a pasted/imported share string — treat
    // it like any other untrusted input and clamp to the widget's own
    // bounds rather than trusting whatever numbers are in the payload.
    const min = def.minSize || { w: 160, h: 80 };
    const max = def.maxSize || { w: 4000, h: 4000 };
    const w = Number.isFinite(src.w) ? Math.max(min.w, Math.min(max.w, src.w)) : undefined;
    const h = Number.isFinite(src.h) ? Math.max(min.h, Math.min(max.h, src.h)) : undefined;
    const widget = makeWidget(src.type, {
      x: snap(Math.max(0, x)),
      y: snap(Math.max(0, y)),
      w, h,
      z: state.maxZ,
      data:     src.data     ? JSON.parse(JSON.stringify(src.data))     : undefined,
      settings: src.settings ? JSON.parse(JSON.stringify(src.settings)) : undefined
    });
    if (typeof src.title === 'string' && src.title) widget.title = src.title;
    else if (def.autoNumber) widget.title = nextAutoTitle(src.type);
    if (src.locked) widget.locked = true;
    state.widgets.push(widget);
    renderWidget(widget);
    newIds.push(widget.id);
  });
  return newIds;
}

// Duplicate selected widgets in-place (used by Cmd+D). Same as paste but the
// payload comes from current selection, not the clipboard.
function duplicateSelected() {
  if (!selectedIds.size) return;
  const sources = state.widgets.filter(w => selectedIds.has(w.id));
  if (!sources.length) return;
  const payload = buildClipboardPayload(sources);
  // Place duplicates just below-right of the topmost source
  const top = Math.min(...sources.map(w => w.y));
  const left = Math.min(...sources.map(w => w.x));
  const newIds = spawnFromClipboardPayload(payload, { x: left + 22, y: top + 22 });
  if (newIds.length) {
    setSelection(newIds);
    scheduleSave();
  }
}

async function copySelectedToClipboard() {
  if (!selectedIds.size) return false;
  // Don't preempt text selection — Cmd+C should still copy highlighted text
  if (window.getSelection && window.getSelection().toString().trim()) return false;
  const sources = state.widgets.filter(w => selectedIds.has(w.id));
  if (!sources.length) return false;
  try {
    await navigator.clipboard.writeText(JSON.stringify(buildClipboardPayload(sources)));
    return true;
  } catch { return false; }
}

async function pasteFromClipboard() {
  let text;
  try { text = await navigator.clipboard.readText(); }
  catch { return false; }
  if (!text) return false;
  let parsed;
  try { parsed = JSON.parse(text); }
  catch { return false; }
  if (parsed?.format !== CLIP_FORMAT) return false;
  // Stagger from the viewport's top-left margin so the pasted widget is
  // clearly visible regardless of where the source was.
  const newIds = spawnFromClipboardPayload(parsed, { x: 80, y: 100 });
  if (newIds.length) {
    setSelection(newIds);
    scheduleSave();
    return true;
  }
  return false;
}

document.addEventListener('keydown', e => {
  if (/input|textarea/i.test(e.target.tagName)) return;
  if (e.target && e.target.isContentEditable) return;

  // Cmd/Ctrl shortcuts first — single-key handlers below would otherwise
  // hijack things like Cmd+D (which the browser would normally bookmark)
  // or Cmd+C (text copy) before our handler runs.
  if (e.metaKey || e.ctrlKey) {
    const k = e.key.toLowerCase();
    if (k === 'd') {
      if (!selectedIds.size) return;
      e.preventDefault();
      duplicateSelected();
      return;
    }
    if (k === 'c') {
      // Only intercept if we actually have widgets selected AND no text
      // selection on the page — otherwise let the browser handle text copy.
      if (!selectedIds.size) return;
      if (window.getSelection && window.getSelection().toString().trim()) return;
      e.preventDefault();
      copySelectedToClipboard();
      return;
    }
    if (k === 'v') {
      // Only intercept when the page (not a form field) has focus. The
      // input/textarea/contentEditable filter at the top already excluded
      // those cases, so reaching here means board-level paste.
      e.preventDefault();
      pasteFromClipboard();
      return;
    }
  }

  // Arrow-nudge for selected widgets. Step = 8 px, 24 px when Shift held.
  if (/^Arrow(Up|Down|Left|Right)$/.test(e.key) && selectedIds.size > 0) {
    e.preventDefault();
    const step = e.shiftKey ? 24 : 8;
    const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
    const dy = e.key === 'ArrowUp'   ? -step : e.key === 'ArrowDown'  ? step : 0;
    selectedIds.forEach(id => {
      const w = state.widgets.find(x => x.id === id);
      if (!w || w.locked) return;
      w.x = Math.max(0, w.x + dx);
      w.y = Math.max(0, w.y + dy);
      const n = document.querySelector(`#board .widget[data-id="${id}"]`);
      if (n) { n.style.left = w.x + 'px'; n.style.top = w.y + 'px'; }
    });
    scheduleSave();
    return;
  }

  if (e.key.toLowerCase() === 'e') setEditMode(!document.body.classList.contains('edit-mode'));
  // P opens the side panel (Widgets tab by default).
  if (e.key.toLowerCase() === 'p') {
    setEditMode(true);
    selectPanelTab('widgets');
  }
  // T opens the side panel and jumps to the Theme tab.
  if (e.key.toLowerCase() === 't') {
    setEditMode(true);
    selectPanelTab('theme');
  }
  if (e.key === 'Escape') {
    if (selectedIds.size > 0) { clearSelection(); return; }
    if (document.body.classList.contains('edit-mode')) setEditMode(false);
  }
  // Delete / Backspace removes every selected widget (skipping locked ones).
  // No-ops if nothing is selected. Single, batched save at the end.
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (!selectedIds.size) return;
    const toRemove = [];
    selectedIds.forEach(id => {
      const w = state.widgets.find(x => x.id === id);
      if (w && !w.locked) toRemove.push(w);
    });
    if (!toRemove.length) return;
    e.preventDefault();
    toRemove.forEach(w => {
      const node = document.querySelector(`.widget[data-id="${w.id}"]`);
      if (node && node._cleanups) node._cleanups.forEach(fn => { try { fn(); } catch {} });
      node?._dragCleanup?.();
      node?._resizeCleanup?.();
      if (node) node.remove();
    });
    const removeIds = new Set(toRemove.map(w => w.id));
    state.widgets = state.widgets.filter(w => !removeIds.has(w.id));
    clearSelection();
    scheduleSave();
  }
});

panel.querySelectorAll('.panel-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    panel.querySelectorAll('.panel-tab').forEach(t => t.classList.toggle('active', t === tab));
    panel.querySelectorAll('.panel-pane').forEach(p => {
      p.classList.toggle('hidden', p.dataset.pane !== tab.dataset.tab);
    });
  });
});

// ----- Integrations pane -----
// Builds one card per provider in INTEGRATIONS, with a credential input bound
// to state.integrations[provider][field]. Saves on input (debounced via
// scheduleSave) and broadcasts a 'tessra:integrations-changed' event so any
// live widget that uses that provider can re-render with the new credential.
function populateIntegrationsPane() {
  const host = document.getElementById('integrations-list');
  if (!host) return;
  host.innerHTML = '';
  Object.entries(INTEGRATIONS).forEach(([provider, def]) => {
    const card = document.createElement('section');
    card.className = 'integration-card';
    card.dataset.provider = provider;
    let fieldsHtml = '';
    def.fields.forEach(f => {
      const val = (state.integrations?.[provider]?.[f.key] || '');
      const inputType = f.type === 'password' ? 'password' : 'text';
      fieldsHtml += `
        <label class="integration-field">
          <span class="integration-field-label">${f.label}</span>
          <input type="${inputType}" data-field="${f.key}" value="${val.replace(/"/g, '&quot;')}"
                 placeholder="${f.placeholder || ''}" spellcheck="false" autocomplete="off"/>
        </label>`;
    });
    card.innerHTML = `
      <div class="integration-head">
        <span class="integration-icon">${def.icon}</span>
        <span class="integration-name">${def.name}</span>
        <span class="integration-status" data-role="status"></span>
      </div>
      <p class="integration-hint">${def.setupHint}</p>
      ${fieldsHtml}
    `;
    host.appendChild(card);

    // Set initial status (Connected / Not connected) based on whether all
    // declared fields are populated. Updates live as the user types.
    const statusEl = card.querySelector('[data-role="status"]');
    function refreshStatus() {
      const allSet = def.fields.every(f => !!(state.integrations?.[provider]?.[f.key]));
      statusEl.textContent = allSet ? 'Connected' : 'Not connected';
      statusEl.classList.toggle('on', allSet);
    }
    refreshStatus();

    card.querySelectorAll('input[data-field]').forEach(input => {
      input.addEventListener('input', () => {
        if (!state.integrations[provider]) state.integrations[provider] = {};
        state.integrations[provider][input.dataset.field] = input.value;
        refreshStatus();
        scheduleSave();
        // Tell every widget that lives under this provider's subcategory to
        // rerender — they'll pick up the new credential via tessraIntegration().
        window.dispatchEvent(new CustomEvent('tessra:integrations-changed', {
          detail: { provider, field: input.dataset.field }
        }));
      });
    });
  });
}

// Re-render any widget whose subcategory matches the changed provider. Lets
// the Notion widgets pick up a new token without a full page reload.
window.addEventListener('tessra:integrations-changed', (e) => {
  const provider = e.detail?.provider;
  if (!provider) return;
  state.widgets.forEach(w => {
    const def = registry.get(w.type);
    if (!def || def.subcategory !== provider) return;
    const node = document.querySelector(`#board .widget[data-id="${w.id}"]`);
    if (node && typeof node._rerender === 'function') node._rerender();
  });
});

// ----- Drag-from-panel -----
const ghost = document.getElementById('drag-ghost');
let dragType = null;

function startCatalogDrag(type, e) {
  const def = registry.get(type);
  if (!def) return;
  dragType = type;
  const size = def.defaultSize;
  ghost.style.width = size.w + 'px';
  ghost.style.height = size.h + 'px';
  ghost.style.left = (e.clientX / zoomFactor() - size.w / 2) + 'px';
  ghost.style.top  = (e.clientY / zoomFactor() - size.h / 2) + 'px';
  ghost.textContent = def.title;
  ghost.classList.remove('hidden');
  document.body.style.userSelect = 'none';
  setInteracting(true);
}
function moveGhost(e) {
  if (!dragType) return;
  const def = registry.get(dragType);
  if (!def) return;
  const size = def.defaultSize;
  ghost.style.left = (e.clientX / zoomFactor() - size.w / 2) + 'px';
  ghost.style.top  = (e.clientY / zoomFactor() - size.h / 2) + 'px';
}
function dropGhost(e) {
  if (!dragType) return;
  const type = dragType;
  dragType = null;
  ghost.classList.add('hidden');
  document.body.style.userSelect = '';
  setInteracting(false);

  const panelRect = panel.getBoundingClientRect();
  const insidePanel = e.clientX >= panelRect.left && e.clientX <= panelRect.right
                   && e.clientY >= panelRect.top  && e.clientY <= panelRect.bottom;
  if (insidePanel) return;

  const def = registry.get(type);
  if (!def) return;
  const size = def.defaultSize;
  const x = Math.max(0, snap(e.clientX / zoomFactor() - size.w / 2));
  const y = Math.max(0, snap(e.clientY / zoomFactor() - size.h / 2));
  state.maxZ = (state.maxZ || 0) + 1;
  const w = makeWidget(type, { x, y, z: state.maxZ });
  if (def.autoNumber) w.title = nextAutoTitle(type);
  state.widgets.push(w);
  renderWidget(w);
  saveNow();
  // Emit so the onboarding tour (and any other listener) can react.
  document.dispatchEvent(new CustomEvent('tessra:widget-spawned', { detail: { type } }));
}
window.addEventListener('mousemove', moveGhost);
window.addEventListener('mouseup', dropGhost);

// ----- Color helpers + Picker -----
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function hexToHsl(hex) {
  hex = (hex || '#000000').replace('#','');
  if (hex.length === 3) hex = hex.split('').map(c => c+c).join('');
  const r = parseInt(hex.slice(0,2),16)/255;
  const g = parseInt(hex.slice(2,4),16)/255;
  const b = parseInt(hex.slice(4,6),16)/255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b);
  let h=0, s=0, l=(max+min)/2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d/(2-max-min) : d/(max+min);
    switch (max) {
      case r: h = (g-b)/d + (g<b?6:0); break;
      case g: h = (b-r)/d + 2; break;
      case b: h = (r-g)/d + 4; break;
    }
    h /= 6;
  }
  return [Math.round(h*360), Math.round(s*100), Math.round(l*100)];
}
function hslToHex(h, s, l) {
  h = ((h%360)+360)%360; s = clamp(s,0,100)/100; l = clamp(l,0,100)/100;
  const k = n => (n + h/30) % 12;
  const a = s * Math.min(l, 1-l);
  const f = n => l - a * Math.max(-1, Math.min(k(n)-3, 9-k(n), 1));
  const toHex = x => Math.round(255*x).toString(16).padStart(2,'0');
  return ('#' + toHex(f(0)) + toHex(f(8)) + toHex(f(4))).toUpperCase();
}
const isHex = s => /^#?[0-9a-fA-F]{6}$/.test(s);

const ColorPicker = (() => {
  const pop = document.getElementById('color-popover');
  const preview = pop.querySelector('.cp-preview');
  const hueEl = pop.querySelector('.cp-hue');
  const satEl = pop.querySelector('.cp-sat');
  const ligEl = pop.querySelector('.cp-lig');
  const hexEl = pop.querySelector('.cp-hex');

  let current = { h: 0, s: 0, l: 100 };
  let activeSwatch = null;
  let onChange = null;

  function paintTracks() {
    satEl.style.setProperty('--cp-track',
      `linear-gradient(to right, hsl(${current.h},0%,${current.l}%), hsl(${current.h},100%,${current.l}%))`);
    ligEl.style.setProperty('--cp-track',
      `linear-gradient(to right, #000 0%, hsl(${current.h},${current.s}%,50%) 50%, #fff 100%)`);
  }
  function syncFromHSL() {
    const hex = hslToHex(current.h, current.s, current.l);
    preview.style.background = hex;
    hexEl.value = hex.replace('#','');
    paintTracks();
    if (onChange) onChange(hex);
  }
  function setFromHex(hex) {
    if (!isHex(hex)) return;
    if (!hex.startsWith('#')) hex = '#' + hex;
    const [h,s,l] = hexToHsl(hex);
    current = { h, s, l };
    hueEl.value = h; satEl.value = s; ligEl.value = l;
    preview.style.background = hex;
    hexEl.value = hex.replace('#','');
    paintTracks();
  }

  hueEl.addEventListener('input', () => {
    current.h = +hueEl.value;
    if (current.s < 15) { current.s = 100; satEl.value = current.s; }
    if (current.l > 95 || current.l < 10) { current.l = 90; ligEl.value = current.l; }
    syncFromHSL();
  });
  satEl.addEventListener('input', () => {
    current.s = +satEl.value;
    if (current.s > 5 && (current.l > 95 || current.l < 10)) {
      current.l = 90; ligEl.value = current.l;
    }
    syncFromHSL();
  });
  ligEl.addEventListener('input', () => { current.l = +ligEl.value; syncFromHSL(); });
  hexEl.addEventListener('input', () => {
    const v = hexEl.value.trim();
    if (isHex(v)) {
      const hex = (v.startsWith('#') ? v : '#'+v).toUpperCase();
      const [h,s,l] = hexToHsl(hex);
      current = { h, s, l };
      hueEl.value = h; satEl.value = s; ligEl.value = l;
      preview.style.background = hex;
      paintTracks();
      if (onChange) onChange(hex);
    }
  });

  function position(anchor) {
    const z = zoomFactor();
    const rect = anchor.getBoundingClientRect();
    const rectLeft = rect.left / z, rectRight = rect.right / z, rectTop = rect.top / z;
    const vh = window.innerHeight / z;
    const popW = 240, popH = 280;
    let left = rectLeft - popW - 10;
    if (left < 8) left = rectRight + 10;
    let top = rectTop - 8;
    if (top + popH > vh - 8) top = vh - popH - 8;
    if (top < 8) top = 8;
    pop.style.left = left + 'px';
    pop.style.top  = top + 'px';
  }

  let outsideHandler = null;
  function open(swatch, initialHex, cb) {
    close();
    activeSwatch = swatch;
    swatch.classList.add('active');
    onChange = cb;
    setFromHex(initialHex || '#000000');
    pop.classList.remove('hidden');
    position(swatch);
    setTimeout(() => {
      if (pop.classList.contains('hidden')) return;
      outsideHandler = e => {
        if (pop.contains(e.target)) return;
        if (e.target.closest && e.target.closest('.swatch')) return;
        close();
      };
      document.addEventListener('mousedown', outsideHandler);
    }, 0);
  }
  function close() {
    pop.classList.add('hidden');
    if (activeSwatch) activeSwatch.classList.remove('active');
    activeSwatch = null;
    onChange = null;
    if (outsideHandler) {
      document.removeEventListener('mousedown', outsideHandler);
      outsideHandler = null;
    }
  }
  window.addEventListener('resize', () => { if (activeSwatch) position(activeSwatch); });

  return { open, close };
})();

function makeColorControl(host, getValue, setValue) {
  host.innerHTML = `
    <button type="button" class="swatch" aria-label="Pick color"></button>
    <input type="text" class="swatch-hex" maxlength="7" spellcheck="false"/>`;
  const swatch = host.querySelector('.swatch');
  const hex = host.querySelector('.swatch-hex');
  const refresh = () => {
    const v = getValue();
    swatch.style.backgroundColor = v;
    hex.value = v.toUpperCase();
  };
  swatch.addEventListener('click', e => {
    e.stopPropagation();
    ColorPicker.open(swatch, getValue(), newHex => {
      setValue(newHex);
      swatch.style.backgroundColor = newHex;
      hex.value = newHex.toUpperCase();
    });
  });
  hex.addEventListener('input', () => {
    let v = hex.value.trim();
    if (!v.startsWith('#')) v = '#' + v;
    if (isHex(v)) {
      setValue(v.toUpperCase());
      swatch.style.backgroundColor = v;
    }
  });
  hex.addEventListener('blur', refresh);
  refresh();
  return { refresh };
}

// ----- Settings form field builders -----
// Each builder receives (field, settings, onChange) and returns a DOM element.
// `settings` is a reference to the widget's settings object; mutating
// settings[field.key] updates the widget's state directly.

function buildToggle(field, settings, onChange) {
  const row = document.createElement('label');
  row.className = 'row toggle-row';
  row.innerHTML = `<span>${escapeHtml(field.label)}</span>`;
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.className = 'toggle';
  input.checked = !!settings[field.key];
  input.addEventListener('change', () => { settings[field.key] = input.checked; onChange(); });
  row.appendChild(input);
  return row;
}

function buildSelect(field, settings, onChange) {
  const row = document.createElement('div');
  row.className = 'row';
  const label = document.createElement('span');
  label.textContent = field.label;
  const select = document.createElement('select');
  select.className = 'select-input';

  function populate(opts) {
    select.innerHTML = '';
    (opts || []).forEach(opt => {
      const o = document.createElement('option');
      o.value = opt.value;
      o.textContent = opt.label ?? opt.value;
      if (settings[field.key] === opt.value) o.selected = true;
      select.appendChild(o);
    });
  }

  // Options may be a static array, a sync function returning an array, or
  // an async function returning a Promise (e.g. fetched bookmark folders).
  if (typeof field.options === 'function') {
    const result = field.options();
    if (result && typeof result.then === 'function') {
      select.innerHTML = '<option>Loading…</option>';
      result.then(populate).catch(err => {
        console.error('[Tessra] options load failed:', err);
        select.innerHTML = '<option>Error loading options</option>';
      });
    } else {
      populate(result);
    }
  } else {
    populate(field.options);
  }

  select.addEventListener('change', () => { settings[field.key] = select.value; onChange(); });
  row.appendChild(label);
  row.appendChild(select);
  return row;
}

function buildSlider(field, settings, onChange) {
  const min  = field.min  ?? 0;
  const max  = field.max  ?? 100;
  const step = field.step ?? 1;
  const unit = field.unit ?? '';
  const row = document.createElement('div');
  row.className = 'slider-row';
  row.innerHTML = `
    <span>${escapeHtml(field.label)}</span>
    <input type="range" min="${min}" max="${max}" step="${step}"/>
    <input type="number" min="${min}" max="${max}" step="${step}" class="num"/>
    <span class="unit">${escapeHtml(unit)}</span>`;
  const r = row.querySelector('input[type=range]');
  const n = row.querySelector('input[type=number]');
  r.value = settings[field.key];
  n.value = settings[field.key];
  const set = v => {
    v = Math.max(min, Math.min(max, +v || 0));
    settings[field.key] = v; r.value = v; n.value = v;
    onChange();
  };
  r.addEventListener('input', () => set(r.value));
  n.addEventListener('input', () => set(n.value));
  return row;
}

function buildColor(field, settings, onChange) {
  const row = document.createElement('div');
  row.className = 'row';
  const label = document.createElement('span');
  label.textContent = field.label;
  const host = document.createElement('div');
  host.className = 'color-control';
  row.appendChild(label);
  row.appendChild(host);
  makeColorControl(host,
    () => settings[field.key],
    v => { settings[field.key] = v; onChange(); }
  );
  return row;
}

function buildText(field, settings, onChange) {
  const row = document.createElement('div');
  row.className = 'row';
  const label = document.createElement('span');
  label.textContent = field.label;
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'text-input';
  input.value = settings[field.key] ?? '';
  if (field.placeholder) input.placeholder = field.placeholder;
  input.addEventListener('input', () => { settings[field.key] = input.value; onChange(); });
  row.appendChild(label);
  row.appendChild(input);
  return row;
}

function buildDate(field, settings, onChange) {
  const row = document.createElement('div');
  row.className = 'row';
  const label = document.createElement('span');
  label.textContent = field.label;
  const input = document.createElement('input');
  input.type = 'date';
  input.className = 'text-input';
  input.value = settings[field.key] ?? '';
  input.addEventListener('input', () => { settings[field.key] = input.value; onChange(); });
  row.appendChild(label);
  row.appendChild(input);
  return row;
}

// Custom panel field — the widget owns the rendering. Useful for things like
// the watchface gallery where a `select` dropdown doesn't do justice to the
// options. The field def provides a render(host, currentValue, set, settings)
// function; we just give it a row to draw into.
function buildPanel(field, settings, onChange) {
  const row = document.createElement('div');
  row.className = 'row row-panel';
  if (field.label) {
    const label = document.createElement('div');
    label.className = 'row-panel-label';
    label.textContent = field.label;
    row.appendChild(label);
  }
  const host = document.createElement('div');
  host.className = 'row-panel-host';
  row.appendChild(host);
  const set = v => {
    settings[field.key] = v;
    onChange();
  };
  if (typeof field.render === 'function') {
    field.render(host, settings[field.key], set, settings);
  }
  return row;
}

const fieldBuilders = {
  toggle: buildToggle,
  select: buildSelect,
  slider: buildSlider,
  color:  buildColor,
  text:   buildText,
  date:   buildDate,
  panel:  buildPanel
};

function buildField(field, settings, onChange) {
  const fn = fieldBuilders[field.type];
  if (!fn) {
    console.warn(`[Tessra] unknown setting type: ${field.type}`);
    const note = document.createElement('div');
    note.className = 'row';
    note.textContent = `Unknown field type: ${field.type}`;
    return note;
  }
  return fn(field, settings, onChange);
}

// ----- Settings popover (shared, anchored to a widget's gear icon) -----
const SettingsPopover = (() => {
  const pop      = document.getElementById('settings-popover');
  const titleEl  = pop.querySelector('.settings-title');
  const content  = pop.querySelector('.settings-content');
  const resetBtn = pop.querySelector('.settings-reset');

  let outsideHandler = null;
  let currentDef = null;
  let currentWidget = null;
  let currentOnChange = null;

  function rebuild() {
    ColorPicker.close();
    content.innerHTML = '';
    for (const field of currentDef.settingsSchema) {
      content.appendChild(buildField(field, currentWidget.settings, () => {
        if (currentOnChange) currentOnChange();
      }));
    }
  }

  resetBtn.addEventListener('click', () => {
    if (!currentDef || !currentWidget) return;
    currentWidget.settings = currentDef.defaultSettings
      ? currentDef.defaultSettings()
      : {};
    rebuild();
    if (currentOnChange) currentOnChange();
  });

  function position(anchor) {
    const z = zoomFactor();
    const rect = anchor.getBoundingClientRect();
    const rectLeft = rect.left / z, rectRight = rect.right / z;
    const rectTop = rect.top / z, rectBottom = rect.bottom / z;
    const vw = window.innerWidth / z, vh = window.innerHeight / z;
    const popW = 260;
    const rawH = pop.offsetHeight;
    const popH = rawH ? rawH / z : 240;
    let left = rectRight - popW;
    if (left < 8) left = rectLeft;
    if (left + popW > vw - 8) left = vw - popW - 8;
    let top = rectBottom + 8;
    if (top + popH > vh - 8) top = rectTop - popH - 8;
    if (top < 8) top = 8;
    pop.style.left = left + 'px';
    pop.style.top  = top + 'px';
  }

  function open(anchor, def, w, onChange) {
    close();
    currentDef = def;
    currentWidget = w;
    currentOnChange = onChange;
    titleEl.textContent = `${def.title} settings`;
    pop.classList.remove('hidden');
    rebuild();
    position(anchor);
    setTimeout(() => {
      if (pop.classList.contains('hidden')) return;
      outsideHandler = e => {
        if (pop.contains(e.target)) return;
        if (e.target.closest && e.target.closest('.widget-settings')) return;
        if (e.target.closest && e.target.closest('#color-popover')) return;
        close();
      };
      document.addEventListener('mousedown', outsideHandler);
    }, 0);
  }

  function close() {
    pop.classList.add('hidden');
    if (outsideHandler) {
      document.removeEventListener('mousedown', outsideHandler);
      outsideHandler = null;
    }
    currentDef = null;
    currentWidget = null;
    currentOnChange = null;
    ColorPicker.close();
  }

  window.addEventListener('resize', () => {
    if (!pop.classList.contains('hidden') && currentDef) {
      // Anchor is lost on resize; nothing to do beyond ensuring on-screen
    }
  });

  return { open, close };
})();

// ----- Theme -----
function applyTheme() {
  const t = state.theme;
  const dark = !!t.darkMode;
  document.body.classList.toggle('dark-mode', dark);

  document.body.classList.remove('bg-color', 'bg-image');
  if (t.bgType === 'color') {
    document.body.classList.add('bg-color');
  } else if (t.bgType === 'image' && t.bgImage) {
    document.body.classList.add('bg-image');
    document.documentElement.style.setProperty('--bg-image-url', `url("${t.bgImage}")`);
  }

  if (!dark) {
    // Light mode: apply the user's chosen colors inline (overriding :root defaults)
    document.documentElement.style.setProperty('--bg', t.bgColor);
    document.documentElement.style.setProperty('--widget-bg', t.widgetBg);
    document.documentElement.style.setProperty('--widget-border', t.widgetBorder);
  } else {
    // Dark mode: themes can opt in to custom dark surfaces via the dark*
    // fields (set by built-in presets). When none are set, clear the inline
    // overrides and fall back to body.dark-mode CSS defaults — preserving
    // the legacy behavior where the user's light-mode color choices reappear
    // when they toggle back to light.
    if (t.darkBgColor)      document.documentElement.style.setProperty('--bg', t.darkBgColor);
    else                    document.documentElement.style.removeProperty('--bg');
    if (t.darkWidgetBg)     document.documentElement.style.setProperty('--widget-bg', t.darkWidgetBg);
    else                    document.documentElement.style.removeProperty('--widget-bg');
    if (t.darkWidgetBorder) document.documentElement.style.setProperty('--widget-border', t.darkWidgetBorder);
    else                    document.documentElement.style.removeProperty('--widget-border');
  }
  document.documentElement.style.setProperty('--widget-border-width', t.widgetBorderWidth + 'px');
  document.documentElement.style.setProperty('--widget-radius', t.widgetRadius + 'px');
  // Shadows: punch up alpha in dark mode so shadows still register on dark surfaces
  const s = t.widgetShadow / 100;
  const shA = dark ? 2.2 : 1;
  document.documentElement.style.setProperty('--widget-shadow',
    `0 1px 2px rgba(0,0,0,${(0.04 * s * 2 * shA).toFixed(3)}), 0 ${Math.round(2 + 8 * s)}px ${Math.round(8 + 24 * s)}px rgba(0,0,0,${(0.06 * s * 2 * shA).toFixed(3)})`);
  document.documentElement.style.setProperty('--widget-shadow-hover',
    `0 2px 4px rgba(0,0,0,${(0.06 * s * 2 * shA).toFixed(3)}), 0 ${Math.round(6 + 12 * s)}px ${Math.round(16 + 32 * s)}px rgba(0,0,0,${(0.08 * s * 2 * shA).toFixed(3)})`);
  document.body.classList.toggle('always-headers', !!t.showHeaders);
  // Traffic lights only apply when window-style headers are also on
  document.body.classList.toggle('traffic-lights', !!t.showHeaders && !!t.trafficLights);
  // Panel side
  document.body.classList.toggle('panel-left', t.panelSide === 'left');
  // Accent colour drives a CSS variable consumed throughout the stylesheet
  document.documentElement.style.setProperty('--accent', t.accent || '#2563eb');
  // Surface style (flat / glass / liquid). CSS rules in body.surface-* override
  // widget/panel/popover backgrounds and shadows without touching the user's
  // saved widget colors.
  document.body.classList.toggle('surface-glass',  t.surfaceStyle === 'glass');
  document.body.classList.toggle('surface-liquid', t.surfaceStyle === 'liquid');
  // Glass tuning vars (only meaningful when surfaceStyle is glass or liquid)
  document.documentElement.style.setProperty('--glass-blur', (t.glassBlur ?? 9) + 'px');
  document.documentElement.style.setProperty('--glass-alpha', ((t.glassAlpha ?? 30) / 100).toFixed(3));
  // Font family — system stacks per option, with the named font listed first
  // so the system uses it when installed. Custom uploads inject an @font-face
  // rule (see installCustomFont) and use the 'TessraCustom' family name.
  const FONT_STACKS = {
    system:    'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    inter:     '"Inter", system-ui, -apple-system, sans-serif',
    geist:     '"Geist", "Geist Sans", system-ui, sans-serif',
    jetbrains: '"JetBrains Mono", ui-monospace, "Menlo", "Consolas", monospace',
    serif:     'ui-serif, Georgia, Cambria, "Times New Roman", serif',
    mono:      'ui-monospace, "SFMono-Regular", "Menlo", "Consolas", monospace',
    custom:    '"TessraCustom", system-ui, sans-serif'
  };
  const stack = FONT_STACKS[t.fontFamily || 'system'] || FONT_STACKS.system;
  document.documentElement.style.setProperty('--font-family', stack);
  if (t.fontFamily === 'custom' && t.customFontDataUrl) {
    installCustomFont(t.customFontDataUrl);
  } else {
    removeCustomFont();
  }
  // Whole-page zoom, applied the same way as the browser's own Ctrl +/- —
  // scales layout, not just rendering, so every coordinate (drag, resize,
  // snap-guides) stays correct with zero changes to that math.
  document.documentElement.style.zoom = (t.zoom || 100) / 100;
}

// Inject a single <style id="custom-font-face"> tag with the @font-face rule.
// Idempotent — calling repeatedly with the same data URL is a no-op.
function installCustomFont(dataUrl) {
  let styleEl = document.getElementById('custom-font-face');
  const css = `@font-face { font-family: "TessraCustom"; src: url("${dataUrl}"); font-display: swap; }`;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'custom-font-face';
    document.head.appendChild(styleEl);
  }
  if (styleEl.textContent !== css) styleEl.textContent = css;
}
function removeCustomFont() {
  const el = document.getElementById('custom-font-face');
  if (el) el.remove();
}

// ----- Built-in theme presets -----
// Six curated palettes inspired by popular editor themes. Each one sets
// accent + light surface colors + dark surface colors + dark-mode flag +
// surface style. applyTheme honors dark* overrides so users can flip the
// darkMode toggle later and still see preset-appropriate surfaces.
const THEME_PRESETS = [
  {
    id: 'solarized-light', name: 'Solarized Light',
    accent: '#268bd2',
    bgColor: '#fdf6e3', widgetBg: '#eee8d5', widgetBorder: '#93a1a1',
    darkBgColor: '#002b36', darkWidgetBg: '#073642', darkWidgetBorder: '#586e75',
    darkMode: false, surfaceStyle: 'flat'
  },
  {
    id: 'tokyo-night', name: 'Tokyo Night',
    accent: '#7aa2f7',
    bgColor: '#d5d6db', widgetBg: '#e9eaee', widgetBorder: '#9699a3',
    darkBgColor: '#1a1b26', darkWidgetBg: '#24283b', darkWidgetBorder: '#414868',
    darkMode: true, surfaceStyle: 'glass'
  },
  {
    id: 'nord', name: 'Nord',
    accent: '#88c0d0',
    bgColor: '#eceff4', widgetBg: '#e5e9f0', widgetBorder: '#d8dee9',
    darkBgColor: '#2e3440', darkWidgetBg: '#3b4252', darkWidgetBorder: '#4c566a',
    darkMode: true, surfaceStyle: 'liquid'
  },
  {
    id: 'catppuccin-mocha', name: 'Catppuccin Mocha',
    accent: '#cba6f7',
    bgColor: '#eff1f5', widgetBg: '#e6e9ef', widgetBorder: '#9ca0b0',
    darkBgColor: '#1e1e2e', darkWidgetBg: '#313244', darkWidgetBorder: '#45475a',
    darkMode: true, surfaceStyle: 'glass'
  },
  {
    id: 'monochrome', name: 'Monochrome',
    accent: '#1a1a1a',
    bgColor: '#ffffff', widgetBg: '#fafafa', widgetBorder: '#d4d4d4',
    darkBgColor: '#0a0a0a', darkWidgetBg: '#171717', darkWidgetBorder: '#404040',
    darkMode: false, surfaceStyle: 'flat'
  }
];

function applyThemePreset(p) {
  if (!p || !state || !state.theme) return;
  const t = state.theme;
  // Spread the preset over the existing theme. Any unrelated fields
  // (font family, glass blur, border radius, etc.) stay as-is.
  Object.assign(t, {
    accent: p.accent,
    bgColor: p.bgColor,
    widgetBg: p.widgetBg,
    widgetBorder: p.widgetBorder,
    darkBgColor: p.darkBgColor,
    darkWidgetBg: p.darkWidgetBg,
    darkWidgetBorder: p.darkWidgetBorder,
    darkMode: !!p.darkMode,
    surfaceStyle: p.surfaceStyle
  });
  applyTheme();
  // Sync side-panel controls so sliders/swatches/checkboxes show the new values.
  if (typeof window._refreshThemePanel === 'function') window._refreshThemePanel();
  saveNow();
}

function renderThemePresets() {
  const grid = document.getElementById('theme-presets-grid');
  if (!grid) return;
  grid.innerHTML = '';
  THEME_PRESETS.forEach(p => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'theme-preset';
    btn.dataset.id = p.id;
    // Two swatches show the "feel" — accent against the surface tone the
    // preset's default mode uses (dark or light).
    const surface = p.darkMode ? p.darkWidgetBg : p.widgetBg;
    const baseBg  = p.darkMode ? p.darkBgColor  : p.bgColor;
    btn.innerHTML = `
      <div class="tp-preview" style="background:${baseBg}">
        <div class="tp-tile" style="background:${surface}; border-color: ${p.darkMode ? p.darkWidgetBorder : p.widgetBorder}">
          <span class="tp-dot" style="background:${p.accent}"></span>
        </div>
      </div>
      <div class="tp-meta">
        <div class="tp-name">${p.name}</div>
        <div class="tp-sub">${p.surfaceStyle} · ${p.darkMode ? 'dark' : 'light'}</div>
      </div>`;
    btn.addEventListener('click', () => applyThemePreset(p));
    grid.appendChild(btn);
  });
}

function bindTheme() {
  const t = state.theme;
  const defaults = defaultTheme();
  const $ = sel => panel.querySelector(sel);

  // Segmented bg type
  const seg = panel.querySelector('[data-control="bgType"]');
  const updateSeg = () => {
    seg.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.value === t.bgType));
    panel.querySelectorAll('[data-show]').forEach(el => {
      const [key, vals] = el.dataset.show.split(':');
      const visible = vals.split(',').includes(t[key]);
      el.classList.toggle('hidden', !visible);
    });
  };
  seg.querySelectorAll('button').forEach(b => {
    b.addEventListener('click', () => {
      t.bgType = b.dataset.value;
      applyTheme(); updateSeg(); saveNow();
    });
  });

  // Custom color controls
  const colorControls = {};
  panel.querySelectorAll('.color-control').forEach(host => {
    const key = host.dataset.key;
    colorControls[key] = makeColorControl(host,
      () => t[key],
      v => { t[key] = v; applyTheme(); scheduleSave(); }
    );
  });

  // Image upload
  const imgInput   = $('#bgImage');
  const previewBox = $('#bgImagePreview');
  const thumbEl    = $('#bgImageThumb');
  const nameEl     = $('#bgImageName');
  const resEl      = $('#bgImageRes');
  const clearBtn   = $('#bgImageClear');
  const chooseBtn  = $('#bgImageBtn');

  function refreshImagePreview() {
    const hasImage = !!t.bgImage;
    clearBtn.disabled = !hasImage;
    if (!hasImage) {
      previewBox.classList.add('hidden');
      thumbEl.removeAttribute('src');
      nameEl.textContent = '';
      resEl.textContent = '';
      return;
    }
    previewBox.classList.remove('hidden');
    thumbEl.src = t.bgImage;
    nameEl.textContent = t.bgImageName || 'Background image';
    if (t.bgImageWidth && t.bgImageHeight) {
      resEl.textContent = `${t.bgImageWidth} × ${t.bgImageHeight}`;
    } else {
      resEl.textContent = '…';
      const probe = new Image();
      probe.onload = () => {
        t.bgImageWidth = probe.naturalWidth;
        t.bgImageHeight = probe.naturalHeight;
        resEl.textContent = `${probe.naturalWidth} × ${probe.naturalHeight}`;
        scheduleSave();
      };
      probe.src = t.bgImage;
    }
  }

  chooseBtn.addEventListener('click', () => imgInput.click());
  imgInput.addEventListener('change', () => {
    const f = imgInput.files && imgInput.files[0];
    if (!f) return;
    if (f.size > 4 * 1024 * 1024) { alert('Image too large (>4 MB).'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const probe = new Image();
      probe.onload = () => {
        t.bgImage = dataUrl;
        t.bgImageName = f.name;
        t.bgImageWidth = probe.naturalWidth;
        t.bgImageHeight = probe.naturalHeight;
        t.bgType = 'image';
        applyTheme(); updateSeg(); refreshImagePreview(); saveNow();
      };
      probe.onerror = () => alert('Could not read image.');
      probe.src = dataUrl;
    };
    reader.readAsDataURL(f);
  });
  clearBtn.addEventListener('click', () => {
    t.bgImage = null;
    t.bgImageName = null;
    t.bgImageWidth = null;
    t.bgImageHeight = null;
    imgInput.value = '';
    applyTheme(); refreshImagePreview(); saveNow();
  });
  refreshImagePreview();

  // Sliders
  const sliders = {};
  const bindSlider = (rangeSel, numSel, key, max, min = 0) => {
    const r = $(rangeSel), n = $(numSel);
    const set = v => {
      v = Math.max(min, Math.min(max, Math.round(+v || 0)));
      t[key] = v; r.value = v; n.value = v;
      applyTheme(); scheduleSave();
    };
    r.value = t[key]; n.value = t[key];
    r.addEventListener('input', () => set(r.value));
    n.addEventListener('input', () => set(n.value));
    sliders[key] = { refresh: () => { r.value = t[key]; n.value = t[key]; } };
  };
  bindSlider('#widgetBorderWidth', '#widgetBorderWidthN', 'widgetBorderWidth', 4);
  bindSlider('#widgetRadius',      '#widgetRadiusN',      'widgetRadius',      24);
  bindSlider('#widgetShadow',      '#widgetShadowN',      'widgetShadow',      100);
  bindSlider('#glassBlur',         '#glassBlurN',         'glassBlur',         60);
  bindSlider('#glassAlpha',        '#glassAlphaN',        'glassAlpha',        90);
  bindSlider('#zoom',              '#zoomN',              'zoom',              150, 60);

  // Surface style segmented control
  const surfaceSeg = panel.querySelector('[data-control="surfaceStyle"]');
  function updateSurfaceActive() {
    if (!surfaceSeg) return;
    surfaceSeg.querySelectorAll('button').forEach(b =>
      b.classList.toggle('active', b.dataset.value === (t.surfaceStyle || 'flat')));
  }
  if (surfaceSeg) {
    surfaceSeg.querySelectorAll('button').forEach(b => {
      b.addEventListener('click', () => {
        t.surfaceStyle = b.dataset.value;
        applyTheme();
        updateSurfaceActive();
        updateSeg();   // refresh data-show=surfaceStyle:... visibility
        saveNow();
      });
    });
    updateSurfaceActive();
  }

  // Dark mode toggle
  const darkCb = $('#darkMode');
  if (darkCb) {
    darkCb.checked = !!t.darkMode;
    darkCb.addEventListener('change', () => {
      t.darkMode = darkCb.checked;
      applyTheme();
      saveNow();
    });
  }

  // Panel-side flip button (in panel header)
  const flipBtn = document.getElementById('panel-flip');
  if (flipBtn) {
    flipBtn.addEventListener('click', () => {
      t.panelSide = t.panelSide === 'left' ? 'right' : 'left';
      applyTheme();
      saveNow();
    });
  }

  // Headers toggle
  const headers = $('#showHeaders');
  const trafficCb = $('#trafficLights');
  const updateTrafficState = () => {
    const enabled = headers.checked;
    trafficCb.disabled = !enabled;
    trafficCb.closest('.row').classList.toggle('disabled', !enabled);
  };
  headers.checked = !!t.showHeaders;
  trafficCb.checked = !!t.trafficLights;
  updateTrafficState();
  headers.addEventListener('change', () => {
    t.showHeaders = headers.checked;
    applyTheme();
    saveNow();
    updateTrafficState();
  });
  trafficCb.addEventListener('change', () => {
    t.trafficLights = trafficCb.checked;
    applyTheme();
    saveNow();
  });

  // Per-control reset
  panel.querySelectorAll('.reset-btn[data-reset]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.reset;
      t[key] = defaults[key];
      if (colorControls[key]) colorControls[key].refresh();
      if (sliders[key])       sliders[key].refresh();
      applyTheme();
      saveNow();
    });
  });

  // Reset everything
  $('#themeReset').addEventListener('click', () => {
    Object.assign(t, defaultTheme());
    Object.keys(colorControls).forEach(k => colorControls[k].refresh());
    Object.keys(sliders).forEach(k => sliders[k].refresh());
    $('#showHeaders').checked = !!t.showHeaders;
    if ($('#trafficLights')) $('#trafficLights').checked = !!t.trafficLights;
    if ($('#darkMode'))      $('#darkMode').checked      = !!t.darkMode;
    updateSurfaceActive();
    refreshImagePreview();
    applyTheme(); updateSeg(); saveNow();
  });

  // Font family select — bind to the theme state and re-apply on change.
  // Exposes `updateSeg` globally so the custom-font upload handler can
  // refresh `data-show=fontFamily:...` visibility after setting fontFamily.
  window._updateSeg = updateSeg;

  // Render theme preset cards and expose a refresh hook the preset
  // applier uses to re-sync side-panel controls after a one-click apply.
  renderThemePresets();
  window._refreshThemePanel = () => {
    Object.keys(colorControls).forEach(k => colorControls[k].refresh());
    Object.keys(sliders).forEach(k => sliders[k].refresh());
    const sh = panel.querySelector('#showHeaders'); if (sh) sh.checked = !!t.showHeaders;
    const tl = panel.querySelector('#trafficLights'); if (tl) tl.checked = !!t.trafficLights;
    const dm = panel.querySelector('#darkMode'); if (dm) dm.checked = !!t.darkMode;
    const ff = panel.querySelector('#fontFamily'); if (ff) ff.value = t.fontFamily || 'system';
    updateSurfaceActive();
    refreshImagePreview();
    updateSeg();
  };

  const fontSel = panel.querySelector('#fontFamily');
  if (fontSel) {
    fontSel.value = t.fontFamily || 'system';
    fontSel.addEventListener('change', () => {
      t.fontFamily = fontSel.value;
      applyTheme();
      updateSeg();
      saveNow();
    });
  }
  // updateSeg() already iterates every [data-show] element, so fontFamily
  // changes are picked up automatically — no extra wiring needed here.

  updateSeg();
}

// ----- Boot -----
// ----- Quick-access spawn toolbar -----
// Vertical stack of round buttons under the Edit toggle. Each pinned widget
// type gets a round icon button that spawns a new instance at viewport
// center when clicked. The "+" button at the bottom opens a small picker
// where users toggle which widgets they want pinned. Hidden in edit mode
// because the side panel is the canonical place to add widgets there.

// Spawn a new widget at viewport center with sensible defaults. Used by the
// quick-access toolbar — adds the widget to state, renders it, persists.
function spawnWidget(type) {
  const def = registry.get(type);
  if (!def) return;
  const sz = def.defaultSize;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const x = Math.max(40, snap((vw - sz.w) / 2));
  const y = Math.max(80, snap((vh - sz.h) / 2));
  state.maxZ = (state.maxZ || 0) + 1;
  const widget = makeWidget(type, { x, y, z: state.maxZ });
  if (def.autoNumber) widget.title = nextAutoTitle(type);
  state.widgets.push(widget);
  renderWidget(widget);
  scheduleSave();
  document.dispatchEvent(new CustomEvent('tessra:widget-spawned', { detail: { type } }));
}

function toggleQuickAccess(type) {
  if (!Array.isArray(state.quickSpawn)) state.quickSpawn = [];
  const i = state.quickSpawn.indexOf(type);
  if (i >= 0) state.quickSpawn.splice(i, 1);
  else state.quickSpawn.push(type);
  renderQuickAccess();
  renderQuickPicker(); // keep the picker grid in sync if open
  scheduleSave();
}

function renderQuickAccess() {
  const host = document.getElementById('quick-access');
  if (!host) return;
  const types = (state.quickSpawn || []).filter(t => registry.has(t));
  let html = '';
  types.forEach(t => {
    const def = registry.get(t);
    html += `<button class="qa-btn" data-type="${t}" title="Spawn ${def.title}">${def.icon || '◻'}</button>`;
  });
  html += '<button class="qa-btn qa-add" id="qa-add-btn" title="Add widget to quick access" aria-label="Add widget to quick access">+</button>';
  host.innerHTML = html;
  host.querySelectorAll('.qa-btn[data-type]').forEach(btn => {
    btn.addEventListener('click', () => spawnWidget(btn.dataset.type));
    // Right-click to quickly unpin without opening the picker
    btn.addEventListener('contextmenu', e => {
      e.preventDefault();
      toggleQuickAccess(btn.dataset.type);
    });
  });
  const addBtn = document.getElementById('qa-add-btn');
  if (addBtn) addBtn.addEventListener('click', toggleQuickPicker);
}

function renderQuickPicker() {
  const host = document.getElementById('quick-picker');
  if (!host) return;
  const pinned = new Set(state.quickSpawn || []);
  let html = '<div class="qp-title">Pin to quick access</div><div class="qp-grid">';
  registry.all().forEach(def => {
    const active = pinned.has(def.type);
    html += `
      <button class="qp-card ${active ? 'qp-active' : ''}" data-type="${def.type}" title="${active ? 'Remove from quick access' : 'Add to quick access'}">
        <div class="qp-icon">${def.icon || '◻'}</div>
        <div class="qp-label">${def.title}</div>
      </button>`;
  });
  html += '</div>';
  host.innerHTML = html;
  host.querySelectorAll('.qp-card').forEach(card => {
    card.addEventListener('click', () => toggleQuickAccess(card.dataset.type));
  });
}

function toggleQuickPicker() {
  const picker = document.getElementById('quick-picker');
  if (!picker) return;
  if (!picker.classList.contains('hidden')) {
    picker.classList.add('hidden');
    return;
  }
  renderQuickPicker();
  picker.classList.remove('hidden');
  // Position to the left of the add button so it doesn't go off-screen.
  // Anchor by the add button's bottom-right corner.
  const addBtn = document.getElementById('qa-add-btn');
  if (addBtn) {
    const z = zoomFactor();
    const rect = addBtn.getBoundingClientRect();
    picker.style.top   = (rect.bottom / z + 8) + 'px';
    picker.style.right = ((window.innerWidth - rect.right) / z) + 'px';
  }
  // Outside-click closer. Defer so the click that opened the picker doesn't
  // immediately close it.
  setTimeout(() => {
    const close = e => {
      if (picker.contains(e.target)) return;
      if (e.target.id === 'qa-add-btn') return;
      picker.classList.add('hidden');
      document.removeEventListener('mousedown', close);
    };
    document.addEventListener('mousedown', close);
  }, 0);
}

// ----- Preset import / export -----
// Export = JSON snapshot of the same shape serialize() emits, wrapped with a
// small envelope (format, version, exportedAt) so future versions can detect
// shape mismatches. Import accepts either the bare state or the wrapped form
// and runs everything through migrate() so older exports stay valid.

const PRESET_FORMAT  = 'tessra-layout';
const PRESET_VERSION = 1;

function exportLayout() {
  const payload = {
    format:     PRESET_FORMAT,
    version:    PRESET_VERSION,
    exportedAt: new Date().toISOString(),
    state:      serialize()
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tessra-layout-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revoke so Firefox's download manager finishes reading the blob
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function importLayoutFromFile(file) {
  let parsed;
  try {
    const text = await file.text();
    parsed = JSON.parse(text);
  } catch {
    alert('Could not parse the file — make sure it is a valid Tessra JSON layout.');
    return;
  }
  // Accept both the wrapped { format, version, state } and the bare state
  // shape (so users can paste in a serialize() output directly).
  let stateLike = parsed;
  if (parsed && parsed.format === PRESET_FORMAT && parsed.state) {
    stateLike = parsed.state;
  }
  if (!stateLike || !Array.isArray(stateLike.widgets)) {
    alert('That file does not look like a Tessra layout.');
    return;
  }
  if (!confirm('Importing will replace your current layout. Continue?')) return;

  // Tear down every existing widget cleanly so timers/listeners don't leak.
  document.querySelectorAll('#board .widget').forEach(node => {
    if (node._cleanups) node._cleanups.forEach(fn => { try { fn(); } catch {} });
    node._dragCleanup?.();
    node._resizeCleanup?.();
    node.remove();
  });
  clearSelection();
  clearSnapGuides();

  // Replace state, run through migrate() so any legacy fields are normalized
  // against the current widget registry. Save immediately so a refresh
  // before any further action preserves the import.
  state = migrate(stateLike);
  if (!state.theme) state.theme = defaultTheme();

  applyTheme();
  state.widgets.forEach(renderWidget);
  populateCatalog();
  renderQuickAccess();
  saveNow();

  // The theme controls in the side panel hold cached refs from bindTheme();
  // reload is the simplest way to make the panel reflect the new state.
  // Delay so the save commits to storage first.
  setTimeout(() => window.location.reload(), 250);
}

function setupPresetIO() {
  const exportBtn = document.getElementById('preset-export');
  const importBtn = document.getElementById('preset-import');
  const fileIn    = document.getElementById('preset-import-file');
  const shareCopyBtn  = document.getElementById('preset-share-copy');
  const sharePasteBtn = document.getElementById('preset-share-paste');
  if (!exportBtn || !importBtn || !fileIn) return;
  exportBtn.addEventListener('click', exportLayout);
  importBtn.addEventListener('click', () => fileIn.click());
  fileIn.addEventListener('change', e => {
    const f = e.target.files && e.target.files[0];
    if (f) importLayoutFromFile(f);
    fileIn.value = '';   // allow re-importing the same file
  });
  if (shareCopyBtn) shareCopyBtn.addEventListener('click', copyShareString);
  if (sharePasteBtn) sharePasteBtn.addEventListener('click', pasteShareString);
  const arrangeBtn = document.getElementById('layout-arrange');
  if (arrangeBtn) arrangeBtn.addEventListener('click', autoArrange);
}

// ----- Shareable layout strings -----
// Compact base64 encoding of the layout JSON. Prefixed with 'gz:' when we
// can compress, 'raw:' otherwise — decode is forward-compatible.

async function encodeShareString() {
  const payload = JSON.stringify({
    format: PRESET_FORMAT, version: PRESET_VERSION, state: serialize()
  });
  if (typeof CompressionStream !== 'undefined') {
    try {
      const stream = new Blob([payload]).stream().pipeThrough(new CompressionStream('gzip'));
      const buf = await new Response(stream).arrayBuffer();
      let bin = '';
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      return 'tessra1:gz:' + btoa(bin);
    } catch { /* fall through to raw */ }
  }
  return 'tessra1:raw:' + btoa(unescape(encodeURIComponent(payload)));
}

async function decodeShareString(s) {
  s = (s || '').trim();
  // Accept the bare base64 too — try gz first, then raw
  let body = s;
  let mode = 'raw';
  const m = /^tessra1:(gz|raw):(.+)$/i.exec(s);
  if (m) { mode = m[1]; body = m[2]; }
  if (mode === 'gz' && typeof DecompressionStream !== 'undefined') {
    const bin = atob(body);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    const text = await new Response(stream).text();
    return JSON.parse(text);
  }
  // Raw base64
  return JSON.parse(decodeURIComponent(escape(atob(body))));
}

async function copyShareString() {
  try {
    const s = await encodeShareString();
    await navigator.clipboard.writeText(s);
    flashButton('preset-share-copy', 'Copied!');
  } catch (err) {
    alert('Could not copy: ' + (err.message || 'clipboard unavailable'));
  }
}

async function pasteShareString() {
  // Try reading clipboard first; fall back to prompt if blocked.
  let s = '';
  try {
    s = await navigator.clipboard.readText();
  } catch { /* permission denied or unsupported — prompt instead */ }
  if (!s) s = prompt('Paste a Tessra share string:') || '';
  s = s.trim();
  if (!s) return;
  let parsed;
  try {
    parsed = await decodeShareString(s);
  } catch (err) {
    alert('Could not decode share string: ' + (err.message || 'invalid format'));
    return;
  }
  const stateLike = (parsed && parsed.format === PRESET_FORMAT && parsed.state) ? parsed.state : parsed;
  if (!stateLike || !Array.isArray(stateLike.widgets)) {
    alert('Decoded payload does not look like a Tessra layout.');
    return;
  }
  if (!confirm('Importing will replace your current layout. Continue?')) return;
  document.querySelectorAll('#board .widget').forEach(node => {
    if (node._cleanups) node._cleanups.forEach(fn => { try { fn(); } catch {} });
    node._dragCleanup?.();
    node._resizeCleanup?.();
    node.remove();
  });
  clearSelection();
  clearSnapGuides();
  state = migrate(stateLike);
  if (!state.theme) state.theme = defaultTheme();
  applyTheme();
  state.widgets.forEach(renderWidget);
  populateCatalog();
  renderQuickAccess();
  saveNow();
  setTimeout(() => window.location.reload(), 250);
}

function flashButton(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  const original = el.textContent;
  el.textContent = msg;
  el.disabled = true;
  setTimeout(() => { el.textContent = original; el.disabled = false; }, 1200);
}

// ----- Z-order popover -----
let zOrderTarget = null;
function openZOrderPopover(anchor, w, node) {
  const pop = document.getElementById('zorder-popover');
  if (!pop) return;
  zOrderTarget = { w, node };
  const z = zoomFactor();
  const rect = anchor.getBoundingClientRect();
  pop.style.top   = (rect.bottom / z + 4) + 'px';
  pop.style.right = ((window.innerWidth - rect.right) / z) + 'px';
  pop.classList.remove('hidden');
  setTimeout(() => {
    const close = e => {
      if (pop.contains(e.target) || e.target === anchor) return;
      pop.classList.add('hidden');
      zOrderTarget = null;
      document.removeEventListener('mousedown', close);
    };
    document.addEventListener('mousedown', close);
  }, 0);
}
function setupZOrderPopover() {
  const pop = document.getElementById('zorder-popover');
  if (!pop) return;
  pop.querySelectorAll('.zorder-item').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!zOrderTarget) return;
      const { w, node } = zOrderTarget;
      if (btn.dataset.action === 'front') bringToFront(w, node);
      else if (btn.dataset.action === 'back') sendToBack(w);
      scheduleSave();
      pop.classList.add('hidden');
      zOrderTarget = null;
    });
  });
}

// ----- Font upload (Custom font picker) -----
function setupFontUpload() {
  const btn  = document.getElementById('fontUploadBtn');
  const clr  = document.getElementById('fontUploadClear');
  const file = document.getElementById('fontUploadFile');
  if (!btn || !clr || !file) return;
  function refreshClear() {
    clr.disabled = !state.theme.customFontDataUrl;
    clr.textContent = state.theme.customFontDataUrl ? `Clear (${state.theme.customFontName || 'custom'})` : 'Clear';
  }
  btn.addEventListener('click', () => file.click());
  file.addEventListener('change', async e => {
    const f = e.target.files && e.target.files[0];
    file.value = '';
    if (!f) return;
    // 4 MB cap so we don't blow up localStorage with a 10 MB font
    if (f.size > 4 * 1024 * 1024) {
      alert('Font file is too large (>4 MB). Storage would balloon — please pick a smaller .woff2.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      state.theme.customFontDataUrl = reader.result;
      state.theme.customFontName = f.name;
      state.theme.fontFamily = 'custom';
      applyTheme();
      // Reflect in the select widget
      const sel = document.getElementById('fontFamily');
      if (sel) sel.value = 'custom';
      // Toggle visibility rows
      const updateSeg = window._updateSeg;
      if (typeof updateSeg === 'function') updateSeg();
      refreshClear();
      scheduleSave();
    };
    reader.readAsDataURL(f);
  });
  clr.addEventListener('click', () => {
    state.theme.customFontDataUrl = null;
    state.theme.customFontName = null;
    if (state.theme.fontFamily === 'custom') state.theme.fontFamily = 'system';
    applyTheme();
    const sel = document.getElementById('fontFamily');
    if (sel) sel.value = state.theme.fontFamily;
    refreshClear();
    scheduleSave();
  });
  refreshClear();
}

// ----- Command palette (⌘K / Ctrl+K) -----
// Fuzzy-search across all available commands: add-widget shortcuts for every
// registered type, plus a handful of layout/theme actions. Up/Down to
// navigate, Enter to run, Esc to close.
function buildCommandList() {
  const cmds = [];
  cmds.push(
    { id: 'auto-arrange', label: 'Auto-arrange widgets into a grid',  hint: '',      run: () => autoArrange() },
    { id: 'duplicate',    label: 'Duplicate selected widget',         hint: '⌘D',    run: () => duplicateSelected() },
    { id: 'copy',         label: 'Copy selected widget',              hint: '⌘C',    run: () => copySelectedToClipboard() },
    { id: 'paste',        label: 'Paste widget from clipboard',       hint: '⌘V',    run: () => pasteFromClipboard() },
    { id: 'edit-toggle',  label: 'Toggle edit mode',                  hint: 'E',     run: () => setEditMode(!document.body.classList.contains('edit-mode')) },
    { id: 'open-theme',   label: 'Open Theme tab',                    hint: 'T',     run: () => { setEditMode(true); selectPanelTab('theme'); } },
    { id: 'open-presets', label: 'Open Presets tab',                  hint: '',      run: () => { setEditMode(true); selectPanelTab('presets'); } },
    { id: 'dark-toggle',  label: 'Toggle dark mode',                  hint: '',      run: () => { state.theme.darkMode = !state.theme.darkMode; applyTheme(); const dm = document.getElementById('darkMode'); if (dm) dm.checked = !!state.theme.darkMode; scheduleSave(); } },
    { id: 'theme-reset',  label: 'Reset theme to defaults',           hint: '',      run: () => { Object.assign(state.theme, defaultTheme()); applyTheme(); scheduleSave(); window.location.reload(); } },
    { id: 'export',       label: 'Export layout as file…',            hint: '',      run: () => exportLayout() },
    { id: 'import',       label: 'Import layout from file…',          hint: '',      run: () => { const f = document.getElementById('preset-import-file'); if (f) f.click(); } },
    { id: 'share-copy',   label: 'Copy layout as share string',       hint: '',      run: () => copyShareString() },
    { id: 'share-paste',  label: 'Paste a share string…',             hint: '',      run: () => pasteShareString() },
    { id: 'panel-toggle', label: 'Open the side panel',               hint: '',      run: () => setEditMode(true) },
  );
  registry.all().forEach(def => {
    cmds.push({
      id: 'spawn-' + def.type,
      label: `Add ${def.title}`,
      hint: def.category || 'widget',
      iconHtml: def.icon || '◻',
      run: () => spawnWidget(def.type)
    });
  });
  return cmds;
}

// Simple subsequence fuzzy match: characters of `q` appear in order in the
// haystack. Score by how tightly they cluster (lower index gap = better).
function fuzzyScore(haystack, q) {
  if (!q) return 0;
  const h = haystack.toLowerCase();
  const needle = q.toLowerCase();
  let hi = 0, score = 0, lastMatch = -1;
  for (let i = 0; i < needle.length; i++) {
    const c = needle[i];
    const found = h.indexOf(c, hi);
    if (found < 0) return -1;
    if (lastMatch >= 0) score -= (found - lastMatch - 1);
    if (found === 0 || h[found - 1] === ' ') score += 5;  // word-start bonus
    lastMatch = found;
    hi = found + 1;
  }
  score += 100 - h.length; // shorter labels score higher
  return score;
}

function setupCommandPalette() {
  const palette = document.getElementById('cmd-palette');
  const input   = palette ? palette.querySelector('.cmd-input') : null;
  const results = palette ? palette.querySelector('.cmd-results') : null;
  if (!palette || !input || !results) return;
  let activeIdx = 0;
  let visible   = false;
  let lastList  = [];

  function close() {
    palette.classList.add('hidden');
    visible = false;
    input.value = '';
  }
  function open() {
    palette.classList.remove('hidden');
    visible = true;
    input.value = '';
    activeIdx = 0;
    render();
    setTimeout(() => input.focus(), 0);
  }
  function render() {
    const q = input.value.trim();
    const all = buildCommandList();
    const scored = all.map(c => ({ c, s: fuzzyScore(c.label, q) }))
      .filter(x => x.s >= 0 || !q)
      .sort((a, b) => b.s - a.s)
      .slice(0, 30)
      .map(x => x.c);
    lastList = scored;
    if (activeIdx >= scored.length) activeIdx = 0;
    if (!scored.length) {
      results.innerHTML = '<div class="cmd-empty">No matches</div>';
      return;
    }
    results.innerHTML = scored.map((c, i) => `
      <button class="cmd-item ${i === activeIdx ? 'cmd-active' : ''}" data-i="${i}" type="button">
        <span class="cmd-icon">${c.iconHtml || '·'}</span>
        <span class="cmd-label">${escapeHtml(c.label)}</span>
        ${c.hint ? `<span class="cmd-hint-tag">${escapeHtml(c.hint)}</span>` : ''}
      </button>`).join('');
    results.querySelectorAll('.cmd-item').forEach(btn => {
      btn.addEventListener('mousedown', e => e.preventDefault()); // keep input focused
      btn.addEventListener('click', () => {
        activeIdx = +btn.dataset.i;
        run();
      });
    });
  }
  function run() {
    const c = lastList[activeIdx];
    if (!c) return;
    close();
    try { c.run(); } catch (err) { console.error('[Tessra cmd]', err); }
  }
  function moveActive(delta) {
    if (!lastList.length) return;
    activeIdx = (activeIdx + delta + lastList.length) % lastList.length;
    render();
    const el = results.querySelector('.cmd-active');
    if (el) el.scrollIntoView({ block: 'nearest' });
  }

  input.addEventListener('input', render);
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); moveActive(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); moveActive(-1); }
    else if (e.key === 'Enter')   { e.preventDefault(); run(); }
    else if (e.key === 'Escape')  { e.preventDefault(); close(); }
  });
  document.addEventListener('mousedown', e => {
    if (!visible) return;
    if (palette.contains(e.target)) return;
    close();
  });
  // Global hotkey
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (visible) close(); else open();
    }
  });
}

// (escapeHtml is imported from ./utils.js at the top of this module — reused
//  here by setupCommandPalette to escape command labels.)

// ----- Onboarding -----
// First-launch flow. The user picks between "I know what I'm doing" (skip
// everything) or "Guided tour" (5 short bubble steps pointing at the most
// important UI elements). Either path marks onboardingComplete and persists
// it so the modal never reappears. Existing users (whose state already has
// other fields) get auto-skipped via migrate() defaulting the flag to true.

const TOUR_STEPS = [
  {
    target: () => document.getElementById('edit-toggle'),
    placement: 'bottom',
    html: 'Click <strong>Edit</strong> (top-right) to open the side panel with widgets and theme controls. Press <kbd>E</kbd> anywhere to toggle it.',
    before: () => setEditMode(false),
    // Auto-advance the moment they click the Edit button — no need to also
    // press Next.
    advanceOn: { event: 'click', selector: '#edit-toggle' }
  },
  {
    target: () => document.querySelector('#side-panel .panel-tab[data-tab="widgets"]'),
    placement: 'left',
    html: 'The <strong>Widgets</strong> tab lists everything you can add, grouped by category. <strong>Drag a card onto the page</strong> to place a widget.',
    before: () => { setEditMode(true); selectPanelTab('widgets'); },
    // Dispatched by dropGhost when a widget is successfully spawned from
    // the catalog — advances automatically as soon as the user drops one.
    advanceOn: { event: 'tessra:widget-spawned' }
  },
  {
    target: () => document.getElementById('quick-access'),
    placement: 'left',
    html: 'Under the Edit button sits the <strong>quick-access toolbar</strong>. One click spawns the pinned widget. The <strong>+</strong> button lets you pin more.',
    before: () => setEditMode(false)
  },
  {
    target: null,
    placement: 'center',
    html: 'Press <kbd>⌘K</kbd> (or <kbd>Ctrl+K</kbd>) anywhere to open the <strong>command palette</strong> — fuzzy-search every widget and action in one place.'
  },
  {
    target: null,
    placement: 'center',
    html: 'Almost done. Pick a starting theme:',
    choices: [
      { label: '☀ Light', run: () => { state.theme.darkMode = false; applyTheme(); } },
      { label: '☾ Dark',  run: () => { state.theme.darkMode = true;  applyTheme(); } }
    ],
    // Don't finish the tour after this choice — go on to the surface step
    choiceAdvances: true
  },
  {
    target: null,
    placement: 'center',
    html: 'And how should widgets look? Pick a <strong>surface style</strong> (you can change it later in the Theme tab):',
    customRender: (textEl, choicesEl, finish) => {
      choicesEl.innerHTML = `
        <div class="tour-surface-grid">
          ${['flat','glass','liquid'].map(v => `
            <button class="tour-surface" data-value="${v}">
              <div class="ts-mock ts-mock-${v}">
                <div class="ts-rect ts-rect-a"></div>
                <div class="ts-rect ts-rect-b"></div>
              </div>
              <span class="ts-label">${v.charAt(0).toUpperCase()}${v.slice(1)}</span>
            </button>`).join('')}
        </div>`;
      choicesEl.querySelectorAll('.tour-surface').forEach(btn => {
        btn.addEventListener('click', () => {
          state.theme.surfaceStyle = btn.dataset.value;
          applyTheme();
          finish();
        });
      });
    }
  }
];

function selectPanelTab(name) {
  const panel = document.getElementById('side-panel');
  if (!panel) return;
  panel.querySelectorAll('.panel-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  panel.querySelectorAll('.panel-pane').forEach(p => p.classList.toggle('hidden', p.dataset.pane !== name));
}

function finishOnboarding() {
  document.getElementById('onboarding-modal')?.classList.add('hidden');
  document.getElementById('onboarding-tour')?.classList.add('hidden');
  if (state && state.onboardingComplete !== true) {
    state.onboardingComplete = true;
    saveNow();
  }
}

function positionBalloon(balloon, target, placement) {
  const arrow = balloon.querySelector('.tour-arrow');
  // Reset arrow position so previous step's inline overrides don't leak
  if (arrow) { arrow.style.left = ''; arrow.style.top = ''; arrow.style.marginLeft = ''; arrow.style.marginTop = ''; }

  // Hide while we measure so the user doesn't see the balloon flash at its
  // pre-measurement coords (was previously appearing at top-left for one
  // frame before snapping into place).
  balloon.style.visibility = 'hidden';

  if (!target || placement === 'center') {
    balloon.dataset.placement = 'center';
    balloon.style.left = '50%';
    balloon.style.top  = '40%';
    balloon.style.transform = 'translate(-50%, -50%)';
    balloon.style.visibility = 'visible';
    return;
  }
  balloon.style.transform = '';
  balloon.dataset.placement = placement;
  const tr = target.getBoundingClientRect();
  const bw = balloon.offsetWidth;
  const bh = balloon.offsetHeight;
  const gap = 14;
  let left = 0, top = 0;
  if (placement === 'bottom') {
    left = tr.left + tr.width / 2 - bw / 2;
    top  = tr.bottom + gap;
  } else if (placement === 'top') {
    left = tr.left + tr.width / 2 - bw / 2;
    top  = tr.top - bh - gap;
  } else if (placement === 'left') {
    left = tr.left - bw - gap;
    top  = tr.top + tr.height / 2 - bh / 2;
  } else if (placement === 'right') {
    left = tr.right + gap;
    top  = tr.top + tr.height / 2 - bh / 2;
  }
  // Clamp to viewport with 8 px gutter
  const M = 8;
  left = Math.max(M, Math.min(window.innerWidth  - bw - M, left));
  top  = Math.max(M, Math.min(window.innerHeight - bh - M, top));
  balloon.style.left = left + 'px';
  balloon.style.top  = top  + 'px';

  // After clamping, the balloon may have slid sideways to fit the viewport
  // (especially under right-edge anchors like the Edit button). The arrow
  // would then no longer line up with the target — re-pin it to the target
  // center, expressed relative to the balloon's final position.
  if (arrow) {
    const targetCx = tr.left + tr.width / 2;
    const targetCy = tr.top  + tr.height / 2;
    const ARROW_INSET = 14;   // keep arrow off the very corners
    if (placement === 'bottom' || placement === 'top') {
      let ax = targetCx - left;
      ax = Math.max(ARROW_INSET, Math.min(bw - ARROW_INSET, ax));
      arrow.style.left = ax + 'px';
      arrow.style.marginLeft = '-6px';
    } else if (placement === 'left' || placement === 'right') {
      let ay = targetCy - top;
      ay = Math.max(ARROW_INSET, Math.min(bh - ARROW_INSET, ay));
      arrow.style.top = ay + 'px';
      arrow.style.marginTop = '-6px';
    }
  }
  balloon.style.visibility = 'visible';
}

// Spotlight cutout — wraps around the target so the dim doesn't cover the
// thing being explained. When target is null, collapses to zero-size at the
// viewport center so the box-shadow uniformly dims everything.
function positionSpotlight(spotlight, target) {
  if (!spotlight) return;
  if (!target) {
    // Zero-size at the screen center — shadow covers everything, no cutout
    spotlight.style.left = '50%';
    spotlight.style.top  = '50%';
    spotlight.style.width = '0px';
    spotlight.style.height = '0px';
    return;
  }
  const PAD = 6;
  const r = target.getBoundingClientRect();
  spotlight.style.left   = (r.left - PAD) + 'px';
  spotlight.style.top    = (r.top  - PAD) + 'px';
  spotlight.style.width  = (r.width  + PAD * 2) + 'px';
  spotlight.style.height = (r.height + PAD * 2) + 'px';
}

function startGuidedTour() {
  const tour = document.getElementById('onboarding-tour');
  if (!tour) { finishOnboarding(); return; }
  document.getElementById('onboarding-modal')?.classList.add('hidden');
  tour.classList.remove('hidden');

  const balloon   = tour.querySelector('.tour-balloon');
  const spotlight = tour.querySelector('.tour-spotlight');
  const textEl    = tour.querySelector('.tour-text');
  const choicesEl = tour.querySelector('.tour-choices');
  const counter   = tour.querySelector('.tour-counter');
  const nextBtn   = tour.querySelector('.tour-next');
  const skipBtn   = tour.querySelector('.tour-skip');
  let idx = 0;
  // Per-step auto-advance teardown — removed when the step ends so a Next
  // click that follows a click on the target doesn't re-fire.
  let stepCleanup = null;

  function advance() {
    if (stepCleanup) { stepCleanup(); stepCleanup = null; }
    idx++;
    if (idx >= TOUR_STEPS.length) { cleanup(); finishOnboarding(); return; }
    show(idx);
  }

  async function show(i) {
    const step = TOUR_STEPS[i];
    if (!step) { finishOnboarding(); return; }
    if (typeof step.before === 'function') {
      try { step.before(); } catch (e) { console.warn('[Tessra tour]', e); }
      await new Promise(r => setTimeout(r, 280)); // wait for the panel transition
    }
    textEl.innerHTML = step.html;
    counter.textContent = `${i + 1} / ${TOUR_STEPS.length}`;

    // Inline choices replace the Next button on relevant steps. Custom
    // renderers get full control over the choices area; plain choices use
    // simple label buttons that finish (or advance) on click.
    choicesEl.innerHTML = '';
    if (typeof step.customRender === 'function') {
      step.customRender(textEl, choicesEl, () => {
        // The custom render's finish callback should end the tour entirely
        cleanup();
        finishOnboarding();
      });
      choicesEl.style.display = '';
      nextBtn.style.display = 'none';
    } else if (Array.isArray(step.choices) && step.choices.length) {
      const isLastStep = i === TOUR_STEPS.length - 1;
      step.choices.forEach(opt => {
        const b = document.createElement('button');
        b.className = 'tour-choice';
        b.textContent = opt.label;
        b.addEventListener('click', () => {
          try { opt.run(); } catch (e) { console.warn('[Tessra tour]', e); }
          if (step.choiceAdvances && !isLastStep) {
            advance();
          } else {
            cleanup();
            finishOnboarding();
          }
        });
        choicesEl.appendChild(b);
      });
      choicesEl.style.display = '';
      nextBtn.style.display = 'none';
    } else {
      choicesEl.style.display = 'none';
      nextBtn.style.display = '';
      nextBtn.textContent = i === TOUR_STEPS.length - 1 ? 'Finish' : 'Next';
    }

    const target = typeof step.target === 'function' ? step.target() : null;
    // Position spotlight first, then balloon — so the balloon's measurement
    // happens after the spotlight is in its final spot (no layout cascade).
    positionSpotlight(spotlight, target);
    positionBalloon(balloon, target, step.placement || 'bottom');

    // Auto-advance listener — fires once when the configured event matches.
    // Removed by stepCleanup() whenever the step ends (manual Next, choice
    // click, finish, or skip), so we never re-fire across steps.
    if (step.advanceOn) {
      const { event, selector } = step.advanceOn;
      const handler = e => {
        if (selector && !(e.target && e.target.closest && e.target.closest(selector))) return;
        // Small delay so the click's own action (e.g. opening the panel)
        // completes before the next step's before() runs.
        setTimeout(() => advance(), 150);
        document.removeEventListener(event, handler, true);
      };
      document.addEventListener(event, handler, true);
      stepCleanup = () => document.removeEventListener(event, handler, true);
    }
  }

  const escHandler = e => {
    if (e.key === 'Escape') { e.preventDefault(); cleanup(); finishOnboarding(); }
  };
  const resizeHandler = () => {
    const step = TOUR_STEPS[idx];
    const target = step && typeof step.target === 'function' ? step.target() : null;
    positionSpotlight(spotlight, target);
    positionBalloon(balloon, target, step?.placement || 'bottom');
  };
  function cleanup() {
    if (stepCleanup) { stepCleanup(); stepCleanup = null; }
    document.removeEventListener('keydown', escHandler);
    window.removeEventListener('resize', resizeHandler);
  }
  document.addEventListener('keydown', escHandler);
  window.addEventListener('resize', resizeHandler);

  nextBtn.onclick = () => advance();
  skipBtn.onclick = () => { cleanup(); finishOnboarding(); };

  show(0);
}

function setupOnboarding() {
  if (!state || state.onboardingComplete) return;
  const modal = document.getElementById('onboarding-modal');
  if (!modal) return;
  const guidedBtn = document.getElementById('ob-guided');
  const manualBtn = document.getElementById('ob-manual');
  // Defer a beat so widgets render first — the choice card on top of a
  // half-rendered board feels jarring otherwise.
  setTimeout(() => modal.classList.remove('hidden'), 450);
  if (guidedBtn) guidedBtn.addEventListener('click', startGuidedTour);
  if (manualBtn) manualBtn.addEventListener('click', finishOnboarding);
  // Esc on the modal also dismisses (counts as manual setup)
  const escHandler = e => {
    if (e.key !== 'Escape') return;
    if (modal.classList.contains('hidden')) return;
    e.preventDefault();
    finishOnboarding();
    document.removeEventListener('keydown', escHandler);
  };
  document.addEventListener('keydown', escHandler);
}

// ----- Page-level marquee (visual only — no actual selection) -----
// Click-and-drag on empty page background draws the classic desktop rubber
// band. `pointer-events: none` on the rect means it never blocks anything;
// `setInteracting` pauses backdrop-filter blur during the drag for the same
// frame-rate reasons as widget drag.
function setupPageMarquee() {
  const rect = document.createElement('div');
  rect.id = 'page-marquee';
  document.body.appendChild(rect);
  // Ignore clicks that start on anything that isn't bare page.
  const SKIP_SELECTOR = '.widget, #side-panel, #edit-toggle, #quick-access, #quick-picker, #color-popover, #settings-popover, .drag-ghost, .author-footer, button, input, textarea, a, select';
  let dragging = false;
  let originX = 0, originY = 0;

  document.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    if (e.target.closest(SKIP_SELECTOR)) return;
    originX = e.clientX; originY = e.clientY;
    dragging = true;
    rect.classList.add('active');
    const z0 = zoomFactor();
    rect.style.left = (originX / z0) + 'px';
    rect.style.top  = (originY / z0) + 'px';
    rect.style.width = '0px';
    rect.style.height = '0px';
    // Suppress text selection that would normally accompany a drag on body
    document.body.style.userSelect = 'none';
    setInteracting(true);
  });
  window.addEventListener('mousemove', e => {
    if (!dragging) return;
    const z = zoomFactor();
    const x = Math.min(originX, e.clientX) / z;
    const y = Math.min(originY, e.clientY) / z;
    const w = Math.abs(e.clientX - originX) / z;
    const h = Math.abs(e.clientY - originY) / z;
    rect.style.left = x + 'px';
    rect.style.top  = y + 'px';
    rect.style.width  = w + 'px';
    rect.style.height = h + 'px';
  });
  window.addEventListener('mouseup', e => {
    if (!dragging) return;
    dragging = false;
    rect.classList.remove('active');
    document.body.style.userSelect = '';
    setInteracting(false);

    // Selection commit. A zero-area marquee (a plain click on empty page)
    // clears the selection; anything bigger box-selects every widget whose
    // AABB intersects the marquee rect.
    const dx = Math.abs(e.clientX - originX);
    const dy = Math.abs(e.clientY - originY);
    if (dx < 3 && dy < 3) {
      clearSelection();
      return;
    }
    const boardRect = document.getElementById('board').getBoundingClientRect();
    const z1 = zoomFactor();
    const mx0 = (Math.min(originX, e.clientX) - boardRect.left) / z1;
    const my0 = (Math.min(originY, e.clientY) - boardRect.top) / z1;
    const mx1 = (Math.max(originX, e.clientX) - boardRect.left) / z1;
    const my1 = (Math.max(originY, e.clientY) - boardRect.top) / z1;
    const hits = state.widgets
      .filter(w => !(w.x + w.w < mx0 || w.x > mx1 || w.y + w.h < my0 || w.y > my1))
      .map(w => w.id);
    setSelection(hits);
  });
}

(async function init() {
  let loaded = await store.get(STORAGE_KEY);
  if (!loaded) {
    const legacy = await store.get(LEGACY_KEY);
    loaded = legacy ? migrate(legacy) : defaultState();
  } else {
    loaded = migrate(loaded);
  }
  state = loaded;
  if (!state.theme) state.theme = defaultTheme();
  applyTheme();
  populateCatalog();
  populateIntegrationsPane();
  state.widgets.forEach(renderWidget);
  bindTheme();
  setupPageMarquee();
  renderQuickAccess();
  setupPresetIO();
  setupZOrderPopover();
  setupFontUpload();
  setupCommandPalette();
  setupOnboarding();
  // Browser connectivity status — sets body.is-offline so any widget that
  // exposes a generic "offline" affordance picks it up, regardless of
  // whether a per-widget fetch has failed yet.
  const updateOnlineStatus = () => document.body.classList.toggle('is-offline', !navigator.onLine);
  window.addEventListener('online',  updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
  updateOnlineStatus();
  scheduleSave();
})();
