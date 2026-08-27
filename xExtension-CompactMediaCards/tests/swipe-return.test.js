"use strict";

const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");
const test = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");

const extensionRoot = path.resolve(__dirname, "..");
const script = fs.readFileSync(
  path.join(extensionRoot, "static", "compact-media-cards.js"),
  "utf8",
);
const stylesheet = fs.readFileSync(
  path.join(extensionRoot, "static", "compact-media-cards.css"),
  "utf8",
);
const metadata = JSON.parse(
  fs.readFileSync(path.join(extensionRoot, "metadata.json"), "utf8"),
);

function pointerEvent(window, type, x, y = 20) {
  const event = new window.MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: x,
    clientY: y,
  });
  Object.defineProperties(event, {
    pointerId: { value: 1 },
    pointerType: { value: "touch" },
    isPrimary: { value: true },
  });
  return event;
}

function createPage(options = {}) {
  const imageSrc = options.imageSrc || "https://example.test/image.jpg";
  const dom = new JSDOM(
    `<!doctype html>
		<html><body><main id="stream">
			<div class="flux not_read" data-id="42">
				<div class="flux_header">
					<div class="item thumbnail"><img src="${imageSrc}"></div>
					<div class="item titleAuthorSummaryDate"><a class="title" href="https://example.test/article">Article</a></div>
					<div class="item manage"><a class="read" href="#read">Read</a></div>
				</div>
			</div>
		</main></body></html>`,
    {
      runScripts: "outside-only",
      url: "https://rss.example.test/i/",
    },
  );
  const { window } = dom;
  window.context = {
    extensions: {
      compactMediaCards: { leftAction: "read", rightAction: "favorite" },
    },
  };
  const card = window.document.querySelector(".flux");
  const image = card.querySelector(".thumbnail img");
  Object.defineProperties(image, {
    complete: { value: true, configurable: true },
    naturalWidth: { value: 900, configurable: true },
    naturalHeight: { value: 1200, configurable: true },
  });
  card.getBoundingClientRect = () => ({ width: 300 });
  if (typeof options.cardWidth === "number") {
    card.getBoundingClientRect = () => ({ width: options.cardWidth });
  }
  if (typeof options.setupWindow === "function") {
    options.setupWindow(window);
  }
  window.eval(script);
  window.document.dispatchEvent(
    new window.Event("DOMContentLoaded", { bubbles: true }),
  );
  return { dom, window, card };
}

test("release metadata identifies Compact Media Cards 1.0.1", () => {
  assert.equal(metadata.name, "Compact Media Cards");
  assert.equal(metadata.version, "1.0.1");
  assert.equal(metadata.entrypoint, "CompactMediaCards");
});

test("loaded image dimensions drive the card aspect ratio so no contain bars remain", () => {
  const { dom, card } = createPage();
  const thumbnail = card.querySelector(".thumbnail");
  assert.equal(
    thumbnail.style.getPropertyValue("--cmc-media-aspect-ratio"),
    "900 / 1200",
  );
  assert.match(
    stylesheet,
    /aspect-ratio:\s*var\(--cmc-media-aspect-ratio,\s*auto\)\s*!important/,
  );
  dom.window.close();
});

test("letterboxed YouTube hqdefault thumbnails upgrade to a verified 16:9 source", async () => {
  const { dom, window, card } = createPage({
    imageSrc: "https://i3.ytimg.com/vi/2qlV1KN_67Q/hqdefault.jpg",
    setupWindow: (targetWindow) => {
      targetWindow.Image = class FakeImage {
        constructor() {
          this.naturalWidth = 1280;
          this.naturalHeight = 720;
        }
        set src(value) {
          this._src = value;
          targetWindow.queueMicrotask(() => this.onload?.());
        }
        get src() {
          return this._src;
        }
      };
    },
  });
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  const image = card.querySelector(".thumbnail img");
  assert.equal(
    image.src,
    "https://i3.ytimg.com/vi/2qlV1KN_67Q/maxresdefault.jpg",
  );
  assert.equal(image.dataset.cmcYoutubeUpgrade, "applied");
  dom.window.close();
});

