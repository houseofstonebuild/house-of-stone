import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright';
import {createApp} from '../server.mjs';
import {prepareOwnerPublication} from '../scripts/publish-owner-release.mjs';
const dataDir=mkdtempSync(join(tmpdir(),'hos-compact-')),password=randomUUID();
const app=createApp({dataDir,env:{ADMIN_PASSWORD:password},backgroundNotifications:false});
await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+app.server.address().port;
const api=async(path,data)=>{const r=await fetch(origin+'/api/admin/'+path,{method:data?'POST':'GET',headers:{Authorization:'Basic '+Buffer.from('admin:'+password).toString('base64'),'Content-Type':'application/json',Origin:origin},...(data?{body:JSON.stringify(data)}:{})});assert(r.ok);return r.json();};
let browser;
try{
 const current=await api('content'),state=await api('content',{revision:current.revision,catalog:prepareOwnerPublication(current.draft)});await api('publish',{revision:state.revision});
 browser=await chromium.launch({args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
 await page.addInitScript(()=>localStorage.setItem('hos-measurement','off'));
 const out=new URL('../test-results/compact/',import.meta.url);mkdirSync(out,{recursive:true});
 for(const width of [390,1440]){
  await page.setViewportSize({width,height:1000});
  for(const route of ['/collection','/collections/rhythm']){
   await page.goto(origin+route);await page.locator('#hos-concept[data-ready="true"]').waitFor();
   const section=page.locator('.hos-collection-browser').filter({visible:true}).first(),filters=section.locator('.hos-collection-filters'),toggle=section.locator('.hos-filter-toggle');
   if(width===390){
    assert.equal(await filters.isVisible(),false);
    assert.equal(await toggle.getAttribute('aria-expanded'),'false');
    await toggle.click();assert(await filters.isVisible());
    const select=filters.locator('select').first(),value=await select.locator('option').nth(1).getAttribute('value');
    await select.selectOption(value);
    const filteredCount=await section.locator('.hos-work-card').count();assert(filteredCount>0);
    await toggle.click();assert.equal(await filters.isVisible(),false);
    assert.equal(await section.locator('.hos-work-card').count(),filteredCount);
   }else assert(await filters.isVisible());
   const intro=page.locator('.hos-collection-introduction');
   if(await intro.count()){
    const rects=await intro.evaluate(n=>{const h=n.querySelector('h1').getBoundingClientRect(),p=n.querySelector('.hos-collection-description').getBoundingClientRect();return{left:h.left,copyLeft:p.left,bottom:h.bottom,copyTop:p.top};});
    assert(Math.abs(rects.left-rects.copyLeft)<1);assert(rects.copyTop>=rects.bottom);
   }
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   await section.scrollIntoViewIfNeeded();
   await page.screenshot({path:new URL(width+'-'+(route==='/collection'?'all':'rhythm')+'.png',out).pathname});
   if(await intro.count()){await intro.scrollIntoViewIfNeeded();await page.screenshot({path:new URL(width+'-title.png',out).pathname});}
  }
 }
 console.log('Compact layout passed: filters open, select and close without losing selection; desktop filters stay visible; descriptions sit below titles at 390px and 1440px.');
}finally{await browser?.close();await new Promise(r=>app.server.close(r));rmSync(dataDir,{recursive:true,force:true});}
