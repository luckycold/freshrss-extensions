const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const scriptPath = path.join(__dirname, '..', 'static', 'entry-click-swap.js');
assert.ok(fs.existsSync(scriptPath), 'entry-click-swap browser script must exist');
const source = fs.readFileSync(scriptPath, 'utf8');

function fixture() {
	const dom = new JSDOM(`<!doctype html><html><body>
		<div id="stream">
			<div class="flux current" id="flux_1">
				<ul class="flux_header">
					<li class="item manage"><a class="bookmark" href="#bookmark">Favorite</a></li>
					<li class="item titleAuthorSummaryDate"><a class="item-element title" target="_blank" rel="noreferrer" href="https://example.test/article">Article title</a></li>
					<li class="item link"><a class="item-element" target="_blank" href="https://example.test/article" title="See on website"><img class="icon" src="../themes/icons/link.svg" alt=""></a></li>
				</ul>
				<article class="flux_content"></article>
			</div>
		</div>
	</body></html>`, {
		url: 'https://rss.example.test/i/',
		runScripts: 'outside-only',
	});
	const { window } = dom;
	const calls = { opened: [], marked: [], toggled: [], coreClick: 0, coreMouseup: 0 };
	window.context = { auto_mark_site: true };
	window.open = (...args) => { calls.opened.push(args); return null; };
	window.mark_read = (...args) => { calls.marked.push(args); };
	window.toggleContent = (...args) => { calls.toggled.push(args); };
	const stream = window.document.getElementById('stream');
	stream.onclick = () => { calls.coreClick += 1; };
	stream.onmouseup = () => { calls.coreMouseup += 1; };
	window.eval(source);
	window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
	return { dom, window, document: window.document, calls };
}

function primaryClick(window, element, options = {}) {
	element.dispatchEvent(new window.MouseEvent('mouseup', {
		bubbles: true,
		cancelable: true,
		button: 0,
		...options,
	}));
	element.dispatchEvent(new window.MouseEvent('click', {
		bubbles: true,
		cancelable: true,
		button: 0,
		...options,
	}));
}

test('clicking the entry title opens the original website and marks it read', () => {
	const f = fixture();
	primaryClick(f.window, f.document.querySelector('a.title'));
	assert.deepEqual(f.calls.opened, [['https://example.test/article', '_blank', 'noopener,noreferrer']]);
	assert.equal(f.calls.marked.length, 1);
	assert.equal(f.calls.marked[0][0].id, 'flux_1');
	assert.deepEqual(f.calls.marked[0].slice(1), [true, false]);
	assert.equal(f.calls.toggled.length, 0);
	assert.equal(f.calls.coreClick, 0);
	assert.equal(f.calls.coreMouseup, 0);
	f.dom.window.close();
});

test('clicking entry header space opens the original website', () => {
	const f = fixture();
	primaryClick(f.window, f.document.querySelector('.titleAuthorSummaryDate'));
	assert.equal(f.calls.opened[0][0], 'https://example.test/article');
	assert.equal(f.calls.toggled.length, 0);
	f.dom.window.close();
});

test('clicking the former website-link button opens the inline FreshRSS entry', () => {
	const f = fixture();
	primaryClick(f.window, f.document.querySelector('.item.link > a'));
	assert.equal(f.calls.opened.length, 0);
	assert.equal(f.calls.marked.length, 0);
	assert.equal(f.calls.toggled.length, 1);
	assert.equal(f.calls.toggled[0][0].id, 'flux_1');
	assert.equal(f.calls.toggled[0][1].id, 'flux_1');
	assert.equal(f.calls.toggled[0][2], false);
	assert.equal(f.calls.coreClick, 0);
	assert.equal(f.calls.coreMouseup, 0);
	f.dom.window.close();
});

test('the swapped button uses the reader icon and an accurate accessible label', () => {
	const f = fixture();
	const button = f.document.querySelector('.item.link > a');
	assert.equal(button.title, 'Open in FreshRSS reader');
	assert.equal(button.getAttribute('aria-label'), 'Open in FreshRSS reader');
	assert.match(button.querySelector('img').src, /\/themes\/icons\/view-reader\.svg$/);
	f.dom.window.close();
});

test('newly loaded entries also receive the reader icon and behavior', () => {
	const f = fixture();
	const flux = f.document.createElement('div');
	flux.className = 'flux';
	flux.id = 'flux_2';
	flux.innerHTML = '<ul class="flux_header"><li class="item titleAuthorSummaryDate"><a class="title" href="https://example.test/two">Two</a></li><li class="item link"><a href="https://example.test/two" title="See on website"><img src="../themes/icons/link.svg" alt=""></a></li></ul>';
	f.document.getElementById('stream').append(flux);
	f.document.body.dispatchEvent(new f.window.Event('freshrss:load-more', { bubbles: true }));
	const button = flux.querySelector('.item.link > a');
	assert.equal(button.title, 'Open in FreshRSS reader');
	assert.match(button.querySelector('img').src, /\/themes\/icons\/view-reader\.svg$/);
	primaryClick(f.window, button);
	assert.equal(f.calls.toggled.at(-1)[0].id, 'flux_2');
	f.dom.window.close();
});

test('management controls and modified clicks keep their native FreshRSS behavior', () => {
	const f = fixture();
	primaryClick(f.window, f.document.querySelector('.bookmark'));
	primaryClick(f.window, f.document.querySelector('a.title'), { ctrlKey: true });
	assert.equal(f.calls.opened.length, 0);
	assert.equal(f.calls.toggled.length, 0);
	assert.equal(f.calls.coreClick, 2);
	assert.equal(f.calls.coreMouseup, 2);
	f.dom.window.close();
});

test('clicking Karakeep does not open the original website', () => {
	const f = fixture();
	const item = f.document.createElement('li');
	item.className = 'item manage';
	item.innerHTML = '<a class="item-element karakeepButton" href="?c=karakeepButton&amp;a=add&amp;id=1">Save</a>';
	f.document.querySelector('.flux_header').append(item);
	primaryClick(f.window, item.querySelector('a.karakeepButton'));
	assert.equal(f.calls.opened.length, 0);
	assert.equal(f.calls.toggled.length, 0);
	assert.equal(f.calls.coreClick, 1);
	f.dom.window.close();
});
