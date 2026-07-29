// Shared utilities used by multiple widgets.

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => (
    { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]
  ));
}

// Widgets render href/src values sourced from third-party API responses (or
// user-typed URLs). escapeHtml() alone only neutralizes markup — it does
// nothing to stop a javascript: URI from executing on click. Gate any such
// value through this before assigning it to href/src.
export function isSafeUrl(url) {
  return typeof url === 'string' && /^https?:\/\//i.test(url.trim());
}
