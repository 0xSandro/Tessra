import { register } from '../widget-registry.js';
import { escapeHtml } from '../utils.js';

// Each habit:
//   id, name, completions: { 'YYYY-MM-DD': true }

const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']; // Sun..Sat

function uniqueId() { return Math.random().toString(36).slice(2, 9); }

function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getStreak(habit) {
  const completions = habit.completions || {};
  const today = new Date(); today.setHours(0,0,0,0);
  let cursor = new Date(today);
  let streak = 0;
  // Allow today to be uncompleted without breaking yesterday's streak
  if (!completions[isoDate(cursor)]) cursor.setDate(cursor.getDate() - 1);
  while (completions[isoDate(cursor)]) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

register({
  type: 'habits',
  title: 'Habit Tracker',
  icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21c-3 0-6-2-6-5.5 0-2.5 1.5-3.5 2.5-6 0 0 1 1 1.5 2 1-2 4-5 6.5-5-1.5 4 3.5 5.5 0 11-1 2.5-2.5 3.5-4.5 3.5z"/><path d="M11 17a3 3 0 0 1 0-4c.3 1.7 2 2 2 4a2 2 0 0 1-2 0z"/></svg>',
  category: 'productivity',
  defaultSize: { w: 380, h: 280 },
  minSize:     { w: 280, h: 200 },

  defaultData: () => ({ habits: [] }),

  defaultSettings: () => ({ view: 'week' }),
  settingsSchema: [
    { key: 'view', type: 'select', label: 'View', options: [
      { value: 'week',  label: 'Week (7 days)' },
      { value: 'month', label: 'Month (30 days)' }
    ]}
  ],

  render(body, ctx) {
    const { data, settings } = ctx;
    body.innerHTML = `
      <div class="habits">
        <ul class="habit-list"></ul>
        <div class="habit-add-wrap"></div>
      </div>`;
    const list    = body.querySelector('.habit-list');
    const addWrap = body.querySelector('.habit-add-wrap');

    function getDays() {
      const count = settings.view === 'month' ? 30 : 7;
      const today = new Date(); today.setHours(0,0,0,0);
      const out = [];
      for (let i = count - 1; i >= 0; i--) {
        const d = new Date(today); d.setDate(d.getDate() - i);
        out.push(d);
      }
      return out;
    }

    function renderAll() {
      list.innerHTML = '';
      if (!data.habits.length) {
        const empty = document.createElement('li');
        empty.className = 'habit-empty';
        empty.textContent = 'No habits yet — add one below.';
        list.appendChild(empty);
        return;
      }
      const days = getDays();
      const todayIso = isoDate(new Date());
      data.habits.forEach((habit, idx) => {
        const completions = habit.completions || {};
        const streak = getStreak(habit);
        const li = document.createElement('li');
        li.className = 'habit-item';
        const cells = days.map(d => {
          const iso = isoDate(d);
          const done = !!completions[iso];
          const letter = DAY_LETTERS[d.getDay()];
          const isToday = iso === todayIso;
          const inner = settings.view === 'week' ? (done ? '✓' : letter) : '';
          return `<button class="habit-day ${done ? 'done' : ''} ${isToday ? 'today' : ''}" data-iso="${iso}" title="${iso}">${inner}</button>`;
        }).join('');
        li.innerHTML = `
          <div class="habit-header">
            <span class="habit-name" contenteditable="true" spellcheck="false">${escapeHtml(habit.name)}</span>
            <span class="habit-streak" title="Current streak">🔥 ${streak}</span>
            <button class="habit-del" title="Remove">×</button>
          </div>
          <div class="habit-days view-${settings.view}">${cells}</div>`;

        const nameEl = li.querySelector('.habit-name');
        nameEl.addEventListener('blur', () => {
          const v = (nameEl.textContent || '').trim();
          if (v && v !== habit.name) {
            habit.name = v;
            ctx.save();
          } else if (!v) {
            nameEl.textContent = habit.name;
          }
        });
        nameEl.addEventListener('keydown', e => {
          if (e.key === 'Enter') { e.preventDefault(); nameEl.blur(); }
          if (e.key === 'Escape') { e.preventDefault(); nameEl.textContent = habit.name; nameEl.blur(); }
        });
        nameEl.addEventListener('mousedown', e => e.stopPropagation());

        li.querySelectorAll('.habit-day').forEach(btn => {
          btn.addEventListener('click', () => {
            const iso = btn.dataset.iso;
            if (!habit.completions) habit.completions = {};
            if (habit.completions[iso]) delete habit.completions[iso];
            else habit.completions[iso] = true;
            ctx.save();
            renderAll();
          });
        });
        li.querySelector('.habit-del').addEventListener('click', () => {
          data.habits.splice(idx, 1);
          ctx.save();
          renderAll();
        });
        list.appendChild(li);
      });
    }

    function showAddButton() {
      addWrap.innerHTML = `<button class="habit-add">+ Add habit</button>`;
      addWrap.querySelector('.habit-add').addEventListener('click', showAddForm);
    }
    function showAddForm() {
      addWrap.innerHTML = `
        <form class="habit-add-form">
          <input type="text" class="habit-add-input" placeholder="Habit name…" maxlength="50"/>
          <button type="submit" class="habit-add-save">Add</button>
          <button type="button" class="habit-add-cancel" title="Cancel">×</button>
        </form>`;
      const form  = addWrap.querySelector('form');
      const input = addWrap.querySelector('.habit-add-input');
      input.focus();
      form.addEventListener('submit', e => {
        e.preventDefault();
        const name = input.value.trim();
        if (!name) { showAddButton(); return; }
        data.habits.push({ id: uniqueId(), name, completions: {} });
        ctx.save();
        showAddButton();
        renderAll();
      });
      addWrap.querySelector('.habit-add-cancel').addEventListener('click', showAddButton);
    }

    showAddButton();
    renderAll();
  }
});
