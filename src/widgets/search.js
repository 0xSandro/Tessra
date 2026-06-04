import { register } from '../widget-registry.js';

register({
  type: 'search',
  title: 'Search',
  icon: '⌕',
  category: 'web',
  defaultSize: { w: 460, h: 80 },
  defaultData: () => ({}),
  render(body) {
    body.innerHTML = `
      <form class="search-form">
        <input class="search-input" type="text" placeholder="Search the web..."/>
      </form>`;
    const form = body.querySelector('form');
    const input = body.querySelector('input');
    form.addEventListener('submit', e => {
      e.preventDefault();
      const q = input.value.trim();
      if (!q) return;
      window.location.href = 'https://duckduckgo.com/?q=' + encodeURIComponent(q);
    });
  }
});
