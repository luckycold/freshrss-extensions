<?php

declare(strict_types=1);

return [
	'retry_after_manager' => [
		'title' => 'Retry-After locks',
		'help' => 'Active FreshRSS Retry-After locks for your feeds are listed below. Reset and refresh removes only the selected feed’s matching lock and immediately retries that feed.',
		'none' => 'No active Retry-After locks were found for your feeds.',
		'feed' => 'Feed',
		'source' => 'Source',
		'scope' => 'Lock scope',
		'expires' => 'Automatic expiry',
		'action' => 'Action',
		'scope_feed' => 'This feed',
		'scope_domain' => 'Entire domain',
		'scope_help' => 'A domain-wide lock is shared by every feed on that host. Resetting any listed feed clears that shared domain lock.',
		'reset_refresh' => 'Reset and refresh',
		'invalid_feed' => 'That feed is not available to the current user.',
		'already_clear' => 'The selected lock had already expired or been removed.',
		'clear_failed' => 'FreshRSS could not remove the selected lock.',
		'reset_but_failed' => 'The lock was cleared, but the feed failed again and may have created a new lock.',
		'reset_success' => 'The lock was cleared and the feed refreshed successfully.',
		'new_articles' => '%d new article(s) were added.',
	],
];
