import { register } from '../widget-registry.js';

const ENGINES = {
  duckduckgo: { label: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' },
  google:     { label: 'Google',     url: 'https://www.google.com/search?q=' },
  bing:       { label: 'Bing',       url: 'https://www.bing.com/search?q=' },
  brave:      { label: 'Brave',      url: 'https://search.brave.com/search?q=' },
  startpage:  { label: 'Startpage',  url: 'https://www.startpage.com/do/search?query=' },
  ecosia:     { label: 'Ecosia',     url: 'https://www.ecosia.org/search?q=' },
  yahoo:      { label: 'Yahoo',      url: 'https://search.yahoo.com/search?p=' }
};

register({
  type: 'search',
  title: 'Search',
  icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="10.5" cy="10.5" r="6.5"/><line x1="15.3" y1="15.3" x2="20.5" y2="20.5"/></svg>',
  category: 'web',
  defaultSize: { w: 480, h: 110 },
  minSize:     { w: 240, h: 80 },
  defaultData: () => ({}),

  defaultSettings: () => ({
    engine: 'google'
  }),
  settingsSchema: [
    { key: 'engine', type: 'select', label: 'Engine', options:
      Object.entries(ENGINES).map(([value, e]) => ({ value, label: e.label }))
    }
  ],

  render(body, ctx) {
    const { settings } = ctx;
    const engine = ENGINES[settings.engine] || ENGINES.google;

    body.innerHTML = `
      <form class="search-form">
        <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7"/>
          <line x1="16.5" y1="16.5" x2="21" y2="21"/>
        </svg>
        <input class="search-input" type="text" placeholder="Search ${engine.label}…" autocomplete="off"/>
      </form>`;
    const form  = body.querySelector('form');
    const input = body.querySelector('input');
    form.addEventListener('submit', e => {
      e.preventDefault();
      const q = input.value.trim();
      if (!q) return;
      window.location.href = engine.url + encodeURIComponent(q);
    });
  }
});
