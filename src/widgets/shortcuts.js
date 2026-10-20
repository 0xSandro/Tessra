import { register } from '../widget-registry.js';
import { escapeHtml, isSafeUrl } from '../utils.js';

// Built-in flat icons (24×24, stroked with currentColor) a shortcut can use
// instead of the site's favicon.
const GLYPHS = {
  home:      '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  mail:      '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  chat:      '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.4A8 8 0 1 1 21 12z"/>',
  calendar:  '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  code:      '<path d="M8 8l-4 4 4 4M16 8l4 4-4 4M14 5l-4 14"/>',
  terminal:  '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9l3 3-3 3M13 15h4"/>',
  music:     '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
  video:     '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3z"/>',
  image:     '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
  news:      '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h10M7 12h10M7 16h6"/>',
  cart:      '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h9.2a1 1 0 0 0 1-.8L20 8H6.2"/>',
  bank:      '<path d="M3 10l9-6 9 6"/><path d="M5 10v8M9 10v8M15 10v8M19 10v8M3 20h18"/>',
  cloud:     '<path d="M7 18a4 4 0 0 1-.6-8A6 6 0 0 1 18 9a4.5 4.5 0 0 1-1 9z"/>',
  folder:    '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  doc:       '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  book:      '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
  star:      '<path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3l-5.5 2.9 1-6.2L3 9.6l6.2-.9z"/>',
  heart:     '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
  game:      '<rect x="2" y="7" width="20" height="11" rx="4"/><path d="M7 11v3M5.5 12.5h3M15 12h.01M18 13.5h.01"/>',
  pin:       '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  search:    '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  sliders:   '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  globe:     '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18"/>'
};

function glyphSvg(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${GLYPHS[name]}</svg>`;
}

// First user-perceived character, so a pasted string can't turn the icon
// into a word (and multi-codepoint emoji like flags/families stay whole).
function firstGrapheme(s) {
  if (typeof s !== 'string' || !s.trim()) return '';
  s = s.trim();
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    const it = new Intl.Segmenter().segment(s)[Symbol.iterator]().next();
    return it.done ? '' : it.value.segment;
  }
  return Array.from(s)[0] || '';
}

// Per-session favicon lookup results, so re-renders (every settings change)
// reuse the working source or go straight to the letter, instead of
// re-running the whole fallback chain and flickering.
const faviconFound = new Map();   // host -> working src
const faviconMissing = new Set(); // hosts where every source failed

function hostOf(url) {
  try { return new URL(url).hostname; } catch { return ''; }
}

// "github.com", "https://github.com/x" → a full http(s) URL, or null if it
// can't be one. Anything without a scheme is treated as https.
function normalizeUrl(input) {
  let s = (input || '').trim();
  if (!s) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = 'https://' + s;
  try {
    const u = new URL(s);
    if ((u.protocol !== 'http:' && u.protocol !== 'https:') || !u.hostname) return null;
    return u.href;
  } catch { return null; }
}

// Default name for a shortcut: its domain without "www.".
function defaultLabel(url) {
  return hostOf(url).replace(/^www\./, '') || url;
}

// Move arr[from] so it lands before (or after) the element currently at `to`.
function reorder(arr, from, to, after) {
  if (from === to) return;
  const [item] = arr.splice(from, 1);
  let at = to > from ? to - 1 : to;
  if (after) at++;
  arr.splice(at, 0, item);
}

// WebExtension API (absent when newtab.html is opened as a plain page).
const api = (typeof browser !== 'undefined') ? browser
          : (typeof chrome !== 'undefined' ? chrome : null);
const DRAG_TYPE = 'application/x-tessra-shortcut';

// Fill `el` with the shortcut's icon. Shared by the widget tiles and the
// settings list. `icon` comes from saved/imported data, so it's validated
// here rather than trusted: unknown glyph names and empty emoji fall back to
// the favicon.
function mountIcon(el, it) {
  const icon = it && it.icon;
  el.classList.remove('shortcut-icon-emoji', 'shortcut-icon-glyph', 'has-favicon');
  if (icon && icon.type === 'emoji' && firstGrapheme(icon.value)) {
    el.classList.add('shortcut-icon-emoji');
    el.innerHTML = escapeHtml(firstGrapheme(icon.value));
    return;
  }
  if (icon && icon.type === 'glyph' && Object.prototype.hasOwnProperty.call(GLYPHS, icon.value)) {
    el.classList.add('shortcut-icon-glyph');
    el.innerHTML = glyphSvg(icon.value);
    return;
  }
  // Website favicon: Google's favicon service first (sharp 64px icons), then
  // the site's own /favicon.ico, then a letter tile. The letter sits
  // underneath the image, so a failed load just reveals it. Listeners are
  // attached in JS — inline onerror="" would be blocked by the extension CSP.
  const label = typeof it.label === 'string' ? it.label : '';
  el.innerHTML = `<span class="shortcut-letter">${escapeHtml((label[0] || '?').toUpperCase())}</span>`;
  const host = hostOf(it.url);
  if (!host || !isSafeUrl(it.url) || faviconMissing.has(host)) return;
  const img = document.createElement('img');
  img.className = 'shortcut-favicon';
  img.alt = '';
  img.draggable = false;   // drag the whole shortcut (reorder), not the image
  img.referrerPolicy = 'no-referrer';
  const sources = faviconFound.has(host) ? [faviconFound.get(host)] : [
    `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`,
    `https://${host}/favicon.ico`
  ];
  const fromGoogle = src => src.startsWith('https://www.google.com/');
  let i = 0;
  const next = () => {
    i++;
    if (i < sources.length) { img.src = sources[i]; return; }
    faviconMissing.add(host);
    img.remove();
  };
  img.addEventListener('load', () => {
    // For sites it has no icon for (or can't reach — localhost, intranet,
    // typos), Google returns a generic 16×16 globe instead of an error.
    // Treat that as a miss and try the site's own favicon.
    if (fromGoogle(sources[i]) && img.naturalWidth <= 16) { next(); return; }
    faviconFound.set(host, sources[i]);
    // Hide the letter only once a real favicon loaded, so a transparent
    // favicon doesn't show the letter through it.
    el.classList.add('has-favicon');
  });
  img.addEventListener('error', next);
  img.src = sources[0];
  el.appendChild(img);
}

