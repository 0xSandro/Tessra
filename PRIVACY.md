# Tessra Privacy Policy

_Last updated: 2026-07-29_

Tessra is a browser extension that replaces your new-tab page with a
customizable dashboard of widgets. This page explains what data it handles
and where it goes.

## Short version

Tessra does not have a server, does not collect analytics, and does not sell
or share your data with anyone. Everything you configure — your layout,
theme, widget settings, notes, to-dos — stays in your browser's local
storage on your own device. The only network requests Tessra makes are the
ones each widget needs to fetch its own content (e.g. the weather widget
asks a weather API for the weather), made directly from your browser to that
service.

## What's stored locally

All of the following is saved via the browser's built-in `storage.local` API,
on your device only. It is never transmitted to the Tessra developer, and is
not synced anywhere unless your browser itself syncs extension storage as
part of its own account sync feature.

- Your widget layout (positions, sizes, which widgets you've added)
- Theme and appearance settings
- Content you type into widgets (notes, to-dos, sticky notes, saved
  shortcuts, habit/goal tracking, etc.)
- Settings you configure per widget (e.g. a city name for weather, a GitHub
  username for the contributions widget, a coin ID for a price ticker)
- If you use the Notion widgets: the Notion integration token you paste in.
  This is stored locally and sent only to `api.notion.com` — never to any
  other destination, including the developer.

## Third-party services widgets talk to

Individual widgets fetch data directly from the third-party services they
represent, only when that widget is placed on your board and only for the
data that widget needs. As with any web request, contacting these services
reveals your IP address to them, per their own privacy policies — Tessra
does not add any additional tracking on top of that. The full list of
services a given install of Tessra can contact (matching its
`manifest.json` host permissions) is:

- **Open-Meteo** (`api.open-meteo.com`, `geocoding-api.open-meteo.com`,
  `air-quality-api.open-meteo.com`) — weather, air quality, sunset/sunrise
  widgets. Location name you enter is sent to resolve coordinates.
- **CoinGecko** (`api.coingecko.com`) — crypto price ticker widget.
- **Yahoo Finance** (`query1.finance.yahoo.com`, `query2.finance.yahoo.com`)
  — stocks, ETFs, forex, and commodities widgets.
- **Polymarket** (`gamma-api.polymarket.com`) — prediction market widget.
- **GitHub** (`api.github.com`, `github-contributions-api.jogruber.de`) —
  contribution graph and trending-repos widgets. The username you configure
  is sent as part of the request.
- **Cloudflare** (`speed.cloudflare.com`) — internet speed test widget;
  downloads a test file to measure your connection.
- **Where the ISS at** (`api.wheretheiss.at`) — ISS tracker widget.
- **Wikipedia** (`en.wikipedia.org`) — On This Day and Wikipedia Roulette
  widgets.
- **Notion** (`api.notion.com`) — Notion widgets, only if you've configured
  an integration token yourself. Your token and requests go directly to
  Notion; Tessra's developer never sees them.
- **Nager.Date** (`date.nager.at`) — public holiday countdown widget. The
  country you select is sent as part of the request.
- **Alternative.me** (`api.alternative.me`) — Crypto Fear & Greed widget.

None of these requests carry any identifying information beyond what's
inherent to an HTTP request (your IP address) and whatever you've explicitly
typed into that widget's settings (a city, a username, a coin ID, etc.).

## Sharing your own layout

Tessra has an optional "export" / "share string" feature that lets you save
or share your current layout as a JSON file or a compact text string. This
only happens when you explicitly trigger it — nothing is exported or shared
automatically. If you paste a share string or import a file someone else
gave you, review it like you would any file from an untrusted source, since
it can contain arbitrary widget settings.

## Browser permissions

Some widgets use browser APIs (open tabs, bookmarks, history, recently
closed tabs/sessions, top sites, notifications) to show that information
directly on your new-tab page — e.g. a bookmarks widget, a recently-closed-
tabs widget, or a browser-stats widget. This data is read locally to render
those widgets and is never transmitted anywhere. See `PERMISSIONS.md` in
this repository for a full per-permission breakdown.

## Changes

If this policy changes, the update will be reflected here with a new date
at the top.

## Contact

Questions about this policy: alessandro.steurer@gmail.com, or
[@0xSandro on X](https://x.com/0xSandro).
