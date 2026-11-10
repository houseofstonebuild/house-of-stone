import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright';
import {createApp} from '../server.mjs';
import {prepareOwnerPublication} from '../scripts/publish-owner-release.mjs';

const dataDir=mkdtempSync(join(tmpdir(),'hos-model-loading-')),password=randomUUID();
const app=createApp({dataDir,env:{ADMIN_PASSWORD:password},backgroundNotifications:false});
await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+app.server.address().port;
const api=async(path,data)=>{const response=await fetch(origin+'/api/admin/'+path,{headers:{Authorization:'Basic '+Buffer.from('admin:'+password).toString('base64'),'Content-Type':'application/json',Origin:origin},...(data?{method:'POST',body:JSON.stringify(data)}:{})});assert(response.ok);return response.json();};
const output=new URL('../test-results/browser/model-loading/',import.meta.url);mkdirSync(output,{recursive:true});
let browser;
try{
  const current=await api('content'),catalog=prepareOwnerPublication(current.draft);catalog.works.find(work=>work.id==='zsa-018').title='Rabbit';
  const saved=await api('content',{revision:current.revision,catalog});await api('publish',{revision:saved.revision});
  browser=await chromium.launch({...(process.env.QA_CHROMIUM_PATH?{executablePath:process.env.QA_CHROMIUM_PATH}:{}),args:[...(process.getuid?.()===0?['--no-sandbox']:[]),'--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  for(const [width,motion] of [[1440,'no-preference'],[390,'reduce']]){
    const page=await browser.newPage({viewport:{width,height:900},reducedMotion:motion});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(()=>localStorage.setItem('hos-measurement','off'));
    let release;const gate=new Promise(resolve=>{release=resolve;});
    await page.route('**/models/rabbit-v1.glb',async route=>{await gate;await route.continue();});
    try{
      await page.goto(origin+'/works/zsa-page-18');await page.locator('#hos-work-model').click();
      await page.waitForFunction(()=>document.querySelector('#hos-model-stage').dataset.modelState==='loading');
      const dialog=page.locator('#hos-model-dialog'),stage=page.locator('#hos-model-stage');
      assert(await stage.locator('.hos-model-loading').isVisible());
      assert.equal(await stage.locator('img:visible').count(),0,'Loading must never show a photograph');
      assert.equal(await stage.getAttribute('aria-busy'),'true');
      assert(await dialog.locator('.hos-model-note').isHidden());
      assert.equal(await dialog.locator('[data-model-control]:disabled').count(),5);
      assert.equal(await stage.locator('.hos-model-loader').evaluate(element=>getComputedStyle(element).animationName),motion==='reduce'?'none':'hos-model-loading');
      const before=(await dialog.boundingBox()).height;
      await dialog.screenshot({path:new URL(`loading-${width}.png`,output).pathname});
      release();await page.waitForFunction(()=>document.querySelector('#hos-model-stage').dataset.modelState==='ready');
      await page.waitForFunction(()=>document.querySelector('#hos-model-stage canvas').getAnimations().length===0);
      assert(await stage.locator('.hos-model-loading').isHidden());assert(await stage.locator('.hos-3d-poster').isHidden());
      assert.equal(await stage.getAttribute('aria-busy'),'false');
      assert.equal(await dialog.locator('.hos-model-note').innerText(),'Digital representation. The actual sculpture may differ slightly.');
      assert(await dialog.locator('.hos-model-note').isVisible());
      assert.equal(await dialog.locator('.hos-model-note').evaluate(element=>getComputedStyle(element).fontSize),'12px');
      assert(Math.abs((await dialog.boundingBox()).height-before)<1,'Loading must not shift the viewer layout');
      await dialog.screenshot({path:new URL(`ready-${width}.png`,output).pathname});
      await page.keyboard.press('Escape');await page.locator('#hos-work-model').click();
      await page.waitForFunction(()=>document.querySelector('#hos-model-stage').dataset.modelState==='ready');
      assert(await stage.locator('.hos-3d-poster').isHidden());assert.deepEqual(errors,[]);
      console.log(`${width}px: neutral loading, no photo swap, quiet caption, motion preference, stable layout and cached reopen passed.`);
    }finally{release();await page.close();}
  }
  const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
  await page.addInitScript(()=>{localStorage.setItem('hos-measurement','off');const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return /webgl/i.test(type)?null:original.call(this,type,...args);};});
  await page.goto(origin+'/works/zsa-page-18');await page.locator('#hos-work-model').click();
  await page.waitForFunction(()=>document.querySelector('#hos-model-stage').dataset.modelState==='unavailable');
  assert(await page.locator('#hos-model-stage .hos-3d-poster').isVisible());
  assert(await page.locator('.hos-model-note').isHidden());assert(await page.locator('.hos-model-loading').isHidden());
  assert.equal(await page.locator('#hos-model-stage').getAttribute('aria-busy'),'false');
  console.log('Unavailable WebGL: labelled photo fallback remains available; model-only caption and loader stay hidden.');
  await page.close();
  // An already-open page can fetch the new lazy viewer before refreshing its HTML.
  const existingPage=await browser.newPage({reducedMotion:'reduce'});
  await existingPage.addInitScript(()=>localStorage.setItem('hos-measurement','off'));
  await existingPage.goto(origin+'/works/zsa-page-18');
  await existingPage.locator('.hos-model-loading').evaluate(element=>element.remove());
  await existingPage.locator('#hos-work-model').click();
  await existingPage.waitForFunction(()=>document.querySelector('#hos-model-stage').dataset.modelState==='ready');
  assert(await existingPage.locator('#hos-model-stage .hos-3d-poster').isHidden());
  await existingPage.close();
  console.log('Previously opened HTML remains compatible with the lazy-loaded viewer.');
}finally{await browser?.close();await new Promise(resolve=>app.server.close(resolve));rmSync(dataDir,{recursive:true,force:true});}
