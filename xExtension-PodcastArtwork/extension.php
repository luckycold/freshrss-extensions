<?php

declare(strict_types=1);

/**
 * Preserve per-item podcast artwork that FreshRSS/SimplePie does not currently
 * map from <itunes:image href="…"> into the standard thumbnail attribute.
 */
final class PodcastArtworkExtension extends Minz_Extension {
	/** @var array<string,string> */
	private array $imagesByGuid = [];

	/** @var array<string,string> */
	private array $imagesByLink = [];

	#[\Override]
	public function init(): void {
		$this->registerHook('simplepie_after_init', [$this, 'captureArtwork']);
		$this->registerHook('entry_before_insert', [$this, 'applyArtwork']);
		$this->registerHook('entry_before_update', [$this, 'applyArtwork']);
	}

	public function captureArtwork(FreshRSS_SimplePieCustom $simplePie, FreshRSS_Feed $feed, bool $result): void {
		if (!$result) {
			return;
		}

		foreach ($simplePie->get_items() as $item) {
			if (!$item instanceof \SimplePie\Item) {
				continue;
			}

			$imageUrl = $this->itunesImageUrl($item);
			if ($imageUrl === null) {
				continue;
			}

			$guid = safe_ascii($item->get_id(false, false));
			if ($guid !== '') {
				$this->imagesByGuid[$guid] = $imageUrl;
			}

			$link = html_only_entity_decode($item->get_permalink() ?? '');
			if ($link !== '') {
				$this->imagesByLink[$link] = $imageUrl;
			}
		}
	}

	public function applyArtwork(FreshRSS_Entry $entry): FreshRSS_Entry {
		$thumbnail = $entry->attributeArray('thumbnail') ?? [];
		if (!empty($thumbnail['url'])) {
			return $entry;
		}

		$imageUrl = $this->imagesByGuid[$entry->guid()] ?? null;
		if ($imageUrl === null) {
			$imageUrl = $this->imagesByLink[html_only_entity_decode($entry->link(raw: true))] ?? null;
		}
		if ($imageUrl !== null) {
			$entry->_attribute('thumbnail', ['url' => $imageUrl]);
		}

		return $entry;
	}

	private function itunesImageUrl(\SimplePie\Item $item): ?string {
		$tags = $item->get_item_tags('http://www.itunes.com/dtds/podcast-1.0.dtd', 'image');
		foreach ($tags as $tag) {
			$href = $tag['attribs']['']['href'] ?? '';
			if (is_string($href) && $this->isSafeImageUrl($href)) {
				return $href;
			}
		}
		return null;
	}

	private function isSafeImageUrl(string $url): bool {
		if (filter_var($url, FILTER_VALIDATE_URL) === false) {
			return false;
		}
		$scheme = strtolower((string) parse_url($url, PHP_URL_SCHEME));
		return in_array($scheme, ['http', 'https'], true)
			&& !str_contains($url, '"')
			&& !str_contains($url, "'")
			&& !str_contains($url, '<')
			&& !str_contains($url, '>');
	}
}
