// Independent acceptance test for the rebuilt, editorial-only Making prototype.
// Runs actual app + actual public footage/images in desktop Chromium and iPhone WebKit.
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,rmSync,statSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {chromium,webkit} from 'playwright';
import {createApp} from '../server.mjs';
assert(existsSync(new URL('../public/assets/making-cinema-frames/frame_00.webp',import.meta.url)),'Real source film frames have not been built');
assert(existsSync(new URL('../public/assets/making-cinema-frames/frame_47.webp',import.meta.url)),'Real source film frames are incomplete');
assert(existsSync(new URL('../public/assets/making-atelier-final-mobile-v1.png',import.meta.url)),'Plinth-free approved Coil final is missing');
const hasRegisteredV7=existsSync(new URL('../public/assets/making-v7/manifest.json',import.meta.url));
const out=new URL('../test-results/browser/making-atelier/',import.meta.url);
mkdirSync(out,{recursive:true});
const data=mkdtempSync(join(tmpdir(),'making-atelier-'));
const app=createApp({dataDir:data,env:{ADMIN_PASSWORD:'test-only-'+randomUUID()},backgroundNotifications:false});
await new Promise(ok=>app.server.listen(0,'127.0.0.1',ok));
const base='http://127.0.0.1:'+app.server.address().port;
const cases=[
 {browser:'chromium',width:1440,height:900,mobile:false},
 {browser:'chromium',width:390,height:844,mobile:true},
 {browser:'webkit',width:375,height:667,mobile:true}
];
const chapters=[
 ['introduction',.3],['origin',.45],['material',.74],
 ['carving',.42],['detail',.64],['finishing',.68],['reveal',.86]
];
let browser;
async function go(page,id,p){
 await page.evaluate(({id,p})=>{
  const el=document.querySelector('[data-scene="'+id+'"]');
  const top=scrollY+el.getBoundingClientRect().top;
  const distance=Math.max(1,el.offsetHeight-innerHeight);
  scrollTo(0,Math.round(top+distance*p));
 },{id,p});
 await page.waitForFunction(({id,p})=>{
  const el=document.querySelector('[data-scene="'+id+'"]');
  return el.dataset.progress!==undefined&&Math.abs(Number(el.dataset.progress)-p)<.02;
 },{id,p},{timeout:18000});
}
try{
 for(const c of cases){
  browser=c.browser==='webkit'?
   await webkit.launch({headless:true}):
   await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:c.width,height:c.height},deviceScaleFactor:1,isMobile:c.mobile,hasTouch:c.mobile});
  const failures=[];
  page.on('pageerror',err=>failures.push('JS: '+err.message));
  page.on('response',res=>{
   // v3 is an optional, separately published media archive. A deliberate
   // 404 before the archive exists must not fail the source-v2 fallback QA.
   const optionalV3=/\/assets\/making-cinema-frames-v3\/manifest\.json/.test(res.url());
   if(optionalV3&&res.status()===404&&!existsSync(new URL(
      '../public/assets/making-cinema-frames-v3/manifest.json',import.meta.url)))return;
   if(res.status()>=400&&/making-atelier|making-cinema-frames|coil-uploaded-v1\.glb/.test(res.url()))
    failures.push('HTTP '+res.status()+' '+res.url());
  });
  await page.goto(base+'/prototypes/making-atelier.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.documentElement.dataset.makingAtelier==='ready');
  // The 144-frame documentary is enabled only after its matching archive lands.
  const denseFilm=existsSync(new URL('../public/assets/making-cinema-frames-v3/manifest.json',import.meta.url));
  if(denseFilm){
   await page.waitForFunction(()=>window.__mabweMaking.film.edition==='hd-v3',{timeout:25000});
   assert.equal(await page.evaluate(()=>window.__mabweMaking.film.frames),144,
    'The 144-frame original HD documentary is not selected');
  }
  // New assets are made visible only after the matching manifest and actual
  // frames deploy. Once v7 files exist, using the older set is a regression.
  if(hasRegisteredV7){
   await page.waitForFunction(()=>{
    const stage=document.querySelector('#formationStage');
    return stage?.dataset.mediaVerified==='v7'||stage?.dataset.modelDerived==='unavailable';
   },null,{timeout:20000});
   assert.equal(await page.locator('#formationStage').getAttribute('data-media-verified'),'v7',
     'The current versioned stone frames were ignored after publication');
  }
  // Verify origin zoom and a physically upright truck moving down the route.
  await go(page,'origin',.14);
  const mapBefore=await page.locator('#mapWrap').evaluate(el=>el.getBoundingClientRect().width);
  await go(page,'origin',.60);
  const mapAfter=await page.locator('#mapWrap').evaluate(el=>el.getBoundingClientRect().width);
  assert(mapAfter>mapBefore*(c.mobile?1.08:1.5),
    'The journey map did not achieve its intended responsive zoom');
  if(c.mobile){
   const pins=await page.evaluate(()=>['#guruvePin .pin-center','#hararePin .pin-center'].map(q=>{
    const r=document.querySelector(q).getBoundingClientRect();
    return {x:r.left+r.width/2,y:r.top+r.height/2};
   }));
   for(const pin of pins)assert(pin.x>12&&pin.x<c.width-12&&pin.y>75&&pin.y<c.height*.66,
    'The Guruve–Harare route was clipped or obscured on mobile');
  }
  const posEarly=await page.locator('#routeTruck').getAttribute('transform');
  await go(page,'origin',.88);
  const posLate=await page.locator('#routeTruck').getAttribute('transform');
  assert.notEqual(posEarly,posLate,'Transport must move with page scroll');
  assert(!posLate.includes('rotate('),'Truck must stay upright during journey');
  await go(page,'origin',.60);
  assert(Number(await page.locator('#hararePin').evaluate(el=>getComputedStyle(el).opacity))>.95,
   'Harare should be identified before the route is complete');
  assert.equal(await page.locator('#routeTruck .truck-stone').count(),1,
   'Transport must visibly carry the stone, not an empty box');
  for(let i=0;i<chapters.length;i++){
   const [id,p]=chapters[i];
   await go(page,id,p);
   if(id==='carving'){
    await page.waitForFunction(()=>document.querySelector('.carving-media').dataset.requestedFrame!==undefined);
    await page.waitForFunction(()=>document.querySelector('.carving-media').dataset.mobileReady==='true'
     ||document.querySelector('.carving-media').dataset.fallback==='atlas',null,{timeout:25000});
    assert.equal(await page.locator('#cinemaFilm').evaluate(v=>getComputedStyle(v).display),'none',
     'Video seeking must not compete with the documentary image timeline');
    const state=await page.evaluate(()=>{
     const v=document.getElementById('cinemaFilm');
     return {paused:v.paused,loop:v.loop,progress:document.querySelector('.carving-media').dataset.scrollPosition};
    });
    assert(state.paused&&!state.loop,'Archival documentary must never independently play or loop');
    assert(['/assets/making-chiseling-scrub-v1.mp4','/assets/making-chiseling-atelier-hd-v2.mp4'].includes(await page.locator('#cinemaFilm source').first().getAttribute('src')));
    assert((await page.evaluate(()=>window.__mabweMaking.film.maxSeconds))<=8.4,'Lion footage must be excluded');
    assert(Math.abs(Number(state.progress)-p)<.03);
    if(c.mobile){
     await page.waitForFunction(()=>document.querySelector('.carving-media').dataset.mobileReady==='true'
      ||document.querySelector('.carving-media').dataset.fallback==='atlas',
      null,{timeout:25000});
    }
   }
   if(id==='detail'||id==='finishing'){
    // Avoid approving screenshots of the stale raw-stone poster at mid-scroll.
    // The screenshot must show the model-derived frame at this scroll position.
    await page.waitForFunction(section=>{
     const node=document.querySelector(section==='detail'?'#formationStage':'#polishStage');
     const desired=Number(node?.dataset.requestedFrame);
     const shown=Number(node?.dataset.displayedFrame);
     return node?.dataset.frameStatus==='ready'&&Number.isFinite(desired)&&
       Number.isFinite(shown)&&Math.abs(desired-shown)<=1;
    },id,{timeout:25000});
   }
   if(id==='reveal'){
    await page.waitForFunction(()=>{
     const status=document.querySelector('#approvedHost').dataset.approvedModelState;
     return ['ready','fallback','error'].includes(status);
    },null,{timeout:45000});
    const state=await page.evaluate(()=>({
     source:document.querySelector('#approvedHost').dataset.approvedSource,
     status:document.querySelector('#approvedHost').dataset.approvedModelState,
     material:document.querySelector('#approvedHost').dataset.approvedMaterialsPreserved,
     model:document.querySelector('#approvedHost').dataset.approvedModelUrl
    }));
    assert.equal(state.status,'ready','The approved model presentation must finish loading');
    assert.equal(state.source,'/models/coil-uploaded-v1.glb');
    assert.equal(state.model,'/models/coil-uploaded-v1.glb');
    assert.equal(state.material,'true');
   }
   const state=await page.evaluate(()=>({
    overflow:document.documentElement.scrollWidth-innerWidth,
    viewport:innerWidth,
    body:document.body.dataset.currentChapter,
    mediaVideo:document.getElementById('cinemaFilm').paused,
    cartoonTools:document.querySelectorAll('#carving-tools,#tool-hammer,#tool-chisel').length
   }));
   assert(state.overflow<=2,'Horizontal overflow at '+c.width+' chapter '+id);
   assert.equal(state.cartoonTools,0,'Cartoon SVG tools reappeared');
   assert.equal(state.mediaVideo,true,'Documentary continued playing');
   await page.screenshot({
    path:new URL(c.browser+'-'+c.width+'-'+String(i).padStart(2,'0')+'-'+id+'.png',out).pathname,
    animations:'disabled'
   });
  }
  // Actual first paint must never rely on an asynchronous scroll frame.
  for(const [id,picture] of [['detail','.formation-poster img'],['finishing','.polish-poster img']]){
   await go(page,id,.015);
   await page.waitForFunction(selector=>document.querySelector(selector)?.naturalWidth>0,picture,{timeout:22000});
   const visible=await page.locator(picture).evaluate(img=>img.getBoundingClientRect().width>0);
   assert(visible,'The '+id+' chapter did not have a frame available on first paint');
  }
  if(c.mobile){
   for(const [chapter,art,heading] of [
    ['detail','#formationFrame','#detailTitle'],
    ['finishing','#polishFrame','#finishingTitle']
   ]){
    await go(page,chapter,.60);
    await page.waitForFunction(selector=>document.querySelector(selector)?.naturalWidth>0,
      art,{timeout:25000});
    const position=await page.evaluate(({art,heading})=>{
     const image=document.querySelector(art);
     const title=document.querySelector(heading);
     const a=image.getBoundingClientRect(),h=title.getBoundingClientRect();
     return {imageTop:a.top,headingTop:h.top,headingBottom:h.bottom};
    },{art,heading});
    assert(position.imageTop<position.headingTop,
     'Mobile sculpture should appear above its chapter heading');
   }
  }
  // The new transformation must actually remove model-derived volume.
  await go(page,'detail',.08);
  await page.waitForFunction(()=>document.querySelector('#formationStage').dataset.modelDerived==='true',{timeout:20000});
  const earlyCarve=await page.evaluate(()=>({
   frame:+document.querySelector('#formationStage').dataset.requestedFrame,
   volume:+document.querySelector('#formationStage').dataset.remainingVoxels
  }));
  await go(page,'detail',.55);
  const middleCarve=await page.evaluate(()=>({
   frame:+document.querySelector('#formationStage').dataset.requestedFrame,
   volume:+document.querySelector('#formationStage').dataset.remainingVoxels
  }));
  await go(page,'detail',.94);
  const lateCarve=await page.evaluate(()=>({
   frame:+document.querySelector('#formationStage').dataset.requestedFrame,
   volume:+document.querySelector('#formationStage').dataset.remainingVoxels
  }));
  assert(earlyCarve.frame<middleCarve.frame&&middleCarve.frame<lateCarve.frame,'Coil is not progressively carved');
  assert(earlyCarve.volume>middleCarve.volume&&middleCarve.volume>lateCarve.volume,'Stone volume must fall as Coil emerges');
  if(hasRegisteredV7){
   assert.equal(await page.locator('#formationStage').getAttribute('data-frame-asset-version'),'v7',
     'Deployed carving is still using the old rendering');
   await page.waitForFunction(()=>{
    const stage=document.querySelector('#formationStage');
    return stage.dataset.frameStatus==='ready'&&Number(stage.dataset.displayedFrame)>=85;
   },null,{timeout:25000});
   await page.screenshot({
    path:new URL(c.browser+'-'+c.width+'-verified-registered-v7-carving.png',out).pathname,
    animations:'disabled'
   });
  }
  assert(await page.locator('#formationChips').count()===1,'Carving canvas missing');
  assert.equal(await page.locator('#formationChips').evaluate(el=>getComputedStyle(el).display),'none',
    'Floating screen-space chips must not appear over the approved sculpture');
  await go(page,'detail',.19);
  assert(+await page.locator('#formationStage').getAttribute('data-requested-frame')<middleCarve.frame,'Stone transformation must reverse on reverse scroll');
  await go(page,'finishing',.19);
  const startPolish=+await page.locator('#polishStage').getAttribute('data-requested-frame');
  await go(page,'finishing',.93);
  const endPolish=+await page.locator('#polishStage').getAttribute('data-requested-frame');
  assert(endPolish>startPolish+17,'Sanding and polishing must advance with scroll');
  assert.equal(await page.locator('#approvedHost').getAttribute('data-in-finishing'),'false',
    'The approved WebGL canvas must never be reparented during polishing');
  const handoff=await page.evaluate(()=>({
   mode:document.querySelector('#polishStage').dataset.handoffMode,
   frame:Number(document.querySelector('#polishStage').dataset.frameAlpha),
   model:Number(document.querySelector('#polishStage').dataset.modelAlpha)
  }));
  assert.equal(handoff.mode,'single-source','Finishing should have exactly one sculpture presentation');
  assert.equal(handoff.frame,1,'The polish sequence must remain visually continuous');
  assert.equal(handoff.model,0,'Approved 3D model must only appear in the gallery');
  assert.equal(await page.locator('#approvedHost').evaluate(el=>el.parentElement.classList.contains('reveal-pin')),true,
    'The approved 3D canvas must stay in its final gallery host');
  assert.equal(await page.locator('#approvedHost').getAttribute('data-atelier-no-plinth'),'true','Do not introduce a generic plinth');
  await go(page,'reveal',.76);
  assert.equal(await page.locator('#approvedHost').getAttribute('data-in-finishing'),'false','Approved Coil must remain the gallery finale');
  if(denseFilm){
   await go(page,'carving',.83);
   await page.waitForFunction(()=>
     Number(document.querySelector('.carving-media').dataset.displayedFrame)>105,
     null,{timeout:25000});
   await go(page,'carving',.17);
   await page.waitForFunction(()=>
     Number(document.querySelector('.carving-media').dataset.displayedFrame)<40,
     null,{timeout:25000});
   assert.equal(await page.locator('.carving-media').getAttribute('data-media-quality'),
     'hd-v3','The 144-frame film must really be displayed, not only loaded');
  }
  // Reversible film, with visible frame changes on real-source mobile frames.
  await go(page,'carving',.20);
  const early=await page.evaluate(()=>Number(document.querySelector('.carving-media').dataset.requestedFrame));
  await go(page,'carving',.83);
  const late=await page.evaluate(()=>Number(document.querySelector('.carving-media').dataset.requestedFrame));
  assert(late>early+15,'Film timeline did not advance with scrolling');
  await go(page,'carving',.15);
  const back=await page.evaluate(()=>Number(document.querySelector('.carving-media').dataset.requestedFrame));
  assert(back<early,'Film did not rewind on reverse scroll');
  await go(page,'detail',.45);
  assert(await page.locator('#cinemaFilm').evaluate(v=>v.paused),'Video kept playing after exiting carving');
  // Jump must lead to the gallery state, not the introduction of the chapter.
  await page.locator('#jump').click();
  await page.waitForFunction(()=>Number(document.querySelector('.reveal').dataset.progress)>.6);
  const screenshot=new URL(c.browser+'-'+c.width+'-skip-to-coil.png',out).pathname;
  await page.screenshot({path:screenshot,animations:'disabled'});
  assert(statSync(screenshot).size>15000);
  assert.deepEqual(failures,[],'Runtime and asset loading errors');
  console.log(c.browser+' '+c.width+'x'+c.height+' passed');
  await page.close();await browser.close();browser=null;
 }
 console.log('New Making Atelier — scroll, real documentary, iOS, original Coil GLB and accessibility QA passed');
}finally{
 await browser?.close();
 await new Promise(done=>app.server.close(done));
 rmSync(data,{recursive:true,force:true});
}
