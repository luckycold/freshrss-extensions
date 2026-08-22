<?php

declare(strict_types=1);

require_once __DIR__ . '/../lib/RetryAfterLockManager.php';

function expectSame(mixed $expected, mixed $actual, string $label): void {
	if ($expected !== $actual) {
		fwrite(STDERR, "FAIL {$label}\nExpected: " . var_export($expected, true) . "\nActual: " . var_export($actual, true) . "\n");
		exit(1);
	}
	fwrite(STDOUT, "PASS {$label}\n");
}

$root = sys_get_temp_dir() . '/retry-after-manager-' . bin2hex(random_bytes(6));
mkdir($root, 0700, true);
$manager = new FreshRssRetryAfterLockManager($root);
$url = 'https://hub.example.test/twitter/user/example?key=secret';
$proxy = '';

$candidates = $manager->candidatePaths($url, $proxy);
expectSame(2, count($candidates), 'public and route-specific candidates');
expectSame($root . '/hub.example.test.txt', $candidates[0]['path'], 'domain-wide path');
expectSame($root . '/hub.example.test_' . hash('sha256', $url) . '.txt', $candidates[1]['path'], 'route-specific path');
expectSame('domain', $candidates[0]['scope'], 'domain scope');
expectSame('feed', $candidates[1]['scope'], 'feed scope');

$now = time();
touch($candidates[1]['path'], $now + 600);
expectSame(
	['path' => $candidates[1]['path'], 'scope' => 'feed', 'expires' => $now + 600],
	$manager->activeLock($url, $proxy, $now),
	'finds active route-specific lock',
);

$otherUrl = 'https://hub.example.test/twitter/user/other?key=secret';
$otherPath = $manager->candidatePaths($otherUrl)[1]['path'];
touch($otherPath, $now + 900);
expectSame(1, $manager->clear($url), 'clears only selected feed lock');
expectSame(false, file_exists($candidates[1]['path']), 'selected lock removed');
expectSame(true, file_exists($otherPath), 'other feed lock preserved');

touch($candidates[1]['path'], $now - 1);
expectSame(null, $manager->activeLock($url, $proxy, $now), 'expired lock ignored');

$proxied = $manager->candidatePaths('https://example.test/feed.xml', 'http://proxy.local:8080');
expectSame(
	$root . '/example.test_' . urlencode('http://proxy.local:8080') . '.txt',
	$proxied[0]['path'],
	'proxy suffix matches FreshRSS naming',
);

expectSame([], $manager->candidatePaths('file:///etc/passwd'), 'non-HTTP URL rejected');
expectSame([], $manager->candidatePaths('https://example.test/feed.xml', "bad\nproxy"), 'unsafe proxy rejected');

foreach (glob($root . '/*') ?: [] as $path) {
	unlink($path);
}
rmdir($root);
fwrite(STDOUT, "All tests passed.\n");
