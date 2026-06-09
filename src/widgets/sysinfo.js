import { register } from '../widget-registry.js';

// Browser sandbox limitations:
//   No web API gives real-time CPU%, RAM%, disk usage, or download/upload speed.
//   This widget surfaces what is actually exposed: hardware tier hints
//   (cores, deviceMemory), the browser's network estimate, the Battery API
//   (deprecated in Firefox), and the extension's storage quota usage.

register({
  type: 'sysinfo',
  title: 'System Info',
  icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="2" x2="9" y2="4"/><line x1="15" y1="2" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="22"/><line x1="15" y1="20" x2="15" y2="22"/><line x1="20" y1="9" x2="22" y2="9"/><line x1="20" y1="15" x2="22" y2="15"/><line x1="2" y1="9" x2="4" y2="9"/><line x1="2" y1="15" x2="4" y2="15"/></svg>',
  category: 'info',
  defaultSize: { w: 300, h: 240 },
  minSize:     { w: 240, h: 180 },

  defaultData: () => ({}),

  render(body, ctx) {
    body.innerHTML = `
      <div class="sysinfo">
        <div class="sysinfo-row" data-key="cpu">
          <span class="sysinfo-label">CPU cores</span>
          <span class="sysinfo-value">—</span>
        </div>
        <div class="sysinfo-row" data-key="mem">
          <span class="sysinfo-label">Device memory</span>
          <span class="sysinfo-value">—</span>
        </div>
        <div class="sysinfo-row" data-key="net">
          <span class="sysinfo-label">Connection</span>
          <span class="sysinfo-value">—</span>
        </div>
        <div class="sysinfo-row" data-key="bat">
          <span class="sysinfo-label">Battery</span>
          <span class="sysinfo-value">—</span>
        </div>
        <div class="sysinfo-row" data-key="storage">
          <span class="sysinfo-label">Storage used</span>
          <span class="sysinfo-value">—</span>
        </div>
        <p class="sysinfo-note">Live CPU / RAM / disk monitoring isn't exposed to browser extensions. Values shown are what the browser reports.</p>
      </div>`;

    function setVal(key, value) {
      const el = body.querySelector(`[data-key="${key}"] .sysinfo-value`);
      if (el) el.textContent = value;
    }
    function setMissing(key) { setVal(key, 'Not available'); }

    // CPU cores (logical)
    setVal('cpu', `${navigator.hardwareConcurrency || '?'} cores`);

    // Device memory tier (rounded by the browser to {0.25,0.5,1,2,4,8} GB, max 8 per spec)
    if (navigator.deviceMemory) setVal('mem', `~${navigator.deviceMemory} GB`);
    else setMissing('mem');

    // Network Information API (Firefox: needs about:config flag for some fields)
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    function updateNet() {
      if (!conn) { setMissing('net'); return; }
      const parts = [];
      if (conn.effectiveType) parts.push(conn.effectiveType.toUpperCase());
      if (conn.downlink)     parts.push(`~${conn.downlink} Mbps`);
      if (conn.rtt)          parts.push(`${conn.rtt} ms`);
      setVal('net', parts.length ? parts.join(' · ') : (navigator.onLine ? 'Online' : 'Offline'));
    }
    updateNet();
    if (conn) {
      conn.addEventListener('change', updateNet);
      ctx.onCleanup(() => conn.removeEventListener('change', updateNet));
    }

    // Battery (deprecated; many browsers return undefined or reject)
    if (typeof navigator.getBattery === 'function') {
      navigator.getBattery().then(battery => {
        function updateBat() {
          const pct = Math.round(battery.level * 100);
          const status = battery.charging ? 'charging' : 'on battery';
          setVal('bat', `${pct}% · ${status}`);
        }
        updateBat();
        battery.addEventListener('levelchange', updateBat);
        battery.addEventListener('chargingchange', updateBat);
        ctx.onCleanup(() => {
          battery.removeEventListener('levelchange', updateBat);
          battery.removeEventListener('chargingchange', updateBat);
        });
      }).catch(() => setMissing('bat'));
    } else {
      setMissing('bat');
    }

    // Extension storage (browser quota for this origin — NOT OS disk)
    async function updateStorage() {
      if (!navigator.storage || !navigator.storage.estimate) { setMissing('storage'); return; }
      try {
        const est = await navigator.storage.estimate();
        const fmt = bytes => {
          if (bytes >= 1e9) return (bytes / 1e9).toFixed(2) + ' GB';
          if (bytes >= 1e6) return (bytes / 1e6).toFixed(1) + ' MB';
          if (bytes >= 1e3) return (bytes / 1e3).toFixed(0) + ' KB';
          return bytes + ' B';
        };
        setVal('storage', `${fmt(est.usage || 0)} / ${fmt(est.quota || 0)}`);
      } catch {
        setMissing('storage');
      }
    }
    updateStorage();
    const storageInterval = setInterval(updateStorage, 60 * 1000);
    ctx.onCleanup(() => clearInterval(storageInterval));
  }
});
