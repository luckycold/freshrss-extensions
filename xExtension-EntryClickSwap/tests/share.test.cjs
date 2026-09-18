const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {JSDOM} = require('jsdom');
const source = fs.readFileSync(`${__dirname}/../static/entry-click-swap.js`, 'utf8');
function fixture(url = 'https://publisher.test/story?a=1&b=2') {
 const dom = new JSDOM('<main id="stream"><div class="flux cmc-swipe-ready"><ul class="flux_header"><li class="item titleAuthorSummaryDate"><a class="title">Story</a></li><li class="item link"><a href="#"><img></a></li></ul></div></main>', {url:'https://rss.test/i/',runScripts:'outside-only'});
 const w = dom.window; w.document.querySelector('.title').href=url;
 const calls={share:[],copy:[],core:0,open:0,read:0};
 w.open=()=>calls.open++; w.mark_read=()=>calls.read++;
 w.document.querySelector('#stream').addEventListener('click',()=>calls.core++);
 w.document.querySelector('#stream').addEventListener('mouseup',()=>calls.core++);
 Object.defineProperty(w.navigator,'clipboard',{value:{writeText:async s=>calls.copy.push(s)},configurable:true});
 w.eval(source); w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
 return {w,calls,button:()=>w.document.querySelector('.ecs-share-button'),close:()=>w.close()};
}
test('share uses the native theme-compatible icon instead of a white inline glyph',()=>{const f=fixture();const icon=f.button().querySelector('img.icon');assert.ok(icon);assert.equal(icon.src,'https://rss.test/themes/icons/share.svg');assert.equal(icon.alt,'');assert.equal(f.button().querySelector('svg'),null);f.close();});
async function click(f){assert.ok(f.button(),'Share button exists'); for(const type of ['mouseup','click']) f.button().dispatchEvent(new f.w.MouseEvent(type,{bubbles:true,cancelable:true,button:0})); await new Promise(resolve=>setImmediate(resolve));}
test('share copies original HTTP(S) URL without opening, toggling or marking read',async()=>{const f=fixture();await click(f);assert.deepEqual(f.calls.copy,['https://publisher.test/story?a=1&b=2']);assert.equal(f.calls.core+f.calls.open+f.calls.read,0);assert.equal(f.button().title,'Link copied');f.close();});
test('native share is called synchronously with title and original URL',async()=>{const f=fixture();f.w.navigator.share=data=>{f.calls.share.push(data);return Promise.resolve();};const p=click(f);assert.equal(f.calls.share.length,1);await p;assert.equal(f.calls.share[0].title,'Story');assert.equal(f.calls.share[0].url,'https://publisher.test/story?a=1&b=2');assert.equal(f.calls.copy.length,0);f.close();});
test('native cancellation does not copy',async()=>{const f=fixture();f.w.navigator.share=async()=>{throw new f.w.DOMException('Cancelled','AbortError');};await click(f);assert.equal(f.calls.copy.length,0);assert.equal(f.button().disabled,false);f.close();});
test('native failure falls back to clipboard',async()=>{const f=fixture();f.w.navigator.share=async()=>{throw new Error('Not allowed');};await click(f);assert.equal(f.calls.copy.length,1);f.close();});
test('unsupported native payload falls back to clipboard',async()=>{const f=fixture();f.w.navigator.canShare=()=>false;f.w.navigator.share=()=>{throw new Error('must not call');};await click(f);assert.equal(f.calls.copy.length,1);f.close();});
test('clipboard failure presents selectable URL without false success',async()=>{const f=fixture();f.w.navigator.clipboard.writeText=async()=>{throw new Error('Denied');};await click(f);const field=f.w.document.querySelector('.ecs-share-fallback input');assert.ok(field);assert.equal(field.value,'https://publisher.test/story?a=1&b=2');assert.notEqual(f.button().title,'Link copied');f.close();});
for(const url of ['javascript:alert(1)','data:text/plain,no','file:///tmp/test','https://user:password@publisher.test/story'])test(`rejects ${url.split(':')[0]} original URL`,async()=>{const f=fixture(url);assert.equal(f.button(),null);f.close();});
test('load-more decorates once and handles new entries',async()=>{const f=fixture();const card=f.w.document.querySelector('.flux').cloneNode(true);card.querySelector('.ecs-share').remove();card.querySelector('.title').href='https://publisher.test/new';f.w.document.querySelector('#stream').append(card);for(let i=0;i<2;i++)f.w.document.dispatchEvent(new f.w.Event('freshrss:load-more'));assert.equal(f.w.document.querySelectorAll('.ecs-share-button').length,2);card.querySelector('.ecs-share-button').click();await new Promise(resolve=>setImmediate(resolve));assert.equal(f.calls.copy[0],'https://publisher.test/new');f.close();});
test('revalidates URL on click and ignores duplicate pending requests',async()=>{const f=fixture();let resolve;f.w.navigator.share=()=>new Promise(r=>{resolve=r;f.calls.share.push(1);});await click(f);await click(f);assert.equal(f.calls.share.length,1);resolve();await new Promise(r=>setImmediate(r));f.w.document.querySelector('.title').href='javascript:alert(1)';await click(f);assert.equal(f.calls.share.length,1);f.close();});
