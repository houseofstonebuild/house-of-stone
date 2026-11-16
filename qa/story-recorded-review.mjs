// Produce real browser recordings of the isolated story for owner review.
// These capture scroll glitches; they are not marketing footage or a claim
// that a scripted desktop swipe represents a physical iPhone.
import {chromium} from 'playwright';
import {createApp} from '../server.mjs';
import {mkdirSync,mkdtempSync,rmSync,renameSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const dir=mkdtempSync(join(tmpdir(),'hos-story-record-'));
const output=new URL('../test-results/browser/making-atelier/',import.meta.url);
mkdirSync(output,{recursive:true});
const app=createApp({dataDir:dir,env:{ADMIN_PASSWORD:'record-only-123456789'},backgroundNotifications:false});
await new Promise(done=>app.server.listen(0,'127.0.0.1',done));
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 for(const viewport of [
  {name:'desktop',width:1440,height:900},
  {name:'mobile',width:390,height:844}
 ]){
  const context=await browser.newContext({
   viewport:{width:viewport.width,height:viewport.height},
   deviceScaleFactor:1,isMobile:viewport.width<700,hasTouch:viewport.width<700,
   recordVideo:{dir:new URL('../test-results/browser/making-atelier/',import.meta.url).pathname,
    size:{width:viewport.width,height:viewport.height}}
  });
  const page=await context.newPage();
  await page.goto('http://127.0.0.1:'+app.server.address().port+
    '/prototypes/making-atelier.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.documentElement.dataset.makingAtelier==='ready');
  await page.waitForTimeout(350);
  for(const scene of ['introduction','origin','material','carving','detail','finishing','reveal','house']){
   await page.evaluate(async scene=>{
    const section=document.querySelector('[data-scene="'+scene+'"]');
    const top=scrollY+section.getBoundingClientRect().top;
    const distance=Math.max(1,section.offsetHeight-innerHeight);
    const duration=980,started=performance.now();
    await new Promise(resolve=>{
     function step(now){
      const u=Math.min(1,(now-started)/duration);
      const eased=u*u*(3-2*u);
      scrollTo(0,top+distance*eased);
      if(u>=1)resolve();
      else requestAnimationFrame(step);
     }
     requestAnimationFrame(step);
    });
   },scene);
   await page.waitForTimeout(200);
  }
  const video=page.video();
  await page.close();await context.close();
  const path=await video.path();
  renameSync(path,new URL(viewport.name+'-story-scroll-review.webm',output).pathname);
  console.log('Recorded '+viewport.name+' owner-feedback scroll capture');
 }
}finally{
 await browser?.close();await new Promise(done=>app.server.close(done));rmSync(dir,{recursive:true,force:true});
}
