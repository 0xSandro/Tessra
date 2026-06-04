// Widget registry — every widget declares itself here.
// A widget definition shape:
//   {
//     type:        string                 // unique key, used in saved state
//     title:       string                 // shown in catalog and widget header
//     icon:        string                 // catalog icon (text or SVG markup)
//     category?:   string                 // for catalog grouping (step 4)
//     defaultSize: { w: number, h: number }
//     defaultData: () => object           // initial content for new instances
//     render(body, ctx):                  // build the widget's DOM
//        ctx = {
//          data:       object             // reference to widget.data (mutable, persisted)
//          save:       () => void         // request a debounced save
//          onCleanup:  (fn) => void       // register a teardown function
//        }
//   }
//
// Future hooks reserved for step 2 (settings) and beyond:
//   defaultSettings, settingsSchema, minSize, migrateData, etc.

const registry = new Map();

export function register(def) {
  if (!def || typeof def !== 'object') throw new Error('register() expects an object');
  if (!def.type)             throw new Error('Widget definition requires `type`');
  if (typeof def.render !== 'function') throw new Error(`Widget "${def.type}" missing render()`);
  if (!def.defaultSize || !def.defaultData) throw new Error(`Widget "${def.type}" missing defaults`);
  if (registry.has(def.type)) console.warn(`[Tessra] widget type "${def.type}" re-registered`);
  registry.set(def.type, def);
}

export function get(type)  { return registry.get(type); }
export function has(type)  { return registry.has(type); }
export function all()      { return Array.from(registry.values()); }
export function types()    { return Array.from(registry.keys()); }
