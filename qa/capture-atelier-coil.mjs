// Deterministically bake the untouched original Coil GLB without the old
// generic beige plinth. Only this new editorial page opts into the no-plinth
// presentation. Original collection and other viewers are untouched.
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,rmSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright';
import {createApp} from '../server.mjs';
const dir=mkdtempSync(join(tmpdir(),'atelier-model-'));
const out=new URL('../public/assets/making-atelier-final-mobile-v1.png',import.meta.url).pathname;
mkdirSync(new URL('../public/assets/',import.meta.url),{recursive:true});
const app=createApp({dataDir:dir,env:{ADMIN_PASSWORD:'test-only-'+randomUUID()},backgroundNotifications:false});
await new Promise(ok=>app.server.listen(0,'127.0.0.1',ok));
const origin='http://127.0.0.1:'+app.server.address().port;
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/prototypes/stone-to-sculpture.html?capture-approved-coil=1',{waitUntil:'domcontentloaded'});
 await page.evaluate(()=>document.querySelector('#render').dataset.atelierNoPlinth='true');
 await page.waitForFunction(()=>document.querySelector('#render').dataset.renderMode==='precomputed-v6');
 await page.evaluate(()=>{
  const journey=document.querySelector('.journey'),stage=document.querySelector('.stage');
  scrollTo(0,Math.round(journey.getBoundingClientRect().top+scrollY+.995*(journey.offsetHeight-stage.offsetHeight)));
 });
 await page.waitForFunction(()=>{
  const host=document.getElementById('render');
  return host.dataset.approvedModelState==='ready'&&host.dataset.approvedModelVisible==='true'
   &&host.dataset.approvedPlinthVisible==='false';
 },null,{timeout:45000});
 const source=await page.evaluate(()=>({
  model:document.getElementById('render').dataset.approvedModelUrl,
  material:document.getElementById('render').dataset.approvedMaterialsPreserved,
  meshes:Number(document.getElementById('render').dataset.approvedMeshCount)
 }));
 assert.equal(source.model,'/models/coil-uploaded-v1.glb');
 assert.equal(source.material,'true');
 assert(source.meshes>=1);
 // Hide all overlay UI. The image is an actual lit rendering from Coil, not
 // an invented approximation or manually recoloured sculpture.
 await page.evaluate(()=>{
  for(const element of document.querySelectorAll('header,.stage-info,.stage-footer,.skip,.stage-vignette,.archive-cutaway,.heating-study,.craft-detail-cutaway'))
   element.style.display='none';
  for(const image of document.querySelectorAll('.making-v6-image'))image.style.visibility='hidden';
  const layer=document.querySelector('#render .approved-coil-reveal');
  layer.style.opacity='1';layer.style.visibility='visible';
  layer.style.filter='none';
 });
 await page.screenshot({path:out,animations:'disabled'});
 assert(statSync(out).size>35000,'Incorrect original Coil render output');
 assert.deepEqual(errors,[],'Original Coil loading emitted JS errors');
 console.log('Approved Coil without generic plinth:',out,statSync(out).size,'bytes; meshes',source.meshes);
}finally{
 await browser?.close();
 await new Promise(ok=>app.server.close(ok));
 rmSync(dir,{recursive:true,force:true});
}
