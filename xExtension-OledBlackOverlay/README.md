# OLED Black Overlay

A late-loading FreshRSS user extension that paints true OLED black (`#000`) over Mapco, Youlag, and Compact Media Cards without modifying those extensions.

## Features

- True black surfaces for the header, sidebar, stream, cards, and overlays
- Neutral pill controls matching Configure View: 4% white fill, 9% white border
- Desktop search field and magnifier joined as one completed pill
- Mark as read remains a coherent split pill on desktop and a full round control on mobile
- Semantic colors stay intact: unread blue, favorite/star, warning, and error accents

## Requirements

FreshRSS 1.29+ with Youlag. Load this extension after Youlag and Compact Media Cards.

## Tests

```sh
python3 -m unittest -v tests.test_oled_overlay
```
