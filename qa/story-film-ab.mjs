// Compare low-resolution documentary motion compositors under identical
// scripted scroll speed and loading conditions. No production changes.
import {chromium,webkit} from 'playwright';
import {mkdirSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server.mjs';
const dir=mkdtempSync(join(tmpdir(),'hos-gpu-ab-'));
const out=new URL('../test-results/browser/making-atelier/',import.meta.url);mkdirSync(out,{recursive:true});
const app=createApp({dataDir:dir,env:{ADMIN_PASSWORD:'ab-test-private-123456789'},backgroundNotifications:false});
await new Promise(ok=>app.server.listen(0,'127.0.0.1',ok));
const result=[];let browser;
try{
 for(const c of [{driver:chromium,name:'desktop',width:1440,height:900},
                 {driver:webkit,name:'iphone',width:390,height:844}]){
  browser=await c.driver.launch({headless:true,
   ...(c.driver===chromium?{args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']}: {})});
  for(const mode of ['canvas']){
   const page=await browser.newPage({viewport:{width:c.width,height:c.height},
    isMobile:c.width<700,hasTouch:c.width<700});
   await page.goto('http://127.0.0.1:'+app.server.address().port+
    '/prototypes/making-atelier.html?filmmode='+mode,{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>window.__mabwePerformance?.().filmAtlas.ready>=1,null,{timeout:25000});
   const sample=await page.evaluate(async()=>{
    const node=document.querySelector('[data-scene="carving"]');
    const top=scrollY+node.getBoundingClientRect().top;
    const span=Math.max(1,node.offsetHeight-innerHeight);
    const intervals=[],painted=[],started=performance.now();
    let previous=started,last=-1,changes=0;
    await new Promise(resolve=>{
     function frame(now){
      const u=Math.min(1,(now-started)/1100);
      scrollTo(0,top+span*u*u*(3-2*u));
      intervals.push(now-previous);previous=now;
      const current=Number(document.querySelector('.carving-media').dataset.displayedFrame);
      if(current!==last){changes++;last=current}
      if(u>=1)resolve();else requestAnimationFrame(frame);
     }
     requestAnimationFrame(frame);
    });
    intervals.sort((a,b)=>a-b);
    return {p95:intervals[Math.floor((intervals.length-1)*.95)],
      total:intervals.length,changes,atlas:window.__mabwePerformance().filmAtlas};
   });
   result.push({device:c.name,mode,...sample});
   console.log(c.name,mode,'p95',sample.p95,'visible frames',sample.changes);
   await page.close();
  }
  await browser.close();browser=null;
 }
 writeFileSync(new URL('film-atlas-ab.json',out),JSON.stringify(result,null,2));
}finally{await browser?.close();await new Promise(done=>app.server.close(done));rmSync(dir,{recursive:true,force:true});}
