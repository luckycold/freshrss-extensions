<?php

declare(strict_types=1);

require_once __DIR__ . '/lib/RetryAfterLockManager.php';

final class RetryAfterManagerExtension extends Minz_Extension {
	/** @var array{status:string,message:string,new_articles?:int}|null */
	private ?array $feedback = null;

	#[\Override]
	public function init(): void {
	}

	#[\Override]
	public function handleConfigureAction(): void {
		$this->registerTranslates();
		if (!Minz_Request::isPost()) {
			return;
		}
		if (Minz_Request::paramString('retry_after_action', true) !== 'reset') {
			return;
		}

		$feedId = Minz_Request::paramInt('retry_after_feed_id');
		$this->feedback = $this->resetFeedLock($feedId);
	}

	/** @return array{status:string,message:string,new_articles?:int}|null */
	public function retryFeedback(): ?array {
		return $this->feedback;
	}

	/** @return list<array{id:int,name:string,host:string,path:string,scope:string,expires:int}> */
	public function activeLocks(): array {
		if (Minz_User::name() === null) {
			return [];
		}

		$manager = $this->lockManager();
		$feedDAO = FreshRSS_Factory::createFeedDao();
		$locks = [];
		foreach ($feedDAO->listFeeds() as $feed) {
			$lock = $manager->activeLock($feed->url(), $feed->proxyParam());
			if ($lock === null) {
				continue;
			}
			$parts = parse_url($feed->url());
			$locks[] = [
				'id' => $feed->id(),
				'name' => self::safeFeedName($feed),
				'host' => is_array($parts) ? (string) ($parts['host'] ?? '') : '',
				'path' => is_array($parts) ? (string) ($parts['path'] ?? '') : '',
				'scope' => $lock['scope'],
				'expires' => $lock['expires'],
			];
		}
		usort($locks, static fn(array $a, array $b): int => $a['expires'] <=> $b['expires'] ?: strcasecmp($a['name'], $b['name']));
		return $locks;
	}

	/** @return array{status:string,message:string,new_articles?:int} */
	private function resetFeedLock(int $feedId): array {
		if ($feedId <= 0 || Minz_User::name() === null) {
			return ['status' => 'error', 'message' => 'invalid_feed'];
		}

		$feedDAO = FreshRSS_Factory::createFeedDao();
		$feed = $feedDAO->searchById($feedId);
		if (!$feed instanceof FreshRSS_Feed) {
			return ['status' => 'error', 'message' => 'invalid_feed'];
		}

		$manager = $this->lockManager();
		if ($manager->activeLock($feed->url(), $feed->proxyParam()) === null) {
			return ['status' => 'info', 'message' => 'already_clear'];
		}
		if ($manager->clear($feed->url(), $feed->proxyParam()) < 1) {
			return ['status' => 'error', 'message' => 'clear_failed'];
		}

		try {
			$result = FreshRSS_feed_Controller::actualizeFeedsAndCommit($feedId);
			$feedAfter = $feedDAO->searchById($feedId);
			$lockAfter = $feedAfter instanceof FreshRSS_Feed
				? $manager->activeLock($feedAfter->url(), $feedAfter->proxyParam())
				: null;
			if (!$feedAfter instanceof FreshRSS_Feed || $feedAfter->inError() || $lockAfter !== null) {
				return ['status' => 'warning', 'message' => 'reset_but_failed'];
			}
			return [
				'status' => 'success',
				'message' => 'reset_success',
				'new_articles' => (int) $result[2],
			];
		} catch (Throwable $error) {
			Minz_Log::warning('Retry-After Manager refresh failed after clearing a feed lock.');
			return ['status' => 'warning', 'message' => 'reset_but_failed'];
		}
	}

	private function lockManager(): FreshRssRetryAfterLockManager {
		return new FreshRssRetryAfterLockManager(DATA_PATH . '/Retry-After');
	}

	private static function safeFeedName(FreshRSS_Feed $feed): string {
		$rawName = trim(html_entity_decode($feed->name(true), ENT_QUOTES));
		return $rawName !== '' ? $rawName : 'Feed #' . $feed->id();
	}
}
