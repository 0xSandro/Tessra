import { register } from '../widget-registry.js';
import { escapeHtml } from '../utils.js';

// Tabbed notes. Each tab is { id, title, content }. Single click on a tab
// switches; double click on a tab title enters rename mode. The title is
// only contenteditable while renaming, so clicks anywhere on a tab reliably
// switch instead of having to hit a non-text pixel.

function uniqueId() { return Math.random().toString(36).slice(2, 9); }

register({
  type: 'notes',
  title: 'Notes',
  icon: '✎',
  category: 'productivity',
  defaultSize: { w: 360, h: 280 },
  minSize:     { w: 220, h: 140 },
  autoNumber:  true,

  defaultData: () => {
    const id = uniqueId();
    return {
      tabs: [{ id, title: 'Notes', content: '' }],
      activeTabId: id
    };
  },

  render(body, ctx) {
    const { data } = ctx;
    // Defensive: make sure active id points at a real tab
    if (!data.tabs || !data.tabs.length) {
      const id = uniqueId();
      data.tabs = [{ id, title: 'Notes', content: '' }];
      data.activeTabId = id;
    }
    if (!data.tabs.find(t => t.id === data.activeTabId)) {
      data.activeTabId = data.tabs[0].id;
    }

    body.innerHTML = `
      <div class="notes">
        <div class="notes-tabs-bar">
          <div class="notes-tabs-list"></div>
          <button class="notes-tab-add" title="Add tab">+</button>
        </div>
        <textarea class="notes-textarea" placeholder="Type here…" spellcheck="false"></textarea>
      </div>`;

    const tabsList = body.querySelector('.notes-tabs-list');
    const addBt    = body.querySelector('.notes-tab-add');
    const textEl   = body.querySelector('.notes-textarea');

    function setActiveTab(id) {
      if (id === data.activeTabId) return;
      data.activeTabId = id;
      ctx.save();
      renderTabs();
      renderContent();
      textEl.focus();
    }

    function renderTabs() {
      tabsList.innerHTML = '';
      const showDelete = data.tabs.length > 1;
      data.tabs.forEach(tab => {
        const tabEl = document.createElement('div');
        tabEl.className = 'notes-tab' + (tab.id === data.activeTabId ? ' active' : '');
        tabEl.dataset.id = tab.id;
        tabEl.innerHTML = `
          <span class="notes-tab-title" title="Double-click to rename">${escapeHtml(tab.title)}</span>
          ${showDelete ? '<button class="notes-tab-del" title="Remove tab">×</button>' : ''}`;
        const titleEl = tabEl.querySelector('.notes-tab-title');
        const delBt   = tabEl.querySelector('.notes-tab-del');

        // Single click anywhere on the tab → switch (unless we're editing the title)
        tabEl.addEventListener('click', e => {
          if (e.target.closest('button')) return;
          if (titleEl.getAttribute('contenteditable') === 'true') return;
          setActiveTab(tab.id);
        });

        // Double-click on title → rename. Make sure the tab is active first.
        titleEl.addEventListener('dblclick', e => {
          e.stopPropagation();
          if (tab.id !== data.activeTabId) setActiveTab(tab.id);
          titleEl.setAttribute('contenteditable', 'true');
          titleEl.focus();
          // Select all so user can immediately type to replace
          const sel = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(titleEl);
          sel.removeAllRanges();
          sel.addRange(range);
        });

        titleEl.addEventListener('blur', () => {
          if (titleEl.getAttribute('contenteditable') !== 'true') return;
          titleEl.removeAttribute('contenteditable');
          const next = (titleEl.textContent || '').trim();
          if (next && next !== tab.title) { tab.title = next; ctx.save(); }
          else titleEl.textContent = tab.title;
        });
        titleEl.addEventListener('keydown', e => {
          if (titleEl.getAttribute('contenteditable') !== 'true') return;
          if (e.key === 'Enter')  { e.preventDefault(); titleEl.blur(); }
          if (e.key === 'Escape') { e.preventDefault(); titleEl.textContent = tab.title; titleEl.blur(); }
        });
        // Stop widget drag from starting only when we're actually editing
        titleEl.addEventListener('mousedown', e => {
          if (titleEl.getAttribute('contenteditable') === 'true') e.stopPropagation();
        });

        if (delBt) {
          delBt.addEventListener('click', e => {
            e.stopPropagation();
            if (data.tabs.length <= 1) return;
            const idx = data.tabs.findIndex(t => t.id === tab.id);
            if (idx >= 0) data.tabs.splice(idx, 1);
            if (data.activeTabId === tab.id) data.activeTabId = data.tabs[0].id;
            ctx.save();
            renderTabs();
            renderContent();
          });
        }
        tabsList.appendChild(tabEl);
      });
    }

    function renderContent() {
      const active = data.tabs.find(t => t.id === data.activeTabId);
      textEl.value = active ? (active.content || '') : '';
    }

    textEl.addEventListener('input', () => {
      const active = data.tabs.find(t => t.id === data.activeTabId);
      if (active) { active.content = textEl.value; ctx.save(); }
    });
    textEl.addEventListener('mousedown', e => e.stopPropagation());

    addBt.addEventListener('click', () => {
      const id = uniqueId();
      data.tabs.push({ id, title: `Tab ${data.tabs.length + 1}`, content: '' });
      data.activeTabId = id;
      ctx.save();
      renderTabs();
      renderContent();
      textEl.focus();
    });

    renderTabs();
    renderContent();
  }
});