test("a committed swipe returns toward the card starting position instead of leaving the screen", () => {
  const { dom, window, card } = createPage();
  const target = card.querySelector(".title");

  target.dispatchEvent(pointerEvent(window, "pointerdown", 240));
  target.dispatchEvent(pointerEvent(window, "pointermove", 130));
  assert.equal(card.style.getPropertyValue("--cmc-drag-x"), "-64px");
  target.dispatchEvent(pointerEvent(window, "pointerup", 130));

  assert.equal(card.style.getPropertyValue("--cmc-drag-x"), "0px");
  assert.ok(card.classList.contains("cmc-settling"));
  dom.window.close();
});

test("max swipe travel matches a FeedMe-sized icon gutter", () => {
  const { dom, window, card } = createPage();
  const target = card.querySelector(".title");

  target.dispatchEvent(pointerEvent(window, "pointerdown", 220));
  target.dispatchEvent(pointerEvent(window, "pointermove", 20));
  assert.equal(card.style.getPropertyValue("--cmc-drag-x"), "-64px");
  assert.equal(card.style.getPropertyValue("--cmc-reveal-width"), "64px");

  target.dispatchEvent(pointerEvent(window, "pointerup", 20));
  assert.equal(card.style.getPropertyValue("--cmc-drag-x"), "0px");
  assert.ok(card.classList.contains("cmc-settling"));
  assert.match(
    stylesheet,
    /cmc-swipe-indicator-right\s*\{[^}]*left:\s*calc\(var\(--cmc-reveal-width\)\s*\/\s*2\);/s,
  );
  assert.match(
    stylesheet,
    /cmc-swipe-indicator-left\s*\{[^}]*right:\s*calc\(var\(--cmc-reveal-width\)\s*\/\s*2\);/s,
  );
  dom.window.close();
});

test("phone-width cards cap swipe travel at about 18% of the card", () => {
  const { dom, window, card } = createPage({ cardWidth: 390 });
  const target = card.querySelector(".title");

  target.dispatchEvent(pointerEvent(window, "pointerdown", 300));
  target.dispatchEvent(pointerEvent(window, "pointermove", 20));
  assert.equal(card.style.getPropertyValue("--cmc-drag-x"), "-70px");
  assert.equal(card.style.getPropertyValue("--cmc-reveal-width"), "70px");
  target.dispatchEvent(pointerEvent(window, "pointerup", 20));
  dom.window.close();
});

test("wide cards still stop after one icon gutter instead of a long drag", () => {
  const { dom, window, card } = createPage({ cardWidth: 800 });
  const target = card.querySelector(".title");

  target.dispatchEvent(pointerEvent(window, "pointerdown", 400));
  target.dispatchEvent(pointerEvent(window, "pointermove", 20));
  assert.equal(card.style.getPropertyValue("--cmc-drag-x"), "-80px");
  target.dispatchEvent(pointerEvent(window, "pointerup", 20));
  dom.window.close();
});

test("a FeedMe-length swipe is enough to commit the action", async () => {
  const { dom, window, card } = createPage();
  const target = card.querySelector(".title");
  const readAction = card.querySelector("a.read");
  let actionCount = 0;
  readAction.addEventListener("click", (event) => {
    event.preventDefault();
    actionCount += 1;
  });

  target.dispatchEvent(pointerEvent(window, "pointerdown", 240));
  target.dispatchEvent(pointerEvent(window, "pointermove", 184));
  assert.equal(card.style.getPropertyValue("--cmc-drag-x"), "-56px");
  target.dispatchEvent(pointerEvent(window, "pointerup", 184));

  await new Promise((resolve) => window.setTimeout(resolve, 360));
  assert.equal(actionCount, 1);
  dom.window.close();
});

