// Integration regression against the actual FreshRSS/Youlag cascade.
// NODE_PATH=<playwright install>/node_modules node tests/banner-layout.cjs
// FRESHRSS_URL must point to an already authorized reader (no credentials here).
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
(async () => {
 const browser = await chromium.launch({executablePath: process.env.CHROMIUM || '/usr/bin/chromium', args:['--no-sandbox']});
 const page = await browser.newPage();
 if (!process.env.LIVE_ASSETS) await page.route('**/ext.php?*', async route => {
  const f = new URL(route.request().url()).searchParams.get('f');
  if (['xExtension-CompactMediaCards/static/compact-media-cards.css','xExtension-CompactMediaCards/static/compact-media-cards.js'].includes(f))
   return route.fulfill({path:path.resolve(__dirname,'../..', f),contentType:f.endsWith('.css')?'text/css':'text/javascript'});
  return route.continue();
 });
 const results=[];
 try {
 for (const width of [360,412,840,841,1440]) {
  await page.setViewportSize({width,height:800});
  await page.goto(process.env.FRESHRSS_URL, {waitUntil:'domcontentloaded'});
  await page.waitForSelector('.cmc-layout-toggle');
  for (const layout of ['masonry','list']) {
   // Browser-only layout changes: do not persist user preferences via toolbar clicks.
   await page.evaluate(layout=>{window.context.extensions.compactMediaCards.layout=layout;document.querySelector('#cmc_layout').dataset.cmcLayout=layout;document.body.classList.toggle('cmc-layout-list',layout==='list');document.body.classList.toggle('cmc-layout-masonry',layout==='masonry');window.dispatchEvent(new Event('resize'));},layout);
   let baseline;
   for (const visible of [false,true,false]) {
    await page.evaluate(visible=>{document.querySelector('#new-article').hidden=!visible;window.scrollTo(0,0);},visible);
    await page.waitForTimeout(250);
    for (const scroll of [0,600,300]) {
     await page.evaluate(scroll=>window.scrollTo(0,scroll),scroll);
     await page.waitForTimeout(350);
     const boxes=await page.evaluate(()=>{
      const rect=s=>document.querySelector(s).getBoundingClientRect().toJSON();
      return {toolbar:rect('#yl_category_toolbar'),banner:rect('#new-article'),card:rect('#stream > .flux'),scrollY,hidden:document.querySelector('#new-article').hidden};
     });
     results.push({width,layout,visible,scroll,...boxes});
     if(visible) assert.ok(boxes.banner.top>=boxes.toolbar.bottom-1,`overlap: ${JSON.stringify(results.at(-1))}`);
     else {assert.equal(boxes.banner.height,0);if(scroll===0){if(baseline!==undefined)assert.ok(Math.abs(boxes.card.top-baseline)<1,'hidden banner left a gap');baseline=boxes.card.top;}}
    }
   }
  }
 }
 console.log(JSON.stringify({passed:results.length,results},null,2));
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
