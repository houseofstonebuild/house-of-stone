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
    plinthBlend:Number(document.getElementById('render').dataset.approvedPlinthBlend),
    documentaryMode:document.querySelector('.stage').dataset.documentaryLayout,
    documentaryScrubbed:document.getElementById('archive-cutaway').dataset.scrollControlled,
    mobileStoneOpacity:getComputedStyle(document.getElementById('render')).getPropertyValue('--processStoneOpacity'),
    videoTime:document.getElementById('archive-film').currentTime}));
   assert.equal(state.phase,expected,'Incorrect stage at '+p+' in '+v.width);
   assert(state.overflow<=2,'Horizontal overflow '+v.width);
   if(p<.86)assert.equal(state.canvasCount,0,'Carving and heating must not load WebGL');
   if(p>=.305)assert.match(state.image,/making-v6\/.*\/frame_/);
   if(p===.64){
    assert.equal(state.documentaryScrubbed,'true','Workshop footage must be scroll-controlled');
    assert.equal(state.videoPaused,true,'Workshop film must not autoplay or loop');
    assert.notEqual(state.physicalTool,'true','Cartoon on-stone tool overlay should not load');
    assert.equal(await page.locator('#carving-tools').count(),0,'Outdated SVG tools must be absent');
    if(v.width>800){
     assert(state.cutawayOpacity>.8,'Large editorial documentary should accompany desktop carving');
     const playback=await page.evaluate(()=>({
      ready:document.getElementById('archive-cutaway').dataset.seekReady,
      paused:document.getElementById('archive-film').paused,
      workFrame:Number(document.getElementById('archive-cutaway').dataset.workFrame),
      atlas:getComputedStyle(document.getElementById('archive-mobile-frames')).display,
      duration:document.getElementById('archive-film').duration
     }));
     assert(playback.paused,'Documentary must never independently play');
     assert(playback.workFrame>0,'Documentary atlas must advance with scroll');
     if(playback.ready==='true'){
      await page.waitForFunction(()=>{
       const film=document.getElementById('archive-film');
       const expected=(.64-.565)/.20*(film.duration-.08);
       return film.paused&&Math.abs(film.currentTime-expected)<.65;
      },null,{timeout:15000});
     }else{
      assert.equal(playback.atlas,'block','A paused video must have a real-footage fallback for scroll scrub');
     }
    }else{
     assert.equal(state.documentaryMode,'mobile-standalone','Phone video must occupy its own scene');
     assert(state.cutawayOpacity>0,'Phone work must show real footage');
     assert.equal(await page.evaluate(()=>getComputedStyle(document.getElementById('archive-cutaway')).display),'block');
     assert(Number(state.mobileStoneOpacity)<.01,'Mobile film must not overlap a visible sculpture');
     await move(page,.688);
     await page.waitForFunction(()=>Number(getComputedStyle(document.querySelector('.stage')).getPropertyValue('--processStoneOpacity'))>.9,{timeout:15000});
     await move(page,.64);
     const atlas=await page.evaluate(()=>getComputedStyle(document.querySelector('#archive-cutaway .archive-mobile-frames')).display);
     assert.equal(atlas,'block','Mobile footage must use the scroll-synced real-film atlas');
    }
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
   const wanted=Math.round((p-.305)/.695*143);
   await page.waitForFunction(wanted=>{
    const host=document.getElementById('render');
    return Math.abs(Number(host.dataset.frameIndex)-wanted)<=2&&host.dataset.staleFrameHidden==='true';
   },wanted,{timeout:30000});
   if(Math.abs(p-.64623)<.0001){
    await page.waitForFunction(()=>Number(document.getElementById('archive-cutaway').dataset.workFrame)>1,{timeout:15000});
   }
   await page.screenshot({path:new URL(v.engine+'-'+v.width+'-carve-'+Math.round(p*1000)+'.png',output).pathname});
  }
  if(v.width>800){
   await move(page,.71);
   await page.waitForFunction(()=>Math.abs(Number(document.querySelector('#archive-cutaway').dataset.workFrame)-30)<=2,{timeout:15000});
   await move(page,.59);
   await page.waitForFunction(()=>Math.abs(Number(document.querySelector('#archive-cutaway').dataset.workFrame)-5)<=2,{timeout:15000});
   const player=await page.evaluate(()=>({paused:document.getElementById('archive-film').paused,loop:document.getElementById('archive-film').loop}));
   assert(player.paused&&!player.loop,'The film must stop and reverse rather than free-run');
  }else{
   await move(page,.59);
   await page.waitForFunction(()=>Math.abs(Number(document.querySelector('#archive-cutaway').dataset.workFrame)-5)<=2,{timeout:15000});
   await move(page,.64);
   await page.waitForFunction(()=>Math.abs(Number(document.querySelector('#archive-cutaway').dataset.workFrame)-15)<=2,{timeout:15000});
   await move(page,.578);
   await page.waitForFunction(()=>Math.abs(Number(document.querySelector('#archive-cutaway').dataset.workFrame)-3)<=2,{timeout:15000});
  }
  await move(page,.40);
  await move(page,.91);
  await move(page,.50);
  await page.waitForFunction(()=>Math.abs(Number(document.getElementById('render').dataset.frameIndex)-40)<=2,{timeout:30000});
  await move(page,.98);
  await move(page,.64);
  const reverse=await page.evaluate(()=>{
   const host=document.getElementById('render');
   const requested=Number(host.dataset.frameRequested),shown=Number(host.dataset.frameIndex);
   const hidden=getComputedStyle(document.querySelector('.making-v6-image:not(.making-v6-previous)')).opacity==='0';
   return {requested,shown,hidden};
  });
  assert(reverse.hidden||Math.abs(reverse.shown-reverse.requested)<=14,
   'Rapid reverse scrolling exposed a finished frame during carving: '+JSON.stringify(reverse));
  await page.waitForFunction(()=>Math.abs(Number(document.getElementById('render').dataset.frameIndex)-Number(document.getElementById('render').dataset.frameRequested))<=2,{timeout:30000});
  assert.deepEqual(errors,[],'Browser errors');
  await page.close();await browser.close();browser=null;
 }
 console.log('Making v6 desktop, mobile WebKit, reversible scroll and footage QA passed');
}finally{await browser?.close();await new Promise(ok=>app.server.close(ok));rmSync(dir,{recursive:true,force:true})}
