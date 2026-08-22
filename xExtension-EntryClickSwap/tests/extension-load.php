<?php

declare(strict_types=1);
require '/var/www/FreshRSS/cli/_cli.php';
cliInitUser('lucky');
$root = dirname(__DIR__);
if (!is_file($root . '/extension.php') || !is_file($root . '/metadata.json')) {
	fwrite(STDERR, "FAIL extension bootstrap files are missing\n");
	exit(1);
}
require_once $root . '/extension.php';
$metadata = json_decode((string) file_get_contents($root . '/metadata.json'), true, 16, JSON_THROW_ON_ERROR);
$metadata['path'] = $root;
$extension = new EntryClickSwapExtension($metadata);
$extension->init();
$scripts = FreshRSS_View::headScript();
$expected = 'xExtension-EntryClickSwap%2Fstatic%2Fentry-click-swap.js';
if (!str_contains($scripts, $expected)) {
	fwrite(STDERR, "FAIL browser script was not registered\n");
	exit(1);
}
if (!preg_match('/<script[^>]*id="entry-click-swap"[^>]*>/', $scripts, $matches)) {
	fwrite(STDERR, "FAIL browser script tag was not rendered\n");
	exit(1);
}
$scriptTag = $matches[0];
if (!str_contains($scriptTag, 'defer') || str_contains($scriptTag, 'async')) {
	fwrite(STDERR, "FAIL browser script must be deferred and ordered, not async\n");
	exit(1);
}
echo "PASS extension registers the ordered browser script\n";
