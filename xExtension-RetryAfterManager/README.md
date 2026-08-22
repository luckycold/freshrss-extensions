# Retry-After Manager for FreshRSS

A small FreshRSS system extension that lists active `Retry-After` locks for the current user's feeds and provides an individual **Reset and refresh** action.

## Behavior

- Maps each subscribed feed to FreshRSS's exact domain-wide and route-specific `data/Retry-After/*.txt` naming rules.
- Shows only locks whose expiry time is still in the future.
- Displays the feed name, sanitized host/path, scope, and automatic expiry without exposing query credentials.
- Recomputes the lock path server-side from the selected feed ID; the browser never submits a filesystem path or feed URL.
- Removes only the selected feed's candidate lock and immediately refreshes that feed.
- Reports success and the number of newly inserted articles, or warns when the feed fails again and recreates a lock.

## Use

Open **Settings → Extensions → Retry-After Manager → Configure**. Active locks appear in a table. Select **Reset & refresh** beside one feed.

A domain-wide lock necessarily affects all feeds on that hostname; the UI labels those separately.

## Security

- Reset actions require FreshRSS's CSRF token.
- Feed IDs are looked up through the current user's DAO, so a user cannot reset another user's feed by supplying an arbitrary ID.
- Feed query strings, access keys, proxies, and lock filenames are never rendered or logged by the extension.
- Only paths deterministically derived under FreshRSS's own private `DATA_PATH/Retry-After` directory are considered.
