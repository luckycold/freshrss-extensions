<?php

declare(strict_types=1);

final class CompactMediaCardsExtension extends Minz_Extension {
	private const DEFAULT_LEFT_ACTION = 'karakeep';
	private const DEFAULT_RIGHT_ACTION = 'favorite';
	private const DEFAULT_LAYOUT = 'masonry';

	/** @return array<string,string> */
	public static function swipeActionOptions(): array {
		return [
			'favorite' => 'Favorite / Watch later',
			'karakeep' => 'Save to Karakeep',
			'read' => 'Toggle read / unread',
			'reader' => 'Open in FreshRSS reader',
			'website' => 'Open original website',
			'none' => 'Disabled',
		];
	}

	/** @return array<string,string> */
	public static function layoutOptions(): array {
		return [
			'masonry' => 'Masonry grid',
			'list' => 'Linear list',
		];
	}

	#[\Override]
	public function init(): void {
		parent::init();

		Minz_View::appendStyle($this->getFileUrl('compact-media-cards.css'));
		FreshRSS_View::appendScript(
			$this->getFileUrl('compact-media-cards.js'),
			defer: true,
			async: false,
			id: 'compact-media-cards',
		);
		$this->registerHook(Minz_HookType::JsVars, [$this, 'jsVars']);
		$this->registerHook(Minz_HookType::NavEntries, [$this, 'layoutMarker'], 0);
	}

	public function getSwipeLeftAction(): string {
		return $this->validatedAction(
			$this->getUserConfigurationString('swipe_left_action'),
			self::DEFAULT_LEFT_ACTION,
		);
	}

	public function getSwipeRightAction(): string {
		return $this->validatedAction(
			$this->getUserConfigurationString('swipe_right_action'),
			self::DEFAULT_RIGHT_ACTION,
		);
	}

	public function getLayout(): string {
		return $this->validatedLayout($this->getUserConfigurationString('layout'));
	}

	/**
	 * @param array<string,mixed> $vars
	 * @return array<string,mixed>
	 */
	public function jsVars(array $vars): array {
		$vars['compactMediaCards'] = [
			'leftAction' => $this->getSwipeLeftAction(),
			'rightAction' => $this->getSwipeRightAction(),
			'layout' => $this->getLayout(),
			'configureUrl' => Minz_Url::display([
				'c' => 'extension',
				'a' => 'configure',
				'params' => ['e' => $this->getName()],
			], 'php'),
		];
		return $vars;
	}

	public function layoutMarker(): string {
		$layout = htmlspecialchars($this->getLayout(), ENT_QUOTES, 'UTF-8');
		return '<div id="cmc_layout" hidden="hidden" data-cmc-layout="' . $layout . '"></div>';
	}

	#[\Override]
	public function handleConfigureAction(): void {
		parent::handleConfigureAction();
		if (!Minz_Request::isPost()) {
			return;
		}

		$left = $this->validatedAction(
			Minz_Request::paramString('cmc_swipe_left_action'),
			self::DEFAULT_LEFT_ACTION,
		);
		$right = $this->validatedAction(
			Minz_Request::paramString('cmc_swipe_right_action'),
			self::DEFAULT_RIGHT_ACTION,
		);
		$layout = $this->validatedLayout(Minz_Request::paramString('cmc_layout'));
		$this->setUserConfigurationValue('swipe_left_action', $left);
		$this->setUserConfigurationValue('swipe_right_action', $right);
		$this->setUserConfigurationValue('layout', $layout);
		FreshRSS_UserDAO::touch();
	}

	private function validatedAction(?string $action, string $fallback): string {
		return $action !== null && array_key_exists($action, self::swipeActionOptions())
			? $action
			: $fallback;
	}

	private function validatedLayout(?string $layout): string {
		return $layout !== null && array_key_exists($layout, self::layoutOptions())
			? $layout
			: self::DEFAULT_LAYOUT;
	}
}
