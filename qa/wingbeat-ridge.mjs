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

 const failures=[];page.on('pageerror',error=>failures.push(error.message));
 const catalog=await(await fetch(origin+'/content.json')).json(),work=catalog.works.find(w=>w.id==='zsa-016');
 for(const width of [1440,390])for(const version of ['original','corrected','flatter']){
  if(width===390 && version!=='corrected')continue;
  await page.setViewportSize({width,height:1000});
  await page.unroute('**/models/wingbeat-v3.glb');
  if(version==='original')await page.route('**/models/wingbeat-v3.glb',route=>route.fulfill({path:new URL('../public/models/wingbeat-v2.glb',import.meta.url).pathname,contentType:'model/gltf-binary'}));
  if(version==='flatter')await page.route('**/models/wingbeat-v3.glb',route=>route.fulfill({path:new URL('../public/models/wingbeat-v3-flat.glb',import.meta.url).pathname,contentType:'model/gltf-binary'}));
  await page.goto(origin+'/works/'+work.slug);await page.locator('#hos-concept[data-ready="true"]').waitFor();
  await page.locator('#hos-work-model').click();
  const stage=page.locator('#hos-model-stage');
  await page.waitForFunction(()=>document.querySelector('#hos-model-stage').dataset.modelState==='ready',null,{timeout:60000});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  const canvas=stage.locator('canvas.hos-3d-canvas');
  for(const [name,angle] of [['front',0],['three-quarter',-.3],['opposite-quarter',.45],['head-edge',Math.PI/2],['reverse',Math.PI]]){
   await page.getByRole('button',{name:'Reset',exact:true}).click();
   const box=await canvas.boundingBox();let dx=(angle+.3)/.009;
   while(Math.abs(dx)>.001){
    const step=Math.sign(dx)*Math.min(Math.abs(dx),100);
    await page.mouse.move(box.x+box.width*.4,box.y+box.height*.5);await page.mouse.down();
    await page.mouse.move(box.x+box.width*.4+step,box.y+box.height*.5,{steps:4});await page.mouse.up();dx-=step;
   }
   await page.waitForFunction(expected=>Math.abs(Number(document.querySelector('#hos-model-stage').dataset.modelRotation)-expected)<.002,angle);
   await page.locator('#hos-model-dialog').screenshot({path:new URL(width+'-'+version+'-'+name+'.jpg',out).pathname,type:'jpeg',quality:95});
  }
  await page.getByRole('button',{name:'Zoom in',exact:true}).click();
  await page.getByRole('button',{name:'Reset',exact:true}).click();
  await page.locator('#hos-model-close').click();
 }
 assert.deepEqual(failures,[]);
 console.log('Ridge removal candidates rendered at five matched angles; desktop, phone, rotation, zoom, reset and console checks passed.');
}finally{await browser?.close();await new Promise(r=>app.server.close(r));rmSync(dataDir,{recursive:true,force:true});}

