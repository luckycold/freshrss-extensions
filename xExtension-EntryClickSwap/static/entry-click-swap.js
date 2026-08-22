(function () {
	'use strict';

	const READER_BUTTON_SELECTOR = '.flux_header .item.link > a';
	const ORIGINAL_LINK_SELECTOR = '.flux_header .item.titleAuthorSummaryDate > a.title[href], .flux_header a.title[href]';
	const EXCLUDED_SELECTOR = '.item.manage, .item.website, .item.labels, .item.share, .dropdown, button, input, select, textarea, a.bookmark, a.karakeepButton';
	const READER_LABEL = 'Open in FreshRSS reader';

	function isUnmodifiedPrimaryClick(event) {
		return event.button === 0 && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
	}

	function httpUrl(anchor) {
		if (!(anchor instanceof HTMLAnchorElement)) {
			return null;
		}
		try {
			const url = new URL(anchor.href, document.baseURI);
			return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
		} catch (error) {
			return null;
		}
	}

	function actionFor(target) {
		if (!(target instanceof Element)) {
			return null;
		}
		const header = target.closest('.flux_header');
		const flux = target.closest('.flux');
		if (!header || !flux) {
			return null;
		}

		const readerButton = target.closest(READER_BUTTON_SELECTOR);
		if (readerButton && header.contains(readerButton)) {
			return { mode: 'reader', flux: flux };
		}
		if (target.closest(EXCLUDED_SELECTOR)) {
			return null;
		}

		const originalLink = header.querySelector(ORIGINAL_LINK_SELECTOR);
		const url = httpUrl(originalLink);
		return url ? { mode: 'website', flux: flux, url: url } : null;
	}

	function stopFreshRssToggle(event) {
		if (isUnmodifiedPrimaryClick(event) && actionFor(event.target)) {
			event.stopImmediatePropagation();
		}
	}

	function handleClick(event) {
		if (!isUnmodifiedPrimaryClick(event)) {
			return;
		}
		const action = actionFor(event.target);
		if (!action) {
			return;
		}
		event.preventDefault();
		event.stopImmediatePropagation();

		if (action.mode === 'reader') {
			if (typeof toggleContent === 'function') {
				toggleContent(action.flux, document.querySelector('.flux.current'), false);
			}
			return;
		}

		if (typeof context !== 'undefined' && context.auto_mark_site && typeof mark_read === 'function') {
			mark_read(action.flux, true, false);
		}
		window.open(action.url, '_blank', 'noopener,noreferrer');
	}

	function decorateReaderButtons(root) {
		root.querySelectorAll(READER_BUTTON_SELECTOR).forEach(function (button) {
			button.title = READER_LABEL;
			button.setAttribute('aria-label', READER_LABEL);
			const image = button.querySelector('img');
			if (image) {
				image.src = new URL('../themes/icons/view-reader.svg', document.baseURI).href;
				image.alt = '';
			}
		});
	}

	function init() {
		if (document.documentElement.dataset.entryClickSwap === 'active') {
			return;
		}
		document.documentElement.dataset.entryClickSwap = 'active';
		document.addEventListener('mouseup', stopFreshRssToggle, true);
		document.addEventListener('click', handleClick, true);
		document.addEventListener('freshrss:load-more', function () {
			decorateReaderButtons(document);
		});
		decorateReaderButtons(document);
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init, { once: true });
	} else {
		init();
	}
}());
