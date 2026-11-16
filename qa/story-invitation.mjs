// Standalone full-screen story: no iframe or blocking first-visit popup.
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server.mjs';
const data=mkdtempSync(join(tmpdir(),'hos-story-link-'));
const app=createApp({dataDir:data,env:{ADMIN_PASSWORD:'test-story-only-1234567890'},backgroundNotifications:false});
await new Promise(done=>app.server.listen(0,'127.0.0.1',done));
const base='http://127.0.0.1:'+app.server.address().port;
let browser;
try{
 for(const config of [{driver:chromium,width:1440,height:900},
                      {driver:webkit,width:390,height:844}]){
  browser=await config.driver.launch({headless:true,
   ...(config.driver===chromium?{args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']}: {})});
  const page=await browser.newPage({viewport:{width:config.width,height:config.height},
   isMobile:config.width<=700,hasTouch:config.width<=700});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('#hos-concept')?.dataset.ready==='true');
  assert.equal(await page.locator('#hos-story-invite,#hos-story-dialog,iframe#hos-story-frame').count(),0,
   'No modal or nested frame should obscure the hero or scroll experience');
  assert.equal(await page.locator('.hos-story-start').count(),1);
  await page.locator('.hos-story-start').click();
  await page.waitForURL('**/prototypes/making-atelier.html?from=home');
  await page.waitForFunction(()=>document.documentElement.dataset.makingAtelier==='ready');
  assert.equal(await page.locator('#openingTitle').count(),1);
  assert.equal(await page.locator('#houseTitle').count(),1);
  assert.equal(await page.locator('.artist-voice cite').count(),1);
  assert.equal(await page.locator('.collection-link').getAttribute('href'),'/collection');
  assert.equal(await page.locator('a[href="/works/zsa-page-6"]').count(),0);
  assert.equal(await page.locator('.masthead .return').getAttribute('href'),'/');
  await page.locator('.masthead .return').click();
  await page.waitForURL(base+'/');
  assert.equal(await page.locator('.hos-story-start').count(),1);
  assert.deepEqual(errors,[]);
  await page.close();await browser.close();browser=null;
  console.log('Top-level story and unobstructed hero passed '+config.width+'px');
 }
}finally{await browser?.close();await new Promise(done=>app.server.close(done));rmSync(data,{recursive:true,force:true})}
