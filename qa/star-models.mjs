import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {chromium,firefox,webkit} from 'playwright';
import {createApp} from '../server.mjs';
const name=process.env.QA_ENGINE || 'chromium',engine={chromium,firefox,webkit}[name];
const dataDir=mkdtempSync(join(tmpdir(),'hos-star-models-')),password=randomUUID(),app=createApp({dataDir,env:{ADMIN_PASSWORD:password},backgroundNotifications:false});
await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+app.server.address().port,auth={Authorization:'Basic '+Buffer.from('admin:'+password).toString('base64')};
const api=async(path,data)=>(await fetch(base+'/api/admin/'+path,{headers:{...auth,...(data?{'Content-Type':'application/json',Origin:base}:{})},...(data?{method:'POST',body:JSON.stringify(data)}:{})})).json();
const out=new URL(`../test-results/browser/star-models/${name}/`,import.meta.url);mkdirSync(out,{recursive:true});
const ids=['zsa-013','zsa-028','zsa-001','zsa-020','zsa-005'],errors=[],failed=[],requests=[],results=[];let browser;
try{
 const staged=await api('prepare-founding-collection',{revision:0});assert.equal(staged.revision,1);
 browser=await engine.launch(name==='chromium'?{args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']}:name==='firefox'?{firefoxUserPrefs:{'webgl.force-enabled':true}}:{});
 const context=await browser.newContext({httpCredentials:{username:'admin',password},viewport:{width:1440,height:1000},reducedMotion:'reduce'}),page=await context.newPage();
 // Firefox exposes the normal HTTP Basic challenge before retrying with credentials.
 // Private DOM/content assertions below still require authentication to succeed.
 page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{const authChallenge=r.status()===401 && /^Basic /i.test(r.headers()['www-authenticate'] || '');if(r.url().startsWith(base)&&r.status()>=400&&!authChallenge)failed.push([r.status(),r.url()]);});page.on('request',r=>requests.push(r.url()));
 await page.goto(base+'/admin/preview');await page.locator('#hos-concept[data-ready="true"]').waitFor();
 assert.equal(requests.filter(url=>url.endsWith('.glb')).length,0,'3D must load only near its section');
 for(const id of ids){
  const visual=page.locator(`#hos-home-chapters [data-visual-work="${id}"]`);
  assert(await visual.locator('.hos-collection-photo').isVisible(),'The source photograph leads each chapter');
  const photoHeight=(await visual.boundingBox()).height;
  await visual.getByRole('button',{name:'View in 3D',exact:true}).click();
  assert(Math.abs((await visual.boundingBox()).height-photoHeight)<2,'Changing the view must not shift the chapter layout');
  const stage=page.locator(`#hos-home-chapters [data-model-stage][data-model-id="${id}"]`);await stage.scrollIntoViewIfNeeded();
  await page.waitForFunction(id=>['ready','unavailable'].includes(document.querySelector(`#hos-home-chapters [data-model-id="${id}"]`)?.dataset.modelState),id,{timeout:45000});
  const ready=await stage.getAttribute('data-model-state')==='ready';if(ready)assert(Number(await stage.getAttribute('data-model-triangles'))>40000);
  await stage.screenshot({path:new URL(id+'-stage.png',out).pathname});
  await stage.locator('..').locator('[data-model]').click();const dialog=page.locator('#hos-model-dialog'),modal=page.locator('#hos-model-stage');
  await page.waitForFunction(()=>['ready','unavailable'].includes(document.querySelector('#hos-model-stage').dataset.modelState),null,{timeout:45000});assert(await dialog.isVisible());assert(await dialog.locator('.hos-model-review-note').isVisible());
  if(ready){
   await page.locator('[data-model-control="reset"]').click();await page.waitForFunction(()=>Number(document.querySelector('#hos-model-stage').dataset.modelRotation)===-.3);
   await modal.screenshot({path:new URL(id+'-front.png',out).pathname});
   for(let i=0;i<13;i++)await page.locator('[data-model-control="right"]').click();
   await page.waitForFunction(()=>Number(document.querySelector('#hos-model-stage').dataset.modelRotation)>2.8);await modal.screenshot({path:new URL(id+'-reverse.png',out).pathname});
   await page.locator('[data-model-control="in"]').click();await page.waitForFunction(()=>Number(document.querySelector('#hos-model-stage').dataset.modelZoom)>1);await page.locator('[data-model-control="reset"]').click();
  }else assert(await page.locator('[data-model-control="right"]').isDisabled());
  await page.keyboard.press('Escape');assert(!(await dialog.isVisible()));
  await visual.getByRole('button',{name:'Photograph',exact:true}).click();assert(await visual.locator('.hos-collection-photo').isVisible());assert(!(await stage.isVisible()));
  await visual.getByRole('button',{name:'View in 3D',exact:true}).click();results.push({id,webglReady:ready});
 }
 assert.equal(app.db.prepare('SELECT count(*) AS n FROM events').get().n,0,'Private review must not log visitors');
 await page.setViewportSize({width:390,height:844});await page.locator('#hos-home-chapters [data-model-stage]').first().scrollIntoViewIfNeeded();const before=await page.evaluate(()=>scrollY);await page.mouse.move(195,600);await page.mouse.wheel(0,180);await page.waitForFunction(y=>scrollY>y,before);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await api('publish',{revision:staged.revision});
 const publicContext=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});await publicContext.addInitScript(()=>localStorage.setItem('hos-measurement','off'));const publicPage=await publicContext.newPage();await publicPage.goto(base);await publicPage.locator('#hos-concept[data-ready="true"]').waitFor();
 assert.equal(await publicPage.locator('#hos-home-chapters [data-model-stage]').count(),0);assert.equal(await publicPage.locator('#hos-home-chapters [data-model-fallback]').count(),5);
 const state=await api('content');state.draft.works.find(w=>w.id==='zsa-013').verification.model=true;const saved=await api('content',{revision:state.revision,catalog:state.draft});await api('publish',{revision:saved.revision});
 await publicPage.reload();await publicPage.locator('#hos-concept[data-ready="true"]').waitFor();assert.equal(await publicPage.locator('#hos-home-chapters [data-model-stage]').count(),1);assert.equal(await publicPage.locator('#hos-home-chapters .hos-poster-caption .hos-availability').first().textContent(),'Sold');
 const fallbackContext=await browser.newContext({viewport:{width:390,height:844}});
 await fallbackContext.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return /webgl/i.test(type)?null:original.call(this,type,...args);};localStorage.setItem('hos-measurement','off');});
 const fallbackPage=await fallbackContext.newPage();await fallbackPage.goto(base);await fallbackPage.locator('#hos-concept[data-ready="true"]').waitFor();
 await fallbackPage.locator('#hos-home-chapters [data-visual-mode="model"]').first().click();
 const fallbackStage=fallbackPage.locator('#hos-home-chapters [data-model-stage]').first();await fallbackStage.scrollIntoViewIfNeeded();
 await fallbackPage.waitForFunction(()=>document.querySelector('#hos-home-chapters [data-model-stage]').dataset.modelState==='unavailable');assert(await fallbackStage.locator('.hos-3d-poster').isVisible());
 await fallbackStage.locator('..').locator('[data-model]').click();await fallbackPage.waitForFunction(()=>document.querySelector('#hos-model-stage').dataset.modelState==='unavailable');assert(await fallbackPage.locator('[data-model-control="right"]').isDisabled());await fallbackPage.keyboard.press('Escape');
 if(name==='chromium')assert.equal(results.filter(x=>x.webglReady).length,5,'All five real exported models must render in Chromium');
 assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
 writeFileSync(new URL('report.json',out),JSON.stringify({engine:name,results,privateEvents:0,publicUnconfirmedFallbacks:5,publicConfirmedStages:1,forcedWebGLFallback:true,errors,failed},null,2));
 console.log(`Star model QA passed (${name}); real WebGL ${results.filter(x=>x.webglReady).length}/5.`);
}finally{await browser?.close();await new Promise(resolve=>app.server.close(resolve));rmSync(dataDir,{recursive:true,force:true});}
