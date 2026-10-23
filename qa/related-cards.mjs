import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {randomUUID} from 'node:crypto';
import {chromium,firefox,webkit} from 'playwright';
import {createApp} from '../server.mjs';import {prepareOwnerPublication} from '../scripts/publish-owner-release.mjs';
const dataDir=mkdtempSync(join(tmpdir(),'hos-related-cards-')),password=randomUUID(),name=process.env.QA_ENGINE||'chromium';
const app=createApp({dataDir,env:{ADMIN_PASSWORD:password},backgroundNotifications:false});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+app.server.address().port;
const api=async(path,data)=>{const response=await fetch(origin+'/api/admin/'+path,{headers:{Authorization:'Basic '+Buffer.from('admin:'+password).toString('base64'),'Content-Type':'application/json',Origin:origin},...(data?{method:'POST',body:JSON.stringify(data)}:{})});assert(response.ok);return response.json();};
let browser;
try{
 const current=await api('content');const state=await api('content',{revision:current.revision,catalog:prepareOwnerPublication(current.draft)});await api('publish',{revision:state.revision});
 browser=await({chromium,firefox,webkit}[name]).launch(name==='chromium'?{args:['--no-sandbox']}:{});
 const page=await browser.newPage({reducedMotion:'reduce'});await page.addInitScript(()=>localStorage.setItem('hos-measurement','off'));
 const errors=[];page.on('pageerror',e=>errors.push(e.message));const counts=new Set();let cards=0;
 for(const width of [320,390,768,1024,1440]){
  await page.setViewportSize({width,height:1000});
  for(const slug of ['zsa-page-1','zsa-page-5','zsa-page-13']){
   assert((await page.goto(origin+'/works/'+slug)).ok());await page.locator('#hos-concept[data-ready="true"]').waitFor();await page.evaluate(()=>document.fonts.ready);
   const rails=page.locator('#hos-work-related .hos-related-rail');
   for(let index=0;index<await rails.count();index++){
    const rail=rails.nth(index);counts.add(await rail.locator('.hos-work-card').count());
    const boxes=await rail.locator('.hos-work-card').evaluateAll(nodes=>nodes.map(card=>{const photo=card.querySelector('.hos-work-card-photo').getBoundingClientRect(),copy=card.querySelector('.hos-work-card-copy').getBoundingClientRect();return{photo:{width:photo.width,bottom:photo.bottom},copy:{width:copy.width,top:copy.top},href:card.querySelector('.hos-work-card-copy [data-work]').getAttribute('href')};}));
    for(const box of boxes){assert(box.copy.width>=Math.min(200,box.photo.width-1),`${slug} at ${width}px: related copy collapsed to ${box.copy.width}px`);assert(box.copy.top>=box.photo.bottom-1,`${slug} at ${width}px: related captions must follow the image`);assert(box.href.startsWith('/works/'));cards++;}
   }
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  }
 }
 assert.deepEqual([...counts].sort(),[1,2,3]);assert.deepEqual(errors,[]);
 const output=new URL('../test-results/browser/',import.meta.url);mkdirSync(output,{recursive:true});await page.goto(origin+'/works/zsa-page-1');await page.locator('#hos-concept[data-ready="true"]').waitFor();const rail=page.locator('#hos-work-related .hos-related-rail').last();await rail.scrollIntoViewIfNeeded();await rail.locator('img').evaluateAll(images=>Promise.all(images.map(image=>image.decode())));await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await page.screenshot({path:new URL('related-cards-'+name+'.jpg',output).pathname,type:'jpeg',quality:90});
 console.log(`Related-card QA passed (${name}): ${cards} cards, one/two/three-work rows, five viewport widths, normal captions and sculpture links.`);
}finally{await browser?.close();await new Promise(r=>app.server.close(r));rmSync(dataDir,{recursive:true,force:true});}
