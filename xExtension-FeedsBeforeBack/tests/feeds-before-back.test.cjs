"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");

const extensionRoot = path.resolve(__dirname, "..");
const script = fs.readFileSync(
  path.join(extensionRoot, "static", "feeds-before-back.js"),
  "utf8",
);
const metadata = JSON.parse(
  fs.readFileSync(path.join(extensionRoot, "metadata.json"), "utf8"),
);

function wait(ms = 30) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createPage(options = {}) {
  const dom = new JSDOM(
    `<!doctype html>
		<html><head><style>
			.dropdown-menu { display: none; }
			.dropdown-target:target ~ .dropdown-menu { display: block; }
		</style></head><body>
			<nav id="aside_feed" class="aside aside_feed${options.hidden ? " is-hidden" : ""}">
				<a class="toggle_aside" href="#close">close</a>
			</nav>
			<div id="nav_menu_toggle_aside"><button class="btn" type="button"></button></div>
			<nav class="item configure"><div class="dropdown">
				<div id="dropdown-configure" class="dropdown-target"></div>
				<a class="btn dropdown-toggle" href="#dropdown-configure">Settings</a>
				<ul class="dropdown-menu"><li>Profile</li></ul>
			</div></nav>
		</body></html>`,
    {
      runScripts: "outside-only",
      url: options.url || "https://rss.example.test/i/?get=a",
    },
  );
  const { window } = dom;
  window.matchMedia = (query) => ({
    matches: options.media ? options.media(query) : query.includes("max-width: 840px"),
    addEventListener() {},
    removeEventListener() {},
  });
  const panel = window.document.getElementById("aside_feed");
  const button = window.document.querySelector("#nav_menu_toggle_aside button");
  window.toggle_aside_click = () => {
    button.classList.add("active");
    panel.classList.add("visible");
    panel.classList.remove("is-hidden");
  };
  if (options.beforeScript) {
    options.beforeScript(window);
  }
  window.eval(script);
  window.document.dispatchEvent(new window.Event("DOMContentLoaded"));
  return { window, panel, button };
}

test("metadata is a user extension", () => {
  assert.equal(metadata.name, "Feeds Before Back");
  assert.equal(metadata.entrypoint, "FeedsBeforeBack");
  assert.equal(metadata.type, "user");
  assert.equal(metadata.version, "1.0.1");
});

test("narrow closed feeds arm a same-page history trap", () => {
  const { window } = createPage();
  assert.equal(window.history.state.feedsBeforeBack, 1);
  assert.equal(window.history.length, 2);
});

test("first back opens the left feeds and does not continue", async () => {
  const { window, panel } = createPage();
  let bubbled = false;
  window.addEventListener("popstate", () => {
    bubbled = true;
  });
  const lengthBefore = window.history.length;
  window.history.back();
  await wait();
  assert.equal(panel.classList.contains("visible"), true);
  assert.equal(bubbled, false);
  assert.equal(window.history.length, lengthBefore);
});

test("back while feeds are already open continues to the previous entry", async () => {
  const { window, panel, button } = createPage();
  panel.classList.add("visible");
  button.classList.add("active");
  await wait(750);
  let extraBack = 0;
  const realBack = window.history.back.bind(window.history);
  window.history.back = () => {
    extraBack += 1;
    return realBack();
  };
  window.history.back();
  await wait(80);
  assert.ok(extraBack >= 2);
});

test("a feed list opened in the same gesture is not immediately dismissed", async () => {
  const { window, panel } = createPage();
  panel.classList.add("visible");
  window.history.back();
  await wait();
  assert.equal(panel.classList.contains("visible"), true);
  assert.equal(window.history.state, null);
});

test("leaving a reader overlay does not open feeds", async () => {
  const { window, panel } = createPage();
  let bubbled = false;
  window.addEventListener("popstate", () => {
    bubbled = true;
  });
  window.history.pushState({ articleOpen: true }, "", window.location.href);
  window.history.back();
  await wait();
  assert.equal(panel.classList.contains("visible"), false);
  assert.equal(bubbled, true);
  assert.equal(window.history.state.feedsBeforeBack, 1);
});

test("desktop back is not trapped", () => {
  const { window } = createPage({
    media() {
      return false;
    },
  });
  assert.equal(window.history.state, null);
  assert.equal(window.history.length, 1);
});

test("a page without the feed list is left alone", () => {
  const dom = new JSDOM("<!doctype html><html><body><main></main></body></html>", {
    runScripts: "outside-only",
    url: "https://rss.example.test/i/",
  });
  dom.window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  dom.window.eval(script);
  dom.window.document.dispatchEvent(new dom.window.Event("DOMContentLoaded"));
  assert.equal(dom.window.history.state, null);
});

test("closing the feed list arms the trap again", async () => {
  const { window, panel, button } = createPage();
  window.history.back();
  await wait();
  assert.equal(panel.classList.contains("visible"), true);
  panel.classList.remove("visible");
  button.classList.remove("active");
  await wait();
  assert.equal(window.history.state.feedsBeforeBack, 1);
});

test("a wiped history state is restored while the feed list is closed", () => {
  const { window } = createPage();
  window.history.replaceState(null, "", window.location.href);
  assert.equal(window.history.state.feedsBeforeBack, 1);
  assert.equal(window.history.length, 2);
});

test("phone landscape with a hidden feed list still arms", () => {
  const { window } = createPage({
    hidden: true,
    media(query) {
      return query.includes("pointer: coarse");
    },
  });
  assert.equal(window.history.state.feedsBeforeBack, 1);
});

test("tapping settings keeps the CSS-targeted dropdown visible", async () => {
  const { window, panel } = createPage();
  const gear = window.document.querySelector(".configure .dropdown-toggle");
  const menu = window.document.querySelector(".configure .dropdown-menu");
  const targetedMenu = () => window.document.querySelector(".configure .dropdown-target:target ~ .dropdown-menu");
  assert.equal(targetedMenu(), null);
  gear.click();
  await wait(80);
  assert.equal(window.location.hash, "#dropdown-configure");
  assert.equal(targetedMenu(), menu);
  assert.equal(panel.classList.contains("visible"), false);
});

test("back closes settings first and the following back opens feeds", async () => {
  const { window, panel } = createPage();
  const menu = window.document.querySelector(".configure .dropdown-menu");
  const targetedMenu = () => window.document.querySelector(".configure .dropdown-target:target ~ .dropdown-menu");
  window.document.querySelector(".configure .dropdown-toggle").click();
  await wait(40);
  assert.equal(targetedMenu(), menu);
  window.history.back();
  await wait(40);
  assert.equal(window.location.hash, "");
  assert.equal(targetedMenu(), null);
  assert.equal(panel.classList.contains("visible"), false);
  window.history.back();
  await wait(40);
  assert.equal(panel.classList.contains("visible"), true);
});
