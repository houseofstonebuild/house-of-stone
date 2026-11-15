// WebKit smoke test for the phone-only, seek-free sculpture timeline.
// This covers the browser engine on iOS; it does not claim to measure real
// device thermal throttling or native Safari toolbar dynamics.
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {webkit} from 'playwright';
import {createApp} from '../server.mjs';

const manifest=JSON.parse(readFileSync(new URL('../public/assets/making-mobile-atlas-v4-manifest.json',import.meta.url)));
assert.equal(manifest.frameCount,192);
assert.equal(manifest.columns,2);
assert.equal(manifest.rows,3);
assert(manifest.tileWidth>=450&&manifest.tileHeight>=950,'Source frames must not be low-resolution upscales');
assert.equal(manifest.generated.length,32);
const output=new URL('../test-results/browser/mobile-webkit/',import.meta.url);
mkdirSync(output,{recursive:true});
const dataDir=mkdtempSync(join(tmpdir(),'hos-webkit-'));
const app=createApp({dataDir,env:{ADMIN_PASSWORD:'test-only-'+randomUUID()},backgroundNotifications:false});
let browser;
try{
 await new Promise(ok=>app.server.listen(0,'127.0.0.1',ok));
 const origin='http://127.0.0.1:'+app.server.address().port;
 browser=await webkit.launch({headless:true});
 for(const view of [{width:393,height:852},{width:375,height:667}]){
  const page=await browser.newPage({viewport:view,deviceScaleFactor:2,hasTouch:true,isMobile:true});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.status()>=400&&/making-mobile-atlas-v3/.test(r.url()))errors.push(String(r.status())+' '+r.url());});
  await page.goto(origin+'/prototypes/stone-to-sculpture.html',{waitUntil:'domcontentloaded'});
  await page.locator('#render[data-render-mode="precomputed-mobile"]').waitFor({timeout:30000});
  const samples=[];
  for(const progress of [.03,.22,.335,.49,.64,.80,.93,.983,.80,.49]){
   await page.evaluate(progress=>{
    const journey=document.querySelector('.journey'),stage=document.querySelector('.stage');
    const top=journey.getBoundingClientRect().top+scrollY;
    scrollTo(0,Math.round(top+(journey.offsetHeight-stage.offsetHeight)*progress));
   },progress);
   // Scroll events are delivered asynchronously in WebKit. A decoded atlas
   // from the preceding checkpoint is not proof the requested frame has painted.
   const expected=Math.round(Math.min(1,Math.max(0,(progress-.305)/.695))*191);
   await page.waitForFunction(({progress,expected})=>{
    const host=document.getElementById('render'),scene=document.getElementById('mobile-sculpture-frames');
    if(progress<.305)return true;
    const frame=Number(host.dataset.mobileAtlasFrame);
    return host.dataset.mobileAtlasPending===''&&
      Number.isInteger(frame)&&Math.abs(frame-expected)<=2&&
      getComputedStyle(scene).backgroundImage.includes('making-mobile-atlas-v3');
   },{progress,expected},{timeout:20000});
   await page.waitForTimeout(120);
   const info=await page.evaluate(()=>({
    frame:Number(document.getElementById('render').dataset.mobileAtlasFrame),
    phase:Number(document.querySelector('.stage').dataset.phase),
    progress:parseFloat(document.getElementById('progress-fill').style.width)||0,
    liveWebGL:!!document.querySelector('#render canvas'),
    atlas:getComputedStyle(document.getElementById('mobile-sculpture-frames')).backgroundImage,
    docWidth:document.documentElement.scrollWidth,viewportWidth:innerWidth
   }));
   assert(!info.liveWebGL,'WebKit phone unexpectedly instantiated a WebGL renderer');
   assert(manifest.tileWidth>=view.width,'Baked sculpture image must never be enlarged beyond its pixel width on phones');
   assert(info.docWidth<=info.viewportWidth+2,'WebKit page has horizontal overflow');
   if(progress>=.305)assert.match(info.atlas,/making-mobile-atlas-v4-/);
   samples.push({progress,frame:info.frame,phase:info.phase});
  }
  assert(samples[7].frame>samples[8].frame,'Backward scroll did not rewind in WebKit');
  assert(samples[8].frame>samples[9].frame,`WebKit phone failed to rewind further: ${JSON.stringify(samples)}`);
  assert.deepEqual(errors,[],'iOS WebKit script or image failures');
  await page.screenshot({path:new URL(String(view.width)+'-final.png',output).pathname});
  console.log('WebKit mobile sculpture frame test',view.width,JSON.stringify(samples));
  await page.close();
 }
}finally{
 await browser?.close();
 await new Promise(ok=>app.server.close(ok));
 rmSync(dataDir,{recursive:true,force:true});
}
