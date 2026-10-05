import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from 'playwright';

// Read-only production verification: no inbox writes and no demand events.
const origin=new URL(process.env.HOS_LIVE_URL || 'https://house-of-stone-production.up.railway.app').origin;
const models=JSON.parse(readFileSync(new URL('../public/models.json',import.meta.url),'utf8'));
const catalog=JSON.parse(readFileSync(new URL('../content/catalog.json',import.meta.url),'utf8'));
const output=new URL('../test-results/live/',import.meta.url);mkdirSync(output,{recursive:true});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const files=['/models.json','/sculpture-viewer.js',...Object.values(models).map(m=>m.file)];
const expected=new Map(files.map(path=>[path,hash(readFileSync(new URL('../public'+path,import.meta.url)))]));
let deployed=false,lastError;
for(let attempt=0;attempt<48;attempt++) {
  try {
    const health=await fetch(origin+'/health',{signal:AbortSignal.timeout(12000)});assert(health.ok && (await health.json()).ok);
    for(const path of files) {
      const response=await fetch(origin+path+'?release='+encodeURIComponent(process.env.GITHUB_SHA || expected.get(path)),{cache:'no-store',signal:AbortSignal.timeout(15000)});
      assert(response.ok,`${path}: HTTP ${response.status}`);assert.equal(hash(Buffer.from(await response.arrayBuffer())),expected.get(path),`${path}: waiting for current release`);
    }
    deployed=true;break;
  } catch(error) {lastError=error.message;console.log(`Waiting for Railway release (${attempt+1}/48): ${lastError}`);await delay(10000);}
}
assert(deployed,lastError);
const browser=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const failures=[];const report={origin,sha:process.env.GITHUB_SHA,assets:files.length,routes:0,models:[]};
try {
  const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
  await context.addInitScript(()=>localStorage.setItem('hos-measurement','off'));
  const page=await context.newPage();
  page.on('pageerror',error=>failures.push(error.message));
  page.on('response',r=>{if(r.url().startsWith(origin)&&r.status()>=400)failures.push(`HTTP ${r.status()}: ${new URL(r.url()).pathname}`);});
  page.on('console',m=>{if(m.type()==='error'&&/WebGLProgram|Shader Error/i.test(m.text()))failures.push(m.text());});
  for(const path of ['/','/collection','/artists','/making','/designers','/collectors','/house','/privacy',...catalog.artists.map(a=>'/artists/'+a.slug),...catalog.works.map(w=>'/works/'+w.slug)]) {
    await page.goto(origin+path);await page.locator('#hos-concept[data-ready="true"]').waitFor();report.routes++;
  }
  for(const [id,entry] of Object.entries(models)) {
    await page.goto(origin+'/works/'+id);await page.locator('#hos-concept[data-ready="true"]').waitFor();await page.locator('#hos-work-model').click();
    const stage=page.locator('#hos-model-stage');await page.waitForFunction(()=>document.querySelector('#hos-model-stage').dataset.modelState==='ready');
    await page.waitForFunction(()=>Number(document.querySelector('#hos-model-stage').dataset.modelTriangles)>500);
    assert(Number(await stage.getAttribute('data-model-texture-width'))>=1000,`${id}: full-resolution texture`);
    await stage.screenshot({path:new URL(id+'-desktop.jpg',output).pathname,type:'jpeg',quality:94});
    await page.getByRole('button',{name:'Rotate right',exact:true}).click();await page.waitForFunction(()=>Number(document.querySelector('#hos-model-stage').dataset.modelRotation)>-.1);
    await page.getByRole('button',{name:'Zoom in',exact:true}).click();await page.waitForFunction(()=>Number(document.querySelector('#hos-model-stage').dataset.modelZoom)>1);
    await page.getByRole('button',{name:'Reset',exact:true}).click();await page.waitForFunction(()=>Number(document.querySelector('#hos-model-stage').dataset.modelRotation)===-.3);
    await page.setViewportSize({width:390,height:844});await stage.screenshot({path:new URL(id+'-mobile.jpg',output).pathname,type:'jpeg',quality:94});
    await page.keyboard.press('Escape');assert(!await page.locator('body').evaluate(el=>el.classList.contains('hos-model-open')));
    await page.locator('#hos-work-inquiry').click();assert(await page.locator('#hos-inquiry-form').isVisible());await page.keyboard.press('Escape');
    report.models.push({id,title:entry.title,textureWidth:Number(await stage.getAttribute('data-model-texture-width'))});await page.setViewportSize({width:1440,height:900});
  }
  assert.deepEqual(failures,[]);report.passed=true;
} finally {await browser.close();writeFileSync(new URL('report.json',output),JSON.stringify({...report,failures},null,2)+'\n');}
console.log(JSON.stringify(report));
