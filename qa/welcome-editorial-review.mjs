// Independent mobile-first acceptance for the unlisted Welcome editorial.
// Uses real source photography and footage against a production-mode server.
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,mkdirSync,existsSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {chromium,webkit} from 'playwright';
import {createApp} from '../server.mjs';

const sourceFiles=[
  '../public/assets/making-artist-and-block.webp',
  '../public/assets/making-marked-stone.webp',
  '../public/assets/making-chiseling-poster-v1.jpg',
  '../public/assets/making-chiseling-scrub-v1.mp4',
  '../public/assets/making-v7/desktop/frame_054.webp',
  '../public/assets/making-v7/desktop/frame_088.webp',
  '../public/assets/making-v7/desktop/frame_116.webp',
  '../public/assets/making-v7/desktop/frame_132.webp',
  '../public/assets/making-v7/mobile/frame_054.webp',
  '../public/assets/making-v7/mobile/frame_088.webp',
  '../public/assets/making-v7/mobile/frame_116.webp',
  '../public/assets/making-v7/mobile/frame_132.webp',
  '../public/assets/making-coil-approved-workshop-v1.png',
  '../public/assets/making-coil-approved-mobile-v2.png',
  '../public/assets/zsa-009-studio-front-v2.webp',
  '../public/assets/zsa-025-studio-back-v2.webp',
  '../public/assets/zsa-012-studio-front-v3.webp',
  '../public/assets/logo.png'
];
for(const file of sourceFiles){
  const url=new URL(file,import.meta.url);
  assert(existsSync(url),'Missing story photo: '+file);
  assert(statSync(url).size>100,'Empty story photo: '+file);
}
const data=mkdtempSync(join(tmpdir(),'welcome-review-'));
const out=new URL('../test-results/browser/welcome-editorial/',import.meta.url);
mkdirSync(out,{recursive:true});
const app=createApp({
  dataDir:data,backgroundNotifications:false,
  env:{ADMIN_PASSWORD:'test-only-'+randomUUID(),NODE_ENV:'production',SITE_URL:'https://house-of-mabwe-test.example'}
});
await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+app.server.address().port;
const cases=[
  {name:'iphone-se',engine:'webkit',width:375,height:667,isMobile:true},
  {name:'iphone-15',engine:'webkit',width:393,height:852,isMobile:true},
  {name:'android-phone',engine:'chromium',width:360,height:800,isMobile:true},
  {name:'tablet',engine:'webkit',width:820,height:1180,isMobile:false},
  {name:'desktop',engine:'chromium',width:1440,height:900,isMobile:false}
];
const checks=['introduction','story-start','stone','artist','carving','form','finish','finished','collection-end'];
const report=[];
let browser;
try{
 for(const c of cases){
  browser=await (c.engine==='webkit'?webkit:chromium).launch({headless:true});
  const page=await browser.newPage({
   viewport:{width:c.width,height:c.height},
   deviceScaleFactor:1,isMobile:c.isMobile,hasTouch:c.isMobile,
   reducedMotion:'reduce'
  });
  const failures=[];
  page.on('pageerror',e=>failures.push('JS: '+e.message));
  page.on('response',r=>{
    if(r.status()>=400&&/\/(assets|prototypes)\//.test(r.url())) failures.push('HTTP '+r.status()+' '+r.url());
  });
  await page.goto(base+'/prototypes/making-atelier.html',{waitUntil:'domcontentloaded'});
  await page.locator('#hero-title').waitFor();
  const chapters=await page.locator('main section[id]').evaluateAll(items=>items.map(x=>x.id));
  for(const id of checks)assert(chapters.includes(id),'Missing chapter: '+id);
  assert.equal(await page.locator('main video').count(),1,'There should only be one user-controlled video');
  assert.equal(await page.locator('canvas, iframe').count(),0,'No canvases or iframes allowed in this lightweight story');
  assert.equal(await page.locator('.pin,.formation-stage,.approved-coil-reveal').count(),0,'Legacy pinned animation leaked into the rebuild');
  const videoBefore=await page.locator('#workshop-film').evaluate(v=>({paused:v.paused,preload:v.preload,autoPlay:v.autoplay}));
  assert.equal(videoBefore.paused,true);
  assert.equal(videoBefore.autoPlay,false);
  assert.equal(videoBefore.preload,'none');
  for(const id of checks){
    await page.locator('#'+id).scrollIntoViewIfNeeded({timeout:30000});
    await page.waitForTimeout(110);
    const overflow=await page.evaluate(()=>{
       const w=document.documentElement.clientWidth;
       return {overflow:document.documentElement.scrollWidth-w,
         scrolling:document.documentElement.scrollHeight,
         transforms:document.querySelectorAll('[style*="transform:"]').length};
    });
    assert(overflow.overflow<=2,c.name+' horizontal overflow at '+id+': '+overflow.overflow);
    assert(overflow.scrolling>c.height);
    const filename=new URL(c.name+'-'+id+'.png',out);
    await page.screenshot({path:filename.pathname,fullPage:false});
  }
  await page.locator('#stone').scrollIntoViewIfNeeded();
  await page.locator('#form').scrollIntoViewIfNeeded();
  const imageResults=await page.evaluate(async()=>{
    const imgs=[...document.querySelectorAll('main img')];
    return imgs.map(img=>({src:img.currentSrc||img.src,complete:img.complete,width:img.naturalWidth,height:img.naturalHeight}));
  });
  // Lazy images near the review route should load; off-screen lazy images can remain pending.
  for(const item of imageResults.filter(x=>x.complete)) assert(item.width>0,'Broken image '+item.src);
  // The viewer remains still when page scrolls. No per-frame script or video scrubbing.
  const film=page.locator('#workshop-film');
  const currentTime=await film.evaluate(x=>x.currentTime);
  assert(currentTime===0,'The film started or was scrubbed without a tap');
  assert.deepEqual(failures,[],c.name+' browser/network errors');
  report.push({name:c.name,chapters:checks.length,imageCount:imageResults.length,errors:failures.length});
  await page.close();
  await browser.close();
  browser=null;
 }
 console.log(JSON.stringify({ok:true,cases:report,review:'editorial Welcome'},null,2));
}finally{
 if(browser)await browser.close();
 await new Promise(resolve=>app.server.close(resolve));
 rmSync(data,{recursive:true,force:true});
}
