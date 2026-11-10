import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright';
import {createApp} from '../server.mjs';
import {prepareOwnerPublication} from '../scripts/publish-owner-release.mjs';
import {prepareVerifiedMetadata} from '../scripts/publish-verified-metadata.mjs';
import {prepareCollectionRoundOne} from '../scripts/publish-collection-round-one.mjs';
import {prepareCollectionRoundTwo} from '../scripts/publish-collection-round-two.mjs';
import {prepareOwnerMeasurements} from '../scripts/publish-owner-measurements.mjs';
import {prepareOwnerRoundFour} from '../scripts/publish-owner-round-four.mjs';
import {prepareOwnerRoundFive} from '../scripts/publish-owner-round-five.mjs';
import {prepareOwnerRoundSix} from '../scripts/publish-owner-round-six.mjs';
import {prepareUploadedWorks,newWorks} from '../scripts/publish-uploaded-model-works.mjs';

const dataDir=mkdtempSync(join(tmpdir(),'hos-uploaded-')),password=randomUUID();
const app=createApp({dataDir,env:{ADMIN_PASSWORD:password},backgroundNotifications:false});
await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+app.server.address().port;
const api=async(path,data)=>{
  const response=await fetch(origin+'/api/admin/'+path,{headers:{Authorization:'Basic '+Buffer.from('admin:'+password).toString('base64'),'Content-Type':'application/json',Origin:origin},...(data?{method:'POST',body:JSON.stringify(data)}:{})});
  assert(response.ok,await response.clone().text());return response.json();
};
const audit=JSON.parse(readFileSync(new URL('../content/uploaded-model-audit.json',import.meta.url)));
const output=new URL('../test-results/browser/uploaded-models/',import.meta.url);mkdirSync(output,{recursive:true});
const report={models:[],passed:false};let browser;
try{
  const current=await api('content');let catalog=current.draft;
  for(const prepare of [prepareOwnerPublication,prepareVerifiedMetadata,prepareCollectionRoundOne,prepareCollectionRoundTwo,prepareOwnerMeasurements,prepareOwnerRoundFour,prepareOwnerRoundFive,prepareOwnerRoundSix])catalog=prepare(catalog);
  catalog=prepareUploadedWorks(catalog);
  for(const record of audit){const work=catalog.works.find(work=>work.id===record.workId);work.title=record.title;work.verification={...work.verification,title:true};}
  const saved=await api('content',{revision:current.revision,catalog});await api('publish',{revision:saved.revision});
  browser=await chromium.launch({...(process.env.QA_CHROMIUM_PATH?{executablePath:process.env.QA_CHROMIUM_PATH}:{}),args:[...(process.getuid?.()===0?['--no-sandbox']:[]),'--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error'&&/WebGLProgram|Shader Error|WebAssembly|MIME type/.test(message.text()))errors.push(message.text());});
  await page.addInitScript(()=>localStorage.setItem('hos-measurement','off'));
  const selected=process.env.QA_MODEL_IDS?.split(',');
  for(const record of audit.filter(record=>!selected||selected.includes(record.workId))){
    const work=catalog.works.find(work=>work.id===record.workId);
    await page.setViewportSize({width:1440,height:900});
    if(report.models.length===0){assert((await page.goto(origin+'/works/'+work.slug)).ok());}
    else {await page.evaluate(slug=>{history.pushState({},'', '/works/'+slug);dispatchEvent(new PopStateEvent('popstate'));},work.slug);}
    await page.locator('#hos-work-model').waitFor({state:'visible'});
    const addition=newWorks.find(item=>item.id===record.workId);
    if(addition){
      assert.equal(await page.locator('#hos-work-title').innerText(),addition.title);
      await page.locator('#hos-work-photo-open').click();
      const gallery=page.locator('#hos-photo-dialog');
      assert(await gallery.isVisible());
      for(let photo=0;photo<addition.photos.length;photo++){
        await page.waitForFunction(()=>{const image=document.querySelector('#hos-photo-dialog .hos-photo-stage img');return image.complete&&image.naturalWidth>0;});
        assert((await gallery.locator('.hos-photo-stage img').getAttribute('src')).includes(addition.id));
        if(photo===0)await gallery.screenshot({path:new URL(record.workId+'-photograph.png',output).pathname});
        if(photo+1<addition.photos.length)await gallery.locator('[data-photo-step="1"]').click();
      }
      await gallery.locator('[data-photo-close]').click();
      await page.locator('#hos-work-inquiry').click();
      assert(await page.locator('#hos-inquiry-form').isVisible());
      assert((await page.locator('#hos-inquiry-context').innerText()).includes(addition.title));
      await page.locator('#hos-inquiry-close').click();
    }
    await page.locator('#hos-work-model').click();
    await page.waitForFunction(()=>document.querySelector('#hos-model-stage')?.dataset.modelState==='ready',null,{timeout:60000});
    const stage=page.locator('#hos-model-stage');
    assert(Number(await stage.getAttribute('data-model-cache-size'))<=2);
    // Renderer statistics include the two-triangle ground shadow.
    assert.equal(Number(await stage.getAttribute('data-model-triangles')),record.triangles+2);
    assert.equal(Number(await stage.getAttribute('data-model-texture-width')),2048);
    await stage.screenshot({path:new URL(record.workId+'-desktop.png',output).pathname});
    await page.locator('[data-model-control="right"]').click();
    await page.waitForFunction(()=>Number(document.querySelector('#hos-model-stage').dataset.modelRotation)>-.1);
    await page.locator('[data-model-control="in"]').click();
    await page.waitForFunction(()=>Number(document.querySelector('#hos-model-stage').dataset.modelZoom)>1);
    await page.locator('[data-model-control="reset"]').click();
    await page.waitForFunction(()=>Number(document.querySelector('#hos-model-stage').dataset.modelZoom)===1);
    await page.setViewportSize({width:390,height:844});
    await stage.screenshot({path:new URL(record.workId+'-mobile.png',output).pathname});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await page.keyboard.press('Escape');assert(await page.locator('#hos-model-dialog').isHidden());
    assert.deepEqual(errors,[]);report.models.push(record.workId);
    console.log(`${record.title}: textured mesh, rotation, zoom, reset and mobile layout passed.`);
  }
  assert.equal(app.db.prepare('SELECT count(*) AS n FROM events').get().n,0);
  report.passed=true;
}finally{
  writeFileSync(new URL('report.json',output),JSON.stringify(report,null,2)+'\n');
  await browser?.close();await new Promise(resolve=>app.server.close(resolve));rmSync(dataDir,{recursive:true,force:true});
}
