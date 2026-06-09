import { register } from '../widget-registry.js';

// Tiny markdown subset: headings, bold, italic, inline code, fenced code,
// links (http/https/mailto/anchor only — javascript: is blocked), unordered
// and ordered lists, blockquote, horizontal rule, paragraphs.
// Strategy: escape HTML first, then pull code blocks aside (so their content
// isn't reprocessed), do textual transforms, restore code.

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
}

function renderMarkdown(src) {
  let text = escapeHtml(src);

  // Extract fenced code blocks (preserve raw content)
  const codeBlocks = [];
  text = text.replace(/```([\s\S]*?)```/g, (_, c) => {
    codeBlocks.push(c.replace(/^\n/, ''));
    return `\x01CB${codeBlocks.length - 1}\x01`;
  });
  // Extract inline code
  const inlineCodes = [];
  text = text.replace(/`([^`\n]+)`/g, (_, c) => {
    inlineCodes.push(c);
    return `\x01IC${inlineCodes.length - 1}\x01`;
  });

  // Headings (longest first to avoid h1 matching ##)
  text = text.replace(/^###### (.*)$/gm, '<h6>$1</h6>')
             .replace(/^##### (.*)$/gm,  '<h5>$1</h5>')
             .replace(/^#### (.*)$/gm,   '<h4>$1</h4>')
             .replace(/^### (.*)$/gm,    '<h3>$1</h3>')
             .replace(/^## (.*)$/gm,     '<h2>$1</h2>')
             .replace(/^# (.*)$/gm,      '<h1>$1</h1>');

  // Bold and italic (bold before italic to avoid greedy bites)
  text = text.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
             .replace(/__([^_\n]+)__/g,     '<strong>$1</strong>')
             .replace(/\*([^*\n]+)\*/g,     '<em>$1</em>')
             .replace(/(?<!\w)_([^_\n]+)_(?!\w)/g, '<em>$1</em>');

  // Links: only safe URL schemes allowed
  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, url) => {
    if (!/^(https?:|mailto:|#|\/)/i.test(url)) return m;
    return `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  });

  // Horizontal rule
  text = text.replace(/^---+$/gm, '<hr/>');

  // Blockquote (> was escaped earlier to &gt;)
  text = text.replace(/^&gt; (.*)$/gm, '<blockquote>$1</blockquote>');

  // Unordered lists
  text = text.replace(/(?:^[-*] .+\n?)+/gm, m => {
    const items = m.trim().split('\n').map(line =>
      `<li>${line.replace(/^[-*] /, '')}</li>`
    ).join('');
    return `<ul>${items}</ul>\n`;
  });
  // Ordered lists
  text = text.replace(/(?:^\d+\. .+\n?)+/gm, m => {
    const items = m.trim().split('\n').map(line =>
      `<li>${line.replace(/^\d+\. /, '')}</li>`
    ).join('');
    return `<ol>${items}</ol>\n`;
  });

  // Paragraphs: split on blank lines, wrap loose text
  text = text.split(/\n{2,}/).map(b => {
    b = b.trim();
    if (!b) return '';
    if (/^(<(h[1-6]|ul|ol|hr|blockquote|pre)|\x01CB)/.test(b)) return b;
    return `<p>${b.replace(/\n/g, '<br/>')}</p>`;
  }).join('\n');

  // Restore code
  text = text.replace(/\x01CB(\d+)\x01/g, (_, i) => `<pre><code>${codeBlocks[+i]}</code></pre>`);
  text = text.replace(/\x01IC(\d+)\x01/g, (_, i) => `<code>${inlineCodes[+i]}</code>`);
  return text;
}

register({
  type: 'markdown',
  title: 'Markdown',
  icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M6 14V10l2 2 2-2v4"/><path d="M14 10v4M16 10v4M14 12h2"/><path d="M18 11v3l-1.5-1.5L18 14"/></svg>',
  category: 'developer',
  defaultSize: { w: 480, h: 320 },
  minSize:     { w: 300, h: 200 },

  defaultData: () => ({
    text: '# Scratchpad\n\nType **markdown** here and the preview updates live.\n\n- Lists\n- _italic_ and **bold**\n- `inline code`\n\n```\nfenced code block\n```'
  }),

  defaultSettings: () => ({ view: 'split' }),
  settingsSchema: [
    { key: 'view', type: 'select', label: 'View', options: [
      { value: 'split',   label: 'Edit + Preview' },
      { value: 'edit',    label: 'Edit only' },
      { value: 'preview', label: 'Preview only' }
    ]}
  ],

  render(body, ctx) {
    const { data, settings } = ctx;
    body.innerHTML = `
      <div class="md view-${settings.view}">
        <textarea class="md-input" placeholder="Type markdown…" spellcheck="false"></textarea>
        <div class="md-preview"></div>
      </div>`;
    const inputEl   = body.querySelector('.md-input');
    const previewEl = body.querySelector('.md-preview');
    inputEl.value = data.text || '';

    function render() {
      previewEl.innerHTML = renderMarkdown(data.text || '');
    }
    inputEl.addEventListener('input', () => {
      data.text = inputEl.value;
      render();
      ctx.save();
    });
    render();
  }
});
