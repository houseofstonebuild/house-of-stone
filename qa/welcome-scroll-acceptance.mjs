import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {mkdtempSync,mkdirSync,rmSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';import {tmpdir} from 'node:os';import {createApp} from '../server.mjs';
const out=new URL('../test-results/browser/welcome-film/',import.meta.url);mkdirSync(out,{recursive:true});
const dir=mkdtempSync(join(tmpdir(),'mabwe-film-'));
const app=createApp({dataDir:dir,backgroundNotifications:false,env:{NODE_ENV:'production',SITE_URL:'https://review.example',ADMIN_PASSWORD:'review-only-password-123456'}});
await new Promise(done=>app.server.listen(0,'127.0.0.1',done));const base='http://127.0.0.1:'+app.server.address().port;
const devices=[{name:'compact',engine:webkit,width:375,height:667,touch:true},{name:'iphone',engine:webkit,width:390,height:844,touch:true},{name:'android',engine:chromium,width:412,height:915,touch:true},{name:'tablet',engine:webkit,width:820,height:1180,touch:false},{name:'desktop',engine:chromium,width:1440,height:900,touch:false}];
let browser;const results=[];
async function scene(page,name,p=.5){await page.evaluate(({name,p})=>{const el=document.querySelector('[data-scene="'+name+'"]'),pin=el.querySelector(':scope > .pin');scrollTo(0,el.getBoundingClientRect().top+scrollY+Math.max(1,el.offsetHeight-(pin?.clientHeight||innerHeight))*p);},{name,p});try{await page.waitForFunction(({name,p})=>Math.abs(Number(document.querySelector('[data-scene="'+name+'"]').dataset.progress)-p)<.003,{name,p},{timeout:8000});}catch(error){console.log('SCENE DIAGNOSTIC',name,p,await page.evaluate(()=>({hidden:document.hidden,y:scrollY,scene:window.__mabweMaking.chapter,reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,sections:[...document.querySelectorAll('[data-scene]')].map(e=>({name:e.dataset.scene,progress:e.dataset.progress,top:e.getBoundingClientRect().top,height:e.offsetHeight,pin:e.querySelector('.pin')?.clientHeight}))})));throw error;}}
async function phase(page,name,p=.5){await page.evaluate(({name,p})=>{const s=window.__mabwePerformance().timeline.find(s=>s.name===name),el=document.querySelector('#process');scrollTo(0,el.getBoundingClientRect().top+scrollY+s.start+(s.end-s.start)*p);},{name,p});await page.waitForFunction(({name,p})=>window.__mabweMaking.step===name&&Math.abs(Number(document.querySelector('#processArt').dataset.phaseProgress)-p)<.003,{name,p});await page.waitForFunction(()=>{const s=window.__mabwePerformance().process;return s.displayed===s.target&&s.displayed>=0;});}
async function capture(page,name){await page.screenshot({path:new URL(name+'.png',out).pathname});const box=await page.evaluate(()=>{const text=[...document.querySelectorAll('.process-step.is-current h2,.process-step.is-current p')].map(el=>{const r=el.getBoundingClientRect();return {text:el.textContent.slice(0,45),l:r.left,r:r.right,b:r.bottom};});return {overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,text};});assert(box.overflow<=2,name+' overflow');if(name.includes('process'))for(const t of box.text){assert(t.l>=0&&t.r<=page.viewportSize().width+1,name+' clipped text');assert(t.b<page.viewportSize().height-45,name+' footer overlap '+t.text);}}
try{
 for(const d of devices){
  browser=await d.engine.launch({...(d.engine===chromium?{args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']}: {})});
  const page=await browser.newPage({viewport:{width:d.width,height:d.height},isMobile:d.touch,hasTouch:d.touch,deviceScaleFactor:1});
  const errors=[],failures=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400&&new URL(r.url()).origin===base)failures.push(r.status()+' '+r.url());});
  await page.bringToFront();await page.goto(base+'/prototypes/making-atelier.html',{waitUntil:'load'});await page.waitForFunction(()=>document.documentElement.dataset.storyLayout==='ready');
  assert.equal(await page.locator('#toolStage,.step-buttons,video[autoplay]').count(),0,'Floating props or playback controls reintroduced');
  for(const name of ['introduction','origin','material','carving']){await scene(page,name,name==='introduction'?0:.5);if(name==='carving')await page.waitForFunction(()=>{const p=window.__mabwePerformance().film;return p.displayed===p.target&&p.displayed>=0;});await capture(page,d.name+'-'+name);}
  const film=[];for(const p of [.72,.25,.55]){await scene(page,'carving',p);await page.waitForFunction(()=>{const s=window.__mabwePerformance().film;return s.displayed===s.target&&s.displayed>=0;});film.push(await page.evaluate(()=>window.__mabwePerformance().film.displayed));}assert(film[0]>film[1]&&film[2]>film[1]);
  for(const p of [.01,.99]){await scene(page,'carving',p);await page.waitForFunction(()=>{const s=window.__mabwePerformance().film;return s.displayed===s.target;});await capture(page,d.name+'-carving-'+(p<.5?'entry':'exit'));}
  const snapshots=[];
  for(const name of ['mark','carve','sand','heat','wax','work']){
   await phase(page,name);await page.waitForTimeout(100);await capture(page,d.name+'-process-'+name);snapshots.push(await page.evaluate(()=>window.__mabwePerformance()));
  }
  await page.waitForFunction(()=>window.__mabwePerformance().approved==='ready');
  await phase(page,'wax',.95);const end=await page.evaluate(()=>window.__mabwePerformance().finish);await phase(page,'work',.1);assert.equal(await page.evaluate(()=>window.__mabwePerformance().finish),end,'Finish jumps at the final boundary');assert.equal(end,1);
  for(const name of ['heat','carve','wax','mark','work','carve']){await phase(page,name);const s=await page.evaluate(()=>window.__mabwePerformance());if(['mark','carve','sand','heat'].includes(name))assert.equal(s.finish,0,'Old final image remained after reversing');assert(s.process.ready<=2&&s.film.ready<=2,'Decoded sheets unbounded');}
  await phase(page,'carve',.1);const before=await page.evaluate(()=>window.__mabwePerformance().process.target);await phase(page,'carve',.15);assert.equal(await page.evaluate(()=>window.__mabwePerformance().process.target),before,'Entry hold vanished');
  let timing=null;
  if(d.engine===chromium){
   await phase(page,'carve',.3);
   timing=await page.evaluate(async()=>{const t=window.__mabwePerformance().timeline.find(s=>s.name==='carve'),el=document.querySelector('#process'),top=el.getBoundingClientRect().top+scrollY,dt=[];let last=performance.now();for(let i=0;i<90;i++){await new Promise(requestAnimationFrame);const n=performance.now();dt.push(n-last);last=n;const p=i<45?.25+i*.009:.65-(i-45)*.009;scrollTo(0,top+t.start+(t.end-t.start)*p);}dt.sort((a,b)=>a-b);return {p95:dt[Math.floor(dt.length*.95)],max:Math.max(...dt)};});
   await page.waitForFunction(()=>{const s=window.__mabwePerformance().process;return s.displayed===s.target;});
   assert(timing.max<180,'Large warmed scroll stall '+timing.max);console.log('SCROLL',d.name,JSON.stringify(timing));
   const old=await page.evaluate(()=>window.__mabweMaking.progress);await page.mouse.wheel(0,400);await page.waitForTimeout(150);assert(await page.evaluate(()=>window.__mabweMaking.progress)>old,'Native wheel did not move story');
  }
  await page.waitForTimeout(150);const idle=await page.evaluate(()=>window.__mabwePerformance());await page.waitForTimeout(250);assert.equal(await page.evaluate(()=>window.__mabwePerformance().process.draws),idle.process.draws,'Idle repaints');
  await scene(page,'house',0);await capture(page,d.name+'-house');
  await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(150);for(const a of await page.locator('[data-step]').all())assert.equal(await a.getAttribute('aria-hidden'),null);assert.equal(await page.locator('.process-art').isVisible(),false);await page.screenshot({path:new URL(d.name+'-reduced.png',out).pathname,fullPage:true});
  assert.deepEqual(errors,[],d.name+' JS errors');assert.deepEqual(failures,[],d.name+' missing source media');results.push({device:d.name,timing,film,snapshots,idle,errors,failures});await browser.close();browser=null;
 }
 writeFileSync(new URL('acceptance.json',out),JSON.stringify(results,null,2));console.log('PASS: quiet story, held key poses, weighted pacing, native-detail sheets, reversible finish, five layouts and reduced motion.');
}finally{if(browser)await browser.close();await new Promise(done=>app.server.close(done));rmSync(dir,{recursive:true,force:true});}
