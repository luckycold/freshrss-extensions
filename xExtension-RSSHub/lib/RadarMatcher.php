<?php

declare(strict_types=1);

/**
 * A small, dependency-free matcher for RSSHub Radar's JSON rule format.
 *
 * It intentionally supports the serialisable rule subset exposed by
 * /api/radar/rules: static targets, named path parameters, optional path
 * parameters, regex constraints, wildcards, and simple query parameters.
 */
final class RssHubRadarMatcher {
	/** @param array<string,mixed> $rules */
	public function __construct(private readonly array $rules) {
	}

	/** @return list<string> RSSHub route paths, without an instance URL or access key. */
	public function match(string $url): array {
		$parts = parse_url($url);
		if (!is_array($parts)) {
			return [];
		}

		$scheme = strtolower((string) ($parts['scheme'] ?? ''));
		$host = strtolower(rtrim((string) ($parts['host'] ?? ''), '.'));
		if (!in_array($scheme, ['http', 'https'], true) || $host === '') {
			return [];
		}

		$domain = $this->findRulesDomain($host);
		if ($domain === null || !is_array($this->rules[$domain] ?? null)) {
			return [];
		}

		$domainRules = $this->rules[$domain];
		$subdomain = $host === $domain ? '.' : substr($host, 0, -(strlen($domain) + 1));
		$rules = $this->rulesForSubdomain($domainRules, $subdomain);
		if ($rules === []) {
			return [];
		}

		$path = (string) ($parts['path'] ?? '/');
		$path = $path === '' ? '/' : $path;
		if ($path !== '/') {
			$path = rtrim($path, '/');
		}
		$query = (string) ($parts['query'] ?? '');
		$candidates = [[$path, $query]];
		$fragment = (string) ($parts['fragment'] ?? '');
		if ($fragment !== '') {
			[$fragmentPath, $fragmentQuery] = array_pad(explode('?', $fragment, 2), 2, null);
			$candidates[] = [$path . '#' . $fragmentPath, $fragmentQuery ?? $query];
		}

		$routes = [];
		foreach ($rules as $rule) {
			if (!is_array($rule) || !is_string($rule['target'] ?? null)) {
				continue;
			}
			$target = $rule['target'];
			if (!$this->isUsableTarget($target)) {
				continue;
			}

			$sources = $rule['source'] ?? [];
			if (is_string($sources)) {
				$sources = [$sources];
			}
			if (!is_array($sources)) {
				continue;
			}

			foreach ($sources as $source) {
				if (!is_string($source) || $source === '') {
					continue;
				}
				$params = null;
				foreach ($candidates as [$candidatePath, $candidateQuery]) {
					$params = $this->matchSource($source, $candidatePath, $candidateQuery);
					if ($params !== null) {
						break;
					}
				}
				if ($params === null) {
					continue;
				}
				$route = $this->fillTarget($target, $params);
				if ($route !== null && !in_array($route, $routes, true)) {
					$routes[] = $route;
				}
			}
		}

		return $routes;
	}

	private function findRulesDomain(string $host): ?string {
		$labels = explode('.', $host);
		for ($index = 0, $count = count($labels); $index < $count; ++$index) {
			$candidate = implode('.', array_slice($labels, $index));
			if (array_key_exists($candidate, $this->rules)) {
				return $candidate;
			}
		}
		return null;
	}

	/**
	 * @param array<string,mixed> $domainRules
	 * @return list<array<string,mixed>>
	 */
	private function rulesForSubdomain(array $domainRules, string $subdomain): array {
		$candidates = [$subdomain];
		if ($subdomain === 'www') {
			$candidates[] = '.';
		} elseif ($subdomain === '.') {
			$candidates[] = 'www';
		}
		$candidates[] = '*';

		foreach (array_unique($candidates) as $candidate) {
			if (is_array($domainRules[$candidate] ?? null)) {
				/** @var list<array<string,mixed>> $result */
				$result = array_values(array_filter($domainRules[$candidate], 'is_array'));
				return $result;
			}
		}
		return [];
	}

	/** @return array<string,string>|null */
	private function matchSource(string $source, string $path, string $query): ?array {
		[$sourcePath, $sourceQuery] = $this->splitSource($source);
		$compiled = $this->compilePathPattern($sourcePath);
		if ($compiled === null || preg_match($compiled, $path, $matches) !== 1) {
			return null;
		}

		$params = [];
		foreach ($matches as $name => $value) {
			if (is_string($name) && is_string($value) && $value !== '') {
				$params[$name] = $value;
			}
		}

		if ($sourceQuery !== null && !$this->matchQuery($sourceQuery, $query, $params)) {
			return null;
		}
		return $params;
	}

	/** @return array{string,?string} */
	private function splitSource(string $source): array {
		if (preg_match('/\?([A-Za-z0-9_.%:-]+)=/', $source, $match, PREG_OFFSET_CAPTURE) === 1) {
			$offset = $match[0][1];
			return [substr($source, 0, $offset), substr($source, $offset + 1)];
		}
		return [$source, null];
	}

	private function compilePathPattern(string $sourcePath): ?string {
		if ($sourcePath === '') {
			$sourcePath = '/';
		}
		if (!str_starts_with($sourcePath, '/')) {
			return null;
		}
		if ($sourcePath === '/') {
			return '~^/$~u';
		}

		$segments = explode('/', trim($sourcePath, '/'));
		$pattern = '^';
		foreach ($segments as $segment) {
			$optional = false;
			$segmentPattern = $this->compileSegment($segment, $optional);
			if ($segmentPattern === null) {
				return null;
			}
			if ($optional) {
				$pattern .= '(?:/' . $segmentPattern . ')?';
			} else {
				$pattern .= '/' . $segmentPattern;
			}
		}
		return '~' . $pattern . '/?$~u';
	}