const GRIP_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>';

// Settings panel: the shortcut list (drag to reorder, click to edit URL /
// name / icon), an inline Add form, and suggestions from most-visited sites.
function renderManager(host, ctx) {
  const data = ctx.widget.data;
  if (!Array.isArray(data.items)) data.items = [];
  let openItem = null;            // shortcut whose editor is expanded
  let dragIdx = null;
  let focusAddUrl = false;        // re-focus the Add URL field after adding
  const sugg = { open: false, loading: false, items: [] };

  const changed = () => { ctx.done(); draw(); };

  function draw() {
    host.innerHTML = '';

    const list = document.createElement('div');
    list.className = 'sc-manage';
    data.items.forEach((it, idx) => {
      const row = document.createElement('div');
      row.className = 'sc-row' + (it === openItem ? ' sc-row-open' : '');
      row.draggable = true;
      row.innerHTML = `
        <span class="sc-grip" title="Drag to reorder">${GRIP_SVG}</span>
        <button type="button" class="sc-row-icon shortcut-icon" title="Edit" aria-label="Edit shortcut"></button>
        <button type="button" class="sc-row-label" title="${escapeHtml(it.url || '')}">${escapeHtml(it.label || defaultLabel(it.url))}</button>
        <button type="button" class="sc-row-del" title="Remove" aria-label="Remove">×</button>`;
      mountIcon(row.querySelector('.sc-row-icon'), it);
      const toggle = () => { openItem = openItem === it ? null : it; draw(); };
      row.querySelector('.sc-row-icon').addEventListener('click', toggle);
      row.querySelector('.sc-row-label').addEventListener('click', toggle);
      row.querySelector('.sc-row-del').addEventListener('click', () => {
        data.items.splice(idx, 1);
        if (openItem === it) openItem = null;
        changed();
      });

      // Drag to reorder (HTML5 drag & drop, scoped to this list).
      row.addEventListener('dragstart', e => {
        dragIdx = idx;
        e.dataTransfer.setData(DRAG_TYPE, String(idx));
        e.dataTransfer.effectAllowed = 'move';
        row.classList.add('sc-dragging');
      });
      row.addEventListener('dragover', e => {
        if (dragIdx === null) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const r = row.getBoundingClientRect();
        const after = e.clientY > r.top + r.height / 2;
        row.classList.toggle('drop-before', !after);
        row.classList.toggle('drop-after', after);
      });
      row.addEventListener('dragleave', () => row.classList.remove('drop-before', 'drop-after'));
      row.addEventListener('drop', e => {
        if (dragIdx === null) return;
        e.preventDefault();
        const after = row.classList.contains('drop-after');
        const from = dragIdx;
        dragIdx = null;
        reorder(data.items, from, idx, after);
        changed();
      });
      row.addEventListener('dragend', () => {
        dragIdx = null;
        list.querySelectorAll('.sc-row').forEach(r => r.classList.remove('sc-dragging', 'drop-before', 'drop-after'));
      });

      list.appendChild(row);
      if (it === openItem) list.appendChild(editor(it));
    });
    host.appendChild(list);
    host.appendChild(addForm());
    if (sugg.open) host.appendChild(suggestions());
  }

  // ---- Edit an existing shortcut: URL, name, icon ----
  function editor(it) {
    const box = document.createElement('div');
    box.className = 'sc-editor';
    const mode = it.icon && (it.icon.type === 'emoji' || it.icon.type === 'glyph') ? it.icon.type : 'site';
    box.innerHTML = `
      <label class="sc-field"><span>URL</span><input type="text" class="sc-input sc-edit-url" spellcheck="false"/></label>
      <label class="sc-field"><span>Name</span><input type="text" class="sc-input sc-edit-name"/></label>
      <div class="sc-field-label">Icon</div>
      <div class="seg-control sc-modes">
        <button type="button" data-mode="site">Website</button>
        <button type="button" data-mode="emoji">Emoji</button>
        <button type="button" data-mode="glyph">Icon</button>
      </div>
      <div class="sc-pane" data-pane="site"><p class="panel-microhint">Uses the site's own favicon.</p></div>
      <div class="sc-pane" data-pane="emoji">
        <input type="text" class="sc-input sc-emoji-input" placeholder="Type or paste an emoji" maxlength="16"/>
      </div>
      <div class="sc-pane sc-glyphs" data-pane="glyph">
        ${Object.keys(GLYPHS).map(g => `<button type="button" class="sc-glyph" data-glyph="${g}" title="${g}" aria-label="${g}">${glyphSvg(g)}</button>`).join('')}
      </div>`;

    const urlIn = box.querySelector('.sc-edit-url');
    const nameIn = box.querySelector('.sc-edit-name');
    urlIn.value = it.url || '';
    nameIn.value = it.label || '';
    nameIn.placeholder = defaultLabel(it.url);
    urlIn.addEventListener('change', () => {
      const url = normalizeUrl(urlIn.value);
      if (!url) { urlIn.classList.add('sc-invalid'); return; }
      // Keep the name in sync if it was still the auto-generated one.
      if (!it.label || it.label === defaultLabel(it.url)) it.label = defaultLabel(url);
      it.url = url;
      changed();
    });
    urlIn.addEventListener('input', () => urlIn.classList.remove('sc-invalid'));
    nameIn.addEventListener('change', () => {
      it.label = nameIn.value.trim() || defaultLabel(it.url);
      changed();
    });
    [urlIn, nameIn].forEach(inp => inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); }));

    const showMode = m => {
      box.querySelectorAll('.sc-modes button').forEach(b => b.classList.toggle('active', b.dataset.mode === m));
      box.querySelectorAll('.sc-pane').forEach(p => { p.hidden = p.dataset.pane !== m; });
    };
    showMode(mode);
    box.querySelectorAll('.sc-modes button').forEach(b => b.addEventListener('click', () => {
      showMode(b.dataset.mode);
      if (b.dataset.mode === 'site' && it.icon) { delete it.icon; changed(); }
      if (b.dataset.mode === 'emoji') box.querySelector('.sc-emoji-input').focus();
    }));

    const emojiIn = box.querySelector('.sc-emoji-input');
    if (it.icon && it.icon.type === 'emoji') emojiIn.value = it.icon.value || '';
    emojiIn.addEventListener('change', () => {
      const v = firstGrapheme(emojiIn.value);
      if (v) it.icon = { type: 'emoji', value: v }; else delete it.icon;
      changed();
    });
    emojiIn.addEventListener('keydown', e => { if (e.key === 'Enter') emojiIn.blur(); });

    box.querySelectorAll('.sc-glyph').forEach(b => {
      if (it.icon && it.icon.type === 'glyph' && it.icon.value === b.dataset.glyph) b.classList.add('active');
      b.addEventListener('click', () => { it.icon = { type: 'glyph', value: b.dataset.glyph }; changed(); });
    });
    return box;
  }

  // ---- Inline Add form ----
  function addForm() {
    const form = document.createElement('form');
    form.className = 'sc-addform';
    form.innerHTML = `
      <input type="text" class="sc-input sc-add-url" placeholder="Paste a URL…" spellcheck="false"/>
      <div class="sc-add-row">
        <input type="text" class="sc-input sc-add-name" placeholder="Name (optional)"/>
        <button type="submit" class="btn-subtle sc-add-btn">Add</button>
      </div>
      ${api && api.topSites ? `<button type="button" class="btn-subtle sc-suggest-btn">${sugg.open ? 'Hide most visited' : 'Add from most visited…'}</button>` : ''}`;
    const urlIn = form.querySelector('.sc-add-url');
    const nameIn = form.querySelector('.sc-add-name');
    urlIn.addEventListener('input', () => {
      urlIn.classList.remove('sc-invalid');
      const url = normalizeUrl(urlIn.value);
      nameIn.placeholder = url ? defaultLabel(url) : 'Name (optional)';
    });
    form.addEventListener('submit', e => {
      e.preventDefault();
      const url = normalizeUrl(urlIn.value);
      if (!url) { urlIn.classList.add('sc-invalid'); urlIn.focus(); return; }
      data.items.push({ label: nameIn.value.trim() || defaultLabel(url), url });
      focusAddUrl = true;
      changed();
    });
    const sBtn = form.querySelector('.sc-suggest-btn');
    if (sBtn) sBtn.addEventListener('click', () => {
      sugg.open = !sugg.open;
      if (sugg.open) loadSuggestions();
      draw();
    });
    if (focusAddUrl) { focusAddUrl = false; setTimeout(() => urlIn.focus(), 0); }
    return form;
  }

  // ---- Suggestions from the browser's most-visited sites ----
  async function loadSuggestions() {
    sugg.loading = true;
    sugg.items = [];
    try {
      // includeFavicon gives the browser's locally cached favicon as a data:
      // URL, so listing suggestions never sends your most-visited domains to
      // the favicon service (only adding one does, like any shortcut).
      const sites = await api.topSites.get({ limit: 30, onePerDomain: true, includeFavicon: true });
      sugg.items = (sites || [])
        .filter(s => s && isSafeUrl(s.url))
        .map(s => ({
          url: s.url,
          label: (s.title || '').trim() || defaultLabel(s.url),
          favicon: typeof s.favicon === 'string' && /^data:image\//.test(s.favicon) ? s.favicon : ''
        }));
    } catch (err) {
      console.error('[Tessra] topSites failed:', err);
    }
    sugg.loading = false;
    if (sugg.open) draw();
  }

  function suggestions() {
    const box = document.createElement('div');
    box.className = 'sc-suggest';
    const have = new Set(data.items.map(i => hostOf(i.url)));
    const items = sugg.items.filter(s => !have.has(hostOf(s.url))).slice(0, 8);
    if (sugg.loading) { box.innerHTML = '<p class="panel-microhint">Loading…</p>'; return box; }
    if (!items.length) { box.innerHTML = '<p class="panel-microhint">No more suggestions — everything you visit often is already here.</p>'; return box; }
    items.forEach(s => {
      const row = document.createElement('div');
      row.className = 'sc-row sc-suggest-row';
      row.innerHTML = `
        <span class="sc-row-icon shortcut-icon"></span>
        <span class="sc-suggest-text">
          <span class="sc-suggest-title">${escapeHtml(s.label)}</span>
          <span class="sc-suggest-host">${escapeHtml(defaultLabel(s.url))}</span>
        </span>
        <button type="button" class="sc-suggest-add" title="Add" aria-label="Add ${escapeHtml(s.label)}">+</button>`;
      // Local favicon or letter only — no network request (see loadSuggestions).
      const ic = row.querySelector('.sc-row-icon');
      ic.innerHTML = `<span class="shortcut-letter">${escapeHtml((s.label[0] || '?').toUpperCase())}</span>`;
      if (s.favicon) {
        const img = document.createElement('img');
        img.className = 'shortcut-favicon';
        img.alt = '';
        img.addEventListener('load', () => ic.classList.add('has-favicon'));
        img.addEventListener('error', () => img.remove());
        img.src = s.favicon;
        ic.appendChild(img);
      }
      row.querySelector('.sc-suggest-add').addEventListener('click', () => {
        data.items.push({ label: s.label, url: s.url });
        changed();
      });
      box.appendChild(row);
    });
    return box;
  }

  draw();
}

