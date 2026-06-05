import { register } from '../widget-registry.js';
import { escapeHtml } from '../utils.js';

register({
  type: 'shortcuts',
  title: 'Shortcuts',
  icon: '▦',
  category: 'web',
  defaultSize: { w: 460, h: 240 },
  minSize:     { w: 160, h: 120 },
  defaultData: () => ({ items: [] }),
  render(body, ctx) {
    const data = ctx.data;
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
          data.items.splice(idx, 1); render(); ctx.save();
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
        render(); ctx.save();
      });
      grid.appendChild(add);
    };
    render();
  }
});
