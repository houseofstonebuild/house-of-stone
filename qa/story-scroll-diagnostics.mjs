// Run only on the isolated review branch. Collect evidence, not a deployment.
// Captures real browser chapter frames, scroll-frame mismatches, overflow,
// positioning, and runtime errors at desktop and mobile viewport sizes.
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {chromium,webkit} from 'playwright';
import {createApp} from '../server.mjs';
const dir=mkdtempSync(join(tmpdir(),'hos-story-review-'));
const destination=new URL('../test-results/browser/making-atelier/',import.meta.url);
mkdirSync(destination,{recursive:true});
const app=createApp({dataDir:dir,env:{ADMIN_PASSWORD:'review-'+randomUUID()},backgroundNotifications:false});
await new Promise(done=>app.server.listen(0,'127.0.0.1',done));
let browser;
const results=[];
try{
 for(const config of [
  {name:'desktop',driver:chromium,width:1440,height:900,mobile:false},
  {name:'iphone',driver:webkit,width:390,height:844,mobile:true},
  {name:'iphone-compact',driver:webkit,width:375,height:667,mobile:true}
 ]){
  browser=await config.driver.launch({headless:true});
  const page=await browser.newPage({viewport:{width:config.width,height:config.height},
    deviceScaleFactor:1,isMobile:config.mobile,hasTouch:config.mobile});
  const errors=[];
  page.on('pageerror',e=>errors.push('JS '+e.message));
  page.on('response',r=>{if(r.status()>=400&&!r.url().includes('fonts.googleapis.com'))
    errors.push('HTTP '+r.status()+' '+r.url().split('?')[0])});
  await page.goto('http://127.0.0.1:'+app.server.address().port+'/prototypes/making-atelier.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.documentElement.dataset.makingAtelier==='ready');
  const scenes=['introduction','origin','material','carving','detail','finishing','reveal','house'];
  const chapter=[];
  for(const id of scenes){
   const position=.55;
   await page.evaluate(({id,p})=>{
    const el=document.querySelector('[data-scene="'+id+'"]');
    const top=scrollY+el.getBoundingClientRect().top;
    scrollTo(0,Math.round(top+Math.max(0,el.offsetHeight-innerHeight)*p));
   },{id,p:position});
   await page.waitForFunction(({id,p})=>{
    const el=document.querySelector('[data-scene="'+id+'"]');
    return Math.abs(Number(el?.dataset.progress)-p)<.035;
   },{id,p:position},{timeout:20000});
   await page.waitForTimeout(90);
   const state=await page.evaluate(id=>{
    const frame=id==='detail'?document.querySelector('#formationStage'):
      id==='finishing'?document.querySelector('#polishStage'):
      id==='carving'?document.querySelector('.carving-media'):null;
    const title=document.querySelector('[data-scene="'+id+'"] h1, [data-scene="'+id+'"] h2');
    const rect=title?.getBoundingClientRect();
    return {chapter:id,
      actualProgress:Number(document.querySelector('[data-scene="'+id+'"]').dataset.progress),
      requestedFrame:frame?Number(frame.dataset.requestedFrame):null,
      displayedFrame:frame?Number(frame.dataset.displayedFrame):null,
      mediaReady:frame?.dataset.frameStatus||frame?.dataset.mobileReady||null,
      horizontalOverflow:document.documentElement.scrollWidth-innerWidth,
      headingRect:rect?{top:rect.top,bottom:rect.bottom,left:rect.left,right:rect.right}:null};
   },id);
   chapter.push(state);
   await page.screenshot({path:new URL(config.name+'-review-'+id+'.png',destination).pathname,animations:'disabled'});
  }
  // Deliberately scroll backwards to sample source frame reversibility.
  for(const p of [.82,.60,.32,.12]){
   await page.evaluate(p=>{
    const node=document.querySelector('[data-scene="detail"]');
    scrollTo(0,scrollY+node.getBoundingClientRect().top+Math.round((node.offsetHeight-innerHeight)*p));
   },p);
   await page.waitForTimeout(120);
   chapter.push(await page.evaluate(()=>({
    chapter:'detail-reverse',
    requestedFrame:Number(document.querySelector('#formationStage').dataset.requestedFrame),
    displayedFrame:Number(document.querySelector('#formationStage').dataset.displayedFrame)
   })));
  }
  results.push({viewport:config.name,width:config.width,height:config.height,chapter,errors});
  await page.close();await browser.close();browser=undefined;
 }
 writeFileSync(new URL('scroll-diagnostics.json',destination),JSON.stringify(results,null,2));
 assert(results.every(x=>x.chapter.some(c=>c.chapter==='house')),'Missing House chapter');
 console.log('Isolated scroll diagnostics stored alongside screenshots');
}finally{
 await browser?.close();
 await new Promise(done=>app.server.close(done));
 rmSync(dir,{recursive:true,force:true});
}
