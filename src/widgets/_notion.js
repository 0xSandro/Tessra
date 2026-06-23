// Shared helpers for Notion-backed widgets. Uses the Internal Integration
// auth model — user pastes a `secret_…` token, the integration must be
// explicitly shared with each page/database in Notion's UI. Narrower scope
// than OAuth and no client registration required on our side.
//
// CORS: api.notion.com doesn't ship CORS headers for browser origins, but
// extension host_permissions bypass that — declaring
// `https://api.notion.com/*` in manifest.json lets fetch from any extension
// page hit the API directly.

export const NOTION_VERSION = '2022-06-28';

export async function notionFetch(token, path, options = {}) {
  if (!token) throw new Error('No Notion integration token configured');
  const url = `https://api.notion.com/v1${path}`;
  const res = await fetch(url, {
    cache: 'no-store',
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  if (!res.ok) {
    let msg = `Notion HTTP ${res.status}`;
    try {
      const err = await res.json();
      if (err && err.message) msg = err.message;
    } catch { /* response wasn't JSON */ }
    throw new Error(msg);
  }
  return await res.json();
}

// Notion properties are heavily typed objects. Convert any of the common
// shapes into a displayable string. Anything we don't know about falls
// through to an empty string rather than something like "[object Object]".
export function propertyText(prop) {
  if (!prop) return '';
  switch (prop.type) {
    case 'title':         return (prop.title         || []).map(t => t.plain_text).join('');
    case 'rich_text':     return (prop.rich_text     || []).map(t => t.plain_text).join('');
    case 'number':        return prop.number == null ? '' : String(prop.number);
    case 'select':        return prop.select?.name || '';
    case 'multi_select':  return (prop.multi_select || []).map(s => s.name).join(', ');
    case 'status':        return prop.status?.name || '';
    case 'checkbox':      return prop.checkbox ? '✓' : '';
    case 'url':           return prop.url || '';
    case 'email':         return prop.email || '';
    case 'phone_number':  return prop.phone_number || '';
    case 'created_time':  return formatRelativeISO(prop.created_time);
    case 'last_edited_time': return formatRelativeISO(prop.last_edited_time);
    case 'people':        return (prop.people || []).map(p => p.name || 'someone').join(', ');
    case 'files':         return (prop.files  || []).map(f => f.name).join(', ');
    case 'date': {
      const d = prop.date;
      if (!d) return '';
      return d.end && d.end !== d.start ? `${d.start} → ${d.end}` : (d.start || '');
    }
    case 'formula': {
      const f = prop.formula;
      if (!f) return '';
      if (f.type === 'string')  return f.string || '';
      if (f.type === 'number')  return f.number == null ? '' : String(f.number);
      if (f.type === 'boolean') return f.boolean ? '✓' : '';
      if (f.type === 'date')    return f.date?.start || '';
      return '';
    }
    case 'rollup': {
      const r = prop.rollup;
      if (!r) return '';
      if (r.type === 'number') return r.number == null ? '' : String(r.number);
      if (r.type === 'date')   return r.date?.start || '';
      if (r.type === 'array')  return r.array.map(propertyText).filter(Boolean).join(', ');
      return '';
    }
    case 'relation':      return `${(prop.relation || []).length} related`;
    default: return '';
  }
}

// Build a list of { name, type } from a query result so callers can pick
// which columns to render without hard-coding schema knowledge.
export function inferProperties(pages) {
  const seen = new Map();
  pages.forEach(p => {
    if (!p.properties) return;
    Object.entries(p.properties).forEach(([name, prop]) => {
      if (!seen.has(name)) seen.set(name, prop.type);
    });
  });
  return [...seen.entries()].map(([name, type]) => ({ name, type }));
}

// Every Notion database has exactly one title property. Surface its name
// so widgets can render it as the leading column without configuration.
export function findTitleProperty(page) {
  if (!page || !page.properties) return null;
  for (const [name, prop] of Object.entries(page.properties)) {
    if (prop.type === 'title') return name;
  }
  return null;
}

// Pull the page title text from a Notion page object (handles results from
// /search where the title lives in `properties.title.title` or under the
// page-typed property whose `type === 'title'`).
export function pageTitle(page) {
  if (!page) return '';
  const props = page.properties || {};
  for (const v of Object.values(props)) {
    if (v && v.type === 'title') return propertyText(v) || '(untitled)';
  }
  return '(untitled)';
}

// "5m ago", "yesterday", "Sep 12" — relative-ish ISO formatter. Used for the
// last_edited_time chip in the Recent Pages widget and rollup dates.
export function formatRelativeISO(iso) {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (isNaN(t)) return iso;
  const diff = Date.now() - t;
  const s = Math.floor(diff / 1000);
  if (s < 60)        return `${s}s ago`;
  if (s < 3600)      return `${Math.floor(s / 60)}m ago`;
  if (s < 86400)     return `${Math.floor(s / 3600)}h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`;
  const d = new Date(t);
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// Build an ISO date string for "today" in local time. Notion date filters
// expect a YYYY-MM-DD or full ISO; we use the date-only form for clarity.
export function localTodayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// Normalize a Notion database ID — accept either the bare 32-char hex
// (with or without dashes) or a full URL with the ID in the path.
export function normalizeDatabaseId(s) {
  const raw = (s || '').trim();
  if (!raw) return '';
  // Pull the last 32-hex-char run out of whatever the user pasted
  const m = raw.replace(/-/g, '').match(/[0-9a-fA-F]{32}/);
  return m ? m[0] : raw;
}
