import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright';
import {createApp} from '../server.mjs';

const screenshots=new URL('../test-results/browser/making-v4/',import.meta.url);
mkdirSync(screenshots,{recursive:true});
const dataDir=mkdtempSync(join(tmpdir(),'hos-making-v4-'));
const app=createApp({dataDir,env:{ADMIN_PASSWORD:'test-only-'+randomUUID()},backgroundNotifications:false});
await new Promise(ok=>app.server.listen(0,'127.0.0.1',ok));
const origin='http://127.0.0.1:'+app.server.address().port;
let browser;
const scrollTo=async(page,p)=>{
 await page.evaluate(f=>{
  const element=document.querySelector('.journey');
  const top=element.getBoundingClientRect().top+scrollY;
  window.scrollTo(0,Math.round(top+f*(element.offsetHeight-innerHeight)));
 },p);
 await page.waitForTimeout(390);
};
try{
 browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const rows=[];
 for(const view of [{width:1440,height:900},{width:390,height:844}]){
  const page=await browser.newPage({viewport:view,deviceScaleFactor:1,hasTouch:view.width<800});
  const errors=[];
  page.on('pageerror',err=>errors.push(err.message));
  page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text())});
  page.on('response',r=>{if(r.status()>=400&&/coil-uploaded|stone-to-sculpture/.test(r.url()))errors.push(r.status()+' '+r.url())});
  await page.goto(origin+'/prototypes/stone-to-sculpture.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('#render')?.dataset.modelReady==='true'||document.querySelector('#render')?.dataset.modelError==='true',{timeout:45000});
  assert.equal(await page.locator('#render').getAttribute('data-model-ready'),'true','Approved Coil GLB must load');
  const steps=[[0,0],[.12,1],[.22,2],[.33,3],[.405,4],[.49,5],[.64,6],[.8,7],[.865,8],[.928,9],[.983,10]];
  let countryBox,regionBox;
  for(const [i,[p,expected]] of steps.entries()){
   await scrollTo(page,p);
   const info=await page.evaluate(()=>({phase:Number(document.querySelector('.stage').dataset.phase),
    docWidth:document.documentElement.scrollWidth,viewport:innerWidth,
    countryBox:document.getElementById('origin-map').getAttribute('viewBox'),
    mapOpacity:getComputedStyle(document.querySelector('.map-scene')).opacity,
    modelReady:document.getElementById('render').dataset.modelReady,
    markerOpacity:document.getElementById('transport-marker').getAttribute('opacity'),
    contactError:document.getElementById('render').dataset.contactError,
    hammerClosed:document.getElementById('render').dataset.hammerClosed,
    canvasWidth:document.querySelector('#render canvas')?.width||0, maskReady:document.getElementById('render').dataset.carveMaskReady, carve:document.getElementById('render').dataset.carveProgress, margin:document.getElementById('render').dataset.materialMargin}));
   assert.equal(info.phase,expected,`Incorrect stage ${view.width}px at ${p}: ${JSON.stringify(info)}`);
   assert(info.docWidth<=info.viewport+2,`Unexpected horizontal overflow: ${JSON.stringify(info)}`);
   assert(info.canvasWidth>0,'WebGL canvas must remain allocated');
   if(i===0)countryBox=info.countryBox;
   if(i===1){regionBox=info.countryBox;assert.notEqual(regionBox,countryBox,'Map should zoom into the Guruve region');}
   if(i===2)assert.equal(info.markerOpacity,'1','Illustrative stone transport marker should follow route');
   assert.equal(info.maskReady,'true','Coil geometry silhouette field unavailable');
   if(i===6)assert(Number(info.carve)>.07&&Number(info.carve)<.98,'Stone needs to be shaped progressively');
   if(i===5 && info.hammerClosed==='true')assert(Number(info.contactError)<.06,'Hammer head misses the chisel cap');
   const file=new URL(`${view.width}-${String(i).padStart(2,'0')}.png`,screenshots).pathname;
   await page.screenshot({path:file,fullPage:false});
   rows.push({width:view.width,p,phase:info.phase,contact:info.contactError||null});
  }
  // Sample known closed strike positions across the sculpting pass. The chisel cap
  // and hammer face must physically coincide in world space at every contact.
  const invSmooth=value=>{let lo=0,hi=1;for(let i=0;i<24;i++){
    const m=(lo+hi)*.5;if(m*m*(3-2*m)<value)lo=m;else hi=m;
  }return (lo+hi)*.5;};
  for(const n of [3,9,15,21,26]){
    const desiredCarve=(n+.82)/28;
    const p=.53+.235*invSmooth(desiredCarve);
    await scrollTo(page,p);
    const {closed,error,material,carveProgress}=await page.evaluate(()=>({
     closed:document.getElementById('render').dataset.hammerClosed,
     error:Number(document.getElementById('render').dataset.contactError),
     material:Number(document.getElementById('render').dataset.materialMargin),
     carveProgress:Number(document.getElementById('render').dataset.carveProgress)
    }));
    assert.equal(closed,'true','Hammer should close exactly at stone-removal event');
    assert(error<.055,`Hammer face misses chisel head: ${error}`);
    assert(carveProgress>0&&carveProgress<1,'Stone shaping should be incomplete at intermediate strikes');
    assert(Number.isFinite(material),'Missing live material carving field');
  }
  assert.deepEqual(errors,[],`Browser errors: ${errors.join('; ')}`);
  await page.close();
 }
 const reducedPage=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
 await reducedPage.goto(origin+'/prototypes/stone-to-sculpture.html',{waitUntil:'domcontentloaded'});
 await reducedPage.locator('#render[data-model-ready="true"]').waitFor({timeout:45000});
 await reducedPage.locator('#skip').click();
 assert((await reducedPage.locator('#finished').boundingBox()).y<844,'Skip button should move to finished work');
 await reducedPage.close();
 console.log('Making v4 geographic camera, 3D carving and contact QA passed:',JSON.stringify(rows));
}finally{
 await browser?.close();
 await new Promise(ok=>app.server.close(ok));
 rmSync(dataDir,{recursive:true,force:true});
}
