import { register } from '../widget-registry.js';
import { escapeHtml } from '../utils.js';

register({
  type: 'todo',
  title: 'To-do',
  icon: '☑',
  category: 'productivity',
  defaultSize: { w: 320, h: 260 },
  defaultData: () => ({ todos: [] }),
  render(body, ctx) {
    const data = ctx.data;
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
          t.done = e.target.checked; render(); ctx.save();
        });
        li.querySelector('.todo-del').addEventListener('click', () => {
          data.todos.splice(idx, 1); render(); ctx.save();
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
          inp.value = ''; render(); ctx.save();
        }
      });
      body.appendChild(inp);
    };
    render();
  }
});
