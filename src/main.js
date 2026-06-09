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
  surfaceStyle: 'flat'    // 'flat' | 'glass' | 'liquid'
});

function id() { return Math.random().toString(36).slice(2, 9); }
function snap(v) { return Math.round(v / GRID) * GRID; }

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
  return { maxZ: widgets.length, widgets, theme: defaultTheme() };
}

// ----- Migration -----
function migrate(s) {
  if (!s || !Array.isArray(s.widgets)) return s;
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
  });
  s.theme = Object.assign(defaultTheme(), s.theme || {});
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

// JSON-safe snapshot. Strips runtime fields (DOM refs, cleanup arrays, etc.)
function serialize() {
  return {
    maxZ: state.maxZ || 0,
    widgets: state.widgets.map(w => ({
      id: w.id, type: w.type,
      x: w.x, y: w.y, w: w.w, h: w.h,
      z: w.z || 0,
      title: w.title || undefined,
      data:     w.data     ? JSON.parse(JSON.stringify(w.data))     : undefined,
      settings: w.settings ? JSON.parse(JSON.stringify(w.settings)) : undefined
    })),
    theme: state.theme ? JSON.parse(JSON.stringify(state.theme)) : null
  };
}

let saveTimer = null;
let savedOnce = false;
function saveNow() {
  clearTimeout(saveTimer);
  saveTimer = null;
  try {
    const snapshot = serialize();
    return store.set(STORAGE_KEY, snapshot).then(() => {
      if (!savedOnce) { savedOnce = true; console.log('[Tessra] state persisted'); }
    }).catch(err => console.error('[Tessra] save failed:', err));
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
      rerender
    };
    try { def.render(body, ctx); }
    catch (err) {
      console.error(`[Tessra] render failed for "${w.type}":`, err);
      body.textContent = 'Widget error.';
    }
    node._cleanups = cleanups;
  }

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

  node.querySelector('.widget-remove').addEventListener('click', () => {
    runCleanups();
    state.widgets = state.widgets.filter(x => x.id !== w.id);
    node.remove();
    scheduleSave();
  });

  enableDrag(node, w);
  enableResize(node, w);
  board.appendChild(node);
  return node;
}

function enableDrag(node, w) {
  let startX, startY, ox, oy, dragging = false;
  const start = (clientX, clientY, target) => {
    const inEdit = document.body.classList.contains('edit-mode');
    const inWindowMode = document.body.classList.contains('always-headers');
    if (!inEdit) {
      // Outside edit mode, only allow drag from the header (window-style mode)
      if (!inWindowMode) return;
      if (!target.closest('.widget-header')) return;
    }
    if (target.closest('button, input, textarea, a, select, .widget-resize, [contenteditable]')) return;
    dragging = true;
    startX = clientX; startY = clientY;
    ox = w.x; oy = w.y;
    node.classList.add('dragging');
    bringToFront(w, node);
  };
  const move = (clientX, clientY) => {
    if (!dragging) return;
    const nx = snap(ox + (clientX - startX));
    const ny = snap(oy + (clientY - startY));
    w.x = Math.max(0, nx);
    w.y = Math.max(0, ny);
    node.style.left = w.x + 'px';
    node.style.top  = w.y + 'px';
  };
  const end = () => {
    if (!dragging) return;
    dragging = false;
    node.classList.remove('dragging');
    scheduleSave();
  };
  node.addEventListener('mousedown', e => { start(e.clientX, e.clientY, e.target); if (dragging) e.preventDefault(); });
  window.addEventListener('mousemove', e => move(e.clientX, e.clientY));
  window.addEventListener('mouseup', end);
}

function enableResize(node, w) {
  const handle = node.querySelector('.widget-resize');
  if (!handle) return;
  const def = registry.get(w.type);
  const min = (def && def.minSize) || { w: 160, h: 80 };
  const max = (def && def.maxSize) || { w: 4000, h: 4000 };

  let startX, startY, ow, oh, resizing = false;

  handle.addEventListener('mousedown', e => {
    if (!document.body.classList.contains('edit-mode')) return;
    e.preventDefault();
    e.stopPropagation(); // prevent widget drag from also starting
    resizing = true;
    startX = e.clientX; startY = e.clientY;
    ow = w.w; oh = w.h;
    node.classList.add('resizing');
    bringToFront(w, node);
  });
  window.addEventListener('mousemove', e => {
    if (!resizing) return;
    const nw = Math.max(min.w, Math.min(max.w, snap(ow + (e.clientX - startX))));
    const nh = Math.max(min.h, Math.min(max.h, snap(oh + (e.clientY - startY))));
    w.w = nw; w.h = nh;
    node.style.width  = nw + 'px';
    node.style.height = nh + 'px';
  });
  window.addEventListener('mouseup', () => {
    if (!resizing) return;
    resizing = false;
    node.classList.remove('resizing');
    scheduleSave();
  });
}

