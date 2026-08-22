<?php

declare(strict_types=1);

require_once __DIR__ . '/../lib/RadarMatcher.php';
require_once __DIR__ . '/../lib/RssHubUrlBuilder.php';

function expectSame(mixed $expected, mixed $actual, string $label): void {
	if ($expected !== $actual) {
		fwrite(STDERR, "FAIL {$label}\nExpected: " . var_export($expected, true) . "\nActual:   " . var_export($actual, true) . "\n");
		exit(1);
	}
	fwrite(STDOUT, "PASS {$label}\n");
}

$rules = [
	'example.com' => [
		'_name' => 'Example',
		'.' => [
			[
				'title' => 'User posts',
				'source' => ['/users/:user/posts'],
				'target' => '/example/users/:user/posts',
			],
			[
				'title' => 'Search',
				'source' => ['/search?q=:keyword'],
				'target' => '/example/search/:keyword',
			],
			[
				'title' => 'Repository file',
				'source' => ['/repo/:branch/*filepath'],
				'target' => '/example/file/:branch/:filepath',
			],
		],
	],
	'optional.test' => [
		'www' => [
			[
				'title' => 'Optional route',
				'source' => ['/:category?/:topic?'],
				'target' => '/optional/:category?/:topic?',
			],
		],
	],
	'constraint.test' => [
		'.' => [
			[
				'title' => 'Constrained ID',
				'source' => ['/item/:id{[0-9]+}'],
				'target' => '/constraint/item/:id{[0-9]+}',
			],
		],
	],
	'inline.test' => [
		'.' => [
			[
				'title' => 'Inline optional parameter',
				'source' => ['/:category?.htm'],
				'target' => '/inline/:category?.xml',
			],
		],
	],
	'fragment.test' => [
		'.' => [
			[
				'title' => 'SPA fragment route',
				'source' => ['/#/channel/:id'],
				'target' => '/fragment/:id',
			],
		],
	],
	'query-wildcard.test' => [
		'.' => [
			[
				'title' => 'Query wildcard',
				'source' => ['/search?keyword=*'],
				'target' => '/query/:keyword',
			],
		],
	],
	'fragment-query.test' => [
		'.' => [
			[
				'title' => 'SPA fragment query',
				'source' => ['/#/search?keyword=*'],
				'target' => '/fragment-query/:keyword',
			],
		],
	],
];

$matcher = new RssHubRadarMatcher($rules);
expectSame(['/example/users/alice/posts'], $matcher->match('https://www.example.com/users/alice/posts'), 'www falls back to apex rules');
expectSame(['/example/search/fresh%20rss'], $matcher->match('https://example.com/search?q=fresh%20rss'), 'query parameter capture');
expectSame(['/example/file/main/src/lib/file.php'], $matcher->match('https://example.com/repo/main/src/lib/file.php'), 'named wildcard capture');
expectSame(['/optional'], $matcher->match('https://optional.test/'), 'apex falls back to www rules and drops optional tail');
expectSame(['/optional/news'], $matcher->match('https://optional.test/news'), 'single optional parameter');
expectSame(['/optional/news/local'], $matcher->match('https://optional.test/news/local'), 'two optional parameters');
expectSame(['/constraint/item/123'], $matcher->match('https://constraint.test/item/123'), 'regex-constrained parameter');
expectSame([], $matcher->match('https://constraint.test/item/not-a-number'), 'constraint rejects invalid value');
expectSame(['/inline/news.xml'], $matcher->match('https://inline.test/news.htm'), 'inline optional parameter with static suffix');
expectSame(['/fragment/42'], $matcher->match('https://fragment.test/#/channel/42'), 'fragment-based SPA route');
expectSame(['/query/fresh%20rss'], $matcher->match('https://query-wildcard.test/search?keyword=fresh%20rss'), 'query wildcard captured by query key');
expectSame(['/fragment-query/fresh%20rss'], $matcher->match('https://fragment-query.test/#/search?keyword=fresh%20rss'), 'query inside SPA fragment');
expectSame([], $matcher->match('https://unsupported.invalid/path'), 'unsupported domain fails open');
expectSame([], $matcher->match('file:///etc/passwd'), 'non-HTTP URL rejected');

$keyBuilder = new RssHubUrlBuilder('https://rsshub.example/', 'key', 'secret value');
expectSame('https://rsshub.example/example/users/alice/posts?key=secret%20value', $keyBuilder->routeUrl('/example/users/alice/posts'), 'key auth route URL');
expectSame('https://rsshub.example/api/radar/rules?key=secret%20value', $keyBuilder->rulesUrl(), 'key auth rules URL');
expectSame('https://rsshub.example/example/search/test?q=one&key=secret%20value', $keyBuilder->routeUrl('/example/search/test?q=one'), 'preserves route query before auth');
$specialKeyBuilder = new RssHubUrlBuilder('https://rsshub.example/', 'key', 'a&b<"c');
expectSame('https://rsshub.example/example/test?key=a%26b%3C%22c', $specialKeyBuilder->routeUrl('/example/test'), 'HTML-sensitive access key remains plaintext until URL encoding');

$codeBuilder = new RssHubUrlBuilder('https://rsshub.example', 'code', 'secret');
$expectedCode = md5('/example/users/alice/posts' . 'secret');
expectSame('https://rsshub.example/example/users/alice/posts?code=' . $expectedCode, $codeBuilder->routeUrl('/example/users/alice/posts'), 'code auth uses request path');

expectSame('/github/user/example', RssHubUrlBuilder::manualRoute('rsshub://github/user/example'), 'manual rsshub scheme');
expectSame('/github/user/example?mode=fulltext', RssHubUrlBuilder::manualRoute('rsshub:/github/user/example?mode=fulltext'), 'manual rsshub single-slash scheme');
expectSame(null, RssHubUrlBuilder::manualRoute('https://example.com/'), 'ordinary URL is not a manual route');
expectSame(null, RssHubUrlBuilder::manualRoute('rsshub://../bad'), 'manual route traversal rejected');

$directSource = 'https://github.com/DIYgod/RSSHub-Radar/releases.atom';
$bridgeDetection = 'https://bridge.example/?action=detect&format=Atom&url=' . rawurlencode($directSource);
expectSame($directSource, RssHubUrlBuilder::unwrapRssBridgeDetectionUrl($bridgeDetection, 'https://bridge.example/'), 'unwrap RSS-Bridge detection URL');
expectSame(null, RssHubUrlBuilder::unwrapRssBridgeDetectionUrl($bridgeDetection, 'https://other-bridge.example/'), 'do not unwrap a different bridge origin');

fwrite(STDOUT, "All tests passed.\n");
