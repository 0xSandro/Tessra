import { register } from '../widget-registry.js';
import { escapeHtml } from '../utils.js';

function uniqueId() { return Math.random().toString(36).slice(2, 9); }

register({
  type: 'goals',
  title: 'Goal Tracker',
  icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2" fill="currentColor"/></svg>',
  category: 'productivity',
  defaultSize: { w: 320, h: 280 },
  minSize:     { w: 240, h: 200 },

  defaultData: () => ({ goals: [] }),

  render(body, ctx) {
    const { data } = ctx;
    body.innerHTML = `
      <div class="goals">
        <ul class="goal-list"></ul>
        <div class="goal-add-wrap">
          <button class="goal-add">+ Add goal</button>
        </div>
      </div>`;
    const list = body.querySelector('.goal-list');
    const addBt = body.querySelector('.goal-add');

    function renderAll(editId = null) {
      list.innerHTML = '';
      if (!data.goals.length && !editId) {
        const empty = document.createElement('li');
        empty.className = 'goal-empty';
        empty.textContent = 'No goals yet.';
        list.appendChild(empty);
        return;
      }
      data.goals.forEach((goal, idx) => {
        const li = document.createElement('li');
        li.className = 'goal-item';
        if (goal.id === editId) {
          li.innerHTML = `
            <input type="text" class="goal-edit-name" placeholder="Goal name"/>
            <div class="goal-edit-row">
              <input type="number" class="goal-edit-current" min="0" step="any"/>
              <span class="goal-edit-sep">/</span>
              <input type="number" class="goal-edit-target" min="1" step="any"/>
              <input type="text" class="goal-edit-unit" placeholder="unit (optional)" maxlength="20"/>
            </div>
            <div class="goal-edit-actions">
              <button class="goal-edit-cancel">Cancel</button>
              <button class="goal-edit-save">Save</button>
            </div>`;
          const nameEl = li.querySelector('.goal-edit-name');
          const curEl  = li.querySelector('.goal-edit-current');
          const tarEl  = li.querySelector('.goal-edit-target');
          const unitEl = li.querySelector('.goal-edit-unit');
          nameEl.value = goal.name || '';
          curEl.value  = goal.current ?? 0;
          tarEl.value  = goal.target ?? 1;
          unitEl.value = goal.unit || '';
          (nameEl.value ? curEl : nameEl).focus();
          li.querySelector('.goal-edit-save').addEventListener('click', () => {
            goal.name    = nameEl.value.trim() || 'Untitled';
            goal.current = Math.max(0, parseFloat(curEl.value) || 0);
            goal.target  = Math.max(0.0001, parseFloat(tarEl.value) || 1);
            goal.unit    = unitEl.value.trim();
            ctx.save();
            renderAll();
          });
          li.querySelector('.goal-edit-cancel').addEventListener('click', () => {
            // If never saved (empty), discard the placeholder
            if (!goal.name && !goal.current && goal.target === 1 && !goal.unit) {
              data.goals.splice(idx, 1);
              ctx.save();
            }
            renderAll();
          });
        } else {
          const target = goal.target || 1;
          const current = goal.current || 0;
          const pct = Math.min(100, Math.max(0, Math.round((current / target) * 100)));
          const complete = current >= target;
          li.innerHTML = `
            <div class="goal-header">
              <span class="goal-name">${escapeHtml(goal.name || 'Untitled')}</span>
              <button class="goal-edit" title="Edit">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
              </button>
              <button class="goal-del" title="Remove">×</button>
            </div>
            <div class="goal-bar">
              <div class="goal-bar-fill ${complete ? 'complete' : ''}" style="width:${pct}%"></div>
              <div class="goal-bar-tick" style="left:25%"></div>
              <div class="goal-bar-tick" style="left:50%"></div>
              <div class="goal-bar-tick" style="left:75%"></div>
            </div>
            <div class="goal-stats">
              <span class="goal-progress">${formatNum(current)} / ${formatNum(target)}${goal.unit ? ' ' + escapeHtml(goal.unit) : ''}</span>
              <span class="goal-pct ${complete ? 'complete' : ''}">${pct}%</span>
            </div>
            <div class="goal-controls">
              <button class="goal-dec" title="−1">−</button>
              <button class="goal-inc" title="+1">+</button>
            </div>`;
          li.querySelector('.goal-inc').addEventListener('click', () => {
            goal.current = (goal.current || 0) + 1;
            ctx.save();
            renderAll();
          });
          li.querySelector('.goal-dec').addEventListener('click', () => {
            goal.current = Math.max(0, (goal.current || 0) - 1);
            ctx.save();
            renderAll();
          });
          li.querySelector('.goal-edit').addEventListener('click', () => renderAll(goal.id));
          li.querySelector('.goal-del').addEventListener('click', () => {
            data.goals.splice(idx, 1);
            ctx.save();
            renderAll();
          });
        }
        list.appendChild(li);
      });
    }

    function formatNum(n) {
      // Trim unnecessary decimals
      return parseFloat(Number(n).toFixed(2)).toString();
    }

    addBt.addEventListener('click', () => {
      const newGoal = { id: uniqueId(), name: '', current: 0, target: 1, unit: '' };
      data.goals.push(newGoal);
      // Don't save until the user commits via Save
      renderAll(newGoal.id);
    });

    renderAll();
  }
});
