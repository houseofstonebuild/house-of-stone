// Browser QA of the actual unlinked Making v6 page against its baked frames.
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {chromium,webkit} from 'playwright';
import {createApp} from '../server.mjs';

const dir=mkdtempSync(join(tmpdir(),'making-v6-'));
const output=new URL('../test-results/browser/making-v6/',import.meta.url);
mkdirSync(output,{recursive:true});
const app=createApp({dataDir:dir,env:{ADMIN_PASSWORD:'test-only-'+randomUUID()},backgroundNotifications:false});
await new Promise(done=>app.server.listen(0,'127.0.0.1',done));
const origin='http://127.0.0.1:'+app.server.address().port;
const steps=[[.03,0],[.12,1],[.22,2],[.33,3],[.405,4],[.49,5],[.64,6],[.8,7],[.865,8],[.928,9],[.983,10]];
async function move(page,p){
 await page.evaluate(p=>{
  const journey=document.querySelector('.journey'),stage=document.querySelector('.stage');
  scrollTo(0,Math.round(journey.getBoundingClientRect().top+scrollY+p*(journey.offsetHeight-stage.offsetHeight)));
 },p);
}
let browser;
try{
 for(const v of [{engine:'chromium',width:1440,height:900},{engine:'chromium',width:390,height:844},{engine:'webkit',width:375,height:667}]){
  browser=v.engine==='webkit'?await webkit.launch({headless:true}):await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:v.width,height:v.height},deviceScaleFactor:1,hasTouch:v.width<800,isMobile:v.width<800});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.status()>=400&&/making-v6|stone-to-sculpture-v6/.test(r.url()))errors.push(r.status()+' '+r.url())});
  await page.goto(origin+'/prototypes/stone-to-sculpture.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('#render')?.dataset.renderMode==='precomputed-v6',{timeout:45000});
  for(const [i,[p,expected]] of steps.entries()){
   await move(page,p);
   await page.waitForFunction(expected=>Number(document.querySelector('.stage').dataset.phase)===expected,expected,{timeout:15000});
   if(p>=.305){
    const wanted=Math.round((p-.305)/.695*143);
    await page.waitForFunction(wanted=>{
     const host=document.getElementById('render'),img=document.querySelector('.making-v6-image:not(.making-v6-previous)');
     return host.dataset.mobileAtlasPending===''&&Math.abs(Number(host.dataset.frameIndex)-wanted)<=2&&img?.complete&&img.naturalWidth>400;
    },wanted,{timeout:30000});
   }
   const state=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth-innerWidth,
    mode:document.getElementById('render').dataset.renderMode,canvasCount:document.querySelectorAll('#render canvas').length,
    phase:Number(document.querySelector('.stage').dataset.phase),
    image:document.querySelector('.making-v6-image:not(.making-v6-previous)').currentSrc,
    videoPaused:document.getElementById('archive-film').paused,
    cutawayOpacity:parseFloat(getComputedStyle(document.getElementById('archive-cutaway')).opacity),
    tools:document.querySelector('.stage').dataset.craftToolsVisible,
    heat:document.querySelector('.stage').dataset.heatingVisible,
    refine:document.querySelector('.stage').dataset.refiningVisible,
    approved:document.getElementById('render').dataset.approvedModelState,
    approvedMaterials:document.getElementById('render').dataset.approvedMaterialsPreserved,
    approvedModelUrl:document.getElementById('render').dataset.approvedModelUrl,
    physicalTool:document.getElementById('render').dataset.physicalChiselVisible,
    physicalTipX:Number(document.getElementById('render').dataset.physicalTipX),
    physicalTipY:Number(document.getElementById('render').dataset.physicalTipY),
    archiveDisplay:getComputedStyle(document.getElementById('archive-cutaway')).display,
    revealBlend:Number(document.getElementById('render').dataset.approvedRevealBlend),
    plinthBlend:Number(document.getElementById('render').dataset.approvedPlinthBlend)}));
   assert.equal(state.phase,expected,'Incorrect stage at '+p+' in '+v.width);
   assert(state.overflow<=2,'Horizontal overflow '+v.width);
   if(p<.86)assert.equal(state.canvasCount,0,'Carving and heating must not load WebGL');
   if(p>=.305)assert.match(state.image,/making-v6\/.*\/frame_/);
   if(p===.64){
    if(v.width>800)assert(state.cutawayOpacity>.8,'Documentary should accompany desktop carving');
    assert.equal(state.tools,'true','Hammer and chisel must be visibly represented in carving');
    assert.equal(state.physicalTool,'true','A chisel must actually touch the stone, not merely appear in footage');
    assert(state.physicalTipX>.35&&state.physicalTipX<.83,'Chisel tip is detached from the stone horizontally');
    assert(state.physicalTipY>.30&&state.physicalTipY<.68,'Chisel tip is detached from the stone vertically');
    const equipment=await page.evaluate(()=>({
      rig:document.getElementById('carving-tools'),
      chisel:!!document.querySelector('#tool-chisel'),
      mallet:!!document.querySelector('#tool-mallet'),
      visible:getComputedStyle(document.querySelector('#carving-tools')).visibility
    }));
    assert(equipment.rig&&equipment.chisel&&equipment.mallet&&equipment.visible==='visible','Real on-stone tool geometry is missing');
    if(v.width<=800)assert.equal(state.archiveDisplay,'none','Mobile documentary must never cover the stone');
   }
   if(p===.8)assert.equal(state.refine,'true','Hand-refinement panel must appear');
   if(p===.865){
    assert.equal(state.heat,'true','Heating visual must appear during surface preparation');
    await page.waitForFunction(()=>Number(document.getElementById('render').dataset.approvedRevealBlend)>.25,{timeout:30000});
   }
   if(p===.928){
    assert(state.revealBlend>.98,'Approved Coil must already be in place during wax and buffing');
    assert(state.plinthBlend<.05,'The gallery plinth should not appear during waxing');
   }
   if(p===.983){
    await page.waitForFunction(()=>{
     const status=document.querySelector('#render').dataset.approvedModelState;
     return status==='ready'||status==='error';
    },null,{timeout:30000});
    const approved=await page.evaluate(()=>({
     status:document.querySelector('#render').dataset.approvedModelState,
     url:document.querySelector('#render').dataset.approvedModelUrl,
     materials:document.querySelector('#render').dataset.approvedMaterialsPreserved,
     visible:document.querySelector('#render').dataset.approvedModelVisible,
     canvas:document.querySelectorAll('#render .approved-coil-canvas').length,
     presentation:document.querySelector('#render').dataset.approvedPresentation
    }));
    assert.equal(approved.status,'ready','The final artwork must use actual GLB, not a pre-render fallback');
    assert.equal(approved.url,'/models/coil-uploaded-v1.glb');
    assert.equal(approved.materials,'true','Original Coil materials must be preserved');
    assert.equal(approved.visible,'true');
    assert(state.revealBlend>.99,'Late-stage final must not require a model crossfade');
    assert(state.plinthBlend>.93,'Gallery plinth must finish fading in');
    if(v.width<=800){
     assert.equal(approved.canvas,0,'Phone ending must avoid unreliable WebKit canvas');
     assert.equal(approved.presentation,'baked-original-glb','Mobile finale must use the approved-GLB poster, not a generic or fallback image');
     await page.waitForFunction(()=>[...document.querySelectorAll('#render .approved-mobile-workshop,#render .approved-mobile-still')].length===2&&[...document.querySelectorAll('#render .approved-mobile-workshop,#render .approved-mobile-still')].every(el=>el.complete&&el.naturalWidth>400),null,{timeout:25000});
    }else assert.equal(approved.canvas,1);
   }
   if(p===.983)assert(state.videoPaused,'Documentary must pause outside the carving interval');
   await page.screenshot({path:new URL(v.engine+'-'+v.width+'-'+String(i).padStart(2,'0')+'.png',output).pathname});
  }
  for(const p of [.586,.616,.64623,.65,.688,.728,.760]){
   await move(page,p);
   if(Math.abs(p-.64623)<.0001){
    await page.waitForFunction(()=>document.getElementById('render').dataset.physicalStrikeContact==='true',{timeout:15000});
   }
   await page.screenshot({path:new URL(v.engine+'-'+v.width+'-carve-'+Math.round(p*1000)+'.png',output).pathname});
  }
  await move(page,.40);
  await move(page,.91);
  await move(page,.50);
  assert.deepEqual(errors,[],'Browser errors');
  await page.close();await browser.close();browser=null;
 }
 console.log('Making v6 desktop, mobile WebKit, reversible scroll and footage QA passed');
}finally{await browser?.close();await new Promise(ok=>app.server.close(ok));rmSync(dir,{recursive:true,force:true})}
