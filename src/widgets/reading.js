import { register } from '../widget-registry.js';
import { escapeHtml, isSafeUrl } from '../utils.js';

// Reading List — URLs with title, read/unread state, optional per-item
// progress (0-100%). Add a URL by paste; we try to extract a friendly
// hostname-based title automatically, but the user can rename inline.

function uid() { return Math.random().toString(36).slice(2, 9); }

function hostnameFromUrl(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

function ensureProtocol(s) {
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  if (/^[a-z0-9.-]+\.[a-z]{2,}/i.test(s)) return 'https://' + s;
  return s;
}

register({
  type: 'reading',
  title: 'Reading List',
  icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16l-7-3-7 3z"/></svg>',
  category: 'productivity',
  defaultSize: { w: 360, h: 320 },
  minSize:     { w: 260, h: 200 },

  defaultData: () => ({ items: [] }),

  defaultSettings: () => ({
    showProgress: true,
    hideRead: false
  }),
  settingsSchema: [
    { key: 'showProgress', type: 'toggle', label: 'Show progress sliders' },
    { key: 'hideRead',     type: 'toggle', label: 'Hide finished items' }
  ],

  render(body, ctx) {
    const { data, settings } = ctx;
    if (!Array.isArray(data.items)) data.items = [];

    body.innerHTML = `
      <div class="reading">
        <ul class="reading-list"></ul>
        <div class="reading-add">
          <input class="reading-input" placeholder="Paste URL and press Enter…"/>
        </div>
      </div>`;

    const listEl  = body.querySelector('.reading-list');
    const inputEl = body.querySelector('.reading-input');

    function paint() {
      const visible = data.items.filter(it => !(settings.hideRead && it.read));
      listEl.innerHTML = '';
      if (!visible.length) {
        const empty = document.createElement('li');
        empty.className = 'reading-empty';
        empty.textContent = data.items.length
          ? 'All caught up.'
          : 'Nothing yet — paste a URL below.';
        listEl.appendChild(empty);
        return;
      }
      visible.forEach(item => {
        const li = document.createElement('li');
        li.className = 'reading-item' + (item.read ? ' reading-read' : '');
        li.dataset.id = item.id;
        const safeUrl = isSafeUrl(item.url) ? item.url : '#';
        const titleHtml = `
          <a class="reading-title" href="${escapeHtml(safeUrl)}" rel="noopener" title="${escapeHtml(item.url)}">${escapeHtml(item.title || item.url)}</a>
          <span class="reading-host">${escapeHtml(hostnameFromUrl(item.url))}</span>`;
        const progressHtml = (settings.showProgress && !item.read) ? `
          <div class="reading-prog">
            <input type="range" min="0" max="100" step="5" value="${item.progress || 0}"/>
            <span class="reading-pct">${item.progress || 0}%</span>
          </div>` : '';
        li.innerHTML = `
          <input type="checkbox" class="reading-check" ${item.read ? 'checked' : ''} title="Mark as read"/>
          <div class="reading-body">
            ${titleHtml}
            ${progressHtml}
          </div>
          <button class="reading-edit" title="Rename">✎</button>
          <button class="reading-del" title="Remove">×</button>`;
        li.querySelector('.reading-check').addEventListener('change', e => {
          item.read = e.target.checked;
          if (item.read) item.progress = 100;
          ctx.save();
          paint();
        });
        li.querySelector('.reading-del').addEventListener('click', () => {
          const i = data.items.findIndex(x => x.id === item.id);
          if (i >= 0) data.items.splice(i, 1);
          ctx.save();
          paint();
        });
        li.querySelector('.reading-edit').addEventListener('click', () => {
          const t = prompt('Title:', item.title || '');
          if (t == null) return;
          item.title = t.trim() || hostnameFromUrl(item.url);
          ctx.save();
          paint();
        });
        const range = li.querySelector('input[type="range"]');
        if (range) {
          range.addEventListener('input', e => {
            item.progress = +e.target.value;
            li.querySelector('.reading-pct').textContent = item.progress + '%';
          });
          range.addEventListener('change', () => {
            if (item.progress >= 100) item.read = true;
            ctx.save();
            paint();
          });
        }
        listEl.appendChild(li);
      });
    }

    function addUrl(raw) {
      const url = ensureProtocol((raw || '').trim());
      if (!url || !isSafeUrl(url)) return;
      const host = hostnameFromUrl(url);
      data.items.unshift({
        id: uid(),
        url,
        title: host || url,
        read: false,
        progress: 0,
        addedAt: Date.now()
      });
      ctx.save();
      paint();
    }

    inputEl.addEventListener('keydown', e => {
      if (e.key === 'Enter' && inputEl.value.trim()) {
        addUrl(inputEl.value);
        inputEl.value = '';
      }
    });

    paint();
  }
});
