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
const files=['/app.js','/styles.css','/models.json','/sculpture-viewer.js','/stone-surface.js',...Object.values(models).map(m=>m.file)];
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
const failures=[];const report={origin,sha:process.env.GITHUB_SHA,assets:files.length,routes:0,headers:[],inquiries:[],models:[]};
try {
  const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
  await context.addInitScript(()=>localStorage.setItem('hos-measurement','off'));
  const page=await context.newPage();
  page.on('pageerror',error=>failures.push(error.message));
  page.on('response',r=>{if(r.url().startsWith(origin)&&r.status()>=400)failures.push(`HTTP ${r.status()}: ${new URL(r.url()).pathname}`);});
  page.on('console',m=>{if(m.type()==='error'&&/WebGLProgram|Shader Error/i.test(m.text()))failures.push(m.text());});
  for(const viewport of [{width:1440,height:900},{width:390,height:844}]) {
    await page.setViewportSize(viewport);await page.goto(origin+'/');await page.locator('#hos-concept[data-ready="true"]').waitFor();
    const header=page.locator('.hos-header'),expanded=(await header.boundingBox()).height;
    const anchor=await page.locator('#hos-home-collection-title').evaluate(el=>el.getBoundingClientRect().top+scrollY);
    await page.evaluate(()=>scrollTo(0,300));await page.waitForFunction(()=>document.documentElement.dataset.headerCompact==='true');
    const compact=(await header.boundingBox()).height;
    assert.equal(compact,viewport.width<=700?56:expanded,'Mobile header shrinks and desktop header keeps its height');
    assert(Math.abs(await page.locator('#hos-home-collection-title').evaluate(el=>el.getBoundingClientRect().top+scrollY)-anchor)<1,'Header does not move content');
    await header.screenshot({path:new URL(`header-${viewport.width}-compact.jpg`,output).pathname,type:'jpeg',quality:94});
    await page.locator('.hos-menu-toggle').click();assert(await page.locator('#hos-menu').isVisible());await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(()=>scrollY),300,'Menu preserves the scroll position');
    await page.evaluate(()=>scrollTo(0,0));await page.waitForFunction(()=>document.documentElement.dataset.headerCompact==='false');
    assert.equal((await header.boundingBox()).height,expanded,'Header returns to full size at the top');
    report.headers.push({viewport:viewport.width,expanded,compact});
    const chapters=page.locator('#hos-home-chapters .hos-artist-chapter');
    assert(await chapters.count()>0,'Homepage has artist sections');
    for(let index=0;index<await chapters.count();index++) {
      const chapter=chapters.nth(index),button=chapter.getByRole('button',{name:'Inquire',exact:true});
      assert.equal(await button.count(),1,'One inquiry action per artist section');
      const topic=await button.getAttribute('data-inquiry'),artistId=await button.getAttribute('data-inquiry-artist'),workId=await button.getAttribute('data-inquiry-work');
      assert(artistId,'Inquiry identifies the artist');
      if(workId)assert.equal(await chapter.getByRole('button',{name:'View sculpture',exact:true}).getAttribute('data-work'),workId,'Inquiry identifies the selected sculpture');
      if(await chapter.locator('.hos-chapter-work h3').count()) assert.equal(topic,`${await chapter.locator('.hos-chapter-work h3').innerText()} by ${await chapter.locator('.hos-chapter-artist h2').innerText()}`);
      await button.scrollIntoViewIfNeeded();
      if(index===0) await chapter.locator('.hos-setting-action').screenshot({path:new URL(`inquiry-${viewport.width}.jpg`,output).pathname,type:'jpeg',quality:94});
      const scroll=await page.evaluate(()=>scrollY);await button.click();
      assert(await page.locator('#hos-inquiry-form').isVisible());assert.equal(await page.locator('#hos-inquiry-context').innerText(),topic);
      await page.locator('#hos-inquiry-close').click();assert(await button.isVisible());assert(await button.evaluate(el=>el===document.activeElement));
      assert(Math.abs(await page.evaluate(()=>scrollY)-scroll)<2,'Closing inquiry restores collection position');
      report.inquiries.push({viewport:viewport.width,artistId,workId,topic});
    }
  }
  await page.setViewportSize({width:1440,height:900});
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
    for(let turn=1;turn<=13;turn++) {
      await page.getByRole('button',{name:'Rotate right',exact:true}).click();
      if(turn===7||turn===13) {
        await page.waitForFunction(expected=>Math.abs(Number(document.querySelector('#hos-model-stage').dataset.modelRotation)-expected)<.001,-.3+turn*.24);
        await stage.screenshot({path:new URL(id+`${turn===7?'-side':'-back'}-desktop.jpg`,output).pathname,type:'jpeg',quality:94});
      }
    }
    await page.setViewportSize({width:390,height:844});
    await stage.screenshot({path:new URL(id+'-back-mobile.jpg',output).pathname,type:'jpeg',quality:94});
    await page.getByRole('button',{name:'Reset',exact:true}).click();await page.waitForFunction(()=>Number(document.querySelector('#hos-model-stage').dataset.modelRotation)===-.3);
    await page.setViewportSize({width:390,height:844});await stage.screenshot({path:new URL(id+'-mobile.jpg',output).pathname,type:'jpeg',quality:94});
    await page.keyboard.press('Escape');assert(!await page.locator('body').evaluate(el=>el.classList.contains('hos-model-open')));
    await page.locator('#hos-work-inquiry').click();assert(await page.locator('#hos-inquiry-form').isVisible());await page.keyboard.press('Escape');
    report.models.push({id,title:entry.title,textureWidth:Number(await stage.getAttribute('data-model-texture-width'))});await page.setViewportSize({width:1440,height:900});
  }
  assert.deepEqual(failures,[]);report.passed=true;
} finally {await browser.close();writeFileSync(new URL('report.json',output),JSON.stringify({...report,failures},null,2)+'\n');}
console.log(JSON.stringify(report));