test("a short swipe below the compact threshold snaps back without committing", async () => {
  const { dom, window, card } = createPage();
  const target = card.querySelector(".title");
  const readAction = card.querySelector("a.read");
  let actionCount = 0;
  readAction.addEventListener("click", (event) => {
    event.preventDefault();
    actionCount += 1;
  });

  target.dispatchEvent(pointerEvent(window, "pointerdown", 240));
  target.dispatchEvent(pointerEvent(window, "pointermove", 212));
  assert.equal(card.style.getPropertyValue("--cmc-drag-x"), "-28px");
  target.dispatchEvent(pointerEvent(window, "pointerup", 212));

  await new Promise((resolve) => window.setTimeout(resolve, 360));
  assert.equal(actionCount, 0);
  dom.window.close();
});

test("a committed swipe uses a gentler 280ms snap-back", async () => {
  const { dom, window, card } = createPage();
  const target = card.querySelector(".title");
  const readAction = card.querySelector("a.read");
  let actionCount = 0;
  readAction.addEventListener("click", (event) => {
    event.preventDefault();
    actionCount += 1;
  });

  target.dispatchEvent(pointerEvent(window, "pointerdown", 240));
  target.dispatchEvent(pointerEvent(window, "pointermove", 130));
  target.dispatchEvent(pointerEvent(window, "pointerup", 130));

  await new Promise((resolve) => window.setTimeout(resolve, 240));
  assert.equal(actionCount, 0, "action should wait for the slower snap-back");
  await new Promise((resolve) => window.setTimeout(resolve, 80));
  assert.equal(actionCount, 1);
  assert.match(
    stylesheet,
    /\.cmc-settling\s*>\s*\.flux_header\s*\{[^}]*transition-duration:\s*280ms;/s,
  );
  dom.window.close();
});

test("card metadata is layered over the media gradient instead of occupying a footer row", () => {
  assert.doesNotMatch(
    stylesheet,
    /grid-template-rows:\s*auto\s+var\(--cmc-meta-height\)/,
  );
  assert.match(
    stylesheet,
    /> \.flux_header::after\s*\{[^}]*bottom:\s*0;[^}]*height:\s*calc\(var\(--cmc-meta-height\) \+ 110px\);[^}]*linear-gradient/s,
  );
  assert.match(
    stylesheet,
    /\.titleAuthorSummaryDate\s*>\s*\.date\s*\{[^}]*grid-row:\s*1;[^}]*align-self:\s*end;/s,
  );
  assert.match(
    stylesheet,
    /> li\.item\.manage:has\(a\.bookmark\)\s*\{[^}]*grid-row:\s*1;/s,
  );
  assert.match(stylesheet, /> li\.item\.website\s*\{[^}]*grid-row:\s*1;/s);
  assert.match(
    stylesheet,
    /> a\.title\s*\{[^}]*bottom:\s*calc\(var\(--cmc-meta-height\) \+ 12px\);[^}]*padding:\s*0\s*!important;/s,
  );
});

function rgbaAlpha(color) {
  const match = color.match(/^rgba?\([^,]+,[^,]+,[^,]+(?:,\s*([\d.]+))?\)$/);
  assert.ok(match, `unexpected color: ${color}`);
  return match[1] === undefined ? 1 : Number(match[1]);
}

