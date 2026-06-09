import { register } from '../widget-registry.js';

register({
  type: 'notes',
  title: 'Notes',
  icon: '✎',
  category: 'productivity',
  defaultSize: { w: 320, h: 260 },
  minSize:     { w: 180, h: 100 },
  autoNumber:  true,
  defaultData: () => ({ notes: '' }),
  render(body, ctx) {
    const data = ctx.data;
    body.innerHTML = '';
    const ta = document.createElement('textarea');
    ta.className = 'notes-textarea';
    ta.placeholder = 'Notes…';
    ta.value = data.notes || '';
    ta.addEventListener('input', () => { data.notes = ta.value; ctx.save(); });
    body.appendChild(ta);
  }
});
