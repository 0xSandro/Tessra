import { register } from '../widget-registry.js';
import { escapeHtml, isSafeUrl } from '../utils.js';

// Wikipedia Random Article — the REST "random summary" endpoint returns a
// fresh random page (title, extract, optional thumbnail) on every call.
// Free, no auth, CORS-OK, already whitelisted for the On This Day widget.
// Endpoint: https://en.wikipedia.org/api/rest_v1/page/random/summary

async function fetchRandom() {
  const res = await fetch('https://en.wikipedia.org/api/rest_v1/page/random/summary');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

register({
  type: 'wikirandom',
  title: 'Wikipedia Roulette',
  icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>',
  category: 'info',
  defaultSize: { w: 320, h: 320 },
  minSize:     { w: 240, h: 220 },

  defaultData: () => ({
    article: null,
    fetchedAt: 0,
    error: null
  }),

  defaultSettings: () => ({
    showImage: true,
    autoRefresh: false,
    refreshInterval: 300
  }),
  settingsSchema: [
    { key: 'showImage', type: 'toggle', label: 'Show thumbnail' },
    { key: 'autoRefresh', type: 'toggle', label: 'Auto-shuffle' },
    { key: 'refreshInterval', type: 'slider', label: 'Auto-shuffle every', min: 60, max: 1800, step: 30, unit: 's' }
  ],

  render(body, ctx) {
    const { data, settings } = ctx;
    let cancelled = false;
    ctx.onCleanup(() => { cancelled = true; });

    body.innerHTML = `
      <div class="wr">
        <div class="wr-card">
          <div class="wr-header">
            <img class="wr-logo hidden" alt=""/>
            <div class="wr-title"></div>
          </div>
          <div class="wr-extract"></div>
        </div>
        <div class="wr-divider"></div>
        <div class="wr-actions">
          <a class="wr-btn wr-readmore" href="#" rel="noopener" target="_blank">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7"/><path d="M8 7h9v9"/></svg>
            Read more
          </a>
          <button type="button" class="wr-btn wr-shuffle">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>
            Regenerate
          </button>
        </div>
      </div>`;
    const logoEl    = body.querySelector('.wr-logo');
    const titleEl   = body.querySelector('.wr-title');
    const extractEl = body.querySelector('.wr-extract');
    const dividerEl = body.querySelector('.wr-divider');
    const shuffleBtn = body.querySelector('.wr-shuffle');
    const readMoreEl = body.querySelector('.wr-readmore');
    const actionsEl = body.querySelector('.wr-actions');

    function setChromeVisible(visible) {
      dividerEl.classList.toggle('hidden', !visible);
      actionsEl.classList.toggle('hidden', !visible);
    }

    function paint() {
      if (data.error && !data.article) {
        logoEl.classList.add('hidden');
        titleEl.textContent = '';
        extractEl.innerHTML = `<div class="wr-empty wr-error">${escapeHtml(data.error)}</div>`;
        setChromeVisible(false);
        return;
      }
      if (!data.article) {
        logoEl.classList.add('hidden');
        titleEl.textContent = '';
        extractEl.innerHTML = '<div class="wr-empty">Loading…</div>';
        setChromeVisible(false);
        return;
      }
      setChromeVisible(true);
      const a = data.article;
      const fallbackUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(a.titles?.canonical || a.title || '')}`;
      const url = isSafeUrl(a.content_urls?.desktop?.page) ? a.content_urls.desktop.page : fallbackUrl;
      const thumbSrc = a.thumbnail?.source;
      if (settings.showImage && isSafeUrl(thumbSrc)) {
        logoEl.src = thumbSrc;
        logoEl.classList.remove('hidden');
      } else {
        logoEl.removeAttribute('src');
        logoEl.classList.add('hidden');
      }
      titleEl.textContent = a.title || '';
      extractEl.textContent = a.extract || a.description || '';
      readMoreEl.href = url;
      ctx.setStale(!!data.error && !!data.article);
    }

    async function shuffle() {
      if (cancelled) return;
      shuffleBtn.disabled = true;
      try {
        const article = await fetchRandom();
        if (cancelled) return;
        data.article = article;
        data.fetchedAt = Date.now();
        data.error = null;
        ctx.save();
        paint();
      } catch (err) {
        if (cancelled) return;
        data.error = err.message || 'Failed to load article';
        paint();
        ctx.save();
      } finally {
        if (!cancelled) shuffleBtn.disabled = false;
      }
    }

    shuffleBtn.addEventListener('click', shuffle);

    paint();
    if (!data.article) shuffle();

    let autoTimer = null;
    function setupAuto() {
      if (autoTimer) clearInterval(autoTimer);
      autoTimer = null;
      if (settings.autoRefresh) {
        autoTimer = setInterval(shuffle, Math.max(60, settings.refreshInterval || 300) * 1000);
      }
    }
    setupAuto();
    ctx.onCleanup(() => { if (autoTimer) clearInterval(autoTimer); });
  }
});
