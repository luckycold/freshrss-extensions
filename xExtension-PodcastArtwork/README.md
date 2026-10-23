# Podcast Artwork

A small FreshRSS compatibility extension for podcast feeds that expose per-item artwork through `itunes:image` but not through Media RSS thumbnails.

It captures the artwork during SimplePie parsing and stores it in FreshRSS's standard `thumbnail` entry attribute. FreshRSS then renders the artwork using its normal `enclosure-thumbnail` markup, and API consumers can access the semantic thumbnail instead of relying on injected article HTML.

## Requirements

FreshRSS 1.29+. No configuration page. Created for RSSHub Spotify feeds on FreshRSS 1.29.1.

## Install

Copy this directory to FreshRSS `extensions/xExtension-PodcastArtwork`, then enable **Podcast Artwork** under **Settings → Extensions**.

## Screenshots

Image files are not in the repository yet. Add `screenshots/episode-art.png` beside this README for an entry thumbnail taken from `itunes:image`.

