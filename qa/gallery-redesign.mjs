import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright';
import {createApp} from '../server.mjs';
import {prepareOwnerPublication} from '../scripts/publish-owner-release.mjs';
const dataDir=mkdtempSync(join(tmpdir(),'hos-gallery-')),password=randomUUID();
const app=createApp({dataDir,env:{ADMIN_PASSWORD:password},backgroundNotifications:false});
await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+app.server.address().port,out=new URL('../test-results/gallery/',import.meta.url);mkdirSync(out,{recursive:true});
let browser;
try {
 const api=async(path,data)=>{const r=await fetch(origin+'/api/admin/'+path,{headers:{Authorization:'Basic '+Buffer.from('admin:'+password).toString('base64'),'Content-Type':'application/json',Origin:origin},...(data?{method:'POST',body:JSON.stringify(data)}:{})});assert(r.ok);return r.json();};
 const current=await api('content'),state=await api('content',{revision:current.revision,catalog:prepareOwnerPublication(current.draft)});await api('publish',{revision:state.revision});
 const catalog=await(await fetch(origin+'/content.json')).json();
 browser=await chromium.launch({args:['--no-sandbox']});
 const page=await browser.newPage({reducedMotion:'reduce'}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>localStorage.setItem('hos-measurement','off'));
 const ready=async path=>{assert((await page.goto(origin+path)).ok());await page.locator('#hos-concept[data-ready="true"]').waitFor();await page.evaluate(()=>document.fonts.ready);};
 const routes=['/','/collection','/artists','/making','/designers','/collectors','/house',...catalog.collections.map(c=>'/collections/'+c.slug),...catalog.works.map(w=>'/works/'+w.slug),...catalog.artists.map(a=>'/artists/'+a.slug)];
 let checked=0;
 for(const width of [320,390,768,1440]){
  await page.setViewportSize({width,height:1000});
  for(const route of routes){
   await ready(route);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),route+' overflow at '+width);
   assert.equal(await page.locator('#hos-concept').evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(255, 255, 255)');
   const cards=page.locator('.hos-view:visible .hos-work-card');
   for(const card of await cards.all()){
    assert(await card.locator('h3 a[data-work]').getAttribute('href'));
    assert.equal(await card.locator('.hos-card-specs,.hos-card-description').count(),0);
   }
   checked++;
  }
 }
 const samples=[['collection','/collection'],['rhythm','/collections/rhythm'],['orbit','/works/zsa-page-9'],['artist','/artists/'+catalog.artists[0].slug]];
 for(const width of [390,1440]){
  await page.setViewportSize({width,height:1000});
  for(const [name,route] of samples){
   await ready(route);await page.locator('.hos-view:visible img').evaluateAll(images=>Promise.all(images.map(img=>{img.loading='eager';return img.decode().catch(()=>{});})));await page.mouse.move(0,0);await page.screenshot({path:new URL(width+'-'+name+'.jpg',out).pathname,type:'jpeg',quality:85,fullPage:true});
  }
 }
 await ready('/works/zsa-page-9');await page.locator('#hos-work-inquiry').click();assert(await page.locator('#hos-inquiry').isVisible());await page.locator('#hos-inquiry-close').click();
 await page.locator('#hos-work-photo-open').click();assert(await page.locator('#hos-photo-dialog').isVisible());await page.keyboard.press('Escape');assert(await page.locator('#hos-photo-dialog').isHidden());
 await page.locator('.hos-photo-thumbnail').last().click();assert.equal(await page.locator('.hos-photo-thumbnail').last().getAttribute('aria-pressed'),'true');
 await page.emulateMedia({reducedMotion:'no-preference'});await ready('/collection');const photo=page.locator('.hos-view:visible .hos-work-card-photo').first();await photo.hover();await page.waitForTimeout(700);assert.equal(await photo.locator('img').evaluate(n=>getComputedStyle(n).transform),'none','Artwork frames remain stable on hover');
 await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await photo.locator('img').evaluate(n=>getComputedStyle(n).transform),'none');
 assert.deepEqual(errors,[]);console.log('Gallery redesign passed: '+checked+' route/viewport combinations, native card links, inquiry, photo inspection, hover and reduced motion.');
} finally {await browser?.close();await new Promise(r=>app.server.close(r));rmSync(dataDir,{recursive:true,force:true});}