function renderCardFixture(width, height = 800) {
  const fixture = path.join(__dirname, "card-height-buttons.html");
  const profile = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "cmc-card-fixture-"));
  try {
    const output = childProcess.execFileSync(
      "chromium",
      [
        "--headless",
        "--no-sandbox",
        "--disable-gpu",
        "--allow-file-access-from-files",
        `--user-data-dir=${profile}`,
        `--window-size=${width},${height}`,
        "--virtual-time-budget=1000",
        "--dump-dom",
        new URL(`file://${fixture}`).href,
      ],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 45000,
      },
    );
    const match = output.match(
      /<pre id="height-controls-results">([^<]+)<\/pre>/,
    );
    assert.ok(match, "Chromium did not return computed card layout");
    return JSON.parse(match[1].replaceAll("&quot;", '"'));
  } finally {
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

test("image cards hug their media height and top-corner controls reveal the image", () => {
  const layout = renderCardFixture(1280);

  assert.ok(
    Math.abs(layout.imageCard.height - layout.imageHeader.height) <= 1,
    `image card stretched to ${layout.imageCard.height}px while its header is ${layout.imageHeader.height}px`,
  );
  assert.ok(
    Math.abs(layout.imageCard.height - layout.media.height) <= 1,
    `image card is ${layout.imageCard.height}px while its media is ${layout.media.height}px`,
  );
  assert.ok(
    Math.abs(layout.image.height - layout.media.height) <= 1,
    `rendered image is ${layout.image.height}px while its media box is ${layout.media.height}px`,
  );
  assert.ok(
    Math.abs(layout.image.width / layout.image.height - 900 / 1200) <= 0.01,
    `portrait image was cropped into the wrong aspect ratio: ${layout.image.width}x${layout.image.height}`,
  );
  assert.equal(
    layout.imageObjectFit,
    "contain",
    "the whole source image should remain visible",
  );
  assert.ok(
    layout.title.height <= 82,
    `title should occupy at most three clean text lines, not ${layout.title.height}px`,
  );
  assert.ok(
    Math.abs(layout.title.bottom - (layout.media.bottom - 60)) <= 1,
    "title should be bottom-anchored immediately above the 48px metadata row and 12px gap",
  );
  for (const name of ["title", "favorite", "feed", "date"]) {
    const element = layout[name];
    assert.ok(
      element.top >= layout.media.top - 1 &&
        element.bottom <= layout.media.bottom + 1,
      `${name} extends outside the media bounds`,
    );
  }
  for (const name of ["favorite", "feed", "date"]) {
    assert.ok(
      Math.abs(layout[name].bottom - layout.media.bottom) <= 1,
      `${name} is not aligned to the media bottom edge`,
    );
  }
  for (const control of [layout.readControl, layout.readerControl]) {
    assert.equal(
      rgbaAlpha(control.backgroundColor),
      0,
      `top-corner positioning wrapper should remain transparent: ${control.backgroundColor}`,
    );
    assert.equal(
      control.borderWidth,
      "0px",
      `top-corner positioning wrapper should have no border: ${control.borderWidth}`,
    );
  }
  for (const control of [layout.readButton, layout.readerButton]) {
    const alpha = rgbaAlpha(control.backgroundColor);
    assert.ok(
      alpha > 0,
      `top-corner button needs a visible translucent surface: ${control.backgroundColor}`,
    );
    assert.ok(
      alpha < 0.5,
      `top-corner button surface must leave the thumbnail readable: ${control.backgroundColor}`,
    );
    assert.equal(
      control.borderWidth,
      "1px",
      `top-corner button needs a subtle boundary: ${control.borderWidth}`,
    );
    assert.equal(
      control.borderRadius,
      "999px",
      `top-corner button should remain circular: ${control.borderRadius}`,
    );
    assert.equal(
      control.boxShadow,
      "none",
      `top-corner button should have no shadow: ${control.boxShadow}`,
    );
    assert.equal(
      control.backdropFilter,
      "none",
      `top-corner button should not blur the thumbnail: ${control.backdropFilter}`,
    );
  }
});

test("fine-pointer mode enables desktop controls and reacts to capability changes", () => {
  const mediaQuery = {
    matches: true,
    media: "(any-hover: hover) and (any-pointer: fine)",
    listener: null,
    addEventListener(type, listener) {
      assert.equal(type, "change");
      this.listener = listener;
    },
  };
  const { dom, window } = createPage({
    setupWindow: (targetWindow) => {
      targetWindow.matchMedia = (query) => {
        assert.equal(query, mediaQuery.media);
        return mediaQuery;
      };
    },
  });
  assert.ok(
    window.document.body.classList.contains("cmc-desktop-controls"),
    "a fine pointer should expose the native card buttons",
  );
  mediaQuery.matches = false;
  mediaQuery.listener?.({ matches: false });
  assert.ok(
    !window.document.body.classList.contains("cmc-desktop-controls"),
    "touch-first input should return to the gesture presentation",
  );
  dom.window.close();
});

test("desktop keeps a bottom-left Favorite button and hover-only top-right actions", () => {
  const desktop = renderCardFixture(1280);
  assert.equal(desktop.desktopControls, true);
  assert.ok(
    desktop.favoriteButton.width >= 38 && desktop.favoriteButton.height >= 38,
    "desktop Favorite lost its hit area",
  );
  assert.equal(desktop.favoriteButtonStyle.borderWidth, "1px");
  assert.equal(desktop.favoriteButtonStyle.borderRadius, "999px");
  assert.ok(rgbaAlpha(desktop.favoriteButtonStyle.backgroundColor) > 0);
  assert.ok(rgbaAlpha(desktop.favoriteButtonStyle.backgroundColor) < 0.5);
  assert.ok(
    Math.abs(desktop.favorite.bottom - desktop.media.bottom) <= 1,
    "desktop Favorite should stay in the bottom-left metadata corner",
  );
  assert.ok(
    desktop.favorite.left < desktop.feed.left,
    "desktop Favorite should stay left of the feed name",
  );
  assert.equal(Number(desktop.favoriteStyle.opacity), 1);
  for (const name of ["karakeepStyle", "readControl", "readerControl"]) {
    assert.equal(desktop[name].opacity, "0", `${name} should stay hidden until hover`);
    assert.equal(desktop[name].pointerEvents, "none", `${name} should not intercept idle clicks`);
  }
  const revealed = desktop.revealed;
  for (const name of ["karakeepStyle", "readControl", "readerControl"]) {
    assert.equal(revealed[name].opacity, "1", `${name} should appear on hover/focus`);
    assert.equal(revealed[name].pointerEvents, "auto", `${name} must become clickable`);
  }
  assert.ok(
    revealed.karakeepButton.width >= 38 && revealed.karakeepButton.height >= 38,
    "revealed Karakeep lost its hit area",
  );
  assert.equal(revealed.karakeepButtonStyle.borderWidth, "1px");
  assert.equal(revealed.karakeepButtonStyle.borderRadius, "999px");
  assert.ok(revealed.karakeepIcon.width > 0 && revealed.karakeepIcon.height > 0);
  assert.ok(
    revealed.karakeep.top <= revealed.media.top + 14,
    "Karakeep should join the top-right overlay cluster",
  );
  assert.ok(
    revealed.karakeep.right <= revealed.readControlRect.left + 1,
    "Karakeep should sit to the left of Mark as read",
  );
  assert.ok(
    revealed.readControlRect.right <= revealed.readerControlRect.left + 1,
    "Mark as read should sit to the left of the reader button",
  );
  assert.ok(
    Math.abs(revealed.favorite.bottom - revealed.media.bottom) <= 1,
    "focusing the top cluster should not move Favorite off the metadata row",
  );
  assert.ok(
    revealed.currentFavoriteButton.width >= 38 &&
      revealed.currentKarakeepButton.width >= 38,
    "selected collapsed cards should keep the same desktop control treatment",
  );

  const mobile = renderCardFixture(390, 844);
  assert.equal(mobile.desktopControls, false);
  assert.equal(mobile.karakeep.width, 0, "Karakeep should remain gesture-only on mobile");
  assert.ok(mobile.favoriteButton.width > 0, "the existing mobile favorite metadata action disappeared");
  assert.notEqual(mobile.readControl.opacity, "0", "mobile should keep persistent top-right read/reader controls");
  assert.match(
    stylesheet,
    /cmc-swipe-ready:not\(\.active\):hover > \.flux_header > li\.item\.manage:has\(a\.karakeepButton\)/,
    "desktop Karakeep must reveal on real card hover, not only the test hook",
  );
  assert.ok(desktop.favoriteHit, "favorite hit target was not measured");
  assert.equal(
    desktop.favoriteHit.isTitle,
    false,
    `favorite click hit the article title instead of the star (${desktop.favoriteHit.id || desktop.favoriteHit.className})`,
  );
  assert.equal(desktop.favoriteHit.isFavorite, true, "favorite click must land on the native star control");
  assert.ok(
    Number(desktop.favoriteStyle.zIndex) >= 12 ||
      desktop.favoriteStyle.position === "relative" ||
      desktop.favoriteStyle.position === "absolute",
    "favorite must be a stacked overlay, not a static metadata cell under the title",
  );
  assert.equal(
    desktop.revealed.karakeepButtonStyle.backgroundColor,
    desktop.revealed.readButton.backgroundColor,
    "Karakeep should use the same translucent surface as Mark as read",
  );
  assert.equal(
    desktop.revealed.karakeepButtonStyle.borderColor,
    desktop.revealed.readButton.borderColor,
    "Karakeep border should match the other top-right buttons",
  );
});

test("swipe action icons remain plain glyphs without circular surfaces", () => {
  assert.match(
    stylesheet,
    /\.cmc-swipe-indicator \.cmc-swipe-icon\s*\{[^}]*border:\s*0\s*!important;[^}]*background:\s*transparent\s*!important;[^}]*box-shadow:\s*none\s*!important;[^}]*backdrop-filter:\s*none\s*!important;/s,
  );
  assert.match(
    stylesheet,
    /\.cmc-swipe-indicator \.cmc-swipe-label\s*\{[^}]*display:\s*none;/s,
  );
});

