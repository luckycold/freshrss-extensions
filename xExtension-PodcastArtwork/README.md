# Podcast Artwork

A small FreshRSS compatibility extension for podcast feeds that expose per-item artwork through `itunes:image` but not through Media RSS thumbnails.

It captures the artwork during SimplePie parsing and stores it in FreshRSS's standard `thumbnail` entry attribute. FreshRSS then renders the artwork using its normal `enclosure-thumbnail` markup, and API consumers can access the semantic thumbnail instead of relying on injected article HTML.

Created for RSSHub Spotify feeds on FreshRSS 1.29.1.
