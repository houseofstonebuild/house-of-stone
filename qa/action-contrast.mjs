import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';
import {createApp} from '../server.mjs';
import {prepareOwnerPublication} from '../scripts/publish-owner-release.mjs';
const dataDir=await mkdtemp(join(tmpdir(),'hos-action-contrast-')),password=randomUUID();
const app=createApp({dataDir,env:{ADMIN_PASSWORD:password},backgroundNotifications:false});
await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+app.server.address().port,output=new URL('../test-results/actions/',import.meta.url);
mkdirSync(output,{recursive:true});
const api=async(path,data)=>{const r=await fetch(origin+'/api/admin/'+path,{headers:{Authorization:'Basic '+Buffer.from('admin:'+password).toString('base64'),'Content-Type':'application/json',Origin:origin},...(data?{method:'POST',body:JSON.stringify(data)}:{})});assert(r.ok);return r.json();};
let browser;
const report={baseline:[],checks:[],errors:[]};
try{
 const current=await api('content'),state=await api('content',{revision:current.revision,catalog:prepareOwnerPublication(current.draft)});
 await api('publish',{revision:state.revision});
 const catalog=await(await fetch(origin+'/content.json')).json();
 browser=await chromium.launch({args:['--no-sandbox']});
 const context=await browser.newContext({reducedMotion:'reduce',viewport:{width:1440,height:1000}});
 await context.addInitScript(()=>localStorage.setItem('hos-measurement','off'));
 const page=await context.newPage();page.on('pageerror',error=>report.errors.push(error.message));
 const ready=async path=>{await page.goto(origin+path);await page.locator('#hos-concept[data-ready="true"]').waitFor();await page.evaluate(()=>document.fonts.ready);};
 const measure=button=>button.evaluate(node=>{
  const style=getComputedStyle(node),rgba=text=>(text.match(/[\d.]+/g)||[]).map(Number);
  const fg=rgba(style.color);let background=node,bg;
  while(background){bg=rgba(getComputedStyle(background).backgroundColor);if(bg.length===3||bg[3]>0.99)break;background=background.parentElement;}
  const luminance=rgb=>rgb.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4)).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
  const a=luminance(fg),b=luminance(bg||[255,255,255]);const bounds=node.getBoundingClientRect();
  return {text:node.textContent.trim(),foreground:style.color,background:getComputedStyle(background||node).backgroundColor,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05),opacity:Number(style.opacity),width:bounds.width,height:bounds.height};
 });
 const primary='.hos-collection-primary,.hos-primary-action';
 if(process.env.HOS_BASELINE_REF){
  const baseline=execFileSync('git',['-c','safe.directory='+process.cwd(),'show',process.env.HOS_BASELINE_REF+':public/editorial-layout.css'],{encoding:'utf8'});
  await page.route('**/editorial-layout.css',route=>route.fulfill({status:200,contentType:'text/css',body:baseline}));
  await ready('/');const button=page.locator('.hos-collection-primary').first();await button.scrollIntoViewIfNeeded();
  report.baseline.push({...await measure(button),state:'normal'});await button.hover();await page.waitForTimeout(250);report.baseline.push({...await measure(button),state:'hover'});
  await page.unroute('**/editorial-layout.css');console.log('Baseline action contrast: '+JSON.stringify(report.baseline));
 }
 const routes=['/',...catalog.collections.map(c=>'/collections/'+c.slug),...catalog.works.map(w=>'/works/'+w.slug)];
 const stars=new Set(catalog.collections.map(c=>c.starWorkId));
 for(const width of [390,1440]){
  await page.setViewportSize({width,height:1000});
  for(const path of routes){
   await ready(path);
   const buttons=page.locator(primary).filter({visible:true});
   for(let i=0;i<await buttons.count();i++){
    const button=buttons.nth(i);await button.scrollIntoViewIfNeeded();
    for(const state of ['normal','hover','focus']){
     if(state==='normal'){await page.mouse.move(0,0);await button.evaluate(node=>node.blur());}
     if(state==='hover')await button.hover();
     if(state==='focus'){await page.mouse.move(0,0);await button.focus();}
     await page.waitForTimeout(220);
     const result=await measure(button);report.checks.push({path,width,state,...result});
     assert(result.text,path+': missing action label');
     assert(result.ratio>=4.5,path+' at '+width+'px '+state+': insufficient action contrast '+JSON.stringify(result));
     assert(result.opacity===1,path+': primary action is faded');
     assert(result.width>=44&&result.height>=44,path+': primary action too small');
    }
   }
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),path+': horizontal overflow');
   const work=catalog.works.find(w=>path==='/works/'+w.slug);
   const screenshot=path==='/'||(work&&stars.has(work.id));
   if(screenshot){
    await page.locator('#hos-main img').evaluateAll(images=>images.filter(image=>image.getClientRects().length).forEach(image=>{image.loading='eager';}));
    await page.waitForFunction(()=>[...document.querySelectorAll('#hos-main img')].filter(image=>image.getClientRects().length).every(image=>image.complete&&image.naturalWidth>0));
    await page.mouse.move(0,0);await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,0);});
    await page.screenshot({path:new URL(width+'-'+(work?work.id:'home')+'.jpg',output).pathname,type:'jpeg',quality:85,fullPage:true});
    if(path==='/')for(const collection of catalog.collections)await page.locator('[data-collection-section="'+collection.id+'"]').screenshot({path:new URL(width+'-collection-'+collection.id+'.jpg',output).pathname,type:'jpeg',quality:90});
   }
  }
 }
 assert.deepEqual(report.errors,[]);
 console.log('Action contrast passed: '+report.checks.length+' normal/hover/focus checks across '+routes.length+' routes and two viewport sizes.');
}finally{
 writeFileSync(new URL('report.json',output),JSON.stringify(report,null,2));
 await browser?.close();await new Promise(resolve=>app.server.close(resolve));await rm(dataDir,{recursive:true,force:true});
}