test("a selected current card retains the same metadata-on-image layout", () => {
  assert.doesNotMatch(
    stylesheet,
    /cmc-swipe-ready:not\(\.active\):not\(\.current\)/,
  );
  const fixture = path.join(__dirname, "card-height-buttons.html");
  const output = childProcess.execFileSync(
    "chromium",
    [
      "--headless",
      "--no-sandbox",
      "--disable-gpu",
      "--allow-file-access-from-files",
      "--window-size=1280,1000",
      "--virtual-time-budget=1000",
      "--dump-dom",
      new URL(`file://${fixture}`).href,
    ],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 45000,
    },
  );
  const match = output.match(
    /<pre id="height-controls-results">([^<]+)<\/pre>/,
  );
  assert.ok(match, "Chromium did not return selected-card layout");
  const layout = JSON.parse(match[1].replaceAll("&quot;", '"'));
  assert.ok(
    Math.abs(layout.currentCard.height - layout.currentMedia.height) <= 1,
    `selected card gained a footer: card ${layout.currentCard.height}px, media ${layout.currentMedia.height}px`,
  );
  assert.ok(
    Math.abs(layout.currentHeader.height - layout.currentMedia.height) <= 1,
    `selected card header gained a footer: header ${layout.currentHeader.height}px, media ${layout.currentMedia.height}px`,
  );
  for (const name of [
    "currentTitle",
    "currentFavorite",
    "currentFeed",
    "currentDate",
  ]) {
    const element = layout[name];
    assert.ok(
      element.top >= layout.currentMedia.top - 1 &&
        element.bottom <= layout.currentMedia.bottom + 1,
      `${name} fell outside the selected card image`,
    );
  }
});

