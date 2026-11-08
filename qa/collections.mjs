import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {chromium,firefox,webkit} from 'playwright';
import {createApp} from '../server.mjs';
const engineName=process.env.QA_ENGINE || 'chromium',engine={chromium,firefox,webkit}[engineName];
const dataDir=mkdtempSync(join(tmpdir(),'hos-collections-browser-')),password=randomUUID();
const app=createApp({dataDir,env:{ADMIN_PASSWORD:password},backgroundNotifications:false});
await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+app.server.address().port,auth={Authorization:'Basic '+Buffer.from('admin:'+password).toString('base64')};
const api=async(path,data)=>(await fetch(base+'/api/admin/'+path,{headers:{...auth,...(data?{'Content-Type':'application/json',Origin:base}:{})},...(data?{method:'POST',body:JSON.stringify(data)}:{})})).json();
const out=new URL('../test-results/browser/',import.meta.url);mkdirSync(out,{recursive:true});
let browser;const errors=[],requests=[],failedResponses=[];let checked=0;
try {
 let staged;
 browser=await engine.launch(engineName==='chromium'?{args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']}:{});
 const privateContext=await browser.newContext({httpCredentials:{username:'admin',password},viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 let page=await privateContext.newPage();page.on('pageerror',error=>errors.push(error.message));
 await page.goto(base+'/admin/content');await page.locator('#field-title').waitFor();
 await page.locator('#prepare-founding').click();await page.waitForFunction(()=>document.querySelector('#field-name')?.value==='Rhythm');
 assert.equal(await page.locator('#collection-list .record').count(),5);
 await page.locator('#work-list .record>button:first-child').filter({hasText:'Flame in Motion'}).click();
 await page.locator('#field-availability').selectOption('available');await page.locator('#save').click();await page.waitForFunction(()=>document.querySelector('#status').textContent==='Draft saved.');
 await page.locator('#field-availability').selectOption('sold');await page.locator('#save').click();await page.waitForFunction(()=>document.querySelector('#status').textContent==='Draft saved.');
 staged=await api('content');
 await page.goto(base+'/admin/preview');await page.locator('#hos-concept[data-ready="true"]').waitFor();
 assert.equal(await page.locator('#hos-home-chapters [data-collection-section]').count(),5);
 assert.equal(await page.locator('#hos-home-chapters [data-model-fallback]').count(),0);
 assert.equal(await page.locator('#hos-home-chapters [data-model-stage]').count(),0,'Collection banners remain photographic');
 assert.equal(await page.locator('#hos-home-chapters .hos-collection-selection [data-artist]').count(),23,'Artist credits stay with the sculpture cards');
 assert.equal(await page.locator('#hos-home-chapters .hos-collection-selection').count(),5);
 assert.equal(await page.locator('#hos-home-chapters .hos-collection-selection .hos-work-card').count(),23);
 assert.equal(await page.locator('#hos-home-chapters .hos-collection-reversed').count(),0);
 assert.equal(await page.locator('#hos-home-chapters .hos-collection-photo').count(),5);
 for(const collection of staged.draft.collections){
  assert.deepEqual(await page.locator(`#hos-home-chapters [data-collection-section="${collection.id}"] .hos-collection-selection .hos-work-card`).evaluateAll(cards=>cards.map(card=>card.dataset.workRecord)),collection.workIds);
 }
 assert(!requests.some(url=>url.endsWith('.glb')),'Photographic browsing must not request models');
 await page.setViewportSize({width:390,height:844});
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await page.setViewportSize({width:1440,height:1000});
 await page.screenshot({path:new URL('collections-private-desktop.png',out).pathname,fullPage:true});
 await page.locator('#hos-home-chapters [data-collection="rhythm"]').first().click();await page.waitForURL('**/admin/preview/collections/rhythm');
 assert.equal(await page.locator('#hos-category-content .hos-work-card').count(),5);
 if(await page.locator('#hos-category-content .hos-filter-toggle').isVisible())await page.locator('#hos-category-content .hos-filter-toggle').click();await page.locator('#hos-category-content [data-filter="material"]').selectOption('Springstone');assert.equal(await page.locator('#hos-category-content .hos-work-card').count(),2);
 await page.getByRole('button',{name:'Reset filters',exact:true}).click();assert.equal(await page.locator('#hos-category-content .hos-work-card').count(),5);
 await page.locator('#hos-category-content [data-artist]').first().click();await page.waitForURL('**/admin/preview/artists/*');assert((await page.locator('#hos-artist-works h3 a[data-work]').count())>0);
 assert.equal(app.db.prepare('SELECT count(*) AS n FROM events').get().n,0,'Private preview cannot log sessions');
 await privateContext.close();
 await api('publish',{revision:staged.revision});
 const content=await(await fetch(base+'/content.json')).json();
 const context=await browser.newContext({reducedMotion:'reduce'});await context.addInitScript(()=>localStorage.setItem('hos-measurement','off'));
 page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>requests.push(request.url()));page.on('response',response=>{if(response.url().startsWith(base)&&response.status()>=400)failedResponses.push([response.status(),response.url()]);});
 const routes=['/','/collection','/artists','/making','/designers','/collectors','/house','/privacy',...content.collections.map(c=>'/collections/'+c.slug),...content.works.map(w=>'/works/'+w.slug),...content.artists.map(a=>'/artists/'+a.slug)];
 for(const [width,height] of [[320,568],[390,844],[844,390],[1440,1000],[2560,1440],[3840,2160]]) {
  await page.setViewportSize({width,height});
  for(const route of routes){
   const response=await page.goto(base+route);assert.equal(response.status(),200,route);
   await page.locator('#hos-concept[data-ready="true"]').waitFor();
   await page.evaluate(async()=>{const images=[...document.querySelectorAll('main img')].filter(img=>img.getClientRects().length);images.forEach(img=>img.loading='eager');await Promise.all(images.map(img=>img.decode()));});
   const layout=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,header:document.querySelector('.hos-header').getBoundingClientRect().top,footer:getComputedStyle(document.querySelector('.hos-footer')).position,images:[...document.querySelectorAll('main img')].filter(img=>img.getClientRects().length).map(img=>({fit:getComputedStyle(img).objectFit,fullComposition:innerWidth<=700&&img.src.includes('elemental-campaign'),hero:img.classList.contains('hos-hero-image')||img.parentElement.classList.contains('hos-collection-landscape')}))}));
   assert(layout.scroll<=layout.width+1,`${route} overflows at ${width}`);assert.equal(layout.header,0);assert.equal(layout.footer,'static');assert(layout.images.every(img=>img.fit===(img.hero||img.fullComposition?'cover':'contain')),`Cropping ${route}`);
   if(route==='/'){assert.equal(await page.locator('#hos-home-chapters [data-collection-section]').count(),5);assert.equal(await page.locator('#hos-home-chapters .hos-work-card .hos-availability').allTextContents().then(v=>v.join()),'Sold');assert.equal(await page.locator('.hos-hero-copy h1 span').last().evaluate(el=>getComputedStyle(el).color),'rgb(255, 255, 255)');}
   if(route.includes('/collections/')){const collection=content.collections.find(c=>route.endsWith('/'+c.slug));assert.deepEqual(await page.locator('#hos-category-content .hos-work-card').evaluateAll(nodes=>nodes.map(node=>node.dataset.workRecord)),collection.workIds);}
   checked++;
  }
  await page.goto(base+'/collections/rhythm');await page.locator('#hos-concept[data-ready="true"]').waitFor();await page.evaluate(async()=>{const imgs=[...document.querySelectorAll('#hos-category-content img')];imgs.forEach(img=>img.loading='eager');await Promise.all(imgs.map(img=>img.decode()));});await page.screenshot({path:new URL(`collections-${engineName}-${width}.png`,out).pathname,fullPage:true});
 }
 assert(!requests.some(url=>url.endsWith('.glb') || url.includes('sculpture-viewer.js')),'No GPU resources should load for missing matching models');
 await page.setViewportSize({width:390,height:844});await page.goto(base+'/');await page.locator('#hos-concept[data-ready="true"]').waitFor();
 await page.getByRole('link',{name:'Discover the collection',exact:true}).click();assert.equal(new URL(page.url()).pathname,'/');await page.waitForFunction(()=>scrollY>100);
 await page.locator('.hos-menu-toggle').click();await page.getByRole('link',{name:'The collection 01'}).click();await page.waitForURL('**/collection');
 await page.goto(base+'/works/zsa-page-28');await page.locator('#hos-concept[data-ready="true"]').waitFor();await page.locator('#hos-work-inquiry').click();
 await page.locator('[name="name"]').fill('Local browser QA');await page.locator('[name="email"]').fill('local@example.test');await page.getByRole('button',{name:'Review inquiry',exact:true}).click();await page.locator('#hos-inquiry-send').click();await page.locator('#hos-inquiry-success').waitFor({state:'visible'});
 assert.equal(app.db.prepare('SELECT work_id FROM inquiries').get().work_id,'zsa-028');
 await page.goto(base+'/works/zsa-page-13');await page.locator('#hos-concept[data-ready="true"]').waitFor();assert.equal(await page.locator('#hos-work-context .hos-availability').textContent(),'Sold');assert.equal(await page.locator('#hos-work-inquiry').textContent(),'Inquire about related works');
 await page.locator('#hos-work-inquiry').click();await page.locator('[name="name"]').fill('Alternatives QA');await page.locator('[name="email"]').fill('alternative@example.test');await page.getByRole('button',{name:'Review inquiry',exact:true}).click();await page.locator('#hos-inquiry-send').click();await page.locator('#hos-inquiry-success').waitFor({state:'visible'});assert.match(app.db.prepare('SELECT topic FROM inquiries WHERE work_id=?').get('zsa-013').topic,/^Alternatives to /);
 await context.close();
 const tracking=await browser.newContext();page=await tracking.newPage();await page.goto(base+'/collections/elemental');await page.locator('#hos-concept[data-ready="true"]').waitFor();await page.locator('#hos-category-content .hos-card-title[data-work="zsa-028"]').click();await page.waitForURL('**/works/zsa-page-28');await page.waitForTimeout(100);assert(app.db.prepare("SELECT count(*) AS n FROM events WHERE page='category' AND name='page_view'").get().n>0);assert(app.db.prepare("SELECT count(*) AS n FROM events WHERE work_id='zsa-028' AND name='work_view'").get().n>0);
 // A correctly matched legacy fixture verifies viewer lifecycle on a newly rendered
 // collection route. It is local QA data, never a substitute for a source sculpture.
 const liveState=await api('content');let restored=await api('restore',{revision:liveState.revision,version:0});
 restored.draft.collections ||= [];restored.draft.collections.push({id:'viewer-fixture',slug:'viewer-fixture',name:'Viewer fixture',description:'Local QA only',introduction:'',starWorkId:'folded-light',workIds:['folded-light'],archived:false});
 restored=await api('content',{revision:restored.revision,catalog:restored.draft});await api('publish',{revision:restored.revision});
 const viewerContext=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});await viewerContext.addInitScript(()=>localStorage.setItem('hos-measurement','off'));
 const viewerPage=await viewerContext.newPage();viewerPage.on('pageerror',error=>errors.push(error.message));
 await viewerPage.goto(base+'/collections/viewer-fixture');await viewerPage.locator('#hos-concept[data-ready="true"]').waitFor();
 assert.equal(await viewerPage.locator('#hos-category-content [data-model-stage]').count(),0);
 await viewerPage.locator('#hos-category-content .hos-card-title[data-work="folded-light"]').click();
 await viewerPage.locator('#hos-work-model').click();await viewerPage.waitForFunction(()=>['ready','unavailable'].includes(document.querySelector('#hos-model-stage').dataset.modelState));
 assert(await viewerPage.locator('#hos-model-dialog').isVisible());await viewerPage.keyboard.press('Escape');assert(await viewerPage.locator('#hos-model-dialog').isHidden());await viewerContext.close();
 assert.deepEqual(errors,[]);assert.deepEqual(failedResponses,[]);writeFileSync(new URL(`collections-${engineName}-report.json`,out),JSON.stringify({engine:engineName,routes:routes.length,sizes:6,checks:checked,errors,inquiries:2,matchingStarModels:0,photoFallbacks:5},null,2));console.log(`Collection QA passed: ${checked} route/viewport checks, private draft, filters, links, sold alternatives, inquiries and session logging (${engineName}).`);
} finally {await browser?.close();await new Promise(resolve=>app.server.close(resolve));rmSync(dataDir,{recursive:true,force:true});}

