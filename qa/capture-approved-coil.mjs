// Capture the approved Coil GLB with its unmodified materials and the same
// production Three.js lighting. Mobile receives a deterministic sharp poster
// if iOS WebGL presentation is unreliable; this is NOT a replacement model.
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,rmSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright';
import {createApp} from '../server.mjs';

const dir=mkdtempSync(join(tmpdir(),'approved-coil-poster-'));
const target=new URL('../public/assets/making-coil-approved-mobile-v1.png',import.meta.url).pathname;
mkdirSync(new URL('../public/assets/',import.meta.url),{recursive:true});
const app=createApp({dataDir:dir,env:{ADMIN_PASSWORD:'test-only-'+randomUUID()},backgroundNotifications:false});
await new Promise(done=>app.server.listen(0,'127.0.0.1',done));
const origin='http://127.0.0.1:'+app.server.address().port;
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({
  viewport:{width:390,height:844},deviceScaleFactor:2,
  isMobile:true,hasTouch:true
 });
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(origin+'/prototypes/stone-to-sculpture.html',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.getElementById('render')?.dataset.renderMode==='precomputed-v6');
 await page.evaluate(()=>{
  const journey=document.querySelector('.journey'),stage=document.querySelector('.stage');
  scrollTo(0,Math.round(journey.getBoundingClientRect().top+scrollY+.983*(journey.offsetHeight-stage.offsetHeight)));
 });
 await page.waitForFunction(()=>{
  const host=document.getElementById('render');
  return host.dataset.approvedModelState==='ready'&&host.dataset.approvedModelVisible==='true';
 },null,{timeout:35000});
 const model=await page.evaluate(()=>({
  url:document.getElementById('render').dataset.approvedModelUrl,
  materials:document.getElementById('render').dataset.approvedMaterialsPreserved,
  meshCount:document.getElementById('render').dataset.approvedMeshCount
 }));
 assert.equal(model.url,'/models/coil-uploaded-v1.glb');
 assert.equal(model.materials,'true');
 assert(Number(model.meshCount)>0);
 // Only the actual WebGL image: remove editorial UI and scroll overlays.
 await page.evaluate(()=>{
  for(const selector of ['.stage-info','.stage-footer','.topbar','.skip','.stage-vignette',
     '#archive-cutaway','#craft-detail','#heating-study']){
   const el=document.querySelector(selector);if(el)el.style.display='none';
  }
  const layer=document.querySelector('.approved-coil-reveal');
  layer.style.visibility='visible';layer.style.opacity='1';
 });
 await page.screenshot({path:target,animations:'disabled'});
 assert(statSync(target).size>35000,'Approved final poster is unexpectedly small');
 assert.deepEqual(errors,[],'Approved GLB browser loading errors');
 console.log(JSON.stringify({approvedModel:model,poster:target,bytes:statSync(target).size}));
}finally{
 await browser?.close();
 await new Promise(resolve=>app.server.close(resolve));
 rmSync(dir,{recursive:true,force:true});
}