test("mixed-height cards pack as masonry without changing DOM order", () => {
  const fixture = path.join(__dirname, "masonry-layout.html");
  const output = childProcess.execFileSync(
    "chromium",
    [
      "--headless",
      "--no-sandbox",
      "--disable-gpu",
      "--allow-file-access-from-files",
      "--window-size=1280,1200",
      "--virtual-time-budget=2500",
      "--dump-dom",
      new URL(`file://${fixture}`).href,
    ],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 45000,
    },
  );
  const match = output.match(/<pre id="masonry-results">([^<]+)<\/pre>/);
  assert.ok(match, "Chromium did not return masonry layout results");
  const result = JSON.parse(match[1].replaceAll("&quot;", '"'));
  const initial = result.initial;
  assert.equal(initial.masonryActive, true);
  assert.equal(initial.gridAutoFlow, "dense");
  assert.equal(initial.gridAutoRows, "1px");
  assert.deepEqual(
    initial.cards.map((card) => card.id),
    ["card-1", "card-2", "card-3", "card-4", "card-5", "card-6", "card-7", "card-8"],
    "masonry must preserve the FreshRSS DOM/source order",
  );
  const cards = Object.fromEntries(initial.cards.map((card) => [card.id, card.rect]));
  const panoramicCard = initial.cards.find((card) => card.id === "card-1");
  assert.ok(panoramicCard.titleRect.height > 0, "panoramic card title disappeared");
  assert.ok(
    panoramicCard.titleRect.top >= panoramicCard.rect.top - 1 &&
      panoramicCard.titleRect.bottom <= panoramicCard.rect.bottom + 1,
    "panoramic card title is clipped outside the natural-ratio card",
  );
  assert.ok(
    cards["card-7"].top < cards["card-4"].bottom - 40,
    "the card after the short neighbors should fill their space instead of waiting for the portrait card",
  );
  for (let left = 0; left < initial.cards.length; left += 1) {
    for (let right = left + 1; right < initial.cards.length; right += 1) {
      const a = initial.cards[left].rect;
      const b = initial.cards[right].rect;
      const sharesColumn = a.left < b.right - 1 && b.left < a.right - 1;
      if (sharesColumn) {
        assert.ok(
          a.bottom <= b.top + 1 || b.bottom <= a.top + 1,
          `${initial.cards[left].id} overlaps ${initial.cards[right].id}`,
        );
      }
    }
  }
  const maxCardBottom = Math.max(...initial.cards.map((card) => card.rect.bottom));
  assert.ok(initial.footer.top >= maxCardBottom, "stream footer overlaps masonry cards");
  assert.ok(
    initial.stream.bottom >= initial.footer.bottom + initial.footerMarginBottom - 1,
    "masonry grid does not contain the footer and its bottom margin",
  );
  assert.equal(result.expanded.masonryActive, false, "expanded reader must restore Youlag's native grid");
  assert.ok(
    result.expanded.cards.every((card) => card.gridRowEnd === "auto"),
    "expanded reader must clear masonry row spans",
  );
  assert.equal(result.collapsedAgain.masonryActive, true, "collapsed cards must resume masonry");
  const initialCardFive = initial.cards.find((card) => card.id === "card-5");
  const grownCardFive = result.afterGrowth.cards.find((card) => card.id === "card-5");
  assert.ok(
    grownCardFive.rect.height > initialCardFive.rect.height + 100,
    "delayed media growth did not change the card height",
  );
  for (const [label, snapshot] of [
    ["after growth", result.afterGrowth],
    ["after removal", result.afterRemoval],
  ]) {
    for (let left = 0; left < snapshot.cards.length; left += 1) {
      for (let right = left + 1; right < snapshot.cards.length; right += 1) {
        const a = snapshot.cards[left].rect;
        const b = snapshot.cards[right].rect;
        const sharesColumn = a.left < b.right - 1 && b.left < a.right - 1;
        if (sharesColumn) {
          assert.ok(
            a.bottom <= b.top + 1 || b.bottom <= a.top + 1,
            `${label}: ${snapshot.cards[left].id} overlaps ${snapshot.cards[right].id}`,
          );
        }
      }
    }
    const lastCardBottom = Math.max(...snapshot.cards.map((card) => card.rect.bottom));
    assert.ok(snapshot.footer.top >= lastCardBottom, `${label}: footer overlaps cards`);
  }
  assert.equal(
    result.afterRemoval.cards.some((card) => card.id === "card-6"),
    false,
    "removed card remained in the masonry DOM",
  );
  assert.match(
    stylesheet,
    /main#stream\.cmc-masonry-active\s*\{[^}]*grid-auto-flow:\s*row dense;[^}]*grid-auto-rows:\s*1px;/s,
  );
});

