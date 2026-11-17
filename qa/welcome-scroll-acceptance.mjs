// House of Mabwe: regression checks for reversible, user-controlled documentary
// and model-derived scroll stages on original production-available assets.
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {mkdtempSync,mkdirSync,rmSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createApp} from '../server.mjs';
const out=new URL('../test-results/browser/welcome-scroll/',import.meta.url);
mkdirSync(out,{recursive:true});
const dir=mkdtempSync(join(tmpdir(),'hos-welcome-scroll-'));
const app=createApp({dataDir:dir,backgroundNotifications:false,env:{
 NODE_ENV:'production',SITE_URL:'https://review.example',ADMIN_PASSWORD:'review-only-not-real-password-123'
}});
await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+app.server.address().port;
const devices=[
 {name:'iphone-compact',browser:webkit,width:375,height:667,touch:true},
 {name:'iphone-standard',browser:webkit,width:390,height:844,touch:true},
 {name:'android',browser:chromium,width:412,height:915,touch:true},
 {name:'tablet',browser:webkit,width:820,height:1180,touch:false},
 {name:'desktop',browser:chromium,width:1440,height:900,touch:false}
];
let driver;const results=[];
async function go(page,name,p){
 await page.evaluate(({name,p})=>{
  const section=document.querySelector('[data-scene="'+name+'"]');
  const start=section.getBoundingClientRect().top+scrollY;
  const span=Math.max(1,section.offsetHeight-innerHeight);
  scrollTo(0,Math.round(start+span*p));
 },{name,p});
 await page.waitForTimeout(290);
}
try{
 for(const d of devices){
  driver=await d.browser.launch({headless:true,
   ...(d.browser===chromium?{args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']}: {})});
  const page=await driver.newPage({viewport:{width:d.width,height:d.height},
   isMobile:d.touch,hasTouch:d.touch,deviceScaleFactor:1});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{
    if(r.status()>=400&&/\/(?:prototypes|models)\//.test(r.url()))errors.push(r.status()+':'+r.url());
  });
  await page.goto(base+'/prototypes/making-atelier.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.documentElement.dataset.makingAtelier==='ready');
  await page.waitForFunction(()=>window.__mabweMaking?.film?.edition==='hd-v3'||
   window.__mabweMaking?.film?.edition==='hd-v2',{timeout:30000});
  await page.waitForFunction(()=>window.__mabwePerformance?.().filmAtlas.legacySprite||
    window.__mabwePerformance?.().filmAtlas.ready>0,{timeout:20000});
  const sections=['introduction','origin','material','carving','detail','finishing','reveal','house'];
  assert.equal(await page.locator('[data-scene]').count(),sections.length);
  const film=page.locator('#cinemaFilm');
  assert.equal(await film.evaluate(v=>v.paused),true,'Original documentary must never auto-play');
  const samples=[];
  for(const p of [.2,.75,.13,.91,.38]){
   await go(page,'carving',p);
   samples.push(await page.evaluate(()=>({
    requested:Number(document.querySelector('.carving-media').dataset.requestedFrame),
    displayed:Number(document.querySelector('.carving-media').dataset.displayedFrame),
    paused:document.querySelector('#cinemaFilm').paused,
    atlas:window.__mabwePerformance().filmAtlas
   })));
  }
  console.log('SCRUB DEBUG',d.name,JSON.stringify(samples.map(v=>({requested:v.requested,displayed:v.displayed,paused:v.paused,atlas:v.atlas}))), 'page errors',JSON.stringify(errors));
  assert(samples[0].requested<samples[1].requested,'Forward scroll did not advance footage');
  assert(samples[2].requested<samples[1].requested,'Reverse scroll did not reverse footage');
  assert(samples[3].requested>samples[2].requested,'Re-entry did not resume scroll control');
  assert(samples.every(v=>v.paused),'Documentary autoplay regression');
  assert(samples.some(v=>Number.isFinite(v.displayed)&&v.displayed>=0),'Frames never painted');
  assert(samples.every(v=>v.atlas.cachedSheets<=3),'Atlas memory budget exceeded');
  for(const scene of sections){
   await go(page,scene,.5);
   const check=await page.evaluate(()=>{
    const w=document.documentElement.clientWidth;
    const cols=[...document.querySelectorAll('h1,h2')].filter(el=>{
     const b=el.getBoundingClientRect();return b.top<innerHeight&&b.bottom>0;
    }).map(el=>({name:el.textContent.slice(0,45),left:el.getBoundingClientRect().left,
     right:el.getBoundingClientRect().right}));
    return {overflow:document.documentElement.scrollWidth-w,headings:cols};
   });
   assert(check.overflow<=3,d.name+' overflow at '+scene+': '+check.overflow);
   await page.screenshot({path:new URL(d.name+'-'+scene+'.png',out).pathname});
  }
  await go(page,'detail',.67);
  await page.waitForFunction(()=>Number.isFinite(Number(document.querySelector('#formationStage').dataset.requestedFrame)));
  await go(page,'finishing',.73);
  await page.waitForFunction(()=>Number.isFinite(Number(document.querySelector('#polishStage').dataset.requestedFrame)));
  const state=await page.evaluate(()=>window.__mabwePerformance());
  assert(state.film.inflight<=3,'Too many film decoders');
  assert(state.coil.carve.inflight<=3&&state.coil.polish.inflight<=3,'Too many Coil decoders');
  assert.deepEqual(errors,[],d.name+' JS/network errors');
  results.push({device:d.name,samples,edition:state.coil.edition});
  await page.close();await driver.close();driver=null;
 }
 writeFileSync(new URL('acceptance.json',out),JSON.stringify(results,null,2));
 console.log('PASS: reversible documentary scrub and original Coil story on all five responsive layouts');
}finally{
 if(driver)await driver.close();
 await new Promise(done=>app.server.close(done));
 rmSync(dir,{recursive:true,force:true});
}
