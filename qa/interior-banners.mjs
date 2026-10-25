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
 for(const width of [390,1440]){
  await page.setViewportSize({width,height:1000});await page.goto(origin);
  await page.locator('#hos-concept[data-ready="true"]').waitFor();
  for(const c of catalog.collections){
   const chapter=page.locator('[data-collection-section="'+c.id+'"]');
   const title=chapter.locator('.hos-campaign-heading'),banner=chapter.locator('.hos-collection-photo.hos-collection-interior'),img=banner.locator(':scope > img');
   await img.evaluate(n=>n.decode());
   assert((await img.getAttribute('src')).includes('campaign-v2'));
   const geometry=await banner.evaluate(n=>{const r=n.getBoundingClientRect();return {left:r.left,width:r.width,height:r.height,viewport:innerWidth};});
   assert(Math.abs(geometry.left)<2);assert(Math.abs(geometry.width-geometry.viewport)<2);
   assert(Math.abs(geometry.width/geometry.height-(width<700?.75:1.5))<.02);
   const heading=await title.evaluate(n=>n.getBoundingClientRect().bottom),top=await banner.evaluate(n=>n.getBoundingClientRect().top);assert(heading<=top);
   await banner.screenshot({path:new URL(width+'-'+c.id+'.jpg',out).pathname,type:'jpeg',quality:88});
  }
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 }
 console.log('Interior banners passed: five sources, title-first order, landscape desktop and edge-to-edge portrait mobile.');
}finally{await browser?.close();await new Promise(r=>app.server.close(r));rmSync(dataDir,{recursive:true,force:true});}