test("newly loaded cards are decorated and included in masonry", async () => {
  const { dom, window } = createPage({
    setupWindow: (targetWindow) => {
      targetWindow.document.body.classList.add("youlag-active");
    },
  });
  const stream = window.document.querySelector("#stream");
  stream.insertAdjacentHTML(
    "beforeend",
    `<div id="dynamic-card" class="flux not_read" data-id="43">
      <div class="flux_header">
        <div class="item thumbnail"><img src="https://example.test/dynamic.jpg"></div>
        <div class="item titleAuthorSummaryDate"><a class="title" href="https://example.test/dynamic">Dynamic</a></div>
        <div class="item manage"><a class="read" href="#read">Read</a></div>
      </div>
    </div>`,
  );
  stream.dispatchEvent(new window.Event("freshrss:load-more", { bubbles: true }));
  await new Promise((resolve) => window.setTimeout(resolve, 20));

  const dynamic = window.document.querySelector("#dynamic-card");
  assert.ok(dynamic.classList.contains("cmc-swipe-ready"));
  assert.equal(stream.classList.contains("cmc-masonry-active"), true);
  assert.match(dynamic.style.gridRowEnd, /^span \d+$/);
  assert.deepEqual(
    [...stream.querySelectorAll(":scope > .flux")].map((card) => card.id || card.dataset.id),
    ["42", "dynamic-card"],
    "masonry must not reorder cards when infinite loading appends entries",
  );
  dom.window.close();
});

