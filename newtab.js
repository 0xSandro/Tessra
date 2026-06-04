/* Tessra — Custom Starting Page (vanilla JS) */
(() => {
  const GRID = 20;
  const STORAGE_KEY = 'tessra.state.v1';
  const LEGACY_KEY  = 'widgetNewTab.state.v1';

  // ----- Storage shim -----
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

  const defaultTheme = () => ({
    bgType: 'dots',          // 'dots' | 'color' | 'image'
    bgColor: '#fafafa',
    bgImage: null,           // data URL
    widgetBg: '#ffffff',
    widgetBorder: '#e5e5e5',
    widgetBorderWidth: 1,
    widgetRadius: 10,
    widgetShadow: 40,        // 0..100
    showHeaders: false       // window-mode: always show widget header bar
  });

  const defaultState = () => ({
    maxZ: 5,
    widgets: [
      { id: id(), type: 'clock',     x: 40,  y: 80,  w: 280, h: 140, z: 1 },
      { id: id(), type: 'search',    x: 340, y: 80,  w: 460, h: 80,  z: 2 },
      { id: id(), type: 'shortcuts', x: 40,  y: 240, w: 460, h: 240, z: 3,
        data: { items: [
          { label: 'GitHub',      url: 'https://github.com' },
          { label: 'Hacker News', url: 'https://news.ycombinator.com' },
          { label: 'YouTube',     url: 'https://youtube.com' }
        ]}
      },
      { id: id(), type: 'todo',  x: 520, y: 180, w: 320, h: 260, z: 4, data: { todos: [] } },
      { id: id(), type: 'notes', x: 860, y: 180, w: 320, h: 260, z: 5, data: { notes: '' } }
    ],
    theme: defaultTheme()
  });

  function id() { return Math.random().toString(36).slice(2, 9); }
  function snap(v) { return Math.round(v / GRID) * GRID; }

  // Migrate legacy "notes" widget that bundled todo+notes into two separate widgets.
  function migrate(s) {
    if (!s || !Array.isArray(s.widgets)) return s;
    const out = [];
    for (const w of s.widgets) {
      if (w.type === 'notes' && w.data && (w.data.mode || w.data.todos)) {
        // Split into a notes widget + a todo widget (if there were todos)
        out.push({ id: id(), type: 'notes', x: w.x, y: w.y, w: w.w, h: w.h,
                   data: { notes: w.data.notes || '' } });
        if (Array.isArray(w.data.todos) && w.data.todos.length) {
          out.push({ id: id(), type: 'todo', x: w.x + 40, y: w.y + 40, w: w.w, h: w.h,
                     data: { todos: w.data.todos } });
        }
      } else {
        out.push(w);
      }
    }
    s.widgets = out;
    s.theme = Object.assign(defaultTheme(), s.theme || {});
    // Ensure every widget has a z-index, assigned in order
    s.maxZ = s.maxZ || 0;
    s.widgets.forEach(w => { if (!w.z) w.z = ++s.maxZ; });
    return s;
  }
  function bringToFront(w, node) {
    state.maxZ = (state.maxZ || 0) + 1;
    w.z = state.maxZ;
    if (node) node.style.zIndex = w.z;
  }

  let state = null;
  let saveTimer = null;
  // Build a clean, JSON-safe snapshot of state (strips runtime fields like _cleanup functions
  // that break browser.storage.local's structured-clone serializer).
  function serialize() {
    return {
      maxZ: state.maxZ || 0,
      widgets: state.widgets.map(w => ({
        id: w.id, type: w.type,
        x: w.x, y: w.y, w: w.w, h: w.h,
        z: w.z || 0,
        data: w.data ? JSON.parse(JSON.stringify(w.data)) : undefined
      })),
      theme: state.theme ? JSON.parse(JSON.stringify(state.theme)) : null
    };
  }
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
  // Flush before the tab is hidden/closed so quick edits aren't lost
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveNow(); });
  window.addEventListener('beforeunload', () => { saveNow(); });
  window.addEventListener('pagehide', () => { saveNow(); });

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  // ----- Widget renderers -----
  const titles = { clock: 'Clock', search: 'Search', shortcuts: 'Shortcuts', notes: 'Notes', todo: 'To-do' };

  const renderers = {
    clock(body, w) {
      body.innerHTML = '<div class="clock-time"></div><div class="clock-date"></div>';
      const t = body.querySelector('.clock-time');
      const d = body.querySelector('.clock-date');
      const tick = () => {
        const now = new Date();
        t.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        d.textContent = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
      };
      tick();
      const i = setInterval(tick, 15000);
      w._cleanup = () => clearInterval(i);
    },

    search(body) {
      body.innerHTML = `<form class="search-form"><input class="search-input" type="text" placeholder="Search the web..."/></form>`;
      const form = body.querySelector('form');
      const input = body.querySelector('input');
      form.addEventListener('submit', e => {
        e.preventDefault();
        const q = input.value.trim();
        if (!q) return;
        window.location.href = 'https://duckduckgo.com/?q=' + encodeURIComponent(q);
      });
    },

    shortcuts(body, w) {
      const data = w.data ||= { items: [] };
      const render = () => {
        body.innerHTML = '<div class="shortcuts-grid"></div>';
        const grid = body.querySelector('.shortcuts-grid');
        data.items.forEach((it, idx) => {
          const a = document.createElement('a');
          a.className = 'shortcut';
          a.href = it.url;
          let host = '';
          try { host = new URL(it.url).hostname; } catch {}
          a.innerHTML = `
            <div class="shortcut-icon" style="${host ? `background-image:url('https://www.google.com/s2/favicons?domain=${host}&sz=64')` : ''}">
              ${host ? '' : escapeHtml((it.label[0]||'?').toUpperCase())}
            </div>
            <div class="shortcut-label">${escapeHtml(it.label)}</div>
            <button class="shortcut-del" title="Remove">×</button>`;
          a.querySelector('.shortcut-del').addEventListener('click', e => {
            e.preventDefault(); e.stopPropagation();
            data.items.splice(idx, 1); render(); scheduleSave();
          });
          grid.appendChild(a);
        });
        const add = document.createElement('button');
        add.className = 'shortcut-add';
        add.textContent = '+';
        add.title = 'Add shortcut';
        add.addEventListener('click', () => {
          let url = prompt('URL (e.g. https://example.com):');
          if (!url) return;
          if (!/^https?:\/\//.test(url)) url = 'https://' + url;
          let host = url;
          try { host = new URL(url).hostname; } catch {}
          const label = prompt('Label:', host);
          data.items.push({ label: label || host, url });
          render(); scheduleSave();
        });
        grid.appendChild(add);
      };
      render();
    },

    notes(body, w) {
      const data = w.data ||= { notes: '' };
      const ta = document.createElement('textarea');
      ta.className = 'notes-textarea';
      ta.placeholder = 'Notes…';
      ta.value = data.notes || '';
      ta.addEventListener('input', () => { data.notes = ta.value; scheduleSave(); });
      body.innerHTML = '';
      body.appendChild(ta);
    },

    todo(body, w) {
      const data = w.data ||= { todos: [] };
      const render = () => {
        body.innerHTML = '';
        const ul = document.createElement('ul');
        ul.className = 'todo-list';
        data.todos.forEach((t, idx) => {
          const li = document.createElement('li');
          li.className = t.done ? 'done' : '';
          li.innerHTML = `
            <input type="checkbox" ${t.done?'checked':''} />
            <span class="todo-text">${escapeHtml(t.text)}</span>
            <button class="todo-del" title="Remove">×</button>`;
          li.querySelector('input').addEventListener('change', e => {
            t.done = e.target.checked; render(); scheduleSave();
          });
          li.querySelector('.todo-del').addEventListener('click', () => {
            data.todos.splice(idx, 1); render(); scheduleSave();
          });
          ul.appendChild(li);
        });
        body.appendChild(ul);
        const inp = document.createElement('input');
        inp.className = 'todo-input';
        inp.placeholder = 'Add task and press Enter';
        inp.addEventListener('keydown', e => {
          if (e.key === 'Enter' && inp.value.trim()) {
            data.todos.push({ text: inp.value.trim(), done: false });
            inp.value = ''; render(); scheduleSave();
          }
        });
        body.appendChild(inp);
      };
      render();
    }
  };

  // Sensible default sizes when creating a new widget by drag-drop
  const defaultSize = {
    clock:     { w: 280, h: 140 },
    search:    { w: 460, h: 80  },
    shortcuts: { w: 460, h: 240 },
    todo:      { w: 320, h: 260 },
    notes:     { w: 320, h: 260 }
  };

  // ----- Rendering -----
  const board = document.getElementById('board');
  const tpl = document.getElementById('tpl-widget');

  function renderWidget(w) {
    const node = tpl.content.firstElementChild.cloneNode(true);
    node.dataset.id = w.id;
    node.style.left   = w.x + 'px';
    node.style.top    = w.y + 'px';
    node.style.width  = w.w + 'px';
    node.style.height = w.h + 'px';
    node.style.zIndex = w.z || 1;
    node.querySelector('.widget-title').textContent = titles[w.type] || w.type;
    node.querySelector('.widget-remove').addEventListener('click', () => {
      if (w._cleanup) w._cleanup();
      state.widgets = state.widgets.filter(x => x.id !== w.id);
      node.remove();
      scheduleSave();
    });
    const body = node.querySelector('.widget-body');
    (renderers[w.type] || (() => {}))(body, w);
    enableDrag(node, w);
    board.appendChild(node);
    return node;
  }

  function enableDrag(node, w) {
    let startX, startY, ox, oy, dragging = false;

    const start = (clientX, clientY, target) => {
      if (!document.body.classList.contains('edit-mode')) return;
      if (target.closest('button, input, textarea, a')) return;
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

  // ----- Edit button + side panel -----
  const editBtn = document.getElementById('edit-toggle');
  const panel = document.getElementById('side-panel');
  const closeBtn = document.getElementById('panel-close');
  const editLabel = editBtn.querySelector('.edit-label');

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

  // Panel tabs
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
    dragType = type;
    const size = defaultSize[type];
    ghost.style.width = size.w + 'px';
    ghost.style.height = size.h + 'px';
    ghost.style.left = (e.clientX - size.w / 2) + 'px';
    ghost.style.top  = (e.clientY - size.h / 2) + 'px';
    ghost.textContent = titles[type];
    ghost.classList.remove('hidden');
    document.body.style.userSelect = 'none';
  }
  function moveGhost(e) {
    if (!dragType) return;
    const size = defaultSize[dragType];
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

    const size = defaultSize[type];
    const x = Math.max(0, snap(e.clientX - size.w / 2));
    const y = Math.max(0, snap(e.clientY - size.h / 2));
    state.maxZ = (state.maxZ || 0) + 1;
    const w = { id: id(), type, x, y, w: size.w, h: size.h, z: state.maxZ };
    if (type === 'shortcuts') w.data = { items: [] };
    if (type === 'todo')      w.data = { todos: [] };
    if (type === 'notes')     w.data = { notes: '' };
    state.widgets.push(w);
    renderWidget(w);
    saveNow();
  }
  panel.querySelectorAll('.widget-card').forEach(card => {
    card.addEventListener('mousedown', e => { e.preventDefault(); startCatalogDrag(card.dataset.type, e); });
  });
  window.addEventListener('mousemove', moveGhost);
  window.addEventListener('mouseup', dropGhost);

  // ----- Theme -----
  function applyTheme() {
    const t = state.theme;
    document.body.classList.remove('bg-color', 'bg-image');
    if (t.bgType === 'color') {
      document.body.classList.add('bg-color');
      document.documentElement.style.setProperty('--bg', t.bgColor);
    } else if (t.bgType === 'image' && t.bgImage) {
      document.body.classList.add('bg-image');
      document.documentElement.style.setProperty('--bg-image-url', `url("${t.bgImage}")`);
    } else {
      // dots
      document.documentElement.style.setProperty('--bg', t.bgColor);
    }
    document.documentElement.style.setProperty('--widget-bg', t.widgetBg);
    document.documentElement.style.setProperty('--widget-border', t.widgetBorder);
    document.documentElement.style.setProperty('--widget-border-width', t.widgetBorderWidth + 'px');
    document.documentElement.style.setProperty('--widget-radius', t.widgetRadius + 'px');
    const s = t.widgetShadow / 100;
    document.documentElement.style.setProperty('--widget-shadow',
      `0 1px 2px rgba(0,0,0,${(0.04 * s * 2).toFixed(3)}), 0 ${Math.round(2 + 8 * s)}px ${Math.round(8 + 24 * s)}px rgba(0,0,0,${(0.06 * s * 2).toFixed(3)})`);
    document.documentElement.style.setProperty('--widget-shadow-hover',
      `0 2px 4px rgba(0,0,0,${(0.06 * s * 2).toFixed(3)}), 0 ${Math.round(6 + 12 * s)}px ${Math.round(16 + 32 * s)}px rgba(0,0,0,${(0.08 * s * 2).toFixed(3)})`);
    document.body.classList.toggle('always-headers', !!t.showHeaders);
  }

  function bindTheme() {
    const t = state.theme;

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
        applyTheme(); updateSeg(); scheduleSave();
      });
    });

    const $ = sel => panel.querySelector(sel);

    const bindColor = (sel, key) => {
      const el = $(sel);
      el.value = t[key];
      el.addEventListener('input', () => { t[key] = el.value; applyTheme(); scheduleSave(); });
    };
    bindColor('#bgColor', 'bgColor');
    bindColor('#widgetBg', 'widgetBg');
    bindColor('#widgetBorder', 'widgetBorder');

    // Image upload
    const imgInput = $('#bgImage');
    imgInput.addEventListener('change', () => {
      const f = imgInput.files && imgInput.files[0];
      if (!f) return;
      if (f.size > 4 * 1024 * 1024) { alert('Image too large (>4 MB).'); return; }
      const reader = new FileReader();
      reader.onload = () => {
        t.bgImage = reader.result;
        t.bgType = 'image';
        applyTheme(); updateSeg(); scheduleSave();
      };
      reader.readAsDataURL(f);
    });
    $('#bgImageClear').addEventListener('click', () => {
      t.bgImage = null;
      imgInput.value = '';
      applyTheme(); scheduleSave();
    });

    // Sliders + number inputs
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
    };
    bindSlider('#widgetBorderWidth', '#widgetBorderWidthN', 'widgetBorderWidth', 4);
    bindSlider('#widgetRadius',      '#widgetRadiusN',      'widgetRadius',      24);
    bindSlider('#widgetShadow',      '#widgetShadowN',      'widgetShadow',      100);

    // Window-mode toggle
    const headers = $('#showHeaders');
    headers.checked = !!t.showHeaders;
    headers.addEventListener('change', () => {
      t.showHeaders = headers.checked;
      applyTheme();
      saveNow();
    });

    $('#themeReset').addEventListener('click', () => {
      state.theme = defaultTheme();
      // re-bind input values
      $('#bgColor').value = state.theme.bgColor;
      $('#widgetBg').value = state.theme.widgetBg;
      $('#widgetBorder').value = state.theme.widgetBorder;
      ['widgetBorderWidth','widgetRadius','widgetShadow'].forEach(k => {
        $('#'+k).value = state.theme[k]; $('#'+k+'N').value = state.theme[k];
      });
      $('#showHeaders').checked = !!state.theme.showHeaders;
      applyTheme(); updateSeg(); saveNow();
    });

    updateSeg();
  }

  // ----- Boot -----
  (async function init() {
    let loaded = await store.get(STORAGE_KEY);
    if (!loaded) {
      // Try to migrate from previous version's key
      const legacy = await store.get(LEGACY_KEY);
      loaded = legacy ? migrate(legacy) : defaultState();
    } else {
      loaded = migrate(loaded);
    }
    state = loaded;
    if (!state.theme) state.theme = defaultTheme();
    applyTheme();
    state.widgets.forEach(renderWidget);
    bindTheme();
    scheduleSave();
  })();
})();
