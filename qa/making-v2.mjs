import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright';
import {createApp} from '../server.mjs';
const screenshotFolder=new URL('../test-results/browser/making-v2/',import.meta.url);
mkdirSync(screenshotFolder,{recursive:true});
const dataDir=mkdtempSync(join(tmpdir(),'hos-making-v2-'));
const app=createApp({dataDir,env:{ADMIN_PASSWORD:'test-only-'+randomUUID()},backgroundNotifications:false});
await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
let browser;
try{
 const base='http://127.0.0.1:'+app.server.address().port;
 browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const checks=[];
 for(const viewport of [{width:1440,height:900},{width:390,height:844}]){
   const page=await browser.newPage({viewport,deviceScaleFactor:1,hasTouch:viewport.width===390});
   const errors=[];
   page.on('pageerror',error=>errors.push('page:'+error.message));
   page.on('console',message=>{if(message.type()==='error')errors.push('console:'+message.text())});
   page.on('response',response=>{if(response.status()>=400&&/coil-uploaded|stone-to-sculpture/.test(response.url()))errors.push('HTTP '+response.status()+': '+response.url())});
   await page.goto(base+'/prototypes/stone-to-sculpture.html',{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>document.querySelector('#render')?.dataset.modelReady==='true'||document.querySelector('#render')?.dataset.modelError==='true',{timeout:45000});
   assert.equal(await page.locator('#render').getAttribute('data-model-ready'),'true','Original Coil 3D model failed to load');
   const canvas=page.locator('#render canvas');assert(await canvas.isVisible(),'3D canvas is not visible');
   const progress=[0,.20,.46,.69,.86,.98];
   for(let i=0;i<progress.length;i++){
     const p=progress[i];
     await page.evaluate(f=>{
       const track=document.querySelector('.journey');
       const top=track.getBoundingClientRect().top+window.scrollY;
       window.scrollTo(0,Math.round(top+f*(track.offsetHeight-innerHeight)));
     },p);
     await page.waitForTimeout(280);
     const info=await page.evaluate(()=>({phase:document.querySelector('.stage').dataset.phase,title:document.querySelector('#stage-title').textContent,docWidth:document.documentElement.scrollWidth,viewport:innerWidth,progress:document.querySelector('#progress-fill').style.width,canvasWidth:document.querySelector('#render canvas')?.width}));
     assert(info.docWidth<=info.viewport+2,`Unexpected horizontal overflow: ${JSON.stringify(info)}`);
     assert(info.canvasWidth>0,'Missing 3D framebuffer');
     if(i===0)assert.equal(info.phase,'0');
     if(i===progress.length-1)assert.equal(info.phase,'4');
     await page.screenshot({path:new URL(`${viewport.width}-${String(i).padStart(2,'0')}.png`,screenshotFolder).pathname,fullPage:false});
     checks.push({width:viewport.width,position:p,phase:info.phase,progress:info.progress});
   }
   assert.deepEqual(errors,[],`Unexpected browser or asset errors: ${errors.join('; ')}`);
   await page.close();
 }
 const reducedPage=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
 await reducedPage.goto(base+'/prototypes/stone-to-sculpture.html');
 await reducedPage.locator('#render[data-model-ready="true"]').waitFor({timeout:45000});
 await reducedPage.locator('#skip').click();
 assert((await reducedPage.locator('#finished').boundingBox()).y<844,'Skip action failed');
 await reducedPage.close();
 console.log('Making v2 browser review passed:',JSON.stringify({checks}));
}finally{
 await browser?.close();
 await new Promise(resolve=>app.server.close(resolve));
 rmSync(dataDir,{recursive:true,force:true});
}
