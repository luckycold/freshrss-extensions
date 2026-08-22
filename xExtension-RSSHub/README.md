# RSSHub Radar for FreshRSS

A FreshRSS system extension that mirrors the useful part of the RSS-Bridge extension workflow for RSSHub.

When a URL is added, the extension:

1. Asks FreshRSS to parse the exact URL as a feed with HTML autodiscovery disabled.
2. Preserves valid RSS, Atom, and JSON Feed URLs unchanged.
3. For non-feed webpages, fetches and caches rules from the configured RSSHub instance's `/api/radar/rules` endpoint.
4. Matches the website hostname, path, and common route parameters.
5. Rewrites a supported webpage URL to the matching route on the configured RSSHub instance.
6. Adds RSSHub `key` or `code` access control without logging the secret.
7. Leaves unsupported URLs unchanged, allowing FreshRSS native feed discovery and the RSS-Bridge extension to continue normally.

The extension runs after the existing RSS-Bridge hook. It unwraps RSS-Bridge detection URLs, restores valid direct feeds to their original URLs, prefers RSSHub when Radar supports a non-feed webpage, and otherwise keeps RSS-Bridge as the fallback.

## Manual route syntax

A known RSSHub route can always be entered directly in FreshRSS:

```text
rsshub://github/user/example
```

It becomes:

```text
https://configured-rsshub.example/github/user/example?<configured access control>
```

Route query parameters are preserved.

## Supported Radar subset

The server endpoint exposes JSON rules. This extension supports static route targets, named path parameters, optional parameters, regex constraints, wildcards, and simple query-parameter capture. Rules whose target requires executable browser-side JavaScript are skipped safely; use the manual `rsshub://...` syntax for those uncommon routes.

## Security

- Only an administrator-configured RSSHub base URL is fetched for rules and generated feeds.
- The access secret is stored in FreshRSS's system configuration and never included in logs.
- Rule downloads use FreshRSS's required PHP cURL extension, reject redirects, and are bounded to 5 MiB.
- Radar failures fail open and preserve the URL the user entered.
- Cache files live in FreshRSS's private data cache, are mode `0600`, use a hash rather than the secret in their names, and are JSON-validated before being cached or reused.
