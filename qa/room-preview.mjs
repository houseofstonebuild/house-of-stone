import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {chromium,webkit} from 'playwright';
import {createApp} from '../server.mjs';
import {prepareOwnerPublication} from '../scripts/publish-owner-release.mjs';

const dataDir=mkdtempSync(join(tmpdir(),'hos-ar-')),password=randomUUID();
const app=createApp({dataDir,env:{ADMIN_PASSWORD:password},backgroundNotifications:false});
await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+app.server.address().port;
const api=async(path,data)=>{
  const response=await fetch(origin+'/api/admin/'+path,{method:data?'POST':'GET',headers:{Authorization:'Basic '+Buffer.from('admin:'+password).toString('base64'),'Content-Type':'application/json',Origin:origin},...(data?{body:JSON.stringify(data)}:{})});
  assert(response.ok,`${path}: ${response.status}`);return response.json();
};
let browser;
try {
  const current=await api('content');
  const state=await api('content',{revision:current.revision,catalog:prepareOwnerPublication(current.draft)});
  await api('publish',{revision:state.revision});
  const engine=process.env.QA_ENGINE==='webkit'?webkit:chromium;
  browser=await engine.launch(process.env.QA_ENGINE==='webkit'?{}:{args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
  const failures=[];
  page.on('requestfailed',request=>failures.push(`${request.url()}: ${request.failure()?.errorText}`));
  page.on('pageerror',error=>failures.push(`page: ${error.message}`));
  const catalog=await(await fetch(origin+'/content.json')).json();
  for(const id of ['hos-queen-mother','zsa-023','zsa-024']) {
    const work=catalog.works.find(item=>item.id===id);
    assert(work,`${id} missing from published fixture`);
    await page.goto(origin+'/works/'+work.slug);
    await page.locator('#hos-concept[data-ready="true"]').waitFor();
    await page.locator('#hos-work-ar-trigger').click();
    const viewer=page.locator('#hos-ar-stage model-viewer');
    await viewer.waitFor();
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
