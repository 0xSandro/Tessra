# Permissions Justification

This maps every permission in `manifest.json` to the widget(s) that need it,
for the AMO review notes and for anyone auditing the extension.

## API permissions

| Permission | Used by | Why |
|---|---|---|
| `storage` | Core app (`main.js`) | Persists your layout, theme, and every widget's data/settings locally via `storage.local`. Nothing works without this. |
| `tabs` | Browser Stats, Recent Tabs | Browser Stats shows your open-tab count (`tabs.query`) and listens for tabs opening/closing to keep it live. Recent Tabs listens for tab removal to refresh its list. |
| `history` | Browser Stats | Its "most visited" section falls back to `history.search` when `topSites` isn't available/enough data exists. |
| `bookmarks` | Bookmarks, Browser Stats | Bookmarks widget lists/opens a chosen bookmark folder (`bookmarks.getTree`, `bookmarks.getChildren`). Browser Stats shows a bookmark count. |
| `sessions` | Recent Tabs, Browser Stats | Recent Tabs lists and restores recently-closed tabs/windows (`sessions.getRecentlyClosed`, `sessions.restore`). Browser Stats shows a recently-closed count. |
| `topSites` | Browser Stats | "Most visited sites" section (`topSites.get`). |
| `notifications` | Alarms | Fires an OS notification when an alarm goes off while the tab isn't focused. |

## Host permissions

Each is a widget-specific API the corresponding widget fetches directly —
none of these are contacted unless that widget is actually placed on the
board.

| Host | Widget(s) |
|---|---|
| `api.open-meteo.com`, `air-quality-api.open-meteo.com` | Weather, Advanced Weather, Air Quality |
| `geocoding-api.open-meteo.com` | Weather, Advanced Weather, Air Quality, Sunset Countdown, ISS Tracker (resolving a typed location name to coordinates) |
| `api.coingecko.com` | Crypto (price ticker) |
| `query1.finance.yahoo.com`, `query2.finance.yahoo.com` | Stocks, ETFs, Forex, Commodities (shared quote helper) |
| `gamma-api.polymarket.com` | Polymarket |
| `api.github.com` | GitHub Trending |
| `github-contributions-api.jogruber.de` | GitHub Commits (contribution graph) |
| `speed.cloudflare.com` | Internet Speed Test |
| `api.wheretheiss.at` | ISS Tracker |
| `en.wikipedia.org` | On This Day, Wikipedia Roulette |
| `api.notion.com` | Notion Database / Notion Today / Notion Recent — only contacted if the user has configured their own Notion integration token |
| `date.nager.at` | Public Holiday Countdown |
| `api.alternative.me` | Crypto Fear & Greed |

## Content Security Policy

`script-src 'self'; object-src 'self';` — no remote script execution. (An
earlier version loaded a CoinGecko embed script for a chart widget; that
widget has been pulled entirely and the CSP exception removed with it.)
