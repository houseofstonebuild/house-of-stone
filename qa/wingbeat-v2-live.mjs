import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from 'playwright';

const origin='https://house-of-stone-production.up.railway.app';
const out=new URL('../test-results/wingbeat-v2-live/',import.meta.url);mkdirSync(out,{recursive:true});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const expectedModel='97e82842792a93b1abc159578b15aae3399264be4ea4445b0fd46f9896ff6fac';
const expectedApp=sha(readFileSync(new URL('../public/app.js',import.meta.url)));
let deployed=false,lastError;
for(let attempt=0;attempt<48;attempt++){
 try{
  const app=await fetch(origin+'/app.js?wingbeat='+expectedApp,{signal:AbortSignal.timeout(15000)});
  assert(app.ok);assert.equal(sha(Buffer.from(await app.arrayBuffer())),expectedApp);
  const res=await fetch(origin+'/models.json?wingbeat='+expectedModel,{signal:AbortSignal.timeout(15000)});assert(res.ok);
  const manifest=await res.json();assert(manifest['zsa-016'].ownerApproved);assert.equal(manifest['zsa-016'].file,'/models/wingbeat-v2.glb');
  const model=await fetch(origin+manifest['zsa-016'].file,{signal:AbortSignal.timeout(30000)});assert(model.ok);
  assert.equal(sha(Buffer.from(await model.arrayBuffer())),expectedModel);
  deployed=true;break;
 }catch(error){lastError=error.message;console.log('Waiting for Wingbeat deployment '+(attempt+1)+'/48: '+lastError);await delay(10000);}
}
assert(deployed,lastError);
const catalog=await(await fetch(origin+'/content.json')).json();
const work=catalog.works.find(work=>work.id==='zsa-016');assert(work);
const browser=await chromium.launch({args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const report={origin,modelSha256:expectedModel,workId:work.id,viewports:[],failures:[]};
try{
 const context=await browser.newContext({reducedMotion:'reduce'});
 await context.addInitScript(()=>localStorage.setItem('hos-measurement','off'));
 await context.route('**/api/**',async route=>{if(!['GET','HEAD'].includes(route.request().method()))await route.abort();else await route.continue();});
 const page=await context.newPage();
 page.on('pageerror',error=>report.failures.push(error.message));
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:1000});
  const response=await page.goto(origin+'/works/'+work.slug);assert(response.ok());
  await page.locator('#hos-concept[data-ready="true"]').waitFor();
  report.url=page.url();assert.equal(await page.locator('#hos-work-title').innerText(),'Wingbeat');
  assert((await page.locator('#hos-work-image').getAttribute('src')).includes('wingbeat-shoot-front-v1'));
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  const button=page.locator('#hos-work-model');assert(await button.isVisible());await button.click();
  const stage=page.locator('#hos-model-stage');
  await page.waitForFunction(()=>document.querySelector('#hos-model-stage').dataset.modelState==='ready',null,{timeout:60000});
  const canvas=stage.locator('canvas.hos-3d-canvas');const before=await canvas.screenshot();
  const box=await canvas.boundingBox();
  await page.mouse.move(box.x+box.width*.35,box.y+box.height*.5);await page.mouse.down();
  await page.mouse.move(box.x+box.width*.65,box.y+box.height*.5,{steps:10});await page.mouse.up();
  assert(!before.equals(await canvas.screenshot()),'Drag rotates the live model');
  await page.getByRole('button',{name:'Rotate right',exact:true}).click();
  await page.getByRole('button',{name:'Zoom in',exact:true}).click();
  await page.getByRole('button',{name:'Reset',exact:true}).click();
  await page.locator('#hos-model-dialog').screenshot({path:new URL(width+'-wingbeat-live.jpg',out).pathname,type:'jpeg',quality:94});
  report.viewports.push({width,loaded:true,rotates:true,controls:true});
  await page.locator('#hos-model-close').click();assert(!await page.locator('#hos-model-dialog').isVisible());
  await page.goto(origin);await page.locator('#hos-concept[data-ready="true"]').waitFor();
  assert.equal(await page.locator('#hos-home-chapters [data-model-stage]').count(),0,'Collection banners remain photographs');
 }
 assert.deepEqual(report.failures,[]);
 writeFileSync(new URL('report.json',out),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
