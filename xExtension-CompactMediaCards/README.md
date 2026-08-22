# Compact Media Cards

Image-first FreshRSS cards with compact metadata overlays and FeedMe-style swipe actions.

## Features

- Natural, uncropped media that keeps the source aspect ratio
- Masonry packing that preserves source order
- Title, favorite, feed, and date layered over a bottom gradient
- Mobile swipe actions for read, favorite, and Karakeep
- Desktop fine-pointer controls: a persistent bottom-left favorite button, plus hover-only top-right Mark as read, reader, and Karakeep buttons
- Input-mode detection via `(any-hover: hover) and (any-pointer: fine)` rather than viewport width

## Requirements

FreshRSS 1.29+ with Youlag. Designed to sit under the OLED Black Overlay extension.

## Tests

```sh
NODE_PATH=../xExtension-EntryClickSwap/node_modules node --test tests/swipe-return.test.js
```
