(function () {
	'use strict';

	// A PWA cannot cancel Android/Chrome's system back gesture or make that
	// gesture drag the feed list. The supported approach is a same-document
	// history entry: the first back stays on this page and opens the left
	// feeds; the next back is the real previous page.
	if (window.__feedsBeforeBack) {
		return;
	}
	window.__feedsBeforeBack = true;

	const FLAG = 'feedsBeforeBack';
	const MOBILE_QUERY = '(max-width: 840px)';
	const COARSE_QUERY = '(pointer: coarse)';
	const STANDALONE_QUERY = '(display-mode: standalone), (display-mode: minimal-ui), (display-mode: fullscreen)';
	const SAME_GESTURE_MS = 700;

	let tracked = history.state;
	let handling = false;
	let becameOpenAt = 0;
	let started = false;

	function matches(query) {
		return typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
	}

	function aside() {
		return document.getElementById('aside_feed');
	}

	function toggleButton() {
		return document.querySelector('#nav_menu_toggle_aside button');
	}

	function hasFeeds() {
		return !!(aside() && toggleButton());
	}

	function feedsOpen() {
		const panel = aside();
		if (!panel) {
			return false;
		}
		if (panel.classList.contains('visible')) {
			return true;
		}
		const button = toggleButton();
		return !!(button && button.classList.contains('active'));
	}

	function phoneApp() {
		return matches(COARSE_QUERY) || matches(STANDALONE_QUERY) || window.navigator.standalone === true;
	}

	function overlayMode() {
		if (!hasFeeds()) {
			return false;
		}
		if (matches(MOBILE_QUERY)) {
			return true;
		}
		if (!phoneApp()) {
			return false;
		}
		const panel = aside();
		return panel.classList.contains('is-hidden') || getComputedStyle(panel).position === 'fixed';
	}

	function isOurs(state) {
		return !!(state && state[FLAG] === 1);
	}

	function isForeignOverlay(state) {
		return !!(state && (state.modalOpen || state.articleOpen));
	}

	function shouldArm() {
		return overlayMode() && !feedsOpen() && !location.hash && !isForeignOverlay(history.state);
	}

	function arm() {
		if (handling || !shouldArm() || isOurs(history.state)) {
			return;
		}
		history.pushState({ [FLAG]: 1 }, '', location.href);
	}

	function openFeeds() {
		const panel = aside();
		const button = toggleButton();
		if (!panel || feedsOpen()) {
			return;
		}
		panel.style.display = '';
		if (button && button.classList.contains('active')) {
			panel.classList.add('visible');
			panel.classList.remove('is-hidden');
		} else if (typeof toggle_aside_click === 'function') {
			toggle_aside_click(false);
		} else {
			panel.classList.add('visible');
			panel.classList.remove('is-hidden');
			if (button) {
				button.classList.add('active');
			}
		}
		panel.style.display = '';
		becameOpenAt = Date.now();
	}

	function continueBack() {
		handling = true;
		history.back();
		setTimeout(function () {
			handling = false;
		}, 50);
	}

	function onPopState(event) {
		const leaving = tracked;
		tracked = event.state;
		if (handling) {
			handling = false;
			return;
		}
		// A same-page anchor (e.g. the settings dropdown) also emits popstate.
		// Do not consume that navigation as a back gesture.
		if (location.hash) {
			return;
		}
		if (!isOurs(leaving) || !hasFeeds()) {
			return;
		}

		const justOpened = feedsOpen() && becameOpenAt > 0 && (Date.now() - becameOpenAt) < SAME_GESTURE_MS;
		if (justOpened) {
			event.stopImmediatePropagation();
			return;
		}

		if (!overlayMode() || feedsOpen()) {
			event.stopImmediatePropagation();
			continueBack();
			return;
		}

		event.stopImmediatePropagation();
		openFeeds();
	}

	function patchHistory() {
		const push = history.pushState.bind(history);
		const replace = history.replaceState.bind(history);
		history.pushState = function (state, title, url) {
			const result = push(state, title, url);
			tracked = history.state;
			return result;
		};
		history.replaceState = function (state, title, url) {
			const result = replace(state, title, url);
			tracked = history.state;
			if (!handling && shouldArm() && !isOurs(history.state) && !isForeignOverlay(state)) {
				handling = true;
				try {
					const merged = Object.assign({}, history.state, { [FLAG]: 1 });
					if (url === undefined) {
						replace(merged, '');
					} else {
						replace(merged, '', url);
					}
					tracked = history.state;
				} finally {
					handling = false;
				}
			}
			return result;
		};
	}

	function watch() {
		const panel = aside();
		if (!panel || panel.dataset.feedsBeforeBackWatch === '1') {
			return;
		}
		panel.dataset.feedsBeforeBackWatch = '1';
		const observer = new MutationObserver(function () {
			if (feedsOpen()) {
				if (!becameOpenAt) {
					becameOpenAt = Date.now();
				}
				return;
			}
			becameOpenAt = 0;
			arm();
		});
		observer.observe(panel, { attributes: true, attributeFilter: ['class', 'style'] });
		window.addEventListener('hashchange', function () {
			if (!location.hash) {
				arm();
			}
		});
		if (typeof window.matchMedia === 'function') {
			const media = window.matchMedia(MOBILE_QUERY);
			if (typeof media.addEventListener === 'function') {
				media.addEventListener('change', function () {
					arm();
				});
			}
		}
	}

	function start() {
		if (started || !hasFeeds()) {
			return;
		}
		started = true;
		patchHistory();
		watch();
		window.addEventListener('popstate', onPopState, true);
		arm();
		window.addEventListener('pageshow', function () {
			arm();
		});
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', start, { once: true });
	} else {
		start();
	}
})();
