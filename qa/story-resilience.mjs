// Slow-network and responsive stress tests for the isolated story, not production.
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server.mjs';
const temporary=mkdtempSync(join(tmpdir(),'hos-stress-'));
const app=createApp({dataDir:temporary,env:{ADMIN_PASSWORD:'test-only-'+Date.now()},backgroundNotifications:false});
await new Promise(ok=>app.server.listen(0,'127.0.0.1',ok));
const root='http://127.0.0.1:'+app.server.address().port;
let browser;
try{
 for(const config of [
  {driver:chromium,width:1440,height:900},
  {driver:webkit,width:320,height:640},
  {driver:webkit,width:430,height:932},
  {driver:chromium,width:768,height:1024}
 ]){
  browser=await config.driver.launch({headless:true,
   ...(config.driver===chromium?{args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']}: {})});
  const page=await browser.newPage({viewport:{width:config.width,height:config.height},
   deviceScaleFactor:1,isMobile:config.width<=700,hasTouch:config.width<=700});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  // Model a constrained connection without monkey-patching the fetch API.
  // Confirm the posters are painted while each real frame is loading.
  if(config.width===320){
   await page.route(/\/assets\/(making-v8|making-cinema-frames-v4|making-film-atlas-v1)\//,
    async route=>{
     await new Promise(resolve=>setTimeout(resolve,85));
     await route.continue();
    });
  }
  await page.goto(root+'/prototypes/making-atelier.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.documentElement.dataset.makingAtelier==='ready');
  for(const chapter of ['origin','carving','detail','finishing','reveal','house']){
   await page.evaluate(({chapter,progress})=>{
    const section=document.querySelector('[data-scene="'+chapter+'"]');
    scrollTo(0,section.offsetTop+Math.max(0,section.offsetHeight-innerHeight)*progress);
   },{chapter,progress:.68});
   await page.waitForFunction(chapter=>
    document.body.dataset.currentChapter===chapter||
    document.querySelector('[data-scene="'+chapter+'"]')?.dataset.progress,
    chapter,{timeout:16000});
   const state=await page.evaluate(chapter=>{
    const scene=document.querySelector('[data-scene="'+chapter+'"]');
    const heading=scene?.querySelector('h1,h2');
    const box=heading?.getBoundingClientRect();
    return {overflow:document.documentElement.scrollWidth-innerWidth,
     headingVisible:!box||box.width>0&&box.left>=-2&&box.right<=innerWidth+3,
     fallback:chapter==='detail'?document.querySelector('.formation-poster img')?.naturalWidth:
      chapter==='finishing'?document.querySelector('.polish-poster img')?.naturalWidth:null};
   },chapter);
   assert(state.overflow<=2,`Horizontal overflow at ${config.width}px ${chapter}`);
   assert(state.headingVisible,`Heading clipped at ${config.width}px ${chapter}`);
   if(state.fallback!==null)assert(state.fallback>0,'No immediately paintable sculpture poster');
  }
  for(const [chapter,selector] of [['carving','.carving-media'],
                                   ['detail','#formationStage'],['finishing','#polishStage']]){
   for(const progress of [.84,.14,.63,.32,.91]){
    await page.evaluate(({chapter,progress})=>{
     const section=document.querySelector('[data-scene="'+chapter+'"]');
     scrollTo(0,section.offsetTop+Math.max(0,section.offsetHeight-innerHeight)*progress);
    },{chapter,progress});
    await page.waitForTimeout(70);
   }
   await page.waitForFunction(selector=>{
    const el=document.querySelector(selector);
    return Number(el.dataset.displayedFrame)===Number(el.dataset.requestedFrame);
   },selector,{timeout:26000});
  }
  const perf=await page.evaluate(()=>window.__mabwePerformance());
  for(const s of [perf.film,perf.coil.carve,perf.coil.polish]){
   assert(s.inflight<=3,'Decode concurrency exceeded its limit');
   assert(s.ready<=(config.width<=700?12:18),'Decoded frame budget exceeded its limit');
  }
  assert.deepEqual(errors,[],`Runtime exception at ${config.width}px`);
  console.log('Slow/standard network reverse scroll verified at '+config.width+'x'+config.height);
  await page.close();await browser.close();browser=null;
 }
}finally{
 await browser?.close();
 await new Promise(done=>app.server.close(done));
 rmSync(temporary,{recursive:true,force:true});
}
