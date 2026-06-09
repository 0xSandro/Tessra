import { register } from '../widget-registry.js';
import { escapeHtml } from '../utils.js';

const MAX_CLIPS = 50;

register({
  type: 'clipboard',
  title: 'Clipboard',
  icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>',
  category: 'productivity',
  defaultSize: { w: 320, h: 280 },
  minSize:     { w: 240, h: 200 },

  defaultData: () => ({ clips: [] }),

  render(body, ctx) {
    const { data } = ctx;
    body.innerHTML = `
      <div class="clipboard">
        <ul class="clipboard-list"></ul>
        <button class="clipboard-capture">Save clipboard</button>
      </div>`;
    const list = body.querySelector('.clipboard-list');
    const capBt = body.querySelector('.clipboard-capture');

    function renderAll() {
      list.innerHTML = '';
      if (!data.clips || data.clips.length === 0) {
        const empty = document.createElement('li');
        empty.className = 'clipboard-empty';
        empty.textContent = 'No clips yet — copy something and tap “Save clipboard”.';
        list.appendChild(empty);
        return;
      }
      // Newest first
      data.clips.slice().reverse().forEach((clip, revIdx) => {
        const idx = data.clips.length - 1 - revIdx;
        const text = clip.text || '';
        const preview = text.length > 80 ? text.slice(0, 80) + '…' : text;
        const li = document.createElement('li');
        li.className = 'clipboard-item';
        li.innerHTML = `
          <div class="clipboard-text" title="Click to copy">${escapeHtml(preview)}</div>
          <button class="clipboard-del" title="Remove">×</button>`;
        li.querySelector('.clipboard-text').addEventListener('click', () => {
          navigator.clipboard.writeText(text).then(() => {
            const el = li.querySelector('.clipboard-text');
            el.classList.add('clipboard-copied');
            setTimeout(() => el.classList.remove('clipboard-copied'), 700);
          });
        });
        li.querySelector('.clipboard-del').addEventListener('click', e => {
          e.stopPropagation();
          data.clips.splice(idx, 1);
          renderAll();
          ctx.save();
        });
        list.appendChild(li);
      });
    }

    capBt.addEventListener('click', async () => {
      let text;
      try {
        text = await navigator.clipboard.readText();
      } catch (err) {
        // Permission denied or unavailable — fall back to a paste prompt
        text = prompt('Paste your text here:');
        if (text === null) return;
      }
      if (!text || !text.trim()) {
        alert('Nothing on the clipboard to save.');
        return;
      }
      // Skip if it's already the most recent clip
      const lastClip = data.clips[data.clips.length - 1];
      if (lastClip && lastClip.text === text) return;
      data.clips.push({ text, savedAt: Date.now() });
      if (data.clips.length > MAX_CLIPS) data.clips.shift();
      renderAll();
      ctx.save();
    });

    renderAll();
  }
});
