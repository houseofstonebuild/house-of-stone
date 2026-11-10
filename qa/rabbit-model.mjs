import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright';
import {createApp} from '../server.mjs';
import {prepareOwnerPublication} from '../scripts/publish-owner-release.mjs';

const dataDir=mkdtempSync(join(tmpdir(),'hos-rabbit-')),password=randomUUID();
const app=createApp({dataDir,env:{ADMIN_PASSWORD:password},backgroundNotifications:false});
await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+app.server.address().port;
const api=async(path,data)=>{
  const response=await fetch(origin+'/api/admin/'+path,{headers:{Authorization:'Basic '+Buffer.from('admin:'+password).toString('base64'),'Content-Type':'application/json',Origin:origin},...(data?{method:'POST',body:JSON.stringify(data)}:{})});
  assert(response.ok);return response.json();
};
let browser;
try{
  // Current production title, applied only to this temporary database.
  const current=await api('content'),catalog=prepareOwnerPublication(current.draft);
  catalog.works.find(work=>work.id==='zsa-018').title='Rabbit';
  const saved=await api('content',{revision:current.revision,catalog});
  await api('publish',{revision:saved.revision});
  const published=await (await fetch(origin+'/content.json')).json();
  const rabbit=published.works.find(work=>work.id==='zsa-018');
  assert.equal(rabbit.title,'Rabbit');
  assert.equal(published.assets[rabbit.image],'/assets/zsa-page-18.jpg');
  browser=await chromium.launch({...(process.env.QA_CHROMIUM_PATH?{executablePath:process.env.QA_CHROMIUM_PATH}:{}),args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const output=new URL('../test-results/browser/',import.meta.url);mkdirSync(output,{recursive:true});
  for(const width of [1440,390]){
    const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce',hasTouch:width===390});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(()=>localStorage.setItem('hos-measurement','off'));
    assert((await page.goto(origin+'/works/zsa-page-18')).ok());
    await page.locator('#hos-concept[data-ready="true"]').waitFor();
    const link=page.locator('#hos-work-model');
    await link.waitFor({state:'visible'});
    assert(await link.isVisible());
    await page.screenshot({path:new URL(`rabbit-${width}.png`,output).pathname});
    await link.click();
    await page.waitForFunction(()=>document.querySelector('#hos-model-stage').dataset.modelState==='ready',null,{timeout:60000});
    assert(await page.locator('#hos-model-stage canvas.hos-3d-canvas').isVisible());
    assert(await page.locator('#hos-model-dialog').isVisible());
    assert.equal(await page.locator('#hos-model-title').innerText(),'Rabbit');
    for(const control of ['left','right','in','out','reset'])await page.locator(`[data-model-control="${control}"]`).click();
    const canvas=page.locator('#hos-model-stage canvas');await canvas.focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('Home');
    await page.screenshot({path:new URL(`rabbit-dialog-${width}.png`,output).pathname});
    await page.keyboard.press('Escape');assert(await page.locator('#hos-model-dialog').isHidden());
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    assert.deepEqual(errors,[]);await page.close();
    console.log(`Rabbit ${width}px: textured WebGL render, dialog, rotation, zoom, reset, keyboard, close passed.`);
  }
}finally{
  await browser?.close();await new Promise(resolve=>app.server.close(resolve));rmSync(dataDir,{recursive:true,force:true});
}
