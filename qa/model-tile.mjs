import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright';
import {createApp} from '../server.mjs';
import {prepareOwnerPublication} from '../scripts/publish-owner-release.mjs';

const dataDir=mkdtempSync(join(tmpdir(),'hos-model-tile-')),password=randomUUID();
const app=createApp({dataDir,env:{ADMIN_PASSWORD:password},backgroundNotifications:false});
await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+app.server.address().port;
const api=async(path,data)=>{const response=await fetch(origin+'/api/admin/'+path,{headers:{Authorization:'Basic '+Buffer.from('admin:'+password).toString('base64'),'Content-Type':'application/json',Origin:origin},...(data?{method:'POST',body:JSON.stringify(data)}:{})});assert(response.ok);return response.json();};
const output=new URL('../test-results/browser/model-tile/',import.meta.url);mkdirSync(output,{recursive:true});let browser;
try{
  const current=await api('content'),catalog=prepareOwnerPublication(current.draft);catalog.works.find(work=>work.id==='zsa-018').title='Rabbit';
  const saved=await api('content',{revision:current.revision,catalog});await api('publish',{revision:saved.revision});
  browser=await chromium.launch({...(process.env.QA_CHROMIUM_PATH?{executablePath:process.env.QA_CHROMIUM_PATH}:{}),args:[...(process.getuid?.()===0?['--no-sandbox']:[]),'--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  for(const width of [1440,390,320]){
    const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.addInitScript(()=>localStorage.setItem('hos-measurement','off'));
    await page.goto(origin+'/works/zsa-page-18');await page.locator('#hos-concept[data-ready="true"]').waitFor();
    const row=page.locator('#hos-work-additional-images'),tile=row.locator('.hos-model-thumbnail'),photos=row.locator('.hos-photo-thumbnail:not(.hos-model-thumbnail)');
    assert.equal(await tile.count(),1);assert.equal(await tile.getAttribute('data-model'),'zsa-018');
    assert(await row.locator('button').last().evaluate(element=>element.classList.contains('hos-model-thumbnail')));
    assert.equal(await tile.getAttribute('aria-haspopup'),'dialog');
    const count=await photos.count();assert.equal(await page.locator('#hos-gallery-count').innerText(),'1 / '+count);
    await tile.scrollIntoViewIfNeeded();const rect=await tile.boundingBox(),bounds=await row.boundingBox();
    assert(rect.x>=bounds.x&&rect.x+rect.width<=bounds.x+bounds.width+1,'The last 3D tile should be reachable by scrolling the row');
    const photoSize=await photos.first().locator('img').boundingBox(),modelSize=await tile.locator('.hos-model-tile-face').boundingBox();
    assert.equal(modelSize.width,photoSize.width);assert.equal(modelSize.height,photoSize.height);
    await row.screenshot({path:new URL(`tiles-${width}.png`,output).pathname});
    await row.getByRole('button',{name:'Show left',exact:true}).click();
    assert.equal(await page.locator('#hos-work-photo-caption').innerText(),'Left');assert.equal(await page.locator('#hos-gallery-count').innerText(),'2 / '+count);
    if(width>700){
      await page.getByRole('button',{name:'Next sculpture photograph',exact:true}).click();
    }else{
      await page.locator('#hos-gallery-track').evaluate(element=>element.scrollTo({left:2*element.clientWidth,behavior:'instant'}));
      await page.locator('#hos-work-photo-caption').filter({hasText:'Right'}).waitFor();
    }
    assert.equal(await page.locator('#hos-work-photo-caption').innerText(),'Right');
    if(width>700){
      await page.getByRole('button',{name:'Previous sculpture photograph',exact:true}).click();
    }else{
      await page.locator('#hos-gallery-track').evaluate(element=>element.scrollTo({left:element.clientWidth,behavior:'instant'}));
      await page.locator('#hos-work-photo-caption').filter({hasText:'Left'}).waitFor();
    }
    const modes=page.locator('#hos-work-view-modes'),photosMode=modes.locator('[data-work-visual="photos"]'),modelMode=modes.locator('[data-work-visual="model"]');
    assert(await modes.isVisible(),'Approved models should have a prominent photo / 3D switch');
    assert.equal(await photosMode.getAttribute('aria-pressed'),'true');
    await modelMode.click();
    const inline=page.locator('#hos-work-inline-model'),inlineStage=inline.locator('[data-model-stage]');
    await page.waitForFunction(()=>document.querySelector('#hos-work-inline-model [data-model-stage]')?.dataset.modelState==='ready',null,{timeout:60000});
    assert(await inline.locator('.hos-3d-canvas').isVisible(),'The 3D model should render directly in the work gallery');
    assert(await page.locator('#hos-work-photo-open').isHidden(),'The photo should be hidden only while the 3D view is selected');
    assert.equal(await modelMode.getAttribute('aria-pressed'),'true');
    await inline.screenshot({path:new URL(`inline-${width}.png`,output).pathname});
    // Normal page scrolling must never rotate the sculpture, even for visitors
    // without reduced-motion preferences. Rotation remains available by dragging.
    await page.emulateMedia({reducedMotion:'no-preference'});
    const inlineCanvas=inline.locator('.hos-3d-canvas');
    const initialRotation=Number(await inlineStage.getAttribute('data-model-rotation'));
    const scrollBefore=await page.evaluate(()=>scrollY);
    await page.evaluate(()=>scrollBy({top:90,behavior:'instant'}));
    await page.waitForFunction(before=>scrollY>before,scrollBefore);
    await page.waitForTimeout(100);
    const afterScroll=Number(await inlineStage.getAttribute('data-model-rotation'));
    assert(Math.abs(afterScroll-initialRotation)<.001,'Page scroll must not rotate the inline 3D sculpture');
    const canvasBounds=await inlineCanvas.boundingBox();assert(canvasBounds,'Inline model canvas must remain visible');
    await page.mouse.move(canvasBounds.x+canvasBounds.width*.45,canvasBounds.y+canvasBounds.height*.5);
    await page.mouse.down();
    await page.mouse.move(canvasBounds.x+canvasBounds.width*.45+80,canvasBounds.y+canvasBounds.height*.5,{steps:8});
    await page.mouse.up();
    await page.waitForFunction(before=>Number(document.querySelector('#hos-work-inline-model [data-model-stage]').dataset.modelRotation)>before+.4,afterScroll);
    await page.emulateMedia({reducedMotion:'reduce'});
    await photosMode.click();
    assert(await page.locator('#hos-work-photo-open').isVisible());
    assert(await inline.isHidden());
    assert.equal(await photosMode.getAttribute('aria-pressed'),'true');
    assert.equal(await page.locator('#hos-work-photo-caption').innerText(),'Left','Changing display modes must preserve the chosen photo');
    await tile.focus();await page.keyboard.press('Enter');
    await page.waitForFunction(()=>document.querySelector('#hos-model-stage').dataset.modelState==='ready');
    assert.equal(await page.locator('#hos-model-title').innerText(),'Rabbit');
    assert(await page.locator('.hos-model-note').isVisible());
    await page.keyboard.press('Escape');assert(await tile.evaluate(element=>element===document.activeElement));
    assert.equal(await row.getByRole('button',{name:'Show left',exact:true}).getAttribute('aria-pressed'),'true');
    assert.equal(await page.locator('#hos-gallery-count').innerText(),'2 / '+count);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await page.evaluate(()=>{history.pushState({},'', '/works/zsa-page-13');dispatchEvent(new PopStateEvent('popstate'));});
    assert.equal(await row.locator('.hos-model-thumbnail').count(),0,'A work without a matching model must have no 3D tile');
    assert(await page.locator('#hos-work-model').isHidden());assert(await modes.isHidden(),'No unapproved or mismatched model switch should appear');assert.deepEqual(errors,[]);await page.close();
    console.log(`${width}px: 3D tile is last and reachable, photo navigation/counts preserved, keyboard opens model, focus returns, missing-model tile omitted.`);
  }
}finally{await browser?.close();await new Promise(resolve=>app.server.close(resolve));rmSync(dataDir,{recursive:true,force:true});}
