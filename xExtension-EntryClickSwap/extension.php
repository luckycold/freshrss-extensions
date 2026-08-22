<?php

declare(strict_types=1);

final class EntryClickSwapExtension extends Minz_Extension {
	#[\Override]
	public function init(): void {
		parent::init();
		FreshRSS_View::appendScript(
			$this->getFileUrl('entry-click-swap.js'),
			defer: true,
			async: false,
			id: 'entry-click-swap',
		);
	}
}
