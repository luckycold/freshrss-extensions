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
			return (url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password ? url.href : null;
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
		decorateShareButtons();
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

	function shareStatus(button, message) {
		button.title = message;
		button.setAttribute('aria-label', message);
		document.getElementById('ecs-share-status').textContent = message;
	}

	function manualCopy(url) {
		document.querySelector('.ecs-share-fallback')?.remove();
		const dialog = document.createElement('dialog');
		dialog.className = 'ecs-share-fallback';
		const label = document.createElement('label');
		label.textContent = 'Copy article link: ';
		const input = document.createElement('input');
		input.readOnly = true;
		input.value = url;
		label.append(input);
		const close = document.createElement('button');
		close.type = 'button';
		close.textContent = 'Close';
		close.addEventListener('click', function () { dialog.remove(); });
		dialog.append(label, close);
		document.body.append(dialog);
		if (typeof dialog.showModal === 'function') dialog.showModal();
		else dialog.setAttribute('open', '');
		input.focus();
		input.select();
	}

	async function shareArticle(button) {
		if (button.disabled) return;
		const anchor = button.closest('.flux_header').querySelector(ORIGINAL_LINK_SELECTOR);
		const url = httpUrl(anchor);
		if (!url) return;
		button.disabled = true;
		const data = { title: anchor.textContent.trim(), url: url };
		try {
			if (typeof navigator.share === 'function'
				&& (typeof navigator.canShare !== 'function' || navigator.canShare(data))) {
				// Call before any await to retain the mobile browser's user activation.
				try {
					await navigator.share(data);
					shareStatus(button, 'Link shared');
					return;
				} catch (error) {
					if (error && error.name === 'AbortError') {
						shareStatus(button, 'Share article link');
						return;
					}
				}
			}
			await navigator.clipboard.writeText(url);
			shareStatus(button, 'Link copied');
		} catch (error) {
			shareStatus(button, 'Copy article link manually');
			manualCopy(url);
		} finally {
			button.disabled = false;
		}
	}

	function handleShare(event) {
		const button = event.target instanceof Element && event.target.closest('.ecs-share-button');
		if (!button) return;
		// Isolate all clicks from FreshRSS and card gestures, including mouseup.
		event.stopImmediatePropagation();
		if (event.type === 'click') {
			event.preventDefault();
			if (isUnmodifiedPrimaryClick(event)) void shareArticle(button);
		}
	}

	function decorateShareButtons() {
		document.querySelectorAll('.flux .flux_header').forEach(function (header) {
			if (header.querySelector('.ecs-share') || !httpUrl(header.querySelector(ORIGINAL_LINK_SELECTOR))) return;
			const item = document.createElement('li');
			item.className = 'item ecs-share';
			const button = document.createElement('button');
			button.type = 'button';
			button.className = 'item-element ecs-share-button';
			button.title = 'Share article link';
			button.setAttribute('aria-label', button.title);
			const icon = document.createElement('img');
			icon.className = 'icon';
			icon.src = new URL('../themes/icons/share.svg', document.baseURI).href;
			icon.alt = '';
			button.append(icon);
			item.append(button);
			header.append(item);
		});
	}

	function init() {
		if (document.documentElement.dataset.entryClickSwap === 'active') {
			return;
		}
		document.documentElement.dataset.entryClickSwap = 'active';
		const status = document.createElement('span');
		status.id = 'ecs-share-status';
		status.setAttribute('role', 'status');
		document.body.append(status);
		document.addEventListener('mouseup', handleShare, true);
		document.addEventListener('click', handleShare, true);
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
