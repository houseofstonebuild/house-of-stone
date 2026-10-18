import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {chromium,firefox,webkit} from 'playwright';
import {createApp} from '../server.mjs';

const live=process.env.HOS_LIGHT_PREVIEW_URL;
const dataDir=live?null:mkdtempSync(join(tmpdir(),'hos-light-'));
const app=live?null:createApp({dataDir,env:{ADMIN_PASSWORD:randomUUID()},backgroundNotifications:false});
if(app)await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
const origin=live?new URL(live).origin:'http://127.0.0.1:'+app.server.address().port;
const engineName=process.env.QA_ENGINE || 'chromium',engine={chromium,firefox,webkit}[engineName];
const output=new URL('../test-results/browser/',import.meta.url);mkdirSync(output,{recursive:true});
const report={origin,engine:engineName,routes:0,viewports:[],errors:[]};
let browser;
try {
  const dark=await fetch(origin+'/'),light=await fetch(origin+'/?theme=light');
  assert(dark.ok&&light.ok);const darkHTML=await dark.text(),lightHTML=await light.text();
  assert(!darkHTML.includes('data-theme="light"')&&!darkHTML.includes('href="/light-theme.css"'),'The normal address keeps the dark theme');
  assert(lightHTML.includes('data-theme="light"')&&lightHTML.includes('href="/light-theme.css"'),'The preview selects its palette before painting');
  assert.match(light.headers.get('x-robots-tag'),/noindex/);
  assert(!/data-theme="light"/.test(await (await fetch(origin+'/?theme=unrecognized')).text()),'Unknown options keep the normal site');
  const catalog=await (await fetch(origin+'/content.json')).json();
  const routes=['/','/collection','/artists','/making','/designers','/collectors','/house','/privacy',...catalog.artists.map(a=>'/artists/'+a.slug),...catalog.works.map(w=>'/works/'+w.slug)];
  browser=await engine.launch(engineName==='chromium'?{args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']}:{});
  const context=await browser.newContext({reducedMotion:'reduce'});
  await context.addInitScript(()=>localStorage.setItem('hos-measurement','off'));
  const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
  page.on('request',r=>{if(r.url().startsWith(origin)&&r.method()==='POST')report.errors.push('Unexpected write during visual review: '+new URL(r.url()).pathname);});
  page.on('response',r=>{if(r.url().startsWith(origin)&&r.status()>=400)report.errors.push('HTTP '+r.status()+': '+new URL(r.url()).pathname);});
  const ready=async path=>{await page.goto(origin+path+'?theme=light');await page.locator('#hos-concept[data-ready="true"]').waitFor();};
  for(const viewport of [{width:1440,height:900},{width:390,height:844}]) {
    await page.setViewportSize(viewport);
    for(const path of routes) {
      await ready(path);
      assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
      assert.equal(await page.locator('#hos-concept').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(246, 244, 239)');
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),path+': horizontal overflow');
      assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'),origin+path);
      const heading=page.locator('#hos-main [data-page]:not([hidden]) h1').first();
      assert.equal(await heading.evaluate(el=>getComputedStyle(el).color),path==='/'?'rgb(255, 255, 255)':'rgb(40, 37, 31)',path+': readable heading');
      report.routes++;
    }
    await ready('/');
    await page.screenshot({path:new URL(`light-${engineName}-${viewport.width}-hero.jpg`,output).pathname,type:'jpeg',quality:90});
    await page.locator('.hos-hero-copy [data-scroll-collection]').click();assert.equal(new URL(page.url()).searchParams.get('theme'),'light');
    const chapter=page.locator('#hos-home-chapters .hos-artist-chapter').first();await chapter.locator('.hos-chapter-details').scrollIntoViewIfNeeded();
    await page.screenshot({path:new URL(`light-${engineName}-${viewport.width}-artist.jpg`,output).pathname,type:'jpeg',quality:90});
    await chapter.getByRole('button',{name:'View sculpture',exact:true}).click();assert.equal(new URL(page.url()).search,'?theme=light');
    await page.reload();await page.locator('#hos-concept[data-ready="true"]').waitFor();assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
    await page.locator('#hos-work-inquiry').click();assert(await page.locator('#hos-inquiry-form').isVisible());
    assert.equal(await page.locator('#hos-inquiry-form input[name="email"]').evaluate(el=>getComputedStyle(el).color),'rgb(40, 37, 31)');
    await page.screenshot({path:new URL(`light-${engineName}-${viewport.width}-inquiry.jpg`,output).pathname,type:'jpeg',quality:90});
    await page.locator('#hos-inquiry-close').click();await page.goBack();assert.equal(new URL(page.url()).pathname,'/');assert.equal(new URL(page.url()).search,'?theme=light');
    await page.locator('.hos-menu-toggle').click();await page.locator('#hos-menu [data-view="house"]').click();assert.equal(new URL(page.url()).pathname,'/house');assert.equal(new URL(page.url()).search,'?theme=light');
    await page.goto(origin+'/');await page.locator('#hos-concept[data-ready="true"]').waitFor();assert.equal(await page.locator('html').getAttribute('data-theme'),null);
    assert.equal(await page.locator('#hos-concept').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(8, 8, 8)');
    report.viewports.push(viewport);
  }
  assert.deepEqual(report.errors,[]);report.passed=true;console.log('Light-theme review passed: '+JSON.stringify(report));
} finally {
  await browser?.close();if(app)await new Promise(resolve=>app.server.close(resolve));if(dataDir)rmSync(dataDir,{recursive:true,force:true});
  writeFileSync(new URL(`light-${engineName}-report.json`,output),JSON.stringify(report,null,2)+'\n');
}
