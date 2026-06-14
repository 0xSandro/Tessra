import { register } from '../widget-registry.js';

// Internet Speed — runs a real download throughput test against Cloudflare's
// public speed-test endpoints (speed.cloudflare.com/__down?bytes=N). Reads
// chunks as they arrive so the timing reflects payload transfer rather than
// connection-setup overhead. TTFB doubles as a rough ping number.
//
// Cloudflare's edge is in nearly every metro on earth, so the measurement
// reflects the user's actual line capacity rather than the speed to one
// random server. Endpoint is open, no auth.
//
// We also surface the browser's NetworkInformation API (`navigator.connection`)
// for the connection-type chip when available — Firefox supports it as a
// preference; Chromium has it on. When the API is missing the chip is
// hidden rather than guessed.

const ENDPOINT = 'https://speed.cloudflare.com/__down?bytes=';

// Test sizes available in the size dropdown. Bigger = more accurate on fast
// lines, more painful on slow ones. We default to 10 MB which finishes in
// under a second on most home connections.
const SIZE_OPTIONS = [
  { value: 2_000_000,  label: '2 MB'  },
  { value: 5_000_000,  label: '5 MB'  },
  { value: 10_000_000, label: '10 MB' },
  { value: 25_000_000, label: '25 MB' },
  { value: 50_000_000, label: '50 MB' }
];

function formatMbps(mbps) {
  if (!isFinite(mbps) || mbps <= 0) return '—';
  if (mbps >= 100) return mbps.toFixed(0);
  if (mbps >= 10)  return mbps.toFixed(1);
  return mbps.toFixed(2);
}

function formatMs(ms) {
  if (!isFinite(ms) || ms <= 0) return '—';
  return Math.round(ms).toString();
}

function formatAge(ms) {
  if (!ms) return 'Never run';
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60)   return `Tested ${s}s ago`;
  if (s < 3600) return `Tested ${Math.round(s / 60)}m ago`;
  return `Tested ${Math.round(s / 3600)}h ago`;
}

// Pull whatever the Network Information API will give us. Returns null when
// the API isn't exposed by the browser.
function readNetInfo() {
  const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!c) return null;
  return {
    effectiveType: c.effectiveType,    // 'slow-2g' | '2g' | '3g' | '4g'
    downlink: c.downlink,              // Mbps, capped at ~10 for fingerprinting
    rtt: c.rtt,                        // ms
    type: c.type                       // 'wifi' | 'ethernet' | 'cellular' | …
  };
}

// Run one download measurement. Streams the response so the byte counter is
// driven by what actually came over the wire rather than the final Content-
// Length. TTFB is the gap between request kickoff and first byte received.
async function runDownload(bytes) {
  const url = ENDPOINT + bytes;
  const t0 = performance.now();
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (!res.body) throw new Error('No response stream');
  const reader = res.body.getReader();
  let received = 0;
  let firstByteAt = null;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (firstByteAt === null) firstByteAt = performance.now();
    received += value.length;
  }
  const t1 = performance.now();
  if (firstByteAt === null) firstByteAt = t1;  // empty response edge case
  const downloadSec = Math.max(0.001, (t1 - firstByteAt) / 1000);
  const mbps = (received * 8) / (downloadSec * 1_000_000);
  return {
    mbps,
    ttfbMs: firstByteAt - t0,
    bytes: received
  };
}

