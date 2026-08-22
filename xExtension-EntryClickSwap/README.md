# Entry Click Swap for FreshRSS

A user extension for FreshRSS 1.29.1 that swaps the normal-view entry interactions:

- A normal click or tap on an entry title, summary, thumbnail, date, or unused header space opens the original article in a new browser tab.
- The former **open on website** link button opens or closes the inline FreshRSS reader entry instead.
- That button is relabeled **Open in FreshRSS reader** and changes from the external-link icon to FreshRSS's book-shaped reader icon.
- FreshRSS management controls, feed filters, labels, sharing menus, middle-click, and modified clicks keep their native behavior.
- Opening the original website honors FreshRSS's existing **mark as read when opened on its original website** preference.
- Entries loaded later through infinite scrolling receive the same behavior and icon.

## Scope

The extension intentionally changes only normal-view `.flux_header` interactions. Reader view and links inside article content retain FreshRSS's default behavior.

## Security

Only `http:` and `https:` original-entry links are opened. New tabs use `noopener,noreferrer`. The extension does not read, store, transmit, or log feed content or credentials.

## Tests

```sh
npm install --ignore-scripts
npm test
```

The PHP bootstrap test is intended to run inside a FreshRSS container:

```sh
php tests/extension-load.php
```
