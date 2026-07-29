import { register } from '../widget-registry.js';
import { escapeHtml } from '../utils.js';

register({
  type: 'todo',
  title: 'To-do',
  icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 12l2.5 2.5L16 9"/></svg>',
  category: 'productivity',
  defaultSize: { w: 320, h: 260 },
  minSize:     { w: 200, h: 120 },
  defaultData: () => ({ todos: [] }),
  render(body, ctx) {
    const data = ctx.data;
    body.innerHTML = `
      <div class="todo">
        <ul class="todo-list"></ul>
        <input class="todo-input" placeholder="Add task and press Enter"/>
      </div>`;
    const listEl  = body.querySelector('.todo-list');
    const inputEl = body.querySelector('.todo-input');

    function renderList() {
      listEl.innerHTML = '';
      data.todos.forEach((t, idx) => {
        const li = document.createElement('li');
        li.className = t.done ? 'done' : '';
        li.innerHTML = `
          <input type="checkbox" ${t.done?'checked':''} />
          <span class="todo-text">${escapeHtml(t.text)}</span>
          <button class="todo-del" title="Remove">×</button>`;
        li.querySelector('input').addEventListener('change', e => {
          t.done = e.target.checked; renderList(); ctx.save();
        });
        li.querySelector('.todo-del').addEventListener('click', () => {
          data.todos.splice(idx, 1); renderList(); ctx.save();
        });
        listEl.appendChild(li);
      });
    }

    inputEl.addEventListener('keydown', e => {
      if (e.key === 'Enter' && inputEl.value.trim()) {
        data.todos.push({ text: inputEl.value.trim(), done: false });
        inputEl.value = '';
        renderList();
        ctx.save();
      }
    });

    renderList();
  }
});
