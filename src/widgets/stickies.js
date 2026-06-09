import { register } from '../widget-registry.js';

// Soft pastel "sticky note" colors
const COLORS = ['#FEF3C7', '#FCE7F3', '#D1FAE5', '#DBEAFE', '#E9D5FF', '#FED7AA'];

function uniqueId() { return Math.random().toString(36).slice(2, 9); }

register({
  type: 'stickies',
  title: 'Sticky Notes',
  icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="13" height="13" rx="1.5"/><rect x="7" y="8" width="13" height="13" rx="1.5"/></svg>',
  category: 'productivity',
  defaultSize: { w: 320, h: 320 },
  minSize:     { w: 240, h: 200 },

  defaultData: () => ({ notes: [] }),

  render(body, ctx) {
    const { data } = ctx;
    body.innerHTML = `
      <div class="stickies">
        <button class="stickies-add">+ Add note</button>
        <div class="stickies-list"></div>
      </div>`;
    const list   = body.querySelector('.stickies-list');
    const addBt  = body.querySelector('.stickies-add');

    function renderAll() {
      list.innerHTML = '';
      if (!data.notes.length) {
        const empty = document.createElement('div');
        empty.className = 'stickies-empty';
        empty.textContent = 'No notes yet.';
        list.appendChild(empty);
        return;
      }
      // Pinned first; then newest-first by createdAt
      const sorted = data.notes.slice().sort((a, b) => {
        if ((a.pinned ? 1 : 0) !== (b.pinned ? 1 : 0)) return a.pinned ? -1 : 1;
        return (b.createdAt || 0) - (a.createdAt || 0);
      });
      sorted.forEach(note => {
        const card = document.createElement('div');
        card.className = 'sticky-card' + (note.pinned ? ' pinned' : '');
        card.style.background = note.color || COLORS[0];
        if (note.height) card.style.height = note.height + 'px';
        card.innerHTML = `
          <div class="sticky-actions">
            <button class="sticky-pin" title="${note.pinned ? 'Unpin' : 'Pin'}" aria-pressed="${note.pinned ? 'true' : 'false'}">
              <svg viewBox="0 0 24 24" width="11" height="11" fill="${note.pinned ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M9 10.76V6h2V3h2v3h2v4.76L19 14H5z"/></svg>
            </button>
            <button class="sticky-color" title="Change color" style="background:${nextColor(note.color)}"></button>
            <button class="sticky-del" title="Remove">×</button>
          </div>
          <div class="sticky-text" contenteditable="true" spellcheck="false"></div>
          <div class="sticky-resize" title="Drag to resize"></div>`;
        const textEl = card.querySelector('.sticky-text');
        textEl.textContent = note.text || '';
        textEl.addEventListener('input', () => {
          note.text = textEl.textContent;
          ctx.save();
        });
        // Prevent the widget drag from starting when interacting with the note body
        card.addEventListener('mousedown', e => e.stopPropagation());

        card.querySelector('.sticky-pin').addEventListener('click', () => {
          note.pinned = !note.pinned;
          ctx.save();
          renderAll();
        });
        const colorBt = card.querySelector('.sticky-color');
        colorBt.addEventListener('click', () => {
          note.color = nextColor(note.color);
          card.style.background = note.color;
          colorBt.style.background = nextColor(note.color);
          ctx.save();
        });
        card.querySelector('.sticky-del').addEventListener('click', () => {
          const i = data.notes.findIndex(n => n.id === note.id);
          if (i >= 0) data.notes.splice(i, 1);
          ctx.save();
          renderAll();
        });

        // Per-note vertical resize
        const handle = card.querySelector('.sticky-resize');
        let startY, startH, resizing = false;
        handle.addEventListener('mousedown', e => {
          e.preventDefault();
          e.stopPropagation();
          resizing = true;
          startY = e.clientY;
          startH = card.offsetHeight;
          card.classList.add('resizing');
        });
        const onMove = e => {
          if (!resizing) return;
          const next = Math.max(60, startH + (e.clientY - startY));
          card.style.height = next + 'px';
          note.height = next;
        };
        const onUp = () => {
          if (!resizing) return;
          resizing = false;
          card.classList.remove('resizing');
          ctx.save();
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        ctx.onCleanup(() => {
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
        });

        list.appendChild(card);
      });
    }

    function nextColor(current) {
      const i = COLORS.indexOf(current || COLORS[0]);
      return COLORS[(i + 1) % COLORS.length];
    }

    addBt.addEventListener('click', () => {
      const newNote = {
        id: uniqueId(),
        text: '',
        color: COLORS[0],
        pinned: false,
        createdAt: Date.now()
      };
      data.notes.push(newNote);
      ctx.save();
      renderAll();
    });

    renderAll();
  }
});
