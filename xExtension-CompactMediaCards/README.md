# Compact Media Cards

Image-first FreshRSS cards with compact metadata overlays and FeedMe-style swipe actions.

## Features

- Natural, uncropped media that keeps the source aspect ratio
- Masonry packing that preserves source order
- Switchable Grid/List toolbar control with a persistent single-column linear view
- Title, favorite, feed, and date layered over a bottom gradient
- Mobile swipe actions for read, favorite, and Karakeep
- Swipe indicators stay horizontally fixed and only fade upward into place
- Desktop fine-pointer controls: a persistent bottom-left favorite button, plus hover-only top-right Mark as read, reader, and Karakeep buttons
- Input-mode detection via `(any-hover: hover) and (any-pointer: fine)` rather than viewport width

## Requirements

FreshRSS 1.29+. The masonry and list layouts, toolbar, and swipe gestures are part of this extension. OLED Black Overlay is optional and can be enabled afterward. A Karakeep swipe needs the separate Karakeep Button extension.

## Install

Copy this directory to FreshRSS `extensions/xExtension-CompactMediaCards`, then enable **Compact Media Cards** under **Settings → Extensions**.

## Configuration

Open **Settings → Extensions → Compact Media Cards → Configure**.

- **Card layout** — masonry grid or a single-column list. The feed toolbar Grid / List control changes the same setting.
- **Phone columns** — off keeps one full-width column at 840px and narrower. On keeps two columns.
- **Swipe left / swipe right** — read, favorite, reader, website, Karakeep, or none.

## Screenshots

Image files are not in the repository yet. Add them beside this README:

- `screenshots/masonry.png` — desktop masonry feed
- `screenshots/list.png` — single-column list
- `screenshots/swipe.png` — phone swipe indicators

## Tests

```sh
NODE_PATH=../xExtension-EntryClickSwap/node_modules node --test tests/swipe-return.test.js
```
