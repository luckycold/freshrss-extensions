# FreshRSS Extensions

[![License: MIT](https://img.shields.io/github/license/luckycold/freshrss-extensions)](LICENSE)

Local FreshRSS extensions for a media-first reader: OLED-black surfaces, compact cards, swapped click behavior, RSSHub conversion, and small compatibility helpers.

**Requirements:** FreshRSS 1.29+ (tested on 1.29.1). Youlag is expected for the card and OLED overlay stack. No external runtime dependencies beyond FreshRSS itself.

## Extensions

### Compact Media Cards

Image-first feed cards with compact metadata overlays and FeedMe-style swipe actions.

- Natural, uncropped media and measured masonry
- Title, favorite, feed, and date layered over the thumbnail
- Mobile swipe actions; desktop hover-only top-right controls plus a persistent bottom-left star

### OLED Black Overlay

True OLED-black surfaces over Mapco, Youlag, and Compact Media Cards without modifying those extensions.

- `#000` backgrounds
- Neutral pill controls (4% fill, 9% border)
- Desktop search field and magnifier joined as one pill
- Semantic unread/favorite/warning colors left intact

### Entry Click Swap

Clicking an entry opens the publisher website in a new tab. The former website-link button opens the inline FreshRSS reader instead.

### RSSHub Radar

Converts supported webpage URLs into feeds through a configured RSSHub instance using RSSHub Radar rules. Valid direct RSS/Atom/JSON feeds are left unchanged.

### Retry-After Manager

Lists active FreshRSS `Retry-After` locks for the current user and resets one feed at a time without exposing credentials or lock filenames.

### Podcast Artwork

Preserves per-episode `itunes:image` artwork as FreshRSS thumbnails, including RSSHub Spotify feeds.

## Installation

### Option 1: Install via Extension Manager (recommended)

1. Install [Extension Manager](https://github.com/featurecreep-cron/freshrss-extensions/tree/main/xExtension-ExtensionManager) if you do not already have it.
2. In **Settings → Extensions → Extension Manager → Configure**, add:

   ```text
   https://github.com/luckycold/freshrss-extensions
   ```

3. Open **Settings → Extensions** and install the extensions you want from this repository.

### Option 2: Manual

Copy any `xExtension-*` directory into your FreshRSS `extensions/` directory, then enable it in settings.

Typical locations:

- Docker / TrueNAS: `/var/www/FreshRSS/extensions/` inside the container
- Manual install: `<freshrss-root>/extensions/`

Recommended enable order for the card stack:

1. Youlag
2. Compact Media Cards
3. OLED Black Overlay

## Configuration

Each extension has its own settings page in FreshRSS (**Configuration → Extensions**) when it needs one.

## License

[MIT](LICENSE)
