import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright';
import {createApp} from '../server.mjs';

const screenshots=new URL('../test-results/browser/making-v4/',import.meta.url);
mkdirSync(screenshots,{recursive:true});
const dataDir=mkdtempSync(join(tmpdir(),'hos-making-v4-'));
const app=createApp({dataDir,env:{ADMIN_PASSWORD:'test-only-'+randomUUID()},backgroundNotifications:false});
await new Promise(ok=>app.server.listen(0,'127.0.0.1',ok));
const origin='http://127.0.0.1:'+app.server.address().port;
let browser;
const scrollTo=async(page,p)=>{
 await page.evaluate(f=>{
  const element=document.querySelector('.journey');
  const top=element.getBoundingClientRect().top+scrollY;
  window.scrollTo(0,Math.round(top+f*(element.offsetHeight-document.querySelector('.stage').offsetHeight)));
 },p);
 await page.waitForTimeout(360);
};
try{
 browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const rows=[];
 for(const view of [{width:1440,height:900},{width:390,height:844}]){
  const isAtlas=view.width<800;
  const page=await browser.newPage({viewport:view,deviceScaleFactor:1,hasTouch:isAtlas});
  const errors=[];
  page.on('pageerror',err=>errors.push(err.message));
  page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text())});
  page.on('response',r=>{if(r.status()>=400&&/coil-uploaded|stone-to-sculpture|making-chiseling/.test(r.url()))errors.push(r.status()+' '+r.url())});
  await page.goto(origin+'/prototypes/stone-to-sculpture.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('#render')?.dataset.modelReady==='true'||document.querySelector('#render')?.dataset.modelError==='true',{timeout:45000});
  assert.equal(await page.locator('#render').getAttribute('data-model-ready'),'true','Approved Coil animation must load');
  if(isAtlas)assert.equal(await page.locator('#render').getAttribute('data-render-mode'),'precomputed-mobile','Phones must not create a live WebGL renderer');
  const steps=[[0,0],[.12,1],[.22,2],[.33,3],[.405,4],[.49,5],[.64,6],[.8,7],[.865,8],[.928,9],[.983,10]];
  let countryBox,regionBox;
  for(const [i,[p,expected]] of steps.entries()){
   await scrollTo(page,p);
   if(isAtlas&&p>=.305){
    await page.waitForFunction(()=>{const h=document.getElementById('render');return h.dataset.mobileAtlasPending===''&&Number.isFinite(Number(h.dataset.mobileAtlasFrame))&&Number(h.dataset.mobileAtlasFrame)>0;},{timeout:20000});
   }
   const info=await page.evaluate(()=>({phase:Number(document.querySelector('.stage').dataset.phase),
    docWidth:document.documentElement.scrollWidth,viewport:innerWidth,
    countryBox:document.getElementById('origin-map').getAttribute('viewBox'),
    mapOpacity:getComputedStyle(document.querySelector('.map-scene')).opacity,
    modelReady:document.getElementById('render').dataset.modelReady,
    markerOpacity:document.getElementById('transport-marker').getAttribute('opacity'),
    contactError:document.getElementById('render').dataset.contactError,
    hammerClosed:document.getElementById('render').dataset.hammerClosed,
    canvasWidth:document.querySelector('#render canvas')?.width||0, maskReady:document.getElementById('render').dataset.carveMaskReady, carve:document.getElementById('render').dataset.carveProgress, margin:document.getElementById('render').dataset.materialMargin,
    aperture:document.getElementById('render').dataset.apertureProgress, tipError:document.getElementById('render').dataset.tipSurfaceError,blankOpacity:document.getElementById('render').dataset.blankOpacity,
    intermediateVisible:document.getElementById('render').dataset.intermediateVisible,toolsHidden:document.getElementById('render').dataset.toolsHidden,
    rockVisible:document.getElementById('render').dataset.rockVisible,rockOpacity:Number(document.getElementById('render').dataset.rockOpacity),
    roughVisible:document.getElementById('render').dataset.roughVisible,roughOpacity:Number(document.getElementById('render').dataset.roughOpacity),
    carveFrontier:document.getElementById('render').dataset.carveFrontier,realShapeReveal:document.getElementById('render').dataset.realShapeReveal,
    blankCapReady:document.getElementById('render').dataset.blankCapReady,blankCapHeight:document.getElementById('render').dataset.blankCapHeight,supportOverlap:document.getElementById('render').dataset.supportOverlap,
    cutawayOpacity:Number(getComputedStyle(document.getElementById('archive-cutaway')).opacity),cutawayHidden:document.getElementById('archive-cutaway').getAttribute('aria-hidden'),
    marking:Number(document.getElementById('render').dataset.markingVisibility),markSegments:Number(document.getElementById('render').dataset.chalkSegmentCount),stoneContact:Number(document.getElementById('render').dataset.chiselStoneContact),
    archiveTarget:Number(document.getElementById('render').dataset.archiveTarget),mobileFrame:Number(document.getElementById('render').dataset.mobileFilmFrame),videoTime:document.getElementById('archive-film').currentTime,
    videoPaused:document.getElementById('archive-film').paused,surfaceSamples:Number(document.getElementById('render').dataset.surfaceSampleCount),
    truckTransform:document.getElementById('transport-marker').getAttribute('transform'),
    renderMode:document.getElementById('render').dataset.renderMode,mobileAtlasFrame:Number(document.getElementById('render').dataset.mobileAtlasFrame),mobileAtlasBlend:Number(document.getElementById('render').dataset.mobileAtlasBlend),mobileAtlasPending:document.getElementById('render').dataset.mobileAtlasPending,
    mobileAtlasDisplay:getComputedStyle(document.getElementById('mobile-sculpture-frames')).backgroundImage,
    stillLoaded:document.querySelector('.archive-fallback')?.naturalWidth>0,plinthAligned:document.getElementById('render').dataset.plinthAligned}));
   assert.equal(info.phase,expected,`Incorrect stage ${view.width}px at ${p}: ${JSON.stringify(info)}`);
   assert(info.docWidth<=info.viewport+2,`Unexpected horizontal overflow: ${JSON.stringify(info)}`);
   if(isAtlas){assert.equal(info.canvasWidth,0,'Mobile route should never allocate a WebGL canvas');}
   else assert(info.canvasWidth>0,'Desktop WebGL canvas must remain allocated');
   if(i===0){countryBox=info.countryBox;assert(info.cutawayOpacity<.01,'Documentary film should not cover geographic introduction');}
   if(i===1){regionBox=info.countryBox;assert.notEqual(regionBox,countryBox,'Map should zoom into the Guruve region');}
   if(i===2){assert.equal(info.markerOpacity,'1','Illustrative stone transport marker should follow route');assert(!info.truckTransform.includes('rotate'),'Transport marker should never invert');}
   if(!isAtlas)assert.equal(info.maskReady,'true','Coil geometry silhouette field unavailable');
   if(isAtlas&&p>=.305){assert(info.mobileAtlasFrame>0&&info.mobileAtlasFrame<192,'Invalid mobile sculpture frame');assert(info.mobileAtlasBlend>=0&&info.mobileAtlasBlend<=1,'Invalid adjacent-frame opacity');assert.match(info.mobileAtlasDisplay,/making-mobile-atlas-v4-/,'High-detail sculpture frame atlas not composited');}
   if(!isAtlas&&i===5){assert(info.marking>.85,'Chalk marking must remain clearly visible before chiseling');assert(info.markSegments>20,'Contour extraction must create actual visible chalk geometry');}
   if(!isAtlas&&i>=7)assert(info.surfaceSamples>=5,'Approved Coil geometry should provide a stable surface');
   if(!isAtlas&&i===10)assert.equal(info.plinthAligned,'true','Gallery pedestal must be mounted at sculpture origin');
   if(i===6){
    if(!isAtlas){
     assert(Number(info.carve)>.07&&Number(info.carve)<.98,'Stone should change throughout carving');
     assert(Number(info.aperture)>.07&&Number(info.aperture)<.98,'Carving follows scroll');
     assert.equal(info.intermediateVisible,'false','Do not show an unsupported cylindrical blank');
     assert.equal(info.toolsHidden,'true','Real workshop film replaces floating simulated hammers');
     assert(info.roughOpacity>.8&&info.roughOpacity<=1,'Dark rough Coil must be visible wherever the parent stone has been worked');
     assert.equal(info.rockVisible,'true','Unworked parent stone must stay under the revealed Coil');
     assert.equal(info.roughVisible,'true','The approved Coil model is the revealed form');
    }
    assert(info.cutawayOpacity>.95,'Archival chiseling supplements the sculpture');
    assert(info.stillLoaded,'Chiseling still image must load');
    assert(info.videoPaused,'Archive remains under scroll control');
    assert(info.archiveTarget>0,'Archive time follows scroll position');
    assert.equal(info.cutawayHidden,'false');
    if(isAtlas){
     const overlap=await page.evaluate(()=>{
      const a=document.getElementById('skip').getBoundingClientRect();
      const b=document.getElementById('archive-cutaway').getBoundingClientRect();
      return Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
     });
     assert.equal(overlap,0,'Skip link must not cover workshop footage on mobile');
    }
   }
   const file=new URL(`${view.width}-${String(i).padStart(2,'0')}.png`,screenshots).pathname;
   await page.screenshot({path:file,fullPage:false});
   rows.push({width:view.width,p,phase:info.phase,contact:info.contactError||null});
  }
  // Inspect stages previously showing a floating mallet and cylindrical stone.
  for(const p of [.590,.640,.675,.710,.743]){
   await scrollTo(page,p);
   if(isAtlas){
    await page.waitForFunction(()=>document.getElementById('render').dataset.mobileAtlasPending==='',{timeout:20000});
   }
   await page.screenshot({path:new URL(`${view.width}-carving-${String(Math.round(p*1000))}.png`,screenshots).pathname});
  }
  // Rewind via scroll as well as advance: the source must remain paused.
  await scrollTo(page,.690);
  await page.waitForFunction(()=>{const v=document.getElementById('archive-film');return !Number.isFinite(v.duration)||v.duration===0||(!v.seeking&&Math.abs(v.currentTime-Number(document.getElementById('render').dataset.archiveTarget))<.6);},{timeout:10000}).catch(()=>{});
  const forward=await page.locator('#archive-film').evaluate(v=>({time:v.currentTime,duration:v.duration,paused:v.paused,frame:Number(document.getElementById('render').dataset.mobileFilmFrame)}));
  await scrollTo(page,.615);
  await page.waitForFunction(()=>{const v=document.getElementById('archive-film');return !Number.isFinite(v.duration)||v.duration===0||(!v.seeking&&Math.abs(v.currentTime-Number(document.getElementById('render').dataset.archiveTarget))<.6);},{timeout:10000}).catch(()=>{});
  const backward=await page.locator('#archive-film').evaluate(v=>({time:v.currentTime,paused:v.paused,frame:Number(document.getElementById('render').dataset.mobileFilmFrame)}));
  assert(forward.paused&&backward.paused,'Scroll-scrubbed documentary must stay paused');
  if(Number.isFinite(forward.duration)&&forward.duration>.5){
    assert(forward.duration<22,'Inset must exclude the final lion reveal');
  }
  if(view.width<800){
    assert(forward.frame>backward.frame, 'Phone scroll should rewind documentary storyboard without video decoding');
    assert(forward.frame<42&&backward.frame>=0,'Phone storyboard frame must be in bounds');
  }else if(Number.isFinite(forward.duration)&&forward.duration>.5){
    assert(backward.time<forward.time,'Scrolling upward should rewind the workshop video');
  }
  const film=page.locator('.film-note video');
  assert.equal(await film.count(),1,'House of Mabwe workshop film should accompany the finished sculpture');
  assert.equal(await film.getAttribute('autoplay'),null,'Archive footage must not autoplay');
  assert.match(await film.locator('source').getAttribute('src'),/making-chiseling-scrub-v1\.mp4/);
  assert.match(await page.locator('#archive-film source').getAttribute('src'),/making-chiseling-scrub-v1\.mp4/);
  assert.deepEqual(errors,[],`Browser errors: ${errors.join('; ')}`);
  await page.close();
 }
 const reducedPage=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
 await reducedPage.goto(origin+'/prototypes/stone-to-sculpture.html',{waitUntil:'domcontentloaded'});
 await reducedPage.locator('#render[data-model-ready="true"]').waitFor({timeout:45000});
 await reducedPage.locator('#skip').click();
 assert((await reducedPage.locator('#finished').boundingBox()).y<844,'Skip button should move to finished work');
 await reducedPage.close();
 console.log('Making rebuilt workshop and high-resolution mobile documentary QA passed:',JSON.stringify(rows));
}finally{
 await browser?.close();
 await new Promise(ok=>app.server.close(ok));
 rmSync(dataDir,{recursive:true,force:true});
}
