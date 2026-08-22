<?php

declare(strict_types=1);

require_once __DIR__ . '/lib/RadarMatcher.php';
require_once __DIR__ . '/lib/RssHubUrlBuilder.php';

final class RssHubExtension extends Minz_Extension {
	private const CACHE_TTL_SECONDS = 21600;
	private const MAX_RULES_BYTES = 5242880;

	#[\Override]
	public function init(): void {
		// Run after RSS-Bridge (default priority 0), unwrap its detect URL, and
		// restore valid direct feeds before choosing RSSHub or the bridge fallback.
		$this->registerHook(Minz_HookType::CheckUrlBeforeAdd, [self::class, 'detect'], 20);
	}

	#[\Override]
	public function handleConfigureAction(): void {
		$this->registerTranslates();
		if (!Minz_Request::isPost()) {
			return;
		}

		$conf = FreshRSS_Context::systemConf();
		$baseUrl = rtrim(Minz_Request::paramString('rsshub_radar_url', true), '/');
		$accessType = Minz_Request::paramString('rsshub_radar_access_type', true);
		if (!in_array($accessType, ['none', 'key', 'code'], true)) {
			$accessType = 'none';
		}

		try {
			if ($baseUrl !== '') {
				new RssHubUrlBuilder($baseUrl, $accessType, 'validation-only');
			}
		} catch (InvalidArgumentException $error) {
			Minz_Log::warning('RSSHub Radar configuration rejected: invalid base URL.');
			return;
		}

		$conf->rsshub_radar_url = $baseUrl;
		$conf->rsshub_radar_access_type = $accessType;
		$conf->rsshub_radar_auto_detect = Minz_Request::paramBoolean('rsshub_radar_auto_detect');

		$clearKey = Minz_Request::paramBoolean('rsshub_radar_clear_key');
		$newKey = Minz_Request::paramString('rsshub_radar_access_key', true);
		if ($clearKey) {
			$conf->rsshub_radar_access_key = '';
		} elseif ($newKey !== '') {
			$conf->rsshub_radar_access_key = $newKey;
		}
		$conf->save();
	}

	public static function detect(string $url): string {
		$conf = FreshRSS_Context::systemConf();
		$fallbackUrl = $url;
		$bridgeBaseUrl = trim((string) ($conf->rss_bridge_url ?? ''));
		$sourceUrl = $bridgeBaseUrl === ''
			? null
			: RssHubUrlBuilder::unwrapRssBridgeDetectionUrl($url, $bridgeBaseUrl);
		if ($sourceUrl !== null) {
			$url = $sourceUrl;
		}

		// RSS-Bridge may detect even an already-valid feed. Restore the original
		// URL before any RSSHub configuration or conversion is considered.
		if ($sourceUrl !== null && self::isDirectFeed($url)) {
			return $url;
		}

		$baseUrl = trim((string) ($conf->rsshub_radar_url ?? ''));
		if ($baseUrl === '') {
			return $fallbackUrl;
		}

		$accessType = (string) ($conf->rsshub_radar_access_type ?? 'none');
		$accessKey = (string) ($conf->rsshub_radar_access_key ?? '');
		try {
			$builder = new RssHubUrlBuilder($baseUrl, $accessType, $accessKey);
		} catch (InvalidArgumentException $error) {
			Minz_Log::warning('RSSHub Radar skipped: invalid configured base URL.');
			return $fallbackUrl;
		}

		$manualRoute = RssHubUrlBuilder::manualRoute($url);
		if ($manualRoute !== null) {
			try {
				return $builder->routeUrl($manualRoute);
			} catch (InvalidArgumentException $error) {
				return $fallbackUrl;
			}
		}

		if ($builder->isInstanceUrl($url)) {
			return $url;
		}
		if (!(bool) ($conf->rsshub_radar_auto_detect ?? true)) {
			return $fallbackUrl;
		}
		// FreshRSS must get first choice when the submitted URL is already a
		// parseable feed. Disable SimplePie's HTML autodiscovery for this probe so
		// ordinary webpages can still be converted through RSSHub Radar.
		if (self::isDirectFeed($url)) {
			return $url;
		}

		try {
			$rules = self::loadRules($builder);
			$routes = (new RssHubRadarMatcher($rules))->match($url);
			if ($routes !== []) {
				return $builder->routeUrl($routes[0]);
			}
		} catch (Throwable $error) {
			// Feed addition must fail open: FreshRSS can still discover a native feed,
			// and the existing RSS-Bridge extension can still handle the URL.
			Minz_Log::warning('RSSHub Radar detection failed; preserving the original URL.');
		}
		return $fallbackUrl;
	}

