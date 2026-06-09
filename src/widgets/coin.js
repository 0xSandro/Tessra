import { register } from '../widget-registry.js';

const HISTORY_SIZE = 5;

register({
  type: 'coin',
  title: 'Coin Flip',
  icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/></svg>',
  category: 'random',
  defaultSize: { w: 240, h: 240 },
  minSize:     { w: 200, h: 200 },

  defaultData: () => ({ last: null, history: [] }),

  render(body, ctx) {
    const { data } = ctx;
    body.innerHTML = `
      <div class="coin">
        <div class="coin-history"></div>
        <div class="coin-face"></div>
        <button class="coin-flip">Flip</button>
      </div>`;
    const historyEl = body.querySelector('.coin-history');
    const faceEl    = body.querySelector('.coin-face');
    const flipBtn   = body.querySelector('.coin-flip');

    function refresh() {
      // Last face
      if (data.last) {
        faceEl.textContent = data.last;
        faceEl.className = 'coin-face coin-' + data.last.toLowerCase();
      } else {
        faceEl.textContent = '?';
        faceEl.className = 'coin-face coin-empty';
      }
      // History strip (oldest left, newest right; empty slots pad on the left)
      const history = data.history || [];
      const filler = Math.max(0, HISTORY_SIZE - history.length);
      const dots = [];
      for (let i = 0; i < filler; i++) {
        dots.push(`<div class="coin-history-dot coin-empty">·</div>`);
      }
      history.slice(-HISTORY_SIZE).forEach(r => {
        const cls = r === 'Heads' ? 'h' : 't';
        const letter = r === 'Heads' ? 'H' : 'T';
        dots.push(`<div class="coin-history-dot coin-${cls}">${letter}</div>`);
      });
      historyEl.innerHTML = dots.join('');
    }

    flipBtn.addEventListener('click', () => {
      faceEl.classList.add('flipping');
      setTimeout(() => {
        const result = Math.random() < 0.5 ? 'Heads' : 'Tails';
        data.last = result;
        if (!Array.isArray(data.history)) data.history = [];
        data.history.push(result);
        if (data.history.length > HISTORY_SIZE) data.history.shift();
        refresh();
        faceEl.classList.remove('flipping');
        ctx.save();
      }, 350);
    });

    refresh();
  }
});
