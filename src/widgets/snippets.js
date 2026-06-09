import { register } from '../widget-registry.js';
import { escapeHtml } from '../utils.js';

function uniqueId() { return Math.random().toString(36).slice(2, 9); }

register({
  type: 'snippets',
  title: 'Snippets',
  icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="14" y2="17"/></svg>',
  category: 'productivity',
  defaultSize: { w: 320, h: 280 },
  minSize:     { w: 240, h: 200 },

  defaultData: () => ({ snippets: [] }),

  render(body, ctx) {
    const { data } = ctx;
    body.innerHTML = `
      <div class="snippets">
        <ul class="snippets-list"></ul>
        <button class="snippets-add">+ Add snippet</button>
      </div>`;
    const list  = body.querySelector('.snippets-list');
    const addBt = body.querySelector('.snippets-add');

    function renderAll(editId = null) {
      list.innerHTML = '';
      if (!data.snippets.length) {
        const empty = document.createElement('li');
        empty.className = 'snippets-empty';
        empty.textContent = 'No snippets yet.';
        list.appendChild(empty);
        return;
      }
      data.snippets.forEach((snip, idx) => {
        const li = document.createElement('li');
        li.className = 'snippets-item';
        if (snip.id === editId) {
          li.innerHTML = `
            <input class="snippets-title-input" placeholder="Title"/>
            <textarea class="snippets-text-input" placeholder="Snippet text…" rows="3"></textarea>
            <div class="snippets-edit-actions">
              <button class="snippets-cancel">Cancel</button>
              <button class="snippets-save">Save</button>
            </div>`;
          const titleEl = li.querySelector('.snippets-title-input');
          const textEl  = li.querySelector('.snippets-text-input');
          titleEl.value = snip.title || '';
          textEl.value  = snip.text  || '';
          titleEl.focus();
          li.querySelector('.snippets-save').addEventListener('click', () => {
            snip.title = titleEl.value.trim() || 'Untitled';
            snip.text  = textEl.value;
            ctx.save();
            renderAll();
          });
          li.querySelector('.snippets-cancel').addEventListener('click', () => {
            // If the snippet was empty (newly added and never saved), discard it
            if (!snip.title.trim() && !snip.text.trim()) {
              data.snippets.splice(idx, 1);
              ctx.save();
            }
            renderAll();
          });
        } else {
          const preview = (snip.text || '').slice(0, 80).replace(/\n/g, ' ');
          li.innerHTML = `
            <div class="snippets-row">
              <div class="snippets-info">
                <div class="snippets-title">${escapeHtml(snip.title || 'Untitled')}</div>
                <div class="snippets-preview">${escapeHtml(preview)}</div>
              </div>
              <button class="snippets-edit" title="Edit">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
              </button>
              <button class="snippets-del" title="Remove">×</button>
            </div>`;
          li.querySelector('.snippets-row').addEventListener('click', e => {
            if (e.target.closest('button')) return;
            navigator.clipboard.writeText(snip.text || '').then(() => {
              const titleNode = li.querySelector('.snippets-title');
              const orig = titleNode.textContent;
              titleNode.textContent = 'Copied!';
              titleNode.classList.add('snippets-copied');
              setTimeout(() => {
                titleNode.textContent = orig;
                titleNode.classList.remove('snippets-copied');
              }, 800);
            });
          });
          li.querySelector('.snippets-edit').addEventListener('click', e => {
            e.stopPropagation();
            renderAll(snip.id);
          });
          li.querySelector('.snippets-del').addEventListener('click', e => {
            e.stopPropagation();
            data.snippets.splice(idx, 1);
            ctx.save();
            renderAll();
          });
        }
        list.appendChild(li);
      });
    }

    addBt.addEventListener('click', () => {
      const newSnip = { id: uniqueId(), title: '', text: '' };
      data.snippets.push(newSnip);
      // Note: not saved until user clicks Save (cancel discards if still empty)
      renderAll(newSnip.id);
    });

    renderAll();
  }
});
