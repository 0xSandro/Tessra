import { register } from '../widget-registry.js';
import { escapeHtml } from '../utils.js';

const api = (typeof browser !== 'undefined') ? browser
         : (typeof chrome  !== 'undefined') ? chrome
         : null;

// Walk the bookmark tree and return every folder, with a slash-separated path
// label. Used as dynamic options for the folder-picker setting.
async function listFolders() {
  if (!api || !api.bookmarks) return [];
  const tree = await api.bookmarks.getTree();
  const out = [];
  function walk(nodes, parentPath) {
    for (const node of nodes) {
      const isFolder = !node.url;
      if (isFolder && node.id !== 'root________') {
        const title = node.title || '(Untitled)';
        const fullPath = parentPath ? `${parentPath} / ${title}` : title;
        out.push({ value: node.id, label: fullPath });
        if (node.children) walk(node.children, fullPath);
      } else if (node.children) {
        walk(node.children, parentPath);
      }
    }
  }
  walk(tree, '');
  return out;
}

register({
  type: 'bookmarks',
  title: 'Bookmarks',
  icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>',
  category: 'web',
  defaultSize: { w: 320, h: 320 },
  minSize:     { w: 240, h: 200 },

  defaultData: () => ({}),

  defaultSettings: () => ({ folderId: 'toolbar_____' }),
  settingsSchema: [
    { key: 'folderId', type: 'select', label: 'Folder', options: () => listFolders() }
  ],

  render(body, ctx) {
    const { settings } = ctx;
    body.innerHTML = `<ul class="bookmarks-list"></ul>`;
    const list = body.querySelector('.bookmarks-list');

    if (!api || !api.bookmarks) {
      list.innerHTML = '<li class="bookmarks-empty">Bookmarks API unavailable.</li>';
      return;
    }

    async function load() {
      list.innerHTML = '<li class="bookmarks-empty">Loading…</li>';
      try {
        const items = await api.bookmarks.getChildren(settings.folderId || 'toolbar_____');
        if (!items.length) {
          list.innerHTML = '<li class="bookmarks-empty">No bookmarks in this folder.</li>';
          return;
        }
        list.innerHTML = items.map(item => {
          if (item.url) {
            let host = '';
            try { host = new URL(item.url).hostname; } catch {}
            return `
              <li class="bookmarks-item">
                <a href="${escapeHtml(item.url)}" rel="noopener" title="${escapeHtml(item.title || item.url)}">
                  <span class="bookmarks-favicon" style="${host ? `background-image:url('https://www.google.com/s2/favicons?domain=${host}&sz=32')` : ''}"></span>
                  <span class="bookmarks-title">${escapeHtml(item.title || host || item.url)}</span>
                </a>
              </li>`;
          }
          // Folder — show as a small header, non-clickable for now
          return `<li class="bookmarks-folder">${escapeHtml(item.title || 'Folder')}</li>`;
        }).join('');
      } catch (err) {
        list.innerHTML = `<li class="bookmarks-empty">Could not load folder.</li>`;
      }
    }
    load();

    // Refresh when bookmarks change
    const refresh = () => load();
    const events = ['onCreated', 'onChanged', 'onMoved', 'onRemoved'];
    events.forEach(name => {
      if (api.bookmarks[name]) {
        api.bookmarks[name].addListener(refresh);
        ctx.onCleanup(() => { try { api.bookmarks[name].removeListener(refresh); } catch {} });
      }
    });
  }
});
