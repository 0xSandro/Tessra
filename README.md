# Tessra — Custom Starting Page (Firefox)

Lightweight, customizable new tab page. Vanilla JS, no frameworks, no network calls (except favicons for shortcuts).

## Widgets

- **Clock & date**
- **Search** (DuckDuckGo by default)
- **Shortcuts** — favicon grid, add/remove inline
- **To-do** — persistent task list
- **Notes** — quick scratchpad

## Features

- Click **Edit** (top-right) to open the side panel with two tabs:
  - **Widgets** — drag a widget card onto the page to add it
  - **Theme** — background (dotted/color/image upload), widget fill, border color/width, corner radius, shadow strength (sliders + value fields)
- Widgets snap to a 20 px grid when dragged
- In edit mode, widgets get an animated marching-ants outline
- All state (widget positions, contents, theme) is saved to `browser.storage.local` and persists across sessions

## Install (temporary, for development)

1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on…**
3. Pick `manifest.json` inside this folder
4. Open a new tab

Temporary add-ons unload when Firefox closes. For permanent install, see "Sign & package".

## Keyboard

- `E` — toggle edit mode
- `Esc` — exit edit mode

## Customize

- Theme: use the in-app Theme tab; everything persists.
- **Grid step**: change `GRID` in `newtab.js` AND `--grid-size` in `newtab.css` (keep equal).
- **Search engine**: edit the URL in the `search` renderer in `newtab.js`.

## Sign & package (permanent install)

```
npm install -g web-ext
cd newtab-widgets
web-ext lint
web-ext build           # creates web-ext-artifacts/*.zip
```

Submit the zip to https://addons.mozilla.org for signing.

## File layout

```
newtab-widgets/
  manifest.json
  newtab.html
  newtab.css
  newtab.js
  icons/
    icon-48.svg
    icon-96.svg
```
