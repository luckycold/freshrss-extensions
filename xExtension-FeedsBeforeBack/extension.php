<?php

declare(strict_types=1);

final class FeedsBeforeBackExtension extends Minz_Extension {
	#[\Override]
	public function init(): void {
		parent::init();
		FreshRSS_View::appendScript(
			$this->getFileUrl('feeds-before-back.js'),
			defer: true,
			async: false,
			id: 'feeds-before-back',
		);
	}
}
