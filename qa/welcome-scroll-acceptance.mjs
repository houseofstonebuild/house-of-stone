import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {mkdtempSync,mkdirSync,rmSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createApp} from '../server.mjs';
const out=new URL('../test-results/browser/welcome-rebuild/',import.meta.url);mkdirSync(out,{recursive:true});
const dir=mkdtempSync(join(tmpdir(),'mabwe-story-'));
const app=createApp({dataDir:dir,backgroundNotifications:false,env:{NODE_ENV:'production',SITE_URL:'https://review.example',ADMIN_PASSWORD:'review-only-password-123456'}});
await new Promise(done=>app.server.listen(0,'127.0.0.1',done));
const base='http://127.0.0.1:'+app.server.address().port;
const devices=[
 {name:'iphone-compact',engine:webkit,width:375,height:667,touch:true},
 {name:'iphone-standard',engine:webkit,width:390,height:844,touch:true},
 {name:'android',engine:chromium,width:412,height:915,touch:true},
 {name:'tablet',engine:webkit,width:820,height:1180,touch:false},
 {name:'desktop',engine:chromium,width:1440,height:900,touch:false}
];
const steps=['mark','carve','sand','heat','wax','work'];
const results=[];let browser;
async function go(page,scene,p){
 await page.evaluate(({scene,p})=>{const el=document.querySelector('[data-scene="'+scene+'"]');scrollTo({top:Math.round(el.getBoundingClientRect().top+scrollY+Math.max(1,el.offsetHeight-innerHeight)*p),behavior:'instant'});},{scene,p});
 await page.waitForTimeout(150);
}
async function settles(page,kind){
 await page.waitForFunction(kind=>{const s=window.__mabwePerformance()[kind];return s.target>=0&&s.displayed===s.target;},kind,{timeout:30000});
}
async function inspectLayout(page,name){
 const measurement=await page.evaluate(()=>{
  const width=document.documentElement.clientWidth;
  const visible=[...document.querySelectorAll('h1,h2,.process-step.is-current>p,.step-buttons')].filter(el=>{const r=el.getBoundingClientRect();return getComputedStyle(el).visibility!=='hidden'&&getComputedStyle(el).display!=='none'&&r.top<innerHeight&&r.bottom>0;});
  return {overflow:document.documentElement.scrollWidth-width,items:visible.map(el=>{const r=el.getBoundingClientRect();return {text:el.textContent.slice(0,40),left:r.left,right:r.right,top:r.top,bottom:r.bottom};})};
 });
 assert(measurement.overflow<=2,name+' horizontal overflow');
 for(const r of measurement.items){assert(r.left>=-1&&r.right<=page.viewportSize().width+1,name+' clipped '+r.text);if(name.includes('process'))assert(r.bottom<=page.viewportSize().height-65,name+' text overlaps stage navigation: '+r.text);}
}
try{
 for(const device of devices){
  browser=await device.engine.launch({headless:true,...(device.engine===chromium?{args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']}: {})});
  const page=await browser.newPage({viewport:{width:device.width,height:device.height},isMobile:device.touch,hasTouch:device.touch,deviceScaleFactor:1});
  const errors=[],failures=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.status()>=400&&new URL(r.url()).origin===base)failures.push(r.status()+' '+r.url());});
  await page.goto(base+'/prototypes/making-atelier.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.documentElement.dataset.makingAtelier==='ready');
  assert.equal(await page.locator('video[autoplay],video[controls]').count(),0);
  assert.equal(await page.evaluate(()=>window.__mabwePerformance().tools.state),'idle','Tools must not initialize in the opening');
  const captures=[];
  for(const scene of ['introduction','origin','material','carving']){
   await go(page,scene,scene==='introduction'?0:.5);
   if(scene==='carving')await settles(page,'film');
   await inspectLayout(page,device.name+'-'+scene);
   await page.screenshot({path:new URL(device.name+'-'+scene+'.png',out).pathname});
  }
  const filmSamples=[];
  for(const p of [.8,.15,.5]){await go(page,'carving',p);await settles(page,'film');filmSamples.push(await page.evaluate(()=>window.__mabwePerformance().film.displayed));}
  console.log('FILM SAMPLES',device.name,JSON.stringify(filmSamples),JSON.stringify(await page.evaluate(()=>({y:scrollY,chapter:window.__mabweMaking.chapter,stats:window.__mabwePerformance(),layout:[...document.querySelectorAll('[data-scene]')].map(e=>({name:e.dataset.scene,top:e.offsetTop,height:e.offsetHeight}))}))));
  assert(filmSamples[0]>filmSamples[1]&&filmSamples[2]>filmSamples[1],'Documentary must reverse and advance');
  for(let index=0;index<6;index++){
   await go(page,'process',(index+.5)/6);await settles(page,'process');
   await page.waitForTimeout(600);
   assert.equal(await page.evaluate(()=>window.__mabweMaking.step),steps[index]);
   if(index>=1&&index<=4){
    await page.waitForFunction(()=>window.__mabwePerformance().tools.state==='ready',{timeout:20000});
    assert.equal(await page.evaluate(()=>window.__mabwePerformance().tools.visible),true,'Tool absent at '+steps[index]);
   }
   if(index===5){await page.waitForFunction(()=>window.__mabwePerformance().approved==='ready',{timeout:30000});}
   await inspectLayout(page,device.name+'-process-'+steps[index]);
   await page.screenshot({path:new URL(device.name+'-process-'+steps[index]+'.png',out).pathname});
   captures.push(await page.evaluate(()=>window.__mabwePerformance()));
  }
  // A direct jump across all finishing stages must not leave a polished image
  // over a carving frame. The exact displayed source must reach its target.
  for(const index of [1,4,0,3,5,1]){
   await page.locator('[data-go="'+steps[index]+'"]').click();await settles(page,'process');
   assert.equal(await page.evaluate(()=>window.__mabweMaking.step),steps[index]);
   if(index<5)assert.equal(await page.locator('#approvedHost').evaluate(el=>Number(getComputedStyle(el).opacity)),0);
  }
  const steady=await page.evaluate(()=>window.__mabwePerformance());
  await page.waitForTimeout(350);
  const idle=await page.evaluate(()=>window.__mabwePerformance());
  assert.equal(idle.process.draws,steady.process.draws,'Idle scene repaints unnecessarily');
  assert.equal(idle.tools.draws,steady.tools.draws,'Idle tools animate independently of scroll');
  assert(idle.process.inflight<=3&&idle.film.inflight<=3,'Decoder concurrency is unbounded');
  assert(idle.process.bytes<60*1024*1024&&idle.film.bytes<60*1024*1024,'Decoded memory is unbounded');
  await go(page,'house',0);await inspectLayout(page,device.name+'-house');
  await page.screenshot({path:new URL(device.name+'-house.png',out).pathname});
  assert.deepEqual(errors,[],device.name+' JavaScript errors');assert.deepEqual(failures,[],device.name+' missing local media');
  // Capture genuine scroll input as well as programmatic position jumps.
  if(device.engine===chromium){
   await go(page,'process',.2);
   const before=await page.evaluate(()=>window.__mabweMaking.progress);
   await page.mouse.wheel(0,500);await page.waitForTimeout(250);
   const after=await page.evaluate(()=>window.__mabweMaking.progress);assert(after>before,'Wheel input did not advance the process');
  }
  await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(200);
  assert.equal(await page.locator('.process-step').count(),6);
  for(const step of steps)assert.equal(await page.locator('#step-'+step).getAttribute('aria-hidden'),null,'Reduced-motion step hidden from assistive technology');
  assert.equal(await page.locator('.process-art').isVisible(),false,'Reduced motion should use readable stills');
  const reducedOverflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);assert(reducedOverflow<=2);
  await page.screenshot({path:new URL(device.name+'-reduced-motion.png',out).pathname,fullPage:true});
  results.push({device:device.name,filmSamples,captures,idle,errors,failures});
  await page.close();await browser.close();browser=null;
 }
 writeFileSync(new URL('acceptance.json',out),JSON.stringify(results,null,2));
 console.log('PASS: exact reversible frames, four physical tool stages, approved final work, responsive layout, idle rendering, and reduced-motion reading on all five devices.');
}finally{if(browser)await browser.close();await new Promise(done=>app.server.close(done));rmSync(dir,{recursive:true,force:true});}
