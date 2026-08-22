<?php

declare(strict_types=1);

return [
	'rsshub_radar' => [
		'url' => 'RSSHub instance URL',
		'url_help' => 'Base URL only, without a route, query string, or trailing slash.',
		'access_type' => 'RSSHub access control',
		'access_none' => 'None',
		'access_key' => 'Key query parameter',
		'access_code' => 'MD5 access code',
		'secret' => 'Access key / code secret',
		'secret_keep' => 'Configured — leave blank to keep',
		'secret_clear' => 'Clear the saved secret',
		'secret_help' => 'The secret is stored in FreshRSS system configuration and is never written to extension logs.',
		'auto_detect' => 'Automatic Radar conversion',
		'auto_detect_help' => 'Convert supported website URLs using this RSSHub instance’s /api/radar/rules endpoint.',
		'manual_help' => 'You can always add a route explicitly with rsshub://namespace/route/parameters. Unsupported URLs remain unchanged so native FreshRSS discovery and RSS-Bridge can still run.',
	],
];
