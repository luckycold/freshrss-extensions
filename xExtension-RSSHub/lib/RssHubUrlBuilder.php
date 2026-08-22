<?php

declare(strict_types=1);

final class RssHubUrlBuilder {
	private readonly string $baseUrl;
	private readonly string $accessType;

	public function __construct(string $baseUrl, string $accessType = 'none', private readonly string $accessKey = '') {
		$baseUrl = rtrim(trim($baseUrl), '/');
		$parts = parse_url($baseUrl);
		$scheme = strtolower((string) ($parts['scheme'] ?? ''));
		if (!is_array($parts) || !in_array($scheme, ['http', 'https'], true) || empty($parts['host'])) {
			throw new InvalidArgumentException('RSSHub base URL must be an absolute HTTP(S) URL.');
		}
		if (isset($parts['query']) || isset($parts['fragment'])) {
			throw new InvalidArgumentException('RSSHub base URL must not contain a query string or fragment.');
		}
		$this->baseUrl = $baseUrl;
		$this->accessType = in_array($accessType, ['none', 'key', 'code'], true) ? $accessType : 'none';
	}

	public function rulesUrl(): string {
		return $this->withAccess($this->baseUrl . '/api/radar/rules');
	}

	public function routeUrl(string $route): string {
		if (!$this->isSafeRoute($route)) {
			throw new InvalidArgumentException('Invalid RSSHub route.');
		}
		return $this->withAccess($this->baseUrl . $route);
	}

	public function isInstanceUrl(string $url): bool {
		return $url === $this->baseUrl || str_starts_with($url, $this->baseUrl . '/');
	}

	public static function manualRoute(string $url): ?string {
		if (str_starts_with($url, 'rsshub://')) {
			$route = substr($url, strlen('rsshub://'));
		} elseif (str_starts_with($url, 'rsshub:/')) {
			$route = substr($url, strlen('rsshub:/'));
		} else {
			return null;
		}

		$route = '/' . ltrim($route, '/');
		$self = new self('https://rsshub.invalid');
		return $self->isSafeRoute($route) ? $route : null;
	}

	public static function unwrapRssBridgeDetectionUrl(string $url, string $bridgeBaseUrl): ?string {
		$candidate = parse_url($url);
		$bridge = parse_url(rtrim(trim($bridgeBaseUrl), '/'));
		if (!is_array($candidate) || !is_array($bridge)) {
			return null;
		}

		$candidateScheme = strtolower((string) ($candidate['scheme'] ?? ''));
		$bridgeScheme = strtolower((string) ($bridge['scheme'] ?? ''));
		$candidateHost = strtolower((string) ($candidate['host'] ?? ''));
		$bridgeHost = strtolower((string) ($bridge['host'] ?? ''));
		$candidatePort = (int) ($candidate['port'] ?? ($candidateScheme === 'https' ? 443 : 80));
		$bridgePort = (int) ($bridge['port'] ?? ($bridgeScheme === 'https' ? 443 : 80));
		$candidatePath = '/' . trim((string) ($candidate['path'] ?? '/'), '/');
		$bridgePath = '/' . trim((string) ($bridge['path'] ?? '/'), '/');
		if ($candidateScheme !== $bridgeScheme || $candidateHost !== $bridgeHost
			|| $candidatePort !== $bridgePort || $candidatePath !== $bridgePath) {
			return null;
		}

		parse_str((string) ($candidate['query'] ?? ''), $query);
		$source = $query['url'] ?? null;
		if (($query['action'] ?? null) !== 'detect' || !is_string($source) || $source === '') {
			return null;
		}
		$sourceParts = parse_url($source);
		$sourceScheme = is_array($sourceParts) ? strtolower((string) ($sourceParts['scheme'] ?? '')) : '';
		return in_array($sourceScheme, ['http', 'https'], true) && !empty($sourceParts['host']) ? $source : null;
	}

	private function withAccess(string $url): string {
		if ($this->accessType === 'none' || $this->accessKey === '') {
			return $url;
		}
		if ($this->accessType === 'key') {
			return $this->appendQuery($url, 'key', $this->accessKey);
		}

		$path = parse_url($url, PHP_URL_PATH);
		if (!is_string($path)) {
			throw new InvalidArgumentException('Cannot calculate RSSHub access code for URL.');
		}
		return $this->appendQuery($url, 'code', md5($path . $this->accessKey));
	}

	private function appendQuery(string $url, string $name, string $value): string {
		$separator = str_contains($url, '?') ? '&' : '?';
		return $url . $separator . rawurlencode($name) . '=' . rawurlencode($value);
	}

	private function isSafeRoute(string $route): bool {
		if (!str_starts_with($route, '/') || str_starts_with($route, '//')) {
			return false;
		}
		if (str_contains($route, "\r") || str_contains($route, "\n") || str_contains($route, '\\') || str_contains($route, '#')) {
			return false;
		}

		$path = parse_url($route, PHP_URL_PATH);
		if (!is_string($path) || $path === '' || str_contains($path, "\0")) {
			return false;
		}
		foreach (explode('/', rawurldecode($path)) as $segment) {
			if ($segment === '..' || $segment === '.') {
				return false;
			}
		}
		return true;
	}
}
