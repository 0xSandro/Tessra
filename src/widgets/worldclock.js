import { register } from '../widget-registry.js';
import { escapeHtml } from '../utils.js';

// Curated set of common IANA zones, grouped by region for the picker dropdown.
const timezoneGroups = [
  { region: 'UTC', zones: [
    { tz: 'UTC', label: 'UTC' }
  ]},
  { region: 'Americas', zones: [
    { tz: 'America/Anchorage',    label: 'Anchorage' },
    { tz: 'America/Los_Angeles',  label: 'Los Angeles' },
    { tz: 'America/Denver',       label: 'Denver' },
    { tz: 'America/Chicago',      label: 'Chicago' },
    { tz: 'America/New_York',     label: 'New York' },
    { tz: 'America/Toronto',      label: 'Toronto' },
    { tz: 'America/Mexico_City',  label: 'Mexico City' },
    { tz: 'America/Bogota',       label: 'Bogotá' },
    { tz: 'America/Sao_Paulo',    label: 'São Paulo' },
    { tz: 'America/Argentina/Buenos_Aires', label: 'Buenos Aires' }
  ]},
  { region: 'Europe', zones: [
    { tz: 'Europe/Lisbon',     label: 'Lisbon' },
    { tz: 'Europe/Dublin',     label: 'Dublin' },
    { tz: 'Europe/London',     label: 'London' },
    { tz: 'Europe/Madrid',     label: 'Madrid' },
    { tz: 'Europe/Paris',      label: 'Paris' },
    { tz: 'Europe/Amsterdam',  label: 'Amsterdam' },
    { tz: 'Europe/Berlin',     label: 'Berlin' },
    { tz: 'Europe/Zurich',     label: 'Zürich' },
    { tz: 'Europe/Rome',       label: 'Rome' },
    { tz: 'Europe/Vienna',     label: 'Vienna' },
    { tz: 'Europe/Warsaw',     label: 'Warsaw' },
    { tz: 'Europe/Stockholm',  label: 'Stockholm' },
    { tz: 'Europe/Helsinki',   label: 'Helsinki' },
    { tz: 'Europe/Athens',     label: 'Athens' },
    { tz: 'Europe/Istanbul',   label: 'Istanbul' },
    { tz: 'Europe/Moscow',     label: 'Moscow' }
  ]},
  { region: 'Africa', zones: [
    { tz: 'Africa/Lagos',         label: 'Lagos' },
    { tz: 'Africa/Cairo',         label: 'Cairo' },
    { tz: 'Africa/Nairobi',       label: 'Nairobi' },
    { tz: 'Africa/Johannesburg',  label: 'Johannesburg' }
  ]},
  { region: 'Asia', zones: [
    { tz: 'Asia/Dubai',     label: 'Dubai' },
    { tz: 'Asia/Riyadh',    label: 'Riyadh' },
    { tz: 'Asia/Karachi',   label: 'Karachi' },
    { tz: 'Asia/Kolkata',   label: 'Mumbai / Delhi' },
    { tz: 'Asia/Bangkok',   label: 'Bangkok' },
    { tz: 'Asia/Jakarta',   label: 'Jakarta' },
    { tz: 'Asia/Singapore', label: 'Singapore' },
    { tz: 'Asia/Manila',    label: 'Manila' },
    { tz: 'Asia/Hong_Kong', label: 'Hong Kong' },
    { tz: 'Asia/Taipei',    label: 'Taipei' },
    { tz: 'Asia/Shanghai',  label: 'Beijing / Shanghai' },
    { tz: 'Asia/Seoul',     label: 'Seoul' },
    { tz: 'Asia/Tokyo',     label: 'Tokyo' }
  ]},
  { region: 'Australia / Pacific', zones: [
    { tz: 'Australia/Perth',     label: 'Perth' },
    { tz: 'Australia/Adelaide',  label: 'Adelaide' },
    { tz: 'Australia/Brisbane',  label: 'Brisbane' },
    { tz: 'Australia/Sydney',    label: 'Sydney' },
    { tz: 'Pacific/Auckland',    label: 'Auckland' },
    { tz: 'Pacific/Honolulu',    label: 'Honolulu' }
  ]}
];

