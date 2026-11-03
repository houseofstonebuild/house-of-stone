import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {randomUUID} from 'node:crypto';
import {chromium,firefox,webkit} from 'playwright';import {createApp} from '../server.mjs';
const name=process.env.QA_ENGINE||'chromium',engine={chromium,firefox,webkit}[name],dataDir=mkdtempSync(join(tmpdir(),'hos-models-')),password=randomUUID();
const app=createApp({dataDir,env:{ADMIN_PASSWORD:password},backgroundNotifications:false});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+app.server.address().port,auth={Authorization:'Basic '+Buffer.from('admin:'+password).toString('base64')};
const api=async(path,data)=>{const r=await fetch(base+'/api/admin/'+path,{headers:{...auth,...(data?{'Content-Type':'application/json',Origin:base}:{})},...(data?{method:'POST',body:JSON.stringify(data)}:{})});assert(r.ok);return r.json();};
const out=new URL(`../test-results/browser/star-models/${name}/`,import.meta.url);mkdirSync(out,{recursive:true});let browser;
const errors=[],requests=[],report={engine:name,sourceMismatchGates:0,models:0,forcedFallback:false};
try{
 const staged=await api('prepare-founding-collection',{revision:0});
 browser=await engine.launch(name==='chromium'?{args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']}:name==='firefox'?{firefoxUserPrefs:{'webgl.force-enabled':true}}:{});
 const context=await browser.newContext({httpCredentials:{username:'admin',password},viewport:{width:1440,height:1000},reducedMotion:'reduce'}),page=await context.newPage();
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
 const ready=async path=>{await page.goto(base+path);await page.locator('#hos-concept[data-ready="true"]').waitFor();};
 await ready('/admin/preview');assert.equal(await page.locator('#hos-home-chapters [data-model-stage]').count(),0);assert.equal(requests.filter(url=>url.endsWith('.glb')).length,0);
 // Old reconstructions cannot follow a replaced sculpture photograph, even in preview.
 for(const collection of staged.draft.collections){const work=staged.draft.works.find(w=>w.id===collection.starWorkId);await ready('/admin/preview/works/'+work.slug);assert(await page.locator('#hos-work-model').isHidden(),work.id+' must retain its source gate');report.sourceMismatchGates++;}
 const work=staged.draft.works.find(w=>w.id==='zsa-016');assert(work);await ready('/admin/preview/works/'+work.slug);await page.locator('#hos-work-model').click();
 await page.waitForFunction(()=>['ready','unavailable'].includes(document.querySelector('#hos-model-stage').dataset.modelState),null,{timeout:45000});
 const stage=page.locator('#hos-model-stage'),rendered=await stage.getAttribute('data-model-state')==='ready';if(name==='chromium')assert(rendered,'The approved Happy Times mesh must render');
 if(rendered){assert(Number(await stage.getAttribute('data-model-triangles'))>40000);await page.locator('[data-model-control="right"]').click();await page.waitForFunction(()=>Number(document.querySelector('#hos-model-stage').dataset.modelRotation)>-.1);await page.locator('[data-model-control="in"]').click();await page.waitForFunction(()=>Number(document.querySelector('#hos-model-stage').dataset.modelZoom)>1);await page.locator('[data-model-control="reset"]').click();await page.waitForFunction(()=>Number(document.querySelector('#hos-model-stage').dataset.modelZoom)===1);report.models++;}
 await stage.screenshot({path:new URL('happy-times.png',out).pathname});await page.keyboard.press('Escape');assert(await page.locator('#hos-model-dialog').isHidden());assert.equal(app.db.prepare('SELECT count(*) AS n FROM events').get().n,0);
 await api('publish',{revision:staged.revision});
 const visitor=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});await visitor.addInitScript(()=>localStorage.setItem('hos-measurement','off'));const publicPage=await visitor.newPage();publicPage.on('pageerror',e=>errors.push(e.message));
 await publicPage.goto(base+'/works/'+work.slug);await publicPage.locator('#hos-concept[data-ready="true"]').waitFor();assert(await publicPage.locator('#hos-work-model').isVisible(),'Explicitly approved current-photo model is public');
 const fallback=await browser.newContext({viewport:{width:390,height:844}});await fallback.addInitScript(()=>{localStorage.setItem('hos-measurement','off');const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return /webgl/i.test(type)?null:original.call(this,type,...args);};});
 const fallbackPage=await fallback.newPage();fallbackPage.on('pageerror',e=>errors.push(e.message));await fallbackPage.goto(base+'/works/'+work.slug);await fallbackPage.locator('#hos-concept[data-ready="true"]').waitFor();await fallbackPage.locator('#hos-work-model').click();await fallbackPage.waitForFunction(()=>document.querySelector('#hos-model-stage').dataset.modelState==='unavailable');assert(await fallbackPage.locator('#hos-model-stage .hos-3d-poster').isVisible());assert(await fallbackPage.locator('[data-model-control="right"]').isDisabled());report.forcedFallback=true;
 assert.deepEqual(errors,[]);report.passed=true;writeFileSync(new URL('report.json',out),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser?.close();await new Promise(r=>app.server.close(r));rmSync(dataDir,{recursive:true,force:true});}
