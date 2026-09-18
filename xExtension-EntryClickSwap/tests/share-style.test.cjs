const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {JSDOM} = require('jsdom');
const nativeCss = fs.readFileSync(`${__dirname}/../../xExtension-CompactMediaCards/static/compact-media-cards.css`, 'utf8');
const shareCss = fs.readFileSync(`${__dirname}/../static/entry-click-swap.css`, 'utf8');
function rules(css) {
 const dom = new JSDOM(`<style>${css}</style>`);
 const result = [...dom.window.document.styleSheets[0].cssRules];
 dom.window.close();
 return result;
}
const nativeRules = rules(nativeCss), shareRules = rules(shareCss);
for (const state of ['', ':hover', ':focus-visible']) {
 test(`share matches Compact Media Cards reader opacity and surfaces: ${state || 'normal'}`, () => {
  const native = nativeRules.find(r => r.selectorText?.split(',').some(s => s.trim().endsWith(`li.item.link > a${state}`)) && r.style.getPropertyValue('opacity'));
  const share = shareRules.find(r => r.selectorText?.split(',').some(s => s.trim().endsWith(`li.item.ecs-share > button${state}`)) && r.style.getPropertyValue('opacity'));
  assert.ok(native); assert.ok(share);
  assert.equal(Number(share.style.getPropertyValue('opacity')), Number(native.style.getPropertyValue('opacity')));
  const variable = state ? '--cmc-card-control-surface-hover' : '--cmc-card-control-surface';
  assert.ok((share.style.getPropertyValue('background-color') || share.style.getPropertyValue('background')).includes(variable));
  if (state) assert.equal(share.style.getPropertyValue('border-color'), native.style.getPropertyValue('border-color'));
 });
}
