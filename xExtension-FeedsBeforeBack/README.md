# Feeds Before Back

On phone-width pages, the first back gesture opens the left feed list instead of leaving. The next back gesture is the real previous page. Desktop back is unchanged.

An installed web app cannot turn the system edge-swipe itself into a finger-following drawer. This extension adds a same-page history entry so that gesture stays in the app the first time.

## Requirements

FreshRSS 1.29+. No configuration page. It does not depend on Compact Media Cards or OLED Black Overlay.

## Install

Copy this directory to FreshRSS `extensions/xExtension-FeedsBeforeBack`, then enable **Feeds Before Back** under **Settings → Extensions**.

## Screenshots

Image files are not in the repository yet. Add `screenshots/feeds-open.png` beside this README to show the feed list after the first back gesture.

## Tests

```sh
npm install --ignore-scripts
npm test
```
