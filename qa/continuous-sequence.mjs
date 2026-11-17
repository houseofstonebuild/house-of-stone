import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server.mjs';
const dir=mkdtempSync(join(tmpdir(),'mabwe-continuous-'));const dest='test-results/browser/continuous-making';mkdirSync(dest,{recursive:true});
const app=createApp({dataDir:dir,backgroundNotifications:false,env:{NODE_ENV:'production',SITE_URL:'https://review.example',ADMIN_PASSWORD:'review-only-password-12345'}});
await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;const reports=[];
try{
 for(const [name,type,width,height] of [['iphone',webkit,390,844],['android',chromium,412,915],['desktop',chromium,1440,900]]){
  const browser=await type.launch({args:type===chromium?['--use-angle=swiftshader','--enable-unsafe-swiftshader']:[]});const page=await browser.newPage({viewport:{width,height}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/health');await page.evaluate(async({profile})=>{
   document.body.innerHTML='<canvas id="sample" style="width:100vw;height:100vh;display:block"></canvas>';document.body.style.margin='0';const {createContinuousSequence}=await import('/prototypes/continuous-sequence.js');window.player=createContinuousSequence({canvas:document.querySelector('canvas'),root:'/assets/continuous-making-v1/workshop',profile});await window.player.ready;window.player.request(0,true);
  },{profile:name==='desktop'?'desktop':'mobile'});
  await page.waitForFunction(()=>window.player.stats().draws>0,null,{timeout:30000});
  // A large discontinuity formerly deadlocked a narrow frame cache.
  for(const value of [52.5,3.2,57,0,29.6]){
   await page.evaluate(value=>window.player.request(value,true),value);
   await page.waitForFunction(value=>Math.abs(window.player.stats().current-value)<.02,value,{timeout:20000});
   const s=await page.evaluate(()=>window.player.stats());assert(s.decodedBytes<90*1024*1024);assert.equal(s.decodeErrors,0);assert.equal(s.fetchErrors,0);
  }
  const motion=await page.evaluate(async()=>{
   window.player.request(0,true);await new Promise(r=>setTimeout(r,700));const frames=[];const begin=performance.now();
   await new Promise(done=>{function tick(now){const t=Math.min(1,(now-begin)/2600);window.player.request(57*t,true);frames.push({time:now,index:window.player.stats().current});if(t<1)requestAnimationFrame(tick);else done()}requestAnimationFrame(tick)});
   await new Promise(r=>setTimeout(r,800));return frames;
  });
  assert(motion.filter((v,i)=>i&&v.index>motion[i-1].index).length>40,'Warm movement must advance throughout the gesture');
  await page.screenshot({path:dest+'/'+name+'-sequence.png'});const stats=await page.evaluate(()=>window.player.stats());
  const before=stats.draws;await page.waitForTimeout(300);assert.equal((await page.evaluate(()=>window.player.stats())).draws,before,'Settled player must stop repainting');
  const sorted=stats.paintMs.toSorted((a,b)=>a-b),decoded=stats.decodeMs.toSorted((a,b)=>a-b);reports.push({name,current:stats.current,draws:stats.draws,requests:stats.requests,peakDecodedBytes:stats.peakDecodedBytes,paintP95:sorted[Math.floor(sorted.length*.95)],decodeP95:decoded[Math.floor(decoded.length*.95)],motion,errors});assert.deepEqual(errors,[]);await browser.close();
 }
 writeFileSync(dest+'/playback.json',JSON.stringify(reports,null,2));console.log('PASS: continuous fractional playback, long jumps, reversals, bounded decoded memory and idle rendering on WebKit and Chromium.');
}finally{await new Promise(r=>app.server.close(r));rmSync(dir,{recursive:true,force:true})}
