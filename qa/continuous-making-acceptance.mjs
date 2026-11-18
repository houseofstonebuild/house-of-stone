import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createApp} from '../server.mjs';
const dest=process.env.MABWE_REVIEW_DEST||'test-results/browser/continuous-making-full';mkdirSync(dest,{recursive:true});const dir=mkdtempSync(join(tmpdir(),'mabwe-full-'));
const source=readFileSync(new URL('../public/models/coil-uploaded-v1.glb',import.meta.url));const sourceHash=createHash('sha256').update(source).digest('hex');
const manifest=JSON.parse(readFileSync(new URL('../public/assets/continuous-making-v1/form/manifest.json',import.meta.url)));
assert.equal(manifest.frames,480);assert.equal(manifest.source_sha256,sourceHash);
for(const [profile,p] of Object.entries(manifest.profiles))for(const pack of p.packs){const bytes=readFileSync(new URL('../public/assets/continuous-making-v1/form/'+profile+'/'+pack.url,import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),pack.sha256);for(const entry of pack.entries)assert(entry.offset>=0&&entry.offset+entry.length<=bytes.length);}
const app=createApp({dataDir:dir,backgroundNotifications:false,env:{NODE_ENV:'production',SITE_URL:'https://review.example',ADMIN_PASSWORD:'review-only-password-123456'}});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;const reports=[];
try{
 for(const [name,type,width,height] of [['compact',webkit,375,667],['iphone',webkit,390,844],['android',chromium,412,915],['tablet',webkit,820,1180],['landscape',webkit,844,390],['desktop',chromium,1440,900]]){
  const browser=await type.launch({args:type===chromium?['--use-angle=swiftshader','--enable-unsafe-swiftshader']:[]});const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:name==='iphone'?3:name==='android'?2:1});const errors=[],failures=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400&&new URL(r.url()).origin===base)failures.push(r.status()+' '+r.url())});
  await page.goto(base+(process.env.MABWE_STUDY_PATH||'/prototypes/making-continuous.html'),{waitUntil:'load'});await page.bringToFront();await page.waitForFunction(()=>document.documentElement.dataset.storyLayout==='ready');
  assert.match(await page.locator('.opening-photo').getAttribute('src'),/making-artist-and-block/);assert.equal(await page.locator('video,#toolStage,.step-buttons').count(),0);
  await page.screenshot({path:dest+'/'+name+'-opening.png'});
  const cold=await page.evaluate(()=>window.__mabweContinuous.stats());for(const player of [cold.form,cold.film,cold.artist]){assert.equal(player.started,false,'Opening must not start below-fold sequences');assert.equal(player.requests,0);assert.equal(player.decodeCount,0);}

  async function chapter(name,progress=.5){
   await page.evaluate(({name,progress})=>{const section=document.querySelector('[data-scene="'+name+'"]'),pin=section.querySelector(':scope>.pin');scrollTo(0,section.getBoundingClientRect().top+scrollY+Math.max(1,section.offsetHeight-(pin?.clientHeight||innerHeight))*progress)},{name,progress});
   await page.waitForFunction(({name,progress})=>document.body.dataset.currentScene===name&&(['house','interval'].includes(name)||Math.abs(Number(document.querySelector('[data-scene="'+name+'"]').dataset.progress)-progress)<.003),{name,progress});
  }
  for(const name of ['origin','material','carving']){
   await chapter(name);if(name==='material')await page.waitForFunction(()=>{const s=window.__mabweContinuous.stats().artist;return s&&Math.abs(s.current-s.target)<.03&&document.querySelector('#artistCanvas').dataset.frameStatus==='ready'});if(name==='carving')await page.waitForFunction(()=>{const s=window.__mabweContinuous.stats().film;return s&&Math.abs(s.current-s.target)<.03&&document.querySelector('#workshopCanvas').dataset.frameStatus==='ready'});
   await page.screenshot({path:dest+'/'+name+'-'+width+'.png'});
  }
  assert.equal(await page.locator('#routeStone path').count(),5);const zooms=[];for(const p of [.2,.8,.2]){await chapter('origin',p);zooms.push(await page.locator('#mapJourney').evaluate(el=>el.transform.baseVal.consolidate().matrix.a));}assert(zooms[1]>zooms[0]*1.8);assert(Math.abs(zooms[2]-zooms[0])<.01,'Map zoom reverses with scroll');
  const artist=[];for(const p of [.75,.25,.6]){await chapter('material',p);await page.waitForFunction(()=>{const s=window.__mabweContinuous.stats().artist;return Math.abs(s.current-s.target)<.03});artist.push(await page.evaluate(()=>window.__mabweContinuous.stats().artist.current));}assert(artist[0]>artist[1]&&artist[2]>artist[1]);
  const workshop=[];for(const progress of [.75,.25,.6]){await chapter('carving',progress);await page.waitForFunction(()=>{const s=window.__mabweContinuous.stats().film;return s&&Math.abs(s.current-s.target)<.03});workshop.push(await page.evaluate(()=>Number(document.querySelector('#workshopCanvas').dataset.displayedFrame)))}assert(workshop[0]>workshop[1]&&workshop[2]>workshop[1],'Workshop must reverse with the scroll on '+name+': '+JSON.stringify(workshop));
  const stages=await page.evaluate(()=>window.__mabweContinuous.stages());assert.equal(stages.length,6);assert(stages[1].length>=2200);assert(stages.slice(2).every(s=>s.length>=500));assert.equal(await page.locator('.process-pin').count(),2);assert.equal(await page.locator('#processCanvas').count(),1);
  await chapter('interval',0);const gap=await page.locator('.process-break').boundingBox();assert(gap.height>=height*.85,'The chapters need a real unpinned break');await page.screenshot({path:dest+'/'+name+'-chapter-break.png'});
  async function phase(index,local=.5){
   const target=await page.evaluate(({index,local})=>{const stages=window.__mabweContinuous.stages(),s=stages[index],el=document.querySelector('#process'),top=el.getBoundingClientRect().top+scrollY;scrollTo(0,top+s.start+s.length*local);const p=(scrollY-top-s.start)/s.length,motion=Math.max(0,Math.min(1,(p-s.lead)/(1-s.lead-s.tail)));return s.first+(s.last-s.first)*motion}, {index,local});
   await page.waitForFunction(({name,target})=>{const state=window.__mabweContinuous.stats();return state.phase===name&&state.form&&Math.abs(state.form.target-target)<.03&&Math.abs(state.form.current-state.form.target)<.03&&document.querySelector('#processCanvas').dataset.frameStatus==='ready'},{name:stages[index].name,target},{timeout:45000});
  }
  await phase(0,.5);
  if(width<=1100&&height>width){
   const pixels=await page.locator('#processCanvas').evaluate(canvas=>{const {data,width,height}=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height);let top=height,bottom=-1;for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4;if(data[i]>85&&data[i+1]>85&&data[i+2]>70){top=Math.min(top,y);bottom=Math.max(bottom,y)}}const rect=canvas.getBoundingClientRect();return {top:rect.top+top/height*rect.height,bottom:rect.top+bottom/height*rect.height,header:document.querySelector('.masthead').getBoundingClientRect().bottom,copy:document.querySelector('.process-step.is-current').getBoundingClientRect().top}});
   assert(pixels.top>=pixels.header-8,'The visible block must clear the header on '+name+': '+JSON.stringify(pixels));assert(pixels.bottom<=pixels.copy-5,'The visible block must clear the caption on '+name+': '+JSON.stringify(pixels));
  }
  const pictureHashes=[];
  for(let index=0;index<6;index++){
   await phase(index);const file=dest+'/'+name+'-'+stages[index].name+'.png';const pixels=await page.screenshot({path:file});pictureHashes.push(createHash('sha256').update(pixels).digest('hex'));
   const rect=await page.locator('.process-step.is-current').boundingBox();assert(rect&&rect.x>=-1&&rect.x+rect.width<=width+1&&rect.y>=60&&rect.y+rect.height<=height-35,'Current copy must fit at '+name+' '+stages[index].name);
  }
  assert.equal(new Set(pictureHashes).size,6,'Every making stage must have a distinct visible presentation');
  await phase(5,.98);await page.waitForFunction(()=>Number(getComputedStyle(document.querySelector('#exactFinish')).opacity)===1,undefined,{timeout:5000});assert.equal(await page.locator('#exactFinish').evaluate(el=>Number(getComputedStyle(el).opacity)),1,'End must show the unchanged approved image');
  for(const index of [4,3,2,1,0]){await phase(index);assert.equal(await page.locator('#exactFinish').evaluate(el=>Number(getComputedStyle(el).opacity)),0,'Final image must leave when scrolling back to earlier stages');}
  await phase(1,.2);
  await page.evaluate(()=>{window.motionSamples=[];window.recordMotion=true;let last=performance.now();function record(now){const s=window.__mabweContinuous.stats();window.motionSamples.push({time:now,elapsed:now-last,frame:s.form.current,painted:Number(document.querySelector('#processCanvas').dataset.displayedFrame)});last=now;if(window.recordMotion)requestAnimationFrame(record)}requestAnimationFrame(record)});
  for(let i=0;i<35;i++){await page.mouse.wheel(0,55);await page.waitForTimeout(30);}
  await page.waitForTimeout(800);const motion=await page.evaluate(()=>{window.recordMotion=false;return window.motionSamples});const moving=motion.filter((s,i)=>i&&s.painted>motion[i-1].painted),advances=moving.length,seconds=(moving.at(-1).time-moving[0].time)/1000,intervals=motion.filter(s=>s.time>=moving[0].time&&s.time<=moving.at(-1).time).map(s=>s.elapsed).sort((a,b)=>a-b);writeFileSync(dest+'/'+name+'-motion.json',JSON.stringify({motion,stats:await page.evaluate(()=>window.__mabweContinuous.stats()),advances,seconds,p95:intervals[Math.floor(intervals.length*.95)]}));console.log('MOTION',name,advances/seconds,intervals[Math.floor(intervals.length*.95)]);assert(advances>35,'Painted images must advance through actual wheel input');assert(advances/seconds>25,'Visible playback must exceed 25 updates/second on '+name+': '+advances/seconds);assert(intervals[Math.floor(intervals.length*.95)]<50,'Warmed scroll frame time must stay below 50ms on '+name);
  const state=await page.evaluate(()=>window.__mabweContinuous.stats());assert(state.form.decodedBytes<90*1024*1024);assert.equal(state.form.fetchErrors,0);assert.equal(state.form.decodeErrors,0);await page.waitForFunction(()=>{const s=window.__mabweContinuous.stats().form;return s.inflightDecodes===0&&s.current===s.target&&s.density===3},undefined,{timeout:5000});const settled=await page.evaluate(()=>window.__mabweContinuous.stats().form);await page.waitForTimeout(350);const idle=await page.evaluate(()=>window.__mabweContinuous.stats().form);assert.equal(idle.draws,settled.draws,'Settled scene must stop drawing');assert.equal(idle.decodeCount,settled.decodeCount,'Settled scene must stop decoding');
  await chapter('house',0);await page.screenshot({path:dest+'/'+name+'-house.png'});
  await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(200);assert.equal(await page.locator('[data-step][aria-hidden="true"]').count(),0);assert.equal(await page.locator('.static-process-image:visible').count(),6);await page.screenshot({path:dest+'/'+name+'-reduced.png',fullPage:true});
  assert.deepEqual(errors,[]);assert.deepEqual(failures,[]);reports.push({name,errors,failures,cold,zooms,artist,workshop,state,motion});await page.close();await browser.close();
 }
 writeFileSync(dest+'/acceptance.json',JSON.stringify(reports,null,2));console.log('PASS: unchanged model, complete process, exact finished image, six layouts, real wheel motion, reversals, bounded decoding and reduced motion.');
}finally{await new Promise(r=>app.server.close(r));rmSync(dir,{recursive:true,force:true})}