	private static function isDirectFeed(string $url): bool {
		$parts = parse_url($url);
		$scheme = is_array($parts) ? strtolower((string) ($parts['scheme'] ?? '')) : '';
		if (!in_array($scheme, ['http', 'https'], true)) {
			return false;
		}

		try {
			$feed = new FreshRSS_Feed($url);
			return @$feed->load(loadDetails: false, noCache: true) instanceof FreshRSS_SimplePieCustom;
		} catch (Throwable $error) {
			return false;
		}
	}

	/** @return array<string,mixed> */
	private static function loadRules(RssHubUrlBuilder $builder): array {
		$rulesUrl = $builder->rulesUrl();
		$cacheDir = defined('DATA_PATH')
			? DATA_PATH . '/cache/rsshub-radar'
			: sys_get_temp_dir() . '/freshrss-rsshub-radar';
		if (is_link($cacheDir)
			|| (!is_dir($cacheDir) && !@mkdir($cacheDir, 0700, true) && !is_dir($cacheDir))) {
			throw new RuntimeException('RSSHub Radar cache directory is unavailable.');
		}
		@chmod($cacheDir, 0700);
		$cachePath = $cacheDir . '/' . hash('sha256', $rulesUrl) . '.json';

		if (is_file($cachePath) && filemtime($cachePath) >= time() - self::CACHE_TTL_SECONDS) {
			$cached = @file_get_contents($cachePath, false, null, 0, self::MAX_RULES_BYTES);
			if (is_string($cached) && $cached !== '') {
				try {
					return self::decodeRules($cached);
				} catch (Throwable $error) {
					@unlink($cachePath);
				}
			}
		}

		$json = self::fetchRulesJson($rulesUrl);
		$rules = self::decodeRules($json);
		$tmpPath = $cachePath . '.' . bin2hex(random_bytes(6)) . '.tmp';
		if (file_put_contents($tmpPath, $json, LOCK_EX) !== false) {
			@chmod($tmpPath, 0600);
			@rename($tmpPath, $cachePath);
		} else {
			@unlink($tmpPath);
		}
		return $rules;
	}

	private static function fetchRulesJson(string $url): string {
		if (!function_exists('curl_init')) {
			throw new RuntimeException('RSSHub Radar requires the PHP cURL extension.');
		}

		$body = '';
		$tooLarge = false;
		$curl = curl_init($url);
		if ($curl === false) {
			throw new RuntimeException('RSSHub rules request could not be initialized.');
		}
		@curl_setopt_array($curl, [
			CURLOPT_CONNECTTIMEOUT => 10,
			CURLOPT_TIMEOUT => 20,
			CURLOPT_FOLLOWLOCATION => false,
			CURLOPT_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS,
			CURLOPT_HTTPHEADER => ['Accept: application/json'],
			CURLOPT_USERAGENT => 'FreshRSS-RSSHub-Radar/1.0.3',
			CURLOPT_WRITEFUNCTION => static function ($curlHandle, string $chunk) use (&$body, &$tooLarge): int {
				if (strlen($body) + strlen($chunk) > self::MAX_RULES_BYTES) {
					$tooLarge = true;
					return 0;
				}
				$body .= $chunk;
				return strlen($chunk);
			},
		]);
		$success = @curl_exec($curl);
		$status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
		curl_close($curl);

		if ($success !== true || $tooLarge || $status < 200 || $status >= 300 || $body === '') {
			throw new RuntimeException('RSSHub rules endpoint did not return a valid bounded HTTP 2xx response.');
		}
		return $body;
	}

	/** @return array<string,mixed> */
	private static function decodeRules(string $json): array {
		$rules = json_decode($json, true, 128, JSON_THROW_ON_ERROR);
		if (!is_array($rules) || $rules === []) {
			throw new RuntimeException('RSSHub rules endpoint returned an invalid payload.');
		}
		return $rules;
	}
}
