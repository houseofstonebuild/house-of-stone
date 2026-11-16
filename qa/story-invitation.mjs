// First-visit story invitation and collection escape acceptance, without
// modifying collection data or depending on a production storage state.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server.mjs';
const data=mkdtempSync(join(tmpdir(),'hos-story-'));
const app=createApp({dataDir:data,env:{ADMIN_PASSWORD:'test-story-only-1234567890'},backgroundNotifications:false});
await new Promise(done=>app.server.listen(0,'127.0.0.1',done));
const base='http://127.0.0.1:'+app.server.address().port;
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:width===390?844:900},deviceScaleFactor:1});
  const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('#hos-concept')?.dataset.ready==='true');
  await page.waitForFunction(()=>window.__hosStory?.invitationVisible===true,{timeout:12000});
  assert(await page.getByText('The story behind the sculpture.').isVisible());
  await page.locator('#hos-story-invite-open').click();
  assert(await page.locator('#hos-story-dialog').evaluate(el=>el.open));
  await page.waitForFunction(()=>document.querySelector('#hos-story-frame')?.contentDocument?.documentElement.dataset.makingAtelier==='ready',{timeout:20000});
  const story=page.frameLocator('#hos-story-frame');
  assert(await story.locator('#openingTitle').count()===1);
  assert(await story.locator('#houseTitle').count()===1);
  assert.equal(await story.locator('.collection-link').getAttribute('href'),'/collection');
  assert.equal(await story.locator('.collection-link').getAttribute('target'),'_top');
  assert.equal(await story.locator('.artist-voice cite').count(),1);
  assert.equal(await story.locator('a[href="/works/zsa-page-6"]').count(),0);
  await page.locator('#hos-story-dialog-close').click();
  assert.equal(await page.locator('#hos-story-dialog').evaluate(el=>el.open),false);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('#hos-concept')?.dataset.ready==='true');
  assert.equal(await page.locator('#hos-story-invite').isVisible(),false,'Invitation must show only once');
  assert.equal(await page.locator('[data-open-story]').count()>0,true,'Story must remain discoverable');
  await page.locator('[data-open-story]').first().click();
  assert.equal(await page.locator('#hos-story-dialog').evaluate(el=>el.open),true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#hos-story-dialog').evaluate(el=>el.open),false);
  assert.deepEqual(errors,[]);
  await context.close();
  console.log('Our Story first-visit experience passed at '+width+'px');
 }
}finally{await browser?.close();await new Promise(done=>app.server.close(done));rmSync(data,{recursive:true,force:true})}