// ----- Catalog (grouped by category, with search) -----
const CATEGORY_ORDER  = ['time', 'productivity', 'web', 'info', 'developer', 'random', 'other'];
const CATEGORY_LABELS = {
  time:         'Time',
  productivity: 'Productivity',
  web:          'Web',
  info:         'Info',
  developer:    'Developer',
  random:       'Random',
  other:        'Other'
};

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
  const renderSection = (cat) => {
    const defs = byCategory[cat];
    if (!defs || !defs.length) return;
    const section = document.createElement('div');
    section.className = 'catalog-section';
    section.dataset.category = cat;
    section.innerHTML = `<h4 class="catalog-section-title">${CATEGORY_LABELS[cat] || cat}</h4>`;
    const grid = document.createElement('div');
    grid.className = 'catalog-grid';
    defs.forEach(def => {
      const card = document.createElement('div');
      card.className = 'widget-card';
      card.dataset.type  = def.type;
      card.dataset.label = (def.title || def.type).toLowerCase();
      card.innerHTML = `
        <div class="card-icon">${def.icon || '◻'}</div>
        <div class="card-label">${def.title}</div>`;
      card.addEventListener('mousedown', e => { e.preventDefault(); startCatalogDrag(def.type, e); });
      grid.appendChild(card);
    });
    section.appendChild(grid);
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
document.addEventListener('keydown', e => {
  if (/input|textarea/i.test(e.target.tagName)) return;
  if (e.key.toLowerCase() === 'e') setEditMode(!document.body.classList.contains('edit-mode'));
  if (e.key === 'Escape' && document.body.classList.contains('edit-mode')) setEditMode(false);
});

panel.querySelectorAll('.panel-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    panel.querySelectorAll('.panel-tab').forEach(t => t.classList.toggle('active', t === tab));
    panel.querySelectorAll('.panel-pane').forEach(p => {
      p.classList.toggle('hidden', p.dataset.pane !== tab.dataset.tab);
    });
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
  ghost.style.left = (e.clientX - size.w / 2) + 'px';
  ghost.style.top  = (e.clientY - size.h / 2) + 'px';
  ghost.textContent = def.title;
  ghost.classList.remove('hidden');
  document.body.style.userSelect = 'none';
}
function moveGhost(e) {
  if (!dragType) return;
  const def = registry.get(dragType);
  if (!def) return;
  const size = def.defaultSize;
  ghost.style.left = (e.clientX - size.w / 2) + 'px';
  ghost.style.top  = (e.clientY - size.h / 2) + 'px';
}
function dropGhost(e) {
  if (!dragType) return;
  const type = dragType;
  dragType = null;
  ghost.classList.add('hidden');
  document.body.style.userSelect = '';

  const panelRect = panel.getBoundingClientRect();
  const insidePanel = e.clientX >= panelRect.left && e.clientX <= panelRect.right
                   && e.clientY >= panelRect.top  && e.clientY <= panelRect.bottom;
  if (insidePanel) return;

  const def = registry.get(type);
  if (!def) return;
  const size = def.defaultSize;
  const x = Math.max(0, snap(e.clientX - size.w / 2));
  const y = Math.max(0, snap(e.clientY - size.h / 2));
  state.maxZ = (state.maxZ || 0) + 1;
  const w = makeWidget(type, { x, y, z: state.maxZ });
  if (def.autoNumber) w.title = nextAutoTitle(type);
  state.widgets.push(w);
  renderWidget(w);
  saveNow();
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
    const rect = anchor.getBoundingClientRect();
    const popW = 240, popH = 280;
    let left = rect.left - popW - 10;
    if (left < 8) left = rect.right + 10;
    let top = rect.top - 8;
    if (top + popH > window.innerHeight - 8) top = window.innerHeight - popH - 8;
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

const fieldBuilders = {
  toggle: buildToggle,
  select: buildSelect,
  slider: buildSlider,
  color:  buildColor,
  text:   buildText,
  date:   buildDate
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
    const rect = anchor.getBoundingClientRect();
    const popW = 260;
    const popH = pop.offsetHeight || 240;
    let left = rect.right - popW;
    if (left < 8) left = rect.left;
    if (left + popW > window.innerWidth - 8) left = window.innerWidth - popW - 8;
    let top = rect.bottom + 8;
    if (top + popH > window.innerHeight - 8) top = rect.top - popH - 8;
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
    // Dark mode: clear inline overrides so body.dark-mode CSS provides dark surfaces.
    // User-customized colors are preserved in state and will reappear when toggled off.
    document.documentElement.style.removeProperty('--bg');
    document.documentElement.style.removeProperty('--widget-bg');
    document.documentElement.style.removeProperty('--widget-border');
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
  const bindSlider = (rangeSel, numSel, key, max) => {
    const r = $(rangeSel), n = $(numSel);
    const set = v => {
      v = Math.max(0, Math.min(max, Math.round(+v || 0)));
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

  updateSeg();
}

// ----- Boot -----
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
  state.widgets.forEach(renderWidget);
  bindTheme();
  scheduleSave();
})();