register({
  type: 'netspeed',
  title: 'Internet Speed',
  icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 13a9 9 0 0 1 18 0"/><path d="M12 13l4-3"/><circle cx="12" cy="13" r="1.5" fill="currentColor" stroke="none"/><path d="M6 18h12" opacity="0.5"/></svg>',
  category: 'info',
  defaultSize: { w: 280, h: 200 },
  minSize:     { w: 220, h: 160 },

  defaultData: () => ({
    lastMbps: null,
    lastTtfb: null,
    lastBytes: null,
    fetchedAt: 0,
    error: null
  }),

  defaultSettings: () => ({
    testSizeBytes: 10_000_000,
    autoTest: false,
    autoIntervalMin: 30
  }),
  settingsSchema: [
    { key: 'testSizeBytes', type: 'select', label: 'Test size', options: SIZE_OPTIONS },
    { key: 'autoTest',      type: 'toggle', label: 'Auto-test on a schedule' },
    { key: 'autoIntervalMin', type: 'slider', label: 'Auto interval', min: 5, max: 240, step: 5, unit: 'min' }
  ],

  render(body, ctx) {
    const { data, settings } = ctx;
    let cancelled = false;
    let inFlight  = false;
    ctx.onCleanup(() => { cancelled = true; });

    body.innerHTML = `
      <div class="netspeed">
        <div class="net-readout">
          <div class="net-stat net-stat-main">
            <div class="net-value"><span class="net-down-val">—</span><span class="net-unit">Mbps</span></div>
            <div class="net-label">Download</div>
          </div>
          <div class="net-stat">
            <div class="net-value"><span class="net-ping-val">—</span><span class="net-unit">ms</span></div>
            <div class="net-label">Latency</div>
          </div>
        </div>
        <div class="net-meta">
          <span class="net-conn"></span>
          <span class="net-progress"></span>
        </div>
        <div class="net-actions">
          <button class="net-run picker-pick">Run test</button>
          <span class="net-updated"></span>
        </div>
      </div>`;

    const downEl   = body.querySelector('.net-down-val');
    const pingEl   = body.querySelector('.net-ping-val');
    const connEl   = body.querySelector('.net-conn');
    const progEl   = body.querySelector('.net-progress');
    const runBtn   = body.querySelector('.net-run');
    const updatedEl = body.querySelector('.net-updated');

    function paintConn() {
      const info = readNetInfo();
      if (!info) { connEl.textContent = ''; return; }
      const parts = [];
      if (info.effectiveType) parts.push(info.effectiveType.toUpperCase());
      if (info.type)          parts.push(info.type);
      if (info.downlink)      parts.push(`~${Math.round(info.downlink)} Mbps`);
      connEl.textContent = parts.join(' · ');
    }

    function paintNumbers() {
      downEl.textContent = formatMbps(data.lastMbps);
      pingEl.textContent = formatMs(data.lastTtfb);
    }

    function paint() {
      paintNumbers();
      paintConn();
      if (data.error) {
        progEl.textContent = data.error;
        progEl.classList.add('net-error');
      } else {
        progEl.classList.remove('net-error');
        progEl.textContent = inFlight ? 'Testing…' : '';
      }
      updatedEl.textContent = data.fetchedAt ? formatAge(data.fetchedAt) : 'Never run';
      ctx.setStale(!!data.error && data.lastMbps != null);
    }

    async function runTest() {
      if (inFlight || cancelled) return;
      inFlight = true;
      runBtn.disabled = true;
      data.error = null;
      paint();
      try {
        const sizeBytes = Math.max(500_000, settings.testSizeBytes || 10_000_000);
        const result = await runDownload(sizeBytes);
        if (cancelled) return;
        data.lastMbps  = result.mbps;
        data.lastTtfb  = result.ttfbMs;
        data.lastBytes = result.bytes;
        data.fetchedAt = Date.now();
        data.error     = null;
      } catch (err) {
        if (cancelled) return;
        data.error = err.message || 'Test failed';
      } finally {
        inFlight = false;
        if (!cancelled) {
          runBtn.disabled = false;
          ctx.save();
          paint();
        }
      }
    }

    runBtn.addEventListener('click', runTest);

    // Auto-test interval. Restarts whenever settings change because the widget
    // re-renders on every settings save (Tessra's standard rerender cycle).
    if (settings.autoTest) {
      const intervalMs = Math.max(5, settings.autoIntervalMin || 30) * 60_000;
      const handle = setInterval(runTest, intervalMs);
      ctx.onCleanup(() => clearInterval(handle));
      // Kick one off on widget open if we don't have any data yet
      if (!data.fetchedAt) runTest();
    }

    // Refresh the "Tested Xm ago" label every 30 s without re-running
    const ageHandle = setInterval(() => {
      if (data.fetchedAt) updatedEl.textContent = formatAge(data.fetchedAt);
    }, 30_000);
    ctx.onCleanup(() => clearInterval(ageHandle));

    // Network Information API exposes a 'change' event when the connection
    // characteristics shift (wifi → cellular, link rate update). Keep the
    // chip label live without re-running the speed test.
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (conn && conn.addEventListener) {
      const handler = () => paintConn();
      conn.addEventListener('change', handler);
      ctx.onCleanup(() => conn.removeEventListener('change', handler));
    }

    paint();
  }
});
