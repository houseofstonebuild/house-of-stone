import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright';
import {createApp} from '../server.mjs';import {prepareOwnerPublication} from '../scripts/publish-owner-release.mjs';
const dataDir=mkdtempSync(join(tmpdir(),'hos-experience-')),password=randomUUID(),app=createApp({dataDir,env:{ADMIN_PASSWORD:password},backgroundNotifications:false});
await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+app.server.address().port,out=new URL('../test-results/experience/',import.meta.url);mkdirSync(out,{recursive:true});
const api=async(path,data)=>{const r=await fetch(origin+'/api/admin/'+path,{headers:{Authorization:'Basic '+Buffer.from('admin:'+password).toString('base64'),'Content-Type':'application/json',Origin:origin},...(data?{method:'POST',body:JSON.stringify(data)}:{})});assert(r.ok);return r.json();};
let browser;const errors=[],failed=[],report={layouts:0,models:[],touch:false};
try{
 const current=await api('content'),state=await api('content',{revision:current.revision,catalog:prepareOwnerPublication(current.draft)});await api('publish',{revision:state.revision});
 const catalog=await(await fetch(origin+'/content.json')).json();
 browser=await chromium.launch({args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const context=await browser.newContext({reducedMotion:'reduce'});await context.addInitScript(()=>localStorage.setItem('hos-measurement','off'));const page=await context.newPage();
 page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.url().startsWith(origin)&&r.status()>=400)failed.push([r.status(),r.url()]);});
 const ready=async(path='/')=>{assert((await page.goto(origin+path)).ok());await page.locator('#hos-concept[data-ready="true"]').waitFor();await page.evaluate(()=>document.fonts.ready);};
 for(const width of [320,390,768,1440]){
  await page.setViewportSize({width,height:1000});await ready();
  const discover=page.locator('.hos-discover');const parts=await discover.evaluate(n=>{const t=n.children[0].getBoundingClientRect(),a=n.children[1].getBoundingClientRect();return{bottom:t.bottom,arrowTop:a.top,radius:getComputedStyle(n.children[1]).borderRadius};});assert(parts.arrowTop>parts.bottom);assert.equal(parts.radius,'50%');
  for(const c of catalog.collections){
   const chapter=page.locator(`[data-page="home"] [data-collection-section="${c.id}"]`);
   assert.deepEqual(await chapter.locator('.hos-collection-selection .hos-work-card').evaluateAll(nodes=>nodes.map(n=>n.dataset.workRecord)),c.workIds);
   assert.equal(await chapter.locator('.hos-supporting-preview').count(),0);
   const img=chapter.locator('.hos-collection-landscape>img');assert.equal(await img.count(),1);await img.scrollIntoViewIfNeeded();await img.evaluate(i=>i.decode());
   assert.equal(await img.evaluate(i=>getComputedStyle(i).objectFit),'cover');
   const widths=await chapter.locator('.hos-collection-selection .hos-work-card-photo').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().width));assert(Math.max(...widths)-Math.min(...widths)<2);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   if([390,1440].includes(width)){await chapter.screenshot({path:new URL(width+'-'+c.id+'.jpg',out).pathname,type:'jpeg',quality:88});}
   report.layouts++;
  }
  for(const c of catalog.collections){await ready('/collections/'+c.slug);assert.deepEqual(await page.locator('#hos-category-content .hos-work-card').evaluateAll(nodes=>nodes.map(n=>n.dataset.workRecord)),c.workIds);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
 }
 await page.setViewportSize({width:1440,height:1000});await page.emulateMedia({reducedMotion:'no-preference'});await ready();
 assert.equal(await page.locator('.hos-hero-image').evaluate(n=>getComputedStyle(n).animationName),'hos-hero-pan');
 await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.hos-hero-image').evaluate(n=>getComputedStyle(n).animationName),'none');
 for(const c of catalog.collections){
  await ready();const visual=page.locator(`#hos-home-chapters [data-visual-work="${c.starWorkId}"]`);await visual.locator('[data-visual-mode="model"]').click();const stage=visual.locator('[data-model-stage]');await stage.scrollIntoViewIfNeeded();
  await page.waitForFunction(id=>document.querySelector(`#hos-home-chapters [data-model-id="${id}"]`)?.dataset.modelState==='ready',c.starWorkId,{timeout:45000});
  const canvas=stage.locator('.hos-3d-canvas'),b=await canvas.boundingBox(),before=Number(await stage.getAttribute('data-model-rotation'));
  await page.mouse.move(b.x+b.width*.45,b.y+b.height*.5);await page.mouse.down();await page.mouse.move(b.x+b.width*.45+100,b.y+b.height*.5,{steps:8});await page.mouse.up();
  await page.waitForFunction(({id,before})=>Number(document.querySelector(`#hos-home-chapters [data-model-id="${id}"]`).dataset.modelRotation)>before+.5,{id:c.starWorkId,before});
  assert(await page.locator('#hos-model-dialog').isHidden());await canvas.focus();await page.keyboard.press('Home');await page.waitForFunction(id=>Math.abs(Number(document.querySelector(`#hos-home-chapters [data-model-id="${id}"]`).dataset.modelRotation)+.3)<.001,c.starWorkId);
  await stage.screenshot({path:new URL(c.id+'-inline-3d.jpg',out).pathname,type:'jpeg',quality:88});report.models.push(c.starWorkId);
 }
 const touch=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,reducedMotion:'reduce'});await touch.addInitScript(()=>localStorage.setItem('hos-measurement','off'));const mobile=await touch.newPage();mobile.on('pageerror',e=>errors.push(e.message));await mobile.goto(origin);await mobile.locator('#hos-concept[data-ready="true"]').waitFor();
 const visual=mobile.locator('#hos-home-chapters [data-visual-work]').first();await visual.locator('[data-visual-mode="model"]').click();const stage=visual.locator('[data-model-stage]');await stage.scrollIntoViewIfNeeded();await mobile.waitForFunction(()=>document.querySelector('#hos-home-chapters [data-model-stage]').dataset.modelState==='ready');
 const canvas=stage.locator('.hos-3d-canvas');assert.equal(await canvas.evaluate(n=>getComputedStyle(n).touchAction),'pan-y pinch-zoom');const session=await touch.newCDPSession(mobile);let b=await canvas.boundingBox();let x=b.x+b.width*.35,y=b.y+b.height*.5;
 await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});for(let step=1;step<=6;step++)await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+step*15,y,id:1}]});await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await mobile.waitForFunction(()=>Number(document.querySelector('#hos-home-chapters [data-model-stage]').dataset.modelRotation)>.2);assert(await mobile.locator('#hos-model-dialog').isHidden());
 await stage.scrollIntoViewIfNeeded();b=await canvas.boundingBox();x=b.x+b.width*.5;y=b.y+b.height*.75;const scrollBefore=await mobile.evaluate(()=>scrollY);
 await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:2}]});for(let step=1;step<=8;step++){await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-step*18,id:2}]});await mobile.waitForTimeout(20);}await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await mobile.waitForFunction(before=>scrollY>before+30,scrollBefore);
 await mobile.emulateMedia({reducedMotion:'no-preference'});await stage.scrollIntoViewIfNeeded();const rotation=Number(await stage.getAttribute('data-model-rotation'));await mobile.evaluate(()=>scrollBy(0,70));await mobile.waitForFunction(before=>Math.abs(Number(document.querySelector('#hos-home-chapters [data-model-stage]').dataset.modelRotation)-before)>.01,rotation);report.touch=true;
 assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);report.passed=true;writeFileSync(new URL('report.json',out),JSON.stringify(report,null,2));console.log('Collection experience passed: '+JSON.stringify(report));
}finally{await browser?.close();await new Promise(r=>app.server.close(r));rmSync(dataDir,{recursive:true,force:true});}