test("removed cards are released from the masonry resize observer", async () => {
  const observed = new Set();
  const unobserved = new Set();
  const { dom, window } = createPage({
    setupWindow: (targetWindow) => {
      targetWindow.document.body.classList.add("youlag-active");
      targetWindow.ResizeObserver = class {
        constructor(callback) {
          this.callback = callback;
        }
        observe(element) {
          observed.add(element);
        }
        unobserve(element) {
          unobserved.add(element);
        }
      };
    },
  });
  await new Promise((resolve) => window.setTimeout(resolve, 20));
  const card = window.document.querySelector("#stream > .flux");
  const header = card.querySelector(".flux_header");
  const thumbnail = card.querySelector(".item.thumbnail");
  assert.ok(observed.has(card), "the live card was not observed");
  assert.ok(observed.has(header), "the card content was not observed for delayed growth");
  assert.ok(observed.has(thumbnail), "the media wrapper was not observed for delayed growth");
  card.remove();
  await new Promise((resolve) => window.setTimeout(resolve, 20));
  assert.ok(unobserved.has(card), "the removed card remained registered with ResizeObserver");
  assert.ok(unobserved.has(header), "removed card content remained registered with ResizeObserver");
  assert.ok(unobserved.has(thumbnail), "removed media remained registered with ResizeObserver");
  dom.window.close();
});

test("mobile-grid preference retains two masonry columns", () => {
  const fixture = path.join(__dirname, "masonry-layout.html");
  const output = childProcess.execFileSync(
    "chromium",
    [
      "--headless",
      "--no-sandbox",
      "--disable-gpu",
      "--allow-file-access-from-files",
      "--window-size=390,1200",
      "--virtual-time-budget=1900",
      "--dump-dom",
      new URL(`file://${fixture}`).href,
    ],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 45000,
    },
  );
  const match = output.match(/<pre id="masonry-results">([^<]+)<\/pre>/);
  assert.ok(match, "Chromium did not return mobile masonry results");
  const initial = JSON.parse(match[1].replaceAll("&quot;", '"')).initial;
  const columns = new Set(initial.cards.map((card) => Math.round(card.rect.left)));
  assert.equal(initial.masonryActive, true);
  assert.equal(columns.size, 2, "Youlag mobile-grid mode must remain two columns");
});
