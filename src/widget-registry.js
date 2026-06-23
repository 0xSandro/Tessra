// Widget registry — every widget declares itself here.
// A widget definition shape:
//   {
//     type:             string                 // unique key, used in saved state
//     title:            string                 // shown in catalog and widget header
//     icon:             string                 // catalog icon (text or SVG markup)
//     category?:        string                 // for catalog grouping (step 4)
//     subcategory?:     string                 // nested grouping under a category (e.g. 'notion' under 'integrations')
//     defaultSize:      { w: number, h: number }
//     minSize?:         { w: number, h: number }  // resize lower bound (default 160 × 80)
//     maxSize?:         { w: number, h: number }  // resize upper bound (default 4000 × 4000)
//     defaultData:      () => object           // initial content for new instances
//     defaultSettings?: () => object           // initial user prefs (optional)
//     settingsSchema?:  Field[]                // declarative settings form (optional)
//     render(body, ctx):                       // build the widget's DOM
//        ctx = {
//          data:       object                  // reference to widget.data (mutable, persisted)
//          settings:   object                  // reference to widget.settings (mutable, persisted)
//          save:       () => void              // request a debounced save
//          onCleanup:  (fn) => void            // register a teardown function (fires on rerender + remove)
//          rerender:   () => void              // request a full re-render of this widget
//        }
//   }
//
// Field (settings schema):
//   { key: string, type: 'toggle'|'select'|'slider'|'color'|'text'|'date', label: string, ... }
//     toggle:  no extras
//     select:  options: [{ value, label }]
//     slider:  min, max, step, unit?
//     color:   no extras (hex string in settings)
//     text:    placeholder?
//     date:    no extras (YYYY-MM-DD string in settings)
//
// Future hooks reserved for later steps: minSize, migrateData, etc.

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
