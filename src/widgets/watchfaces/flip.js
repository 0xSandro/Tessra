import { registerFace } from './registry.js';

// Flip Clock — split-flap aesthetic without the flip animation. Chunky digits
// on dark cards with a horizontal seam at the middle (the classic
// flip-card "fold line"). Updates instantly. Cheap to render.

function digitsFor(now, settings) {
  let h = now.getHours();
  const m = now.getMinutes();
  const s = now.getSeconds();
  let ampm = '';
  if (settings.format === '12h') {
    ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
  }
  const pad = n => String(n).padStart(2, '0');
  return { h: pad(h), m: pad(m), s: pad(s), ampm };
}

registerFace({
  id: 'flip',
  label: 'Flip Clock',
  mount(host, settings) {
    const showSec = !!settings.showSeconds;
    host.innerHTML = `
      <div class="clock-face clock-flip">
        <div class="flip-row">
          <div class="flip-group">
            <div class="flip-digit" data-slot="h1"></div>
            <div class="flip-digit" data-slot="h2"></div>
          </div>
          <div class="flip-sep">:</div>
          <div class="flip-group">
            <div class="flip-digit" data-slot="m1"></div>
            <div class="flip-digit" data-slot="m2"></div>
          </div>
          ${showSec ? `
            <div class="flip-sep">:</div>
            <div class="flip-group flip-seconds">
              <div class="flip-digit flip-digit-small" data-slot="s1"></div>
              <div class="flip-digit flip-digit-small" data-slot="s2"></div>
            </div>` : ''}
        </div>
        <div class="flip-meta">
          <span class="flip-ampm"></span>
          <span class="flip-date"></span>
        </div>
      </div>`;

    // Cache slot references so we only touch a digit when it actually changes.
    // Prevents pointless DOM writes from triggering style invalidation 60 times
    // a minute. (Yes, it's tiny — still cheap to do it right.)
    const slots = {
      h1: host.querySelector('[data-slot="h1"]'),
      h2: host.querySelector('[data-slot="h2"]'),
      m1: host.querySelector('[data-slot="m1"]'),
      m2: host.querySelector('[data-slot="m2"]'),
      s1: showSec ? host.querySelector('[data-slot="s1"]') : null,
      s2: showSec ? host.querySelector('[data-slot="s2"]') : null
    };
    const ampmEl = host.querySelector('.flip-ampm');
    const dateEl = host.querySelector('.flip-date');
    const prev = {};

    function setSlot(key, ch) {
      if (!slots[key]) return;
      if (prev[key] === ch) return;
      slots[key].textContent = ch;
      prev[key] = ch;
    }

    return (now) => {
      const { h, m, s, ampm } = digitsFor(now, settings);
      setSlot('h1', h[0]); setSlot('h2', h[1]);
      setSlot('m1', m[0]); setSlot('m2', m[1]);
      if (showSec) { setSlot('s1', s[0]); setSlot('s2', s[1]); }
      if (ampm && ampmEl.textContent !== ampm) ampmEl.textContent = ampm;
      const ds = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
      if (dateEl.textContent !== ds) dateEl.textContent = ds;
    };
  }
});
