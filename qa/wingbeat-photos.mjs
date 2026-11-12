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
 browser=await chromium.launch({args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({reducedMotion:'reduce'});
 await page.addInitScript(()=>localStorage.setItem('hos-measurement','off'));
 const out=new URL('../test-results/interiors/',import.meta.url);mkdirSync(out,{recursive:true});

 for(const width of [390,1440]){
  await page.setViewportSize({width,height:1000});await page.goto(origin);
  await page.locator('#hos-concept[data-ready="true"]').waitFor();
  
  const homeImage=page.locator('[data-collection-section="wild-grace"] a[data-work="zsa-016"] img').first();
  assert((await homeImage.getAttribute('src')).includes('wingbeat-shoot-front-v1'));
  const catalog=await(await fetch(origin+'/content.json')).json(),work=catalog.works.find(w=>w.id==='zsa-016');
  await page.goto(origin+'/works/'+work.slug);await page.locator('#hos-concept[data-ready="true"]').waitFor();
  const image=page.locator('#hos-work-image');await image.evaluate(n=>n.decode());
  assert((await image.getAttribute('src')).includes('wingbeat-shoot-front-v1'));
  for(const side of ['left','right','back']){
   await page.locator('#hos-work-additional-images').getByRole('button',{name:'Show '+side,exact:true}).click();
   await image.evaluate(n=>n.decode());
   assert((await image.getAttribute('src')).includes('wingbeat-shoot-'+side+'-v1'));
   assert.equal(await image.evaluate(n=>getComputedStyle(n).objectFit),'contain');
   await page.locator('.hos-work-photo').screenshot({path:new URL(width+'-wingbeat-'+side+'.jpg',out).pathname,type:'jpeg',quality:90});
  }
  await page.locator('#hos-work-additional-images').getByRole('button',{name:'Show front',exact:true}).click();await image.evaluate(n=>n.decode());
  await page.locator('[data-page="work"]').screenshot({path:new URL(width+'-wingbeat-front.jpg',out).pathname,type:'jpeg',quality:90});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  assert(await page.locator('#hos-work-model').isVisible());
  await page.locator('#hos-work-model').click();
  const stage=page.locator('#hos-model-stage');
  await page.waitForFunction(()=>document.querySelector('#hos-model-stage').dataset.modelState==='ready',null,{timeout:60000});
  const canvas=stage.locator('canvas.hos-3d-canvas');const before=await canvas.screenshot();
  const box=await canvas.boundingBox();
  await page.mouse.move(box.x+box.width*.4,box.y+box.height*.5);await page.mouse.down();await page.mouse.move(box.x+box.width*.7,box.y+box.height*.5,{steps:10});await page.mouse.up();
  const after=await canvas.screenshot();assert(!before.equals(after),'Dragging must rotate the rendered model');
  await page.locator('#hos-model-dialog').screenshot({path:new URL(width+'-wingbeat-model.jpg',out).pathname,type:'jpeg',quality:94});
  await page.locator('#hos-model-close').click();
 }
 console.log('Wingbeat photos passed: homepage, four gallery angles, contain fit, mobile and desktop, owner-approved 3D loads and rotates.');
}finally{await browser?.close();await new Promise(r=>app.server.close(r));rmSync(dataDir,{recursive:true,force:true});}

