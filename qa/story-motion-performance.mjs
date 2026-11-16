// Browser performance sampling on the review branch. Never deploys to Railway.
// Measures actual request/decode/paint delay at target scroll locations and
// samples RAF pacing on Chromium desktop and iPhone-sized WebKit.
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {chromium,webkit} from 'playwright';
import {createApp} from '../server.mjs';
const dir=mkdtempSync(join(tmpdir(),'hos-motion-review-'));
const folder=new URL('../test-results/browser/making-atelier/',import.meta.url);
mkdirSync(folder,{recursive:true});
const app=createApp({dataDir:dir,env:{ADMIN_PASSWORD:'motion-review-'+randomUUID()},backgroundNotifications:false});
await new Promise(done=>app.server.listen(0,'127.0.0.1',done));
const base='http://127.0.0.1:'+app.server.address().port;
const results=[];
let browser;
try{
 for(const config of [
   {device:'desktop-chromium',browser:chromium,width:1440,height:900,mobile:false},
   {device:'iphone-webkit',browser:webkit,width:390,height:844,mobile:true},
   {device:'compact-iphone-webkit',browser:webkit,width:375,height:667,mobile:true}
 ]){
  browser=await config.browser.launch({headless:true,
    ...(config.browser===chromium?{args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']}: {})});
  const page=await browser.newPage({viewport:{width:config.width,height:config.height},
     deviceScaleFactor:1,isMobile:config.mobile,hasTouch:config.mobile});
  const exceptions=[];
  page.on('pageerror',e=>exceptions.push(e.message));
  await page.goto(base+'/prototypes/making-atelier.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.documentElement.dataset.makingAtelier==='ready');
  await page.waitForFunction(()=>window.__mabwePerformance?.().coil?.edition);
  const atlasReview=await page.evaluate(async()=>{
   try{const r=await fetch('/assets/making-film-atlas-v1/manifest.json');return r.ok}
   catch{return false}
  });
  if(atlasReview)await page.waitForFunction(()=>
   window.__mabwePerformance().filmAtlas.ready>=8,null,{timeout:30000});
  const chapters=[];
  for(const section of ['carving','detail','finishing']){
   const sample=await page.evaluate(async section=>{
    const node=document.querySelector('[data-scene="'+section+'"]');
    const start=scrollY+node.getBoundingClientRect().top;
    const span=Math.max(1,node.offsetHeight-innerHeight);
    const before=window.__mabwePerformance();
    const frames=[],lag=[],started=performance.now();
    let prev=started,old=-1,readyChanges=0;
    await new Promise(resolve=>{
     function step(now){
      const t=Math.min(1,(now-started)/1100);
      // Includes acceleration and deceleration, simulating intentional
      // finger scrolling rather than snapping between static screenshots.
      const eased=t*t*(3-2*t);
      scrollTo(0,Math.round(start+span*eased));
      frames.push(now-prev);prev=now;
      const nodeFrame=section==='carving'?document.querySelector('.carving-media'):
        document.querySelector(section==='detail'?'#formationStage':'#polishStage');
      const desired=Number(nodeFrame.dataset.requestedFrame),shown=Number(nodeFrame.dataset.displayedFrame);
      if(Number.isFinite(desired)&&Number.isFinite(shown))lag.push(Math.abs(desired-shown));
      if(shown!==old){readyChanges++;old=shown}
      if(t>=1){resolve();return}
      requestAnimationFrame(step);
     }
     requestAnimationFrame(step);
    });
    await new Promise(resolve=>setTimeout(resolve,350));
    const finalNode=section==='carving'?document.querySelector('.carving-media'):
      document.querySelector(section==='detail'?'#formationStage':'#polishStage');
    const after=window.__mabwePerformance();
    frames.sort((a,b)=>a-b);lag.sort((a,b)=>a-b);
    const percentile=(items,p)=>items.length?items[Math.floor((items.length-1)*p)]:null;
    return {section,rafCount:frames.length,rafP95ms:percentile(frames,.95),
      maxFrameLag:lag.at(-1)??null,p95FrameLag:percentile(lag,.95),
      visibleChanges:readyChanges,finalRequested:Number(finalNode.dataset.requestedFrame),
      finalDisplayed:Number(finalNode.dataset.displayedFrame),
      before,after,
      overflow:document.documentElement.scrollWidth-innerWidth};
   },section);
   assert(sample.overflow<=2,config.device+' overflow in '+section);
   assert(sample.rafCount>=8,config.device+' animation frame loop stalled in '+section);
   if(atlasReview&&section==='carving')
    assert(sample.visibleChanges>=10,config.device+' documentary remains too jerky while scrubbing');
   assert(sample.after.film.inflight<4,config.device+' film decoding exceeded budget');
   assert(sample.after.coil.carve.inflight<4&&sample.after.coil.polish.inflight<4,
     config.device+' Coil decoder exceeded concurrent budget');
   await page.waitForFunction(section=>{
     const stage=document.querySelector(section==='carving'?'.carving-media':
       section==='detail'?'#formationStage':'#polishStage');
     return Number(stage.dataset.displayedFrame)===Number(stage.dataset.requestedFrame);
   },section,{timeout:25000});
   chapters.push(sample);
   console.log(config.device,section,'p95 RAF',sample.rafP95ms,'visible frame changes',sample.visibleChanges);
  }
  results.push({device:config.device,chapters,exceptions});
  assert.deepEqual(exceptions,[],config.device+' JS errors');
  await page.close();await browser.close();browser=null;
 }
 writeFileSync(new URL('motion-performance.json',folder),JSON.stringify(results,null,2));
 console.log('Motion performance baselines captured without touching public deployment');
}finally{
 await browser?.close();
 await new Promise(done=>app.server.close(done));
 rmSync(dir,{recursive:true,force:true});
}
