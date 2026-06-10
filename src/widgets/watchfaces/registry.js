// Watchface registry. Mirrors the widget registry pattern but scoped to one
// widget. Each face is a small object that owns its own DOM and per-tick
// update; the clock widget shell handles the timer and settings UX.
//
// Face shape:
//   {
//     id:    'digital',          // stable key persisted in settings
//     label: 'Minimal Digital',  // shown in the watchface dropdown
//     mount(host, settings) -> tick(now)
//   }
//
// `mount` builds the static DOM into `host` and returns a per-tick function
// that receives the current Date. The shell calls tick once on mount and then
// on a setInterval. Faces opt out of seconds by ignoring `now.getSeconds()`.

const faces = [];

export function registerFace(face) {
  if (!face || !face.id) return;
  // First registration wins for a given id — guards against double-import in
  // dev. Later registrations are dropped silently.
  if (faces.find(f => f.id === face.id)) return;
  faces.push(face);
}

export function getFace(id) {
  return faces.find(f => f.id === id) || null;
}

export function allFaces() {
  return faces.slice();
}