const SIZES = ['s', 'm', 'l'];
const SHAPES = ['rounded', 'circle', 'plain'];

register({
  type: 'shortcuts',
  title: 'Shortcuts',
  icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
  category: 'web',
  defaultSize: { w: 460, h: 240 },
  minSize:     { w: 160, h: 120 },
  defaultData: () => ({ items: [] }),
  defaultSettings: () => ({
    view: 'grid',        // 'grid' | 'list'
    size: 'm',           // icon size: 's' | 'm' | 'l'
    shape: 'rounded',    // 'rounded' | 'circle' | 'plain'
    showLabels: true,    // grid only — list rows always show the name
    newTab: false
  }),
  settingsSchema: [
    {
      type: 'panel',
      label: 'Shortcuts',
      render(host, _value, _set, _settings, ctx) { renderManager(host, ctx); }
    },
    { key: 'view', type: 'select', label: 'Layout', options: [
      { value: 'grid', label: 'Grid' },
      { value: 'list', label: 'List' }
    ]},
    { key: 'size', type: 'select', label: 'Icon size', options: [
      { value: 's', label: 'Small' },
      { value: 'm', label: 'Medium' },
      { value: 'l', label: 'Large' }
    ]},
    { key: 'shape', type: 'select', label: 'Icon shape', options: [
      { value: 'rounded', label: 'Rounded' },
      { value: 'circle',  label: 'Circle' },
      { value: 'plain',   label: 'No background' }
    ]},
    { key: 'showLabels', type: 'toggle', label: 'Show names (grid)' },
    { key: 'newTab',     type: 'toggle', label: 'Open in new tab' }
  ],
  render(body, ctx) {
    const data = ctx.data;
    const s = ctx.settings || {};
    if (!Array.isArray(data.items)) data.items = [];
    // Settings can come from an imported layout — fall back on anything unknown.
    const view  = s.view === 'list' ? 'list' : 'grid';
    const size  = SIZES.includes(s.size) ? s.size : 'm';
    const shape = SHAPES.includes(s.shape) ? s.shape : 'rounded';
    const labels = view === 'list' || s.showLabels !== false;
    let dragIdx = null;

    const render = () => {
      if (!data.items.length) {
        body.innerHTML = '<div class="shortcuts-empty">No shortcuts yet. Add some in the widget settings.</div>';
        return;
      }
      body.innerHTML = '';
      const wrap = document.createElement('div');
      wrap.className = `shortcuts-${view} sc-size-${size} sc-shape-${shape}` + (labels ? '' : ' sc-no-labels');
      body.appendChild(wrap);

      data.items.forEach((it, idx) => {
        const a = document.createElement('a');
        a.className = 'shortcut';
        // Imported/shared layouts write data.items directly, bypassing the
        // Add form's validation — re-check so a crafted preset can't smuggle
        // in a javascript: URI.
        a.href = isSafeUrl(it.url) ? it.url : '#';
        if (s.newTab) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
        a.title = it.label || defaultLabel(it.url);
        a.innerHTML = view === 'list'
          ? `<div class="shortcut-icon"></div>
             <div class="shortcut-text">
               <div class="shortcut-label">${escapeHtml(it.label || defaultLabel(it.url))}</div>
               <div class="shortcut-host">${escapeHtml(defaultLabel(it.url))}</div>
             </div>
             <button class="shortcut-del" title="Remove">×</button>`
          : `<div class="shortcut-icon"></div>
             <div class="shortcut-label">${escapeHtml(it.label || defaultLabel(it.url))}</div>
             <button class="shortcut-del" title="Remove">×</button>`;
        mountIcon(a.querySelector('.shortcut-icon'), it);
        a.querySelector('.shortcut-del').addEventListener('click', e => {
          e.preventDefault(); e.stopPropagation();
          data.items.splice(idx, 1); render(); ctx.save();
        });

        // Drag to reorder — edit mode only. Outside edit mode a drag stays a
        // normal link drag (e.g. onto the bookmarks bar).
        a.addEventListener('dragstart', e => {
          if (!document.body.classList.contains('edit-mode')) return;
          dragIdx = idx;
          e.dataTransfer.setData(DRAG_TYPE, String(idx));
          e.dataTransfer.effectAllowed = 'move';
          a.classList.add('sc-dragging');
        });
        a.addEventListener('dragover', e => {
          if (dragIdx === null) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          const r = a.getBoundingClientRect();
          const after = view === 'list' ? e.clientY > r.top + r.height / 2 : e.clientX > r.left + r.width / 2;
          a.classList.toggle('drop-before', !after);
          a.classList.toggle('drop-after', after);
        });
        a.addEventListener('dragleave', () => a.classList.remove('drop-before', 'drop-after'));
        a.addEventListener('drop', e => {
          if (dragIdx === null) return;
          e.preventDefault();
          const after = a.classList.contains('drop-after');
          const from = dragIdx;
          dragIdx = null;
          reorder(data.items, from, idx, after);
          ctx.save();
          render();
        });
        a.addEventListener('dragend', () => {
          dragIdx = null;
          wrap.querySelectorAll('.shortcut').forEach(n => n.classList.remove('sc-dragging', 'drop-before', 'drop-after'));
        });
        wrap.appendChild(a);
      });
    };
    render();
  }
});