const allZones = timezoneGroups.flatMap(g => g.zones);

register({
  type: 'worldclock',
  title: 'World Clock',
  icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15 15 0 0 1 4 10 15 15 0 0 1-4 10 15 15 0 0 1-4-10 15 15 0 0 1 4-10z"/></svg>',
  category: 'time',
  defaultSize: { w: 280, h: 240 },
  minSize:     { w: 220, h: 160 },

  defaultData: () => ({
    zones: [
      { label: 'UTC', tz: 'UTC' }
    ]
  }),

  defaultSettings: () => ({
    format: '24h',
    showSeconds: false
  }),
  settingsSchema: [
    { key: 'format', type: 'select', label: 'Format', options: [
      { value: '24h', label: '24-hour' },
      { value: '12h', label: '12-hour' }
    ]},
    { key: 'showSeconds', type: 'toggle', label: 'Show seconds' }
  ],

  render(body, ctx) {
    const { data, settings } = ctx;

    const opts = {
      hour: '2-digit',
      minute: '2-digit',
      hour12: settings.format === '12h'
    };
    if (settings.showSeconds) opts.second = '2-digit';

    function renderList() {
      body.innerHTML = `
        <ul class="wc-list"></ul>
        <div class="wc-add-row"></div>`;
      const ul = body.querySelector('.wc-list');
      data.zones.forEach((z, idx) => {
        const li = document.createElement('li');
        li.className = 'wc-item';
        li.innerHTML = `
          <div class="wc-info">
            <div class="wc-label">${escapeHtml(z.label)}</div>
            <div class="wc-tz">${escapeHtml(z.tz)}</div>
          </div>
          <div class="wc-time" data-tz="${escapeHtml(z.tz)}">--:--</div>
          <button class="wc-del" title="Remove">×</button>`;
        li.querySelector('.wc-del').addEventListener('click', () => {
          data.zones.splice(idx, 1);
          ctx.save();
          renderList();
          tick();
        });
        ul.appendChild(li);
      });
      showAddButton();
    }

    function showAddButton() {
      const addRow = body.querySelector('.wc-add-row');
      addRow.innerHTML = `<button class="wc-add">+ Add timezone</button>`;
      addRow.querySelector('.wc-add').addEventListener('click', showAddSelect);
    }

    function showAddSelect() {
      const addRow = body.querySelector('.wc-add-row');
      const optGroups = timezoneGroups.map(g => `
        <optgroup label="${escapeHtml(g.region)}">
          ${g.zones.map(z => `<option value="${escapeHtml(z.tz)}">${escapeHtml(z.label)}</option>`).join('')}
        </optgroup>`).join('');
      addRow.innerHTML = `
        <select class="wc-add-select select-input">
          <option value="">Choose timezone…</option>${optGroups}
        </select>`;
      const sel = addRow.querySelector('select');
      sel.focus();
      sel.addEventListener('change', () => {
        const tz = sel.value;
        if (!tz) return;
        const z = allZones.find(z => z.tz === tz);
        data.zones.push({ label: z?.label || tz, tz });
        ctx.save();
        renderList();
        tick();
      });
      sel.addEventListener('blur', () => {
        // If the select is still in DOM (user didn't pick anything), revert to button
        if (addRow.contains(sel)) showAddButton();
      });
    }

    function tick() {
      body.querySelectorAll('.wc-time').forEach(el => {
        const tz = el.dataset.tz;
        try {
          el.textContent = new Date().toLocaleTimeString([], { ...opts, timeZone: tz });
        } catch {
          el.textContent = '??';
        }
      });
    }

    renderList();
    tick();
    const interval = setInterval(tick, settings.showSeconds ? 1000 : 15000);
    ctx.onCleanup(() => clearInterval(interval));
  }
});
