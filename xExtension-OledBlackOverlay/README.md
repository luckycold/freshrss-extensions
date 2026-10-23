# OLED Black Overlay

A late-loading FreshRSS user extension that paints true OLED black (`#000`) over FreshRSS’s header, navigation, stream, and cards, including the Compact Media Cards toolbar.

## Features

- True black surfaces for the header, sidebar, stream, cards, and overlays
- Neutral pill controls matching Configure View: 4% white fill, 9% white border
- Desktop search field and magnifier joined as one completed pill
- Mark as read remains a coherent split pill on desktop and a full round control on mobile
- Semantic colors stay intact: unread blue, favorite/star, warning, and error accents

## Requirements

FreshRSS 1.29+. Enable it after Compact Media Cards when both are installed. It has no settings page.

## Install

Copy this directory to FreshRSS `extensions/xExtension-OledBlackOverlay`, then enable **OLED Black Overlay** under **Settings → Extensions**.

## Screenshots

Image files are not in the repository yet. Add them beside this README:

- `screenshots/header.png` — black header and neutral pill controls
- `screenshots/cards.png` — black stream with Compact Media Cards

## Tests

```sh
python3 -m unittest -v tests.test_oled_overlay
```
