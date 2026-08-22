<?php

declare(strict_types=1);

final class CompactMediaCardsExtension extends Minz_Extension {
	private const DEFAULT_LEFT_ACTION = 'karakeep';
	private const DEFAULT_RIGHT_ACTION = 'favorite';

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

	/**
	 * @param array<string,mixed> $vars
	 * @return array<string,mixed>
	 */
	public function jsVars(array $vars): array {
		$vars['compactMediaCards'] = [
			'leftAction' => $this->getSwipeLeftAction(),
			'rightAction' => $this->getSwipeRightAction(),
		];
		return $vars;
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
		$this->setUserConfigurationValue('swipe_left_action', $left);
		$this->setUserConfigurationValue('swipe_right_action', $right);
		FreshRSS_UserDAO::touch();
	}

	private function validatedAction(?string $action, string $fallback): string {
		return $action !== null && array_key_exists($action, self::swipeActionOptions())
			? $action
			: $fallback;
	}
}
