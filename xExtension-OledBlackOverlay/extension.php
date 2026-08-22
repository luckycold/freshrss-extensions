<?php

declare(strict_types=1);

final class OledBlackOverlayExtension extends Minz_Extension {
	#[\Override]
	public function init(): void {
		parent::init();
		Minz_View::appendStyle($this->getFileUrl('oled-black.css'));
	}
}
