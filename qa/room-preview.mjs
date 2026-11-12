import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {chromium,webkit} from 'playwright';
import {createApp} from '../server.mjs';

const dataDir=mkdtempSync(join(tmpdir(),'hos-ar-')),password=randomUUID();
const app=createApp({dataDir,env:{ADMIN_PASSWORD:password},backgroundNotifications:false});
await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+app.server.address().port;
let browser;
try {
  const engine=process.env.QA_ENGINE==='webkit'?webkit:chromium;
  browser=await engine.launch(process.env.QA_ENGINE==='webkit'?{}:{args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
  const failures=[];
  page.on('requestfailed',request=>failures.push(`${request.url()}: ${request.failure()?.errorText}`));
  page.on('pageerror',error=>failures.push(`page: ${error.message}`));
  for(const [id,title,file] of [
    ['hos-queen-mother','Queen Mother','/models/queen-mother-uploaded-v1.glb'],
    ['zsa-023','Reflection','/models/reflection-uploaded-v1.glb'],
    ['zsa-024','Family','/models/family-uploaded-v1.glb']
  ]) {
    await page.goto(origin+'/');
    await page.locator('#hos-concept[data-ready="true"]').waitFor();
    await page.evaluate(async ({id,title,file})=>{
      const {initializeRoomPreview}=await import('/room-preview.js');
      await initializeRoomPreview(document.querySelector('#hos-concept')).open({id,title},{workId:id,file,uploaded:true,ownerApproved:true},document.querySelector('#hos-work-ar-trigger'));
    },{id,title,file});
    const viewer=page.locator('#hos-ar-stage model-viewer');
    assert(await viewer.count(),`${id} component failed: ${await page.locator('#hos-ar-status').textContent()}; ${failures.join('; ')}`);
    await page.waitForFunction(()=>{
      const message=document.querySelector('#hos-ar-status')?.textContent||'';
      return message.includes('approximately')||message.includes('could not');
    },null,{timeout:30000});
    const result=await viewer.evaluate(element=>({src:element.getAttribute('src'),loaded:element.loaded,errorType:element.dataset.errorType,dimensions:element.getDimensions?.(),scale:element.scale,status:document.querySelector('#hos-ar-status').textContent}));
    console.log(id,JSON.stringify({result,failures}));
    assert(result.status.includes('approximately'),`${id} room preview failed: ${result.status}; ${failures.join('; ')}`);
    assert(result.dimensions?.y>0,`${id} has no model height`);
    await page.locator('[data-ar-close]').click();
  }
} finally {
  await browser?.close();
  await new Promise(resolve=>app.server.close(resolve));
  rmSync(dataDir,{recursive:true,force:true});
}