	private function compileSegment(string $segment, bool &$optional): ?string {
		$optional = false;
		if (preg_match('/^:([A-Za-z_][A-Za-z0-9_]*)(?:\{(.+)\})?([?*])?$/', $segment, $match) === 1) {
			$name = $match[1];
			$constraint = $match[2] ?? '';
			$modifier = $match[3] ?? '';
			$optional = $modifier === '?';
			$valuePattern = $modifier === '*' ? '.+' : ($constraint !== '' ? str_replace('~', '\\~', $constraint) : '[^/]+');
			return '(?P<' . $name . '>' . $valuePattern . ')';
		}

		if (preg_match('/^\*([A-Za-z_][A-Za-z0-9_]*)$/', $segment, $match) === 1) {
			return '(?P<' . $match[1] . '>.*)';
		}
		if ($segment === '*') {
			return '.*';
		}

		$pattern = '';
		$length = strlen($segment);
		for ($index = 0; $index < $length;) {
			if ($segment[$index] === ':') {
				$tail = substr($segment, $index);
				if (preg_match('/^:([A-Za-z_][A-Za-z0-9_]*)/', $tail, $match) !== 1) {
					return null;
				}
				$name = $match[1];
				$index += strlen($match[0]);
				$constraint = '';
				if ($index < $length && $segment[$index] === '{') {
					$end = strpos($segment, '}', $index + 1);
					if ($end === false) {
						return null;
					}
					$constraint = substr($segment, $index + 1, $end - $index - 1);
					$index = $end + 1;
				}
				$modifier = '';
				if ($index < $length && ($segment[$index] === '?' || $segment[$index] === '*')) {
					$modifier = $segment[$index];
					++$index;
				}
				$valuePattern = $modifier === '*'
					? '.*'
					: ($constraint !== ''
						? str_replace('~', '\\~', $constraint)
						: ($modifier === '?' ? '[^/]*' : '[^/]+'));
				$pattern .= '(?P<' . $name . '>' . $valuePattern . ')';
				continue;
			}
			if ($segment[$index] === '*') {
				++$index;
				$tail = substr($segment, $index);
				if (preg_match('/^([A-Za-z_][A-Za-z0-9_]*)/', $tail, $match) === 1) {
					$pattern .= '(?P<' . $match[1] . '>.*)';
					$index += strlen($match[1]);
				} else {
					$pattern .= '.*';
				}
				continue;
			}
			$pattern .= preg_quote($segment[$index], '~');
			++$index;
		}
		return $pattern;
	}

	/** @param array<string,string> $params */
	private function matchQuery(string $sourceQuery, string $query, array &$params): bool {
		parse_str($sourceQuery, $required);
		parse_str($query, $actual);
		foreach ($required as $name => $expected) {
			if (!is_string($expected) || !array_key_exists($name, $actual) || !is_scalar($actual[$name])) {
				return false;
			}
			$value = (string) $actual[$name];
			if ($expected === '*') {
				$params[(string) $name] = rawurlencode($value);
			} elseif (preg_match('/^:([A-Za-z_][A-Za-z0-9_]*)$/', $expected, $match) === 1) {
				$params[$match[1]] = rawurlencode($value);
			} elseif ($value !== $expected) {
				return false;
			}
		}
		return true;
	}

	private function isUsableTarget(string $target): bool {
		return str_starts_with($target, '/')
			&& !str_starts_with($target, '//')
			&& !str_contains($target, "\r")
			&& !str_contains($target, "\n")
			&& !str_contains($target, '=>');
	}

	/** @param array<string,string> $params */
	private function fillTarget(string $target, array $params): ?string {
		[$path, $query] = $this->splitSource($target);
		$segments = explode('/', trim($path, '/'));
		$output = [];
		foreach ($segments as $segment) {
			if (preg_match('/^:([A-Za-z_][A-Za-z0-9_]*)(?:\{[^}]*\})?(\?)?$/', $segment, $match) === 1) {
				$name = $match[1];
				$optional = ($match[2] ?? '') === '?';
				if (!isset($params[$name]) || $params[$name] === '') {
					if ($optional) {
						break;
					}
					return null;
				}
				$output[] = $params[$name];
				continue;
			}

			$failed = false;
			$filled = $this->fillTemplate($segment, $params, $failed);
			if ($failed || !is_string($filled)) {
				return null;
			}
			$output[] = $filled;
		}

		$route = '/' . implode('/', $output);
		if ($query !== null && $query !== '') {
			$failed = false;
			$filledQuery = $this->fillTemplate($query, $params, $failed);
			if ($failed || !is_string($filledQuery)) {
				return null;
			}
			$route .= '?' . $filledQuery;
		}
		return $this->isUsableTarget($route) ? $route : null;
	}

	/** @param array<string,string> $params */
	private function fillTemplate(string $template, array $params, bool &$failed): ?string {
		return preg_replace_callback(
			'/:([A-Za-z_][A-Za-z0-9_]*)(?:\{[^}]*\})?(\?)?/',
			static function (array $match) use ($params, &$failed): string {
				$name = $match[1];
				$optional = ($match[2] ?? '') === '?';
				if (!isset($params[$name]) || $params[$name] === '') {
					if (!$optional) {
						$failed = true;
					}
					return '';
				}
				return $params[$name];
			},
			$template,
		);
	}
}
