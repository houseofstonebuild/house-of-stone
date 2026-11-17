import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createApp} from '../server.mjs';
const dest='test-results/browser/continuous-making-full';mkdirSync(dest,{recursive:true});const dir=mkdtempSync(join(tmpdir(),'mabwe-full-'));
const source=readFileSync(new URL('../public/models/coil-uploaded-v1.glb',import.meta.url));const sourceHash=createHash('sha256').update(source).digest('hex');
const manifest=JSON.parse(readFileSync(new URL('../public/assets/continuous-making-v1/form/manifest.json',import.meta.url)));
assert.equal(manifest.frames,480);assert.equal(manifest.source_sha256,sourceHash);
for(const [profile,p] of Object.entries(manifest.profiles))for(const pack of p.packs){const bytes=readFileSync(new URL('../public/assets/continuous-making-v1/form/'+profile+'/'+pack.url,import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),pack.sha256);for(const entry of pack.entries)assert(entry.offset>=0&&entry.offset+entry.length<=bytes.length);}
const app=createApp({dataDir:dir,backgroundNotifications:false,env:{NODE_ENV:'production',SITE_URL:'https://review.example',ADMIN_PASSWORD:'review-only-password-123456'}});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;const reports=[];
try{
 for(const [name,type,width,height] of [['compact',webkit,375,667],['iphone',webkit,390,844],['android',chromium,412,915],['tablet',webkit,820,1180],['desktop',chromium,1440,900]]){
  const browser=await type.launch({args:type===chromium?['--use-angle=swiftshader','--enable-unsafe-swiftshader']:[]});const page=await browser.newPage({viewport:{width,height},recordVideo:name==='iphone'||name==='desktop'?{dir:dest+'/video',size:{width:Math.min(width,960),height:Math.min(height,900)}}:undefined});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/prototypes/making-continuous.html',{waitUntil:'load'});await page.bringToFront();await page.waitForFunction(()=>document.documentElement.dataset.storyLayout==='ready');
  assert.match(await page.locator('.opening-photo').getAttribute('src'),/making-artist-and-block/);assert.equal(await page.locator('video,#toolStage,.step-buttons').count(),0);
  await page.screenshot({path:dest+'/'+name+'-opening.png'});
  const stages=await page.evaluate(()=>window.__mabweContinuous.stages());assert.equal(stages.length,6);assert(stages[1].length>=2600);assert(stages.slice(2).every(s=>s.length>=1000));
  async function phase(index,local=.5){
   await page.evaluate(({index,local})=>{const stages=window.__mabweContinuous.stages(),s=stages[index],el=document.querySelector('#process');scrollTo(0,el.getBoundingClientRect().top+scrollY+s.start+s.length*local)}, {index,local});
   await page.waitForFunction(({name})=>{const state=window.__mabweContinuous.stats();return state.phase===name&&state.form&&Math.abs(state.form.current-state.form.target)<.03&&document.querySelector('#processCanvas').dataset.frameStatus==='ready'},{name:stages[index].name},{timeout:45000});
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
  await phase(5,.98);assert.equal(await page.locator('#exactFinish').evaluate(el=>Number(getComputedStyle(el).opacity)),1,'End must show the unchanged approved image');
  for(const index of [4,3,2,1,0])await phase(index);
  await phase(1,.2);
  await page.evaluate(()=>{window.motionSamples=[];window.recordMotion=true;let last=performance.now();function record(now){const s=window.__mabweContinuous.stats();window.motionSamples.push({time:now,elapsed:now-last,frame:s.form.current,painted:Number(document.querySelector('#processCanvas').dataset.displayedFrame)});last=now;if(window.recordMotion)requestAnimationFrame(record)}requestAnimationFrame(record)});
  for(let i=0;i<35;i++){await page.mouse.wheel(0,55);await page.waitForTimeout(30);}
  await page.waitForTimeout(800);const motion=await page.evaluate(()=>{window.recordMotion=false;return window.motionSamples});assert(motion.filter((s,i)=>i&&s.painted>motion[i-1].painted).length>35,'Painted images must advance through actual wheel input');
  const state=await page.evaluate(()=>window.__mabweContinuous.stats());assert(state.form.decodedBytes<90*1024*1024);assert.equal(state.form.fetchErrors,0);assert.equal(state.form.decodeErrors,0);const draws=state.form.draws;await page.waitForTimeout(350);assert.equal((await page.evaluate(()=>window.__mabweContinuous.stats())).form.draws,draws,'Settled scene must stop drawing');
  await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(200);assert.equal(await page.locator('[data-step][aria-hidden="true"]').count(),0);assert.equal(await page.locator('.static-process-image:visible').count(),6);await page.screenshot({path:dest+'/'+name+'-reduced.png',fullPage:true});
  assert.deepEqual(errors,[]);reports.push({name,errors,state,motion});await page.close();await browser.close();
 }
 writeFileSync(dest+'/acceptance.json',JSON.stringify(reports,null,2));console.log('PASS: unchanged model, complete process, exact finished image, five layouts, real wheel motion, reversals, bounded decoding and reduced motion.');
}finally{await new Promise(r=>app.server.close(r));rmSync(dir,{recursive:true,force:true})}
