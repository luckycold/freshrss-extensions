<?php

declare(strict_types=1);

final class FreshRssRetryAfterLockManager {
	private readonly string $retryAfterPath;

	public function __construct(string $retryAfterPath) {
		$retryAfterPath = rtrim($retryAfterPath, '/');
		if ($retryAfterPath === '' || str_contains($retryAfterPath, "\0")) {
			throw new InvalidArgumentException('A valid Retry-After directory is required.');
		}
		$this->retryAfterPath = $retryAfterPath;
	}

	/** @return list<array{path:string,scope:'domain'|'feed'}> */
	public function candidatePaths(string $url, string $proxy = ''): array {
		$parts = parse_url($url);
		$scheme = is_array($parts) ? strtolower((string) ($parts['scheme'] ?? '')) : '';
		$domain = is_array($parts) ? (string) ($parts['host'] ?? '') : '';
		if (!in_array($scheme, ['http', 'https'], true) || $domain === ''
			|| str_contains($url, "\0") || str_contains($proxy, "\0")
			|| str_contains($proxy, "\r") || str_contains($proxy, "\n")) {
			return [];
		}

		$port = $parts['port'] ?? null;
		if (is_int($port)) {
			$domain .= ':' . $port;
		}
		$prefix = $this->retryAfterPath . '/' . urlencode($domain);
		$proxySuffix = $proxy === '' ? '' : '_' . urlencode($proxy);
		return [
			['path' => $prefix . $proxySuffix . '.txt', 'scope' => 'domain'],
			['path' => $prefix . '_' . hash('sha256', $url) . $proxySuffix . '.txt', 'scope' => 'feed'],
		];
	}

	/** @return array{path:string,scope:'domain'|'feed',expires:int}|null */
	public function activeLock(string $url, string $proxy = '', ?int $now = null): ?array {
		$now ??= time();
		$active = null;
		foreach ($this->candidatePaths($url, $proxy) as $candidate) {
			$expires = @filemtime($candidate['path']) ?: 0;
			if ($expires > $now && ($active === null || $expires > $active['expires'])) {
				$active = [
					'path' => $candidate['path'],
					'scope' => $candidate['scope'],
					'expires' => $expires,
				];
			}
		}
		return $active;
	}

	public function clear(string $url, string $proxy = ''): int {
		$removed = 0;
		foreach ($this->candidatePaths($url, $proxy) as $candidate) {
			$path = $candidate['path'];
			if ((is_file($path) || is_link($path)) && @unlink($path)) {
				++$removed;
			}
		}
		return $removed;
	}
}
