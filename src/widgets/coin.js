import { register } from '../widget-registry.js';

register({
  type: 'coin',
  title: 'Coin Flip',
  icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/></svg>',
  category: 'random',
  defaultSize: { w: 240, h: 220 },
  minSize:     { w: 200, h: 180 },

  defaultData: () => ({ last: null }),

  render(body, ctx) {
    const { data } = ctx;
    body.innerHTML = `
      <div class="coin">
        <div class="coin-face"></div>
        <button class="coin-flip">Flip</button>
      </div>`;
    const faceEl = body.querySelector('.coin-face');
    const flipBtn = body.querySelector('.coin-flip');

    function refresh() {
      if (data.last) {
        faceEl.textContent = data.last;
        faceEl.className = 'coin-face coin-' + data.last.toLowerCase();
      } else {
        faceEl.textContent = '?';
        faceEl.className = 'coin-face coin-empty';
      }
    }

    flipBtn.addEventListener('click', () => {
      // Brief animation cue, then resolve
      faceEl.classList.add('flipping');
      setTimeout(() => {
        data.last = Math.random() < 0.5 ? 'Heads' : 'Tails';
        refresh();
        faceEl.classList.remove('flipping');
        ctx.save();
      }, 350);
    });

    refresh();
  }
});
