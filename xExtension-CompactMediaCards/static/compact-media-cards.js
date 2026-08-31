(function () {
	'use strict';

	const CARD_SELECTOR = 'main#stream div.flux';
	const CONTROL_SELECTOR = 'button, input, select, textarea, .dropdown-menu, .dropdown-target, [contenteditable="true"]';
	const DESKTOP_CONTROLS_QUERY = '(any-hover: hover) and (any-pointer: fine)';
	const DEFAULT_ACTIONS = Object.freeze({ left: 'karakeep', right: 'favorite' });
	const ACTIONS = Object.freeze({
		favorite: {
			selector: '.flux_header .item.manage > a.bookmark',
			icon: '★',
			color: '#9b641a',
			dark: '#68400f',
			label: function (card) { return card.classList.contains('favorite') ? 'Unfavorite' : 'Favorite'; },
		},
		karakeep: {
			selector: '.flux_header .item.manage > a.karakeepButton',
			icon: '⇩',
			color: '#24764c',
			dark: '#17472f',
			label: function () { return 'Save to Karakeep'; },
		},
		read: {
			selector: '.flux_header .item.manage > a.read',
			icon: '✓',
			color: '#316fb5',
			dark: '#1b426f',
			label: function (card) { return card.classList.contains('not_read') ? 'Mark read' : 'Mark unread'; },
		},
		reader: {
			selector: '.flux_header .item.link > a',
			icon: '▤',
			color: '#7055a8',
			dark: '#443268',
			label: function () { return 'Open reader'; },
		},
		website: {
			selector: '.flux_header .item.titleAuthorSummaryDate > a.title[href], .flux_header a.title[href]',
			icon: '↗',
			color: '#227a87',
			dark: '#164c54',
			label: function () { return 'Open website'; },
		},
		none: {
			selector: null,
			icon: '–',
			color: '#555b64',
			dark: '#34383e',
			label: function () { return 'Disabled'; },
		},
	});
	const DRAG_RATIO = 0.18;
	const DRAG_MIN = 64;
	const DRAG_MAX = 80;
	const AXIS_SLOP = 9;
	const COMMIT_MIN = 44;
	const COMMIT_MAX = 64;
	const COMMIT_RATIO = 0.14;
	const FAVORITE_PENDING_TIMEOUT = 5000;
	const SNAP_BACK_DURATION = 280;
	const SETTLE_RESET_DELAY = 440;
	const MASONRY_ROW_HEIGHT = 1;
	const LAYOUT_ICONS = Object.freeze({
		masonry: '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1"/><rect x="9" y="1.5" width="5.5" height="5.5" rx="1"/><rect x="1.5" y="9" width="5.5" height="5.5" rx="1"/><rect x="9" y="9" width="5.5" height="5.5" rx="1"/></svg>',
		list: '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><rect x="1.5" y="1.5" width="13" height="3.5" rx="1"/><rect x="1.5" y="6.25" width="13" height="3.5" rx="1"/><rect x="1.5" y="11" width="13" height="3.5" rx="1"/></svg>',
	});
	let activeGesture = null;
	let suppressedCard = null;
	let suppressClickUntil = 0;
	let masonryFrame = 0;
	let masonryResizeObserver = null;
	let masonryLayoutRunning = false;
	let desktopControlsMedia = null;
	let persistLayoutTimer = 0;

	function selectedActionId(direction) {
		const configured = window.context?.extensions?.compactMediaCards?.[direction + 'Action'];
		return Object.hasOwn(ACTIONS, configured) ? configured : DEFAULT_ACTIONS[direction];
	}

	function currentLayout() {
		const configured = window.context?.extensions?.compactMediaCards?.layout;
		return configured === 'list' ? 'list' : 'masonry';
	}

	function layoutConfig() {
		if (!window.context) {
			window.context = {};
		}
		if (!window.context.extensions) {
			window.context.extensions = {};
		}
		if (!window.context.extensions.compactMediaCards) {
			window.context.extensions.compactMediaCards = {};
		}
		return window.context.extensions.compactMediaCards;
	}

	function applyLayoutClass(layout = currentLayout()) {
		const resolved = layout === 'list' ? 'list' : 'masonry';
		if (document.body) {
			document.body.classList.toggle('cmc-layout-list', resolved === 'list');
			document.body.classList.toggle('cmc-layout-masonry', resolved === 'masonry');
		}
		const marker = document.getElementById('cmc_layout');
		if (marker) {
			marker.dataset.cmcLayout = resolved;
		}
		return resolved;
	}

	function syncLayoutToggle(layout = currentLayout()) {
		document.querySelectorAll('[data-cmc-layout-option]').forEach(function (button) {
			const selected = button.getAttribute('data-cmc-layout-option') === layout;
			button.setAttribute('aria-pressed', selected ? 'true' : 'false');
			button.classList.toggle('is-active', selected);
		});
	}

	function persistLayout(layout) {
		window.clearTimeout(persistLayoutTimer);
		persistLayoutTimer = window.setTimeout(function () {
			const config = layoutConfig();
			const csrf = window.context?.csrf
				|| document.querySelector('#post-csrf input[name="_csrf"]')?.value;
			const url = config.configureUrl;
			if (!csrf || !url || typeof window.fetch !== 'function') {
				return;
			}
			const body = new URLSearchParams({
				_csrf: csrf,
				cmc_layout: layout,
				cmc_swipe_left_action: selectedActionId('left'),
				cmc_swipe_right_action: selectedActionId('right'),
			});
			window.fetch(url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: body,
				credentials: 'same-origin',
				redirect: 'manual',
			}).catch(function () {
				// Layout is already applied locally; a later reload uses the last saved server value.
			});
		}, 120);
	}

	function setLayout(layout) {
		const resolved = layout === 'list' ? 'list' : 'masonry';
		layoutConfig().layout = resolved;
		applyLayoutClass(resolved);
		syncLayoutToggle(resolved);
		const stream = document.querySelector('main#stream');
		if (resolved === 'list' && stream) {
			disableMasonryLayout(stream);
		} else {
			scheduleMasonryLayout();
		}
		persistLayout(resolved);
		return resolved;
	}

	function createLayoutButton(layout, label) {
		const button = document.createElement('button');
		button.type = 'button';
		button.setAttribute('data-cmc-layout-option', layout);
		button.setAttribute('title', label);
		button.setAttribute('aria-label', label);
		button.setAttribute('aria-pressed', currentLayout() === layout ? 'true' : 'false');
		button.innerHTML = LAYOUT_ICONS[layout]
			+ '<span class="cmc-layout-label">' + (layout === 'list' ? 'List' : 'Grid') + '</span>';
		return button;
	}

	function ensureLayoutToggle() {
		const container = document.querySelector('#yl_category_title_container');
		if (!container) {
			return;
		}
		let group = container.querySelector('.cmc-layout-toggle');
		if (!group) {
			group = document.createElement('div');
			group.className = 'cmc-layout-toggle';
			group.setAttribute('role', 'group');
			group.setAttribute('aria-label', 'Card layout');
			group.append(
				createLayoutButton('masonry', 'Masonry grid'),
				createLayoutButton('list', 'Linear list'),
			);
			const configure = container.querySelector('#yl_nav_menu_container_toggle');
			if (configure) {
				configure.before(group);
			} else {
				container.append(group);
			}
		}
		syncLayoutToggle();
	}

	function onLayoutControlEvent(event) {
		const target = event.target;
		if (!(target instanceof Element)) {
			return;
		}
		const button = target.closest('[data-cmc-layout-option]');
		if (!button || !button.closest('.cmc-layout-toggle')) {
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		event.stopImmediatePropagation();
		setLayout(button.getAttribute('data-cmc-layout-option'));
	}

	function resolveAction(card, direction) {
		const id = selectedActionId(direction);
		const definition = ACTIONS[id];
		const target = definition.selector ? card.querySelector(definition.selector) : null;
		return { id: id, definition: definition, target: target };
	}

	function createIndicator(direction) {
		const indicator = document.createElement('div');
		indicator.className = 'cmc-swipe-indicator cmc-swipe-indicator-' + direction;
		indicator.setAttribute('aria-hidden', 'true');
		const icon = document.createElement('span');
		icon.className = 'cmc-swipe-icon';
		const label = document.createElement('span');
		label.className = 'cmc-swipe-label';
		indicator.append(icon, label);
		return indicator;
	}

	function ensureIndicators(card) {
		for (const direction of ['left', 'right']) {
			if (!card.querySelector('.cmc-swipe-indicator-' + direction)) {
				card.append(createIndicator(direction));
			}
		}
	}

	function updateIndicator(card, direction, action) {
		const indicator = card.querySelector('.cmc-swipe-indicator-' + direction);
		if (!indicator) {
			return;
		}
		const icon = indicator.querySelector('.cmc-swipe-icon');
		const label = indicator.querySelector('.cmc-swipe-label');
		label.textContent = action.definition.label(card);
		icon.replaceChildren();
		const sourceImage = action.id === 'favorite' && card.classList.contains('cmc-favorite-pending')
			? null
			: action.target?.querySelector('img');
		if (sourceImage?.src) {
			const image = document.createElement('img');
			image.src = sourceImage.src;
			image.alt = '';
			icon.append(image);
		} else {
			icon.textContent = action.definition.icon;
		}
		card.dataset['cmc' + direction[0].toUpperCase() + direction.slice(1) + 'Action'] = label.textContent;
		card.dataset['cmc' + direction[0].toUpperCase() + direction.slice(1) + 'ActionId'] = action.id;
		card.style.setProperty('--cmc-' + direction + '-action-color', action.definition.color);
		card.style.setProperty('--cmc-' + direction + '-action-dark', action.definition.dark);
	}

	function updateActionPresentation(card) {
		ensureIndicators(card);
		updateIndicator(card, 'left', resolveAction(card, 'left'));
		updateIndicator(card, 'right', resolveAction(card, 'right'));
	}

	function clamp01(value) {
		return Math.max(0, Math.min(1, value));
	}

	function cardWidth(card) {
		return card.getBoundingClientRect().width;
	}

	function dragLimitFor(card) {
		return Math.round(Math.min(DRAG_MAX, Math.max(DRAG_MIN, cardWidth(card) * DRAG_RATIO)));
	}

	function commitThresholdFor(card) {
		return Math.round(Math.min(COMMIT_MAX, Math.max(COMMIT_MIN, cardWidth(card) * COMMIT_RATIO)));
	}

	function setIndicatorProgress(card, progress) {
		const normalized = clamp01(progress);
		const reveal = clamp01((normalized - 0.04) / 0.96);
		const rise = 1 - Math.pow(1 - reveal, 3);
		const opacity = clamp01(reveal * 1.12);

		card.style.setProperty('--cmc-swipe-progress', normalized.toFixed(3));
		card.style.setProperty('--cmc-indicator-opacity', opacity.toFixed(3));
		card.style.setProperty('--cmc-indicator-offset', (34 * (1 - rise)).toFixed(2) + 'px');
	}

	function clearOptimisticFavorite(card) {
		const pending = card.cmcFavoritePending;
		if (pending) {
			pending.observer.disconnect();
			window.clearTimeout(pending.timeout);
			delete card.cmcFavoritePending;
		}
		card.classList.remove('cmc-favorite-pending', 'cmc-favorite-pending-add', 'cmc-favorite-pending-remove');
		card.querySelector('.cmc-optimistic-star')?.remove();
	}

	function beginOptimisticFavorite(card) {
		clearOptimisticFavorite(card);
		const expectedFavorite = !card.classList.contains('favorite');
		const bookmark = card.querySelector('.flux_header a.bookmark');
		if (!bookmark) {
			return;
		}

		card.classList.add('cmc-favorite-pending');
		card.classList.toggle('cmc-favorite-pending-add', expectedFavorite);
		card.classList.toggle('cmc-favorite-pending-remove', !expectedFavorite);
		const optimisticStar = document.createElement('span');
		optimisticStar.className = 'cmc-optimistic-star';
		optimisticStar.setAttribute('aria-hidden', 'true');
		optimisticStar.textContent = expectedFavorite ? '★' : '☆';
		bookmark.append(optimisticStar);

		const observer = new MutationObserver(function () {
			if (card.classList.contains('favorite') === expectedFavorite) {
				clearOptimisticFavorite(card);
			}
		});
		observer.observe(card, { attributes: true, attributeFilter: ['class'] });
		const timeout = window.setTimeout(function () { clearOptimisticFavorite(card); }, FAVORITE_PENDING_TIMEOUT);
		card.cmcFavoritePending = { observer: observer, timeout: timeout };
	}

	function syncMediaAspectRatio(thumbnail, image) {
		if (!thumbnail) {
			return;
		}
		const card = thumbnail.closest(CARD_SELECTOR);
		if (image?.naturalWidth > 0 && image?.naturalHeight > 0) {
			const mediaRatio = image.naturalWidth / image.naturalHeight;
			thumbnail.style.setProperty(
				'--cmc-media-aspect-ratio',
				image.naturalWidth + ' / ' + image.naturalHeight,
			);
			card?.classList.toggle('cmc-panoramic', mediaRatio >= 3);
		} else {
			thumbnail.style.removeProperty('--cmc-media-aspect-ratio');
			card?.classList.remove('cmc-panoramic');
		}
	}

	function youtubeThumbnailUpgradeUrls(image) {
		if (!image?.src) {
			return [];
		}
		let source;
		try {
			source = new URL(image.currentSrc || image.src, document.baseURI);
		} catch (_) {
			return [];
		}
		if (!/(^|\.)ytimg\.com$/i.test(source.hostname)
			|| !/(?:hqdefault|sddefault)\.(?:jpg|webp)$/i.test(source.pathname)) {
			return [];
		}
		const extension = source.pathname.toLowerCase().endsWith('.webp') ? 'webp' : 'jpg';
		const directory = source.pathname.slice(0, source.pathname.lastIndexOf('/') + 1);
		return [
			['maxresdefault', 640],
			['hq720', 640],
			['mqdefault', 320],
		].map(function ([name, minWidth]) {
			const candidate = new URL(source.href);
			candidate.pathname = directory + name + '.' + extension;
			candidate.search = '';
			candidate.hash = '';
			return { url: candidate.href, minWidth: minWidth };
		});
	}

	function upgradeLetterboxedYouTubeThumbnail(card, image) {
		if (!image || image.dataset.cmcYoutubeUpgrade) {
			return;
		}
		const candidates = youtubeThumbnailUpgradeUrls(image);
		if (candidates.length === 0) {
			return;
		}
		image.dataset.cmcYoutubeUpgrade = 'probing';
		let index = 0;
		const tryNext = function () {
			const candidate = candidates[index++];
			if (!candidate) {
				image.dataset.cmcYoutubeUpgrade = 'unavailable';
				return;
			}
			const probe = new window.Image();
			probe.decoding = 'async';
			probe.onload = function () {
				const ratio = probe.naturalHeight > 0 ? probe.naturalWidth / probe.naturalHeight : 0;
				if (probe.naturalWidth >= candidate.minWidth && ratio >= 1.6) {
					image.dataset.cmcYoutubeUpgrade = 'applied';
					image.addEventListener('load', function () { setTextCardMode(card); }, { once: true });
					image.src = candidate.url;
				} else {
					tryNext();
				}
			};
			probe.onerror = tryNext;
			probe.src = candidate.url;
		};
		tryNext();
	}

	function setTextCardMode(card) {
		const thumbnail = card.querySelector('.flux_header > .item.thumbnail');
		const image = thumbnail?.querySelector('img');
		syncMediaAspectRatio(thumbnail, image);
		upgradeLetterboxedYouTubeThumbnail(card, image);
		const imageFailed = Boolean(image?.complete && image.naturalWidth === 0);
		const useTextCard = !image || imageFailed;
		const details = card.querySelector('.flux_header > .item.titleAuthorSummaryDate');
		if (!details) {
			return;
		}

		card.classList.toggle('cmc-no-thumbnail', useTextCard);
		let textContent = details.querySelector(':scope > .cmc-text-content');
		if (useTextCard && !textContent) {
			textContent = document.createElement('div');
			textContent.className = 'cmc-text-content';
			const title = details.querySelector(':scope > a.title');
			const summary = details.querySelector(':scope > .summary');
			if (title) {
				textContent.append(title);
			}
			if (summary) {
				textContent.append(summary);
			}
			details.prepend(textContent);
		} else if (!useTextCard && textContent) {
			const title = textContent.querySelector(':scope > a.title');
			const summary = textContent.querySelector(':scope > .summary');
			if (title) {
				details.insertBefore(title, textContent);
			}
			if (summary) {
				details.insertBefore(summary, textContent);
			}
			textContent.remove();
		}

		if (image && image.dataset.cmcMediaWatch !== 'true') {
			image.dataset.cmcMediaWatch = 'true';
			image.addEventListener('load', function () { setTextCardMode(card); }, { once: true });
			image.addEventListener('error', function () { setTextCardMode(card); }, { once: true });
		}
		scheduleMasonryLayout();
	}

	function clearMasonrySpans(stream) {
		stream.querySelectorAll(':scope > [data-cmc-masonry-span]').forEach(function (item) {
			item.style.removeProperty('grid-row-end');
			delete item.dataset.cmcMasonrySpan;
		});
	}

	function disableMasonryLayout(stream) {
		stream.classList.remove('cmc-masonry-active');
		clearMasonrySpans(stream);
	}

	function masonryIsEligible(stream) {
		return currentLayout() !== 'list'
			&& document.body.classList.contains('youlag-active')
			&& !document.body.classList.contains('reader')
			&& !stream.classList.contains('reader')
			&& !stream.querySelector(':scope > .flux.active')
			&& Boolean(stream.querySelector(':scope > .flux'));
	}

	function observeMasonryItems(stream) {
		if (typeof window.ResizeObserver !== 'function') {
			return;
		}
		if (!masonryResizeObserver) {
			masonryResizeObserver = new window.ResizeObserver(function () {
				if (!masonryLayoutRunning) {
					scheduleMasonryLayout();
				}
			});
		}
		const observedItems = Array.from(stream.children);
		stream.querySelectorAll(
			':scope > .flux > .flux_header, :scope > .flux > .flux_header > .item.thumbnail',
		).forEach(function (content) {
			observedItems.push(content);
		});
		observedItems.forEach(function (item) {
			if (item.dataset.cmcMasonryObserved !== 'true') {
				item.dataset.cmcMasonryObserved = 'true';
				masonryResizeObserver.observe(item);
			}
		});
	}

	function unobserveMasonryItem(item) {
		const observedItems = [item].concat(Array.from(item.querySelectorAll('[data-cmc-masonry-observed]')));
		observedItems.forEach(function (observedItem) {
			if (!masonryResizeObserver || observedItem.dataset.cmcMasonryObserved !== 'true') {
				return;
			}
			masonryResizeObserver.unobserve(observedItem);
			delete observedItem.dataset.cmcMasonryObserved;
		});
	}

	function layoutMasonry() {
		masonryFrame = 0;
		const stream = document.querySelector('main#stream');
		if (!stream) {
			return;
		}
		if (!masonryIsEligible(stream)) {
			disableMasonryLayout(stream);
			return;
		}

		masonryLayoutRunning = true;
		disableMasonryLayout(stream);
		const style = window.getComputedStyle(stream);
		const rowGap = Number.parseFloat(style.rowGap) || 0;
		const items = Array.from(stream.children).filter(function (item) {
			return window.getComputedStyle(item).display !== 'none';
		});
		const heights = items.map(function (item) {
			const itemStyle = window.getComputedStyle(item);
			const marginTop = Number.parseFloat(itemStyle.marginTop) || 0;
			const marginBottom = Number.parseFloat(itemStyle.marginBottom) || 0;
			return item.getBoundingClientRect().height + marginTop + marginBottom;
		});

		stream.classList.add('cmc-masonry-active');
		items.forEach(function (item, index) {
			const span = Math.max(1, Math.ceil((heights[index] + rowGap) / (MASONRY_ROW_HEIGHT + rowGap)));
			item.dataset.cmcMasonrySpan = String(span);
			item.style.setProperty('grid-row-end', 'span ' + span);
		});
		observeMasonryItems(stream);
		masonryLayoutRunning = false;
	}

	function scheduleMasonryLayout() {
		if (masonryFrame) {
			window.clearTimeout(masonryFrame);
		}
		masonryFrame = window.setTimeout(layoutMasonry, 0);
	}

	function decorateCards(root) {
		const cards = root.matches?.(CARD_SELECTOR) ? [root] : root.querySelectorAll?.(CARD_SELECTOR) || [];
		cards.forEach(function (card) {
			if (!card.querySelector('.flux_header')) {
				return;
			}
			card.classList.add('cmc-swipe-ready');
			setTextCardMode(card);
			updateActionPresentation(card);
		});
		scheduleMasonryLayout();
	}

	function resetCard(card) {
		card.classList.remove('cmc-dragging', 'cmc-settling', 'cmc-swipe-left', 'cmc-swipe-right');
		card.style.removeProperty('--cmc-drag-x');
		card.style.removeProperty('--cmc-swipe-progress');
		card.style.removeProperty('--cmc-indicator-opacity');
		card.style.removeProperty('--cmc-indicator-offset');
		updateActionPresentation(card);
	}

	function pointerIsEligible(event, card) {
		return event.isPrimary !== false
			&& event.button === 0
			&& (event.pointerType === 'touch' || event.pointerType === 'pen')
			&& !card.classList.contains('active')
			&& !card.classList.contains('current')
			&& !event.target.closest(CONTROL_SELECTOR);
	}

	function onPointerDown(event) {
		const card = event.target.closest?.('.flux.cmc-swipe-ready');
		if (!card || !pointerIsEligible(event, card)) {
			return;
		}
		activeGesture = {
			card: card,
			pointerId: event.pointerId,
			startX: event.clientX,
			startY: event.clientY,
			dx: 0,
			axis: null,
		};
	}

	function lockAxis(gesture, dx, dy) {
		const absX = Math.abs(dx);
		const absY = Math.abs(dy);
		if (Math.max(absX, absY) < AXIS_SLOP) {
			return null;
		}
		if (absY > absX * 1.12) {
			return 'vertical';
		}
		if (absX > absY * 1.12) {
			return 'horizontal';
		}
		return gesture.axis;
	}

	function onPointerMove(event) {
		const gesture = activeGesture;
		if (!gesture || event.pointerId !== gesture.pointerId) {
			return;
		}
		const dx = event.clientX - gesture.startX;
		const dy = event.clientY - gesture.startY;
		gesture.axis = gesture.axis || lockAxis(gesture, dx, dy);
		if (gesture.axis === 'vertical') {
			activeGesture = null;
			return;
		}
		if (gesture.axis !== 'horizontal') {
			return;
		}

		const direction = dx < 0 ? 'left' : 'right';
		const action = resolveAction(gesture.card, direction);
		const hasAction = action.id !== 'none' && Boolean(action.target);
		const limit = dragLimitFor(gesture.card);
		gesture.dx = Math.max(-limit, Math.min(limit, hasAction ? dx : dx * 0.2));
		const threshold = commitThresholdFor(gesture.card);
		const progress = Math.min(1, Math.abs(gesture.dx) / threshold);
		gesture.card.classList.add('cmc-dragging');
		gesture.card.classList.toggle('cmc-swipe-left', gesture.dx < 0);
		gesture.card.classList.toggle('cmc-swipe-right', gesture.dx > 0);
		gesture.card.style.setProperty('--cmc-drag-x', gesture.dx + 'px');
		setIndicatorProgress(gesture.card, progress);
		try {
			gesture.card.setPointerCapture(event.pointerId);
		} catch (_) {
			// Pointer capture is an enhancement; delegated listeners still work without it.
		}
		event.preventDefault();
		event.stopPropagation();
	}

	async function executeAction(action, card) {
		if (action.id === 'favorite') {
			beginOptimisticFavorite(card);
			if (typeof window.mark_favorite === 'function') {
				window.mark_favorite(card);
			} else {
				action.target.click();
			}
			return;
		}
		if (action.id === 'karakeep' && typeof window.add_to_karakeep === 'function') {
			await window.add_to_karakeep(action.target, card);
			return;
		}
		if (action.id === 'reader' && typeof window.toggleContent === 'function') {
			window.toggleContent(card, document.querySelector('.flux.current'), false);
			return;
		}
		if (action.id === 'website') {
			if (window.context?.auto_mark_site && typeof window.mark_read === 'function') {
				window.mark_read(card, true, false);
			}
			window.open(action.target.href, '_blank', 'noopener,noreferrer');
			return;
		}
		action.target.click();
	}

	function commitGesture(gesture, direction, action) {
		const card = gesture.card;
		card.classList.remove('cmc-dragging');
		card.classList.add('cmc-settling');
		card.style.setProperty('--cmc-drag-x', '0px');
		setIndicatorProgress(card, 0);
		suppressedCard = card;
		suppressClickUntil = Date.now() + 450;

		window.setTimeout(async function () {
			await executeAction(action, card);
			updateActionPresentation(card);
		}, SNAP_BACK_DURATION);
		window.setTimeout(function () {
			if (card.isConnected) {
				resetCard(card);
			}
		}, SETTLE_RESET_DELAY);
	}

	function onPointerEnd(event) {
		const gesture = activeGesture;
		if (!gesture || event.pointerId !== gesture.pointerId) {
			return;
		}
		activeGesture = null;
		if (gesture.axis !== 'horizontal') {
			resetCard(gesture.card);
			return;
		}

		const direction = gesture.dx < 0 ? 'left' : 'right';
		const action = resolveAction(gesture.card, direction);
		const threshold = commitThresholdFor(gesture.card);
		if (action.id !== 'none' && action.target && Math.abs(gesture.dx) >= threshold) {
			commitGesture(gesture, direction, action);
		} else {
			gesture.card.classList.remove('cmc-dragging');
			gesture.card.classList.add('cmc-settling');
			gesture.card.style.setProperty('--cmc-drag-x', '0px');
			setIndicatorProgress(gesture.card, 0);
			window.setTimeout(function () { resetCard(gesture.card); }, 220);
		}
		event.preventDefault();
		event.stopPropagation();
	}

	function suppressPostSwipeClick(event) {
		if (!event.isTrusted || Date.now() >= suppressClickUntil || !suppressedCard?.contains(event.target)) {
			return;
		}
		event.preventDefault();
		event.stopImmediatePropagation();
	}

	function isolateYoulagTouchGesture(event) {
		if (activeGesture?.axis === 'horizontal' || Date.now() < suppressClickUntil) {
			event.preventDefault();
			event.stopPropagation();
		}
	}

	function syncDesktopControls(media = desktopControlsMedia) {
		document.body?.classList.toggle('cmc-desktop-controls', Boolean(media?.matches));
	}

	function init() {
		if (document.documentElement.dataset.compactMediaCards === 'active') {
			return;
		}
		document.documentElement.dataset.compactMediaCards = 'active';
		applyLayoutClass();
		ensureLayoutToggle();
		window.addEventListener('click', onLayoutControlEvent, true);
		if (typeof window.matchMedia === 'function') {
			desktopControlsMedia = window.matchMedia(DESKTOP_CONTROLS_QUERY);
			syncDesktopControls(desktopControlsMedia);
			if (typeof desktopControlsMedia.addEventListener === 'function') {
				desktopControlsMedia.addEventListener('change', syncDesktopControls);
			} else if (typeof desktopControlsMedia.addListener === 'function') {
				desktopControlsMedia.addListener(syncDesktopControls);
			}
		} else {
			syncDesktopControls(null);
		}
		decorateCards(document);
		document.addEventListener('pointerdown', onPointerDown, true);
		document.addEventListener('pointermove', onPointerMove, true);
		document.addEventListener('pointerup', onPointerEnd, true);
		document.addEventListener('pointercancel', onPointerEnd, true);
		document.addEventListener('click', suppressPostSwipeClick, true);
		document.addEventListener('touchmove', isolateYoulagTouchGesture, { capture: true, passive: false });
		document.addEventListener('touchend', isolateYoulagTouchGesture, { capture: true, passive: false });
		document.addEventListener('freshrss:load-more', function (event) {
			decorateCards(event.target instanceof Element ? event.target : document);
			ensureLayoutToggle();
			scheduleMasonryLayout();
		});
		window.addEventListener('resize', scheduleMasonryLayout);

		const stream = document.querySelector('main#stream');
		if (stream) {
			new MutationObserver(function (records) {
				let masonryStateChanged = false;
				let masonryEligibilityChanged = false;
				records.forEach(function (record) {
					if (record.type === 'attributes' && record.target.matches?.(CARD_SELECTOR)) {
						const wasActive = (record.oldValue || '').split(/\s+/).includes('active');
						if (wasActive !== record.target.classList.contains('active')) {
							masonryStateChanged = true;
							masonryEligibilityChanged = true;
						}
						return;
					}
					record.addedNodes.forEach(function (node) {
						if (node instanceof Element) {
							if (node.id === 'yl_category_toolbar'
								|| node.querySelector?.('#yl_category_title_container, #yl_category_toolbar')) {
								ensureLayoutToggle();
							}
							if (node.matches(CARD_SELECTOR) || node.querySelector(CARD_SELECTOR)) {
								decorateCards(node);
								masonryStateChanged = true;
							}
							const media = node.matches('.item.thumbnail img')
								? node
								: node.querySelector('.item.thumbnail img');
							const card = media?.closest(CARD_SELECTOR);
							if (card) {
								setTextCardMode(card);
							}
						}
					});
					record.removedNodes.forEach(function (node) {
						if (node instanceof Element) {
							unobserveMasonryItem(node);
						}
						masonryStateChanged = true;
					});
				});
				if (masonryEligibilityChanged) {
					layoutMasonry();
				} else if (masonryStateChanged) {
					scheduleMasonryLayout();
				}
			}).observe(stream, {
				childList: true,
				subtree: true,
				attributes: true,
				attributeFilter: ['class'],
				attributeOldValue: true,
			});
		}
		scheduleMasonryLayout();
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init, { once: true });
	} else {
		init();
	}
}());
