import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright';
import {createApp} from '../server.mjs';
import {prepareOwnerPublication} from '../scripts/publish-owner-release.mjs';
const dataDir=mkdtempSync(join(tmpdir(),'hos-interiors-')),password=randomUUID();
const app=createApp({dataDir,env:{ADMIN_PASSWORD:password},backgroundNotifications:false});
await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+app.server.address().port;
const api=async(path,data)=>{const r=await fetch(origin+'/api/admin/'+path,{method:data?'POST':'GET',headers:{Authorization:'Basic '+Buffer.from('admin:'+password).toString('base64'),'Content-Type':'application/json',Origin:origin},...(data?{body:JSON.stringify(data)}:{})});assert(r.ok);return r.json();};
let browser;
try{
 const current=await api('content'),state=await api('content',{revision:current.revision,catalog:prepareOwnerPublication(current.draft)});await api('publish',{revision:state.revision});
 browser=await chromium.launch({args:['--no-sandbox']});
 const page=await browser.newPage({reducedMotion:'reduce'});
 await page.addInitScript(()=>localStorage.setItem('hos-measurement','off'));
 const out=new URL('../test-results/interiors/',import.meta.url);mkdirSync(out,{recursive:true});
 const catalog=await(await fetch(origin+'/content.json')).json();
 for(const width of [320,390,1440]){
  await page.setViewportSize({width,height:1000});await page.goto(origin);
  await page.locator('#hos-concept[data-ready="true"]').waitFor();
  const jumps=page.locator('#hos-home-collection-index .hos-collection-jumps');
  const row=await jumps.locator('a').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {top:r.top,left:r.left,right:r.right};}));
  assert.equal(row.length,5);
  assert(Math.max(...row.map(n=>n.top))-Math.min(...row.map(n=>n.top))<1,'All collection links share one line');
  assert(await jumps.evaluate(n=>n.scrollWidth<=n.clientWidth+1),'All five links fit without horizontal scrolling');
  await jumps.screenshot({path:new URL(width+'-collection-links.jpg',out).pathname,type:'jpeg',quality:90});
  for(const c of catalog.collections){
   const chapter=page.locator('[data-collection-section="'+c.id+'"]');
   const title=chapter.locator('.hos-campaign-heading'),banner=chapter.locator('.hos-collection-photo.hos-collection-interior'),img=banner.locator(':scope > img');
   await banner.scrollIntoViewIfNeeded();await img.evaluate(n=>n.decode());
   assert((await img.getAttribute('src')).includes('campaign-v'));
   const geometry=await banner.evaluate(n=>{const r=n.getBoundingClientRect();return {left:r.left,width:r.width,height:r.height,viewport:innerWidth};});
   assert(Math.abs(geometry.left)<2);assert(Math.abs(geometry.width-geometry.viewport)<2);
   assert(Math.abs(geometry.width/geometry.height-(width<700?.75:1.5))<.02);
   const heading=await title.evaluate(n=>n.getBoundingClientRect().bottom),top=await banner.evaluate(n=>n.getBoundingClientRect().top);assert(heading<=top);
   assert.equal(await chapter.locator('.hos-visual-modes,[data-model-stage]').count(),0);
   const grid=chapter.locator('.hos-equal-works');
   await grid.scrollIntoViewIfNeeded();
   const cards=await grid.locator('.hos-work-card').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {top:r.top,width:r.width};}));
   assert.equal(cards.length,c.workIds.length);
   assert(Math.max(...cards.map(n=>n.top))-Math.min(...cards.map(n=>n.top))<2,'Cards should share a single row');
   if(width<700){
    const before=await grid.evaluate(n=>({width:n.clientWidth,scroll:n.scrollWidth}));assert(before.scroll>before.width);
    await grid.hover();await page.mouse.wheel(240,0);await page.waitForFunction(id=>document.querySelector('[data-collection-section="'+id+'"] .hos-equal-works').scrollLeft>20,c.id);
    await grid.evaluate(n=>n.scrollTo({left:n.scrollWidth,behavior:'instant'}));
    const last=await grid.evaluate(n=>{const a=n.lastElementChild.getBoundingClientRect(),b=n.getBoundingClientRect();return a.right<=b.right+2;});assert(last,'Last sculpture must be reachable');
    await grid.evaluate(n=>n.scrollTo({left:0,behavior:'instant'}));
    await grid.screenshot({path:new URL(width+'-'+c.id+'-carousel.jpg',out).pathname,type:'jpeg',quality:88});
   }
   await banner.screenshot({path:new URL(width+'-'+c.id+'.jpg',out).pathname,type:'jpeg',quality:88});
  }
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 }
 for(const c of catalog.collections){await page.goto(origin+'/collections/'+c.slug);await page.locator('#hos-concept[data-ready="true"]').waitFor();assert.equal(await page.locator('#hos-category-content .hos-visual-modes,#hos-category-content [data-model-stage]').count(),0);}
 const star=catalog.works.find(w=>w.id===catalog.collections[0].starWorkId);await page.goto(origin+'/works/'+star.slug);await page.locator('#hos-concept[data-ready="true"]').waitFor();assert(await page.locator('#hos-work-model').isVisible(),'3D remains on sculpture pages');
 console.log('Interior banners and mobile carousel passed: five sources, title-first order, landscape desktop and edge-to-edge portrait mobile.');
}finally{await browser?.close();await new Promise(r=>app.server.close(r));rmSync(dataDir,{recursive:true,force:true});}

