import assert from 'node:assert/strict';import {mkdtempSync,rmSync,mkdirSync,writeFileSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {randomUUID} from 'node:crypto';import {chromium} from 'playwright';
import {createApp} from '../server.mjs';import {prepareOwnerPublication} from '../scripts/publish-owner-release.mjs';import {prepareVerifiedMetadata} from '../scripts/publish-verified-metadata.mjs';import {prepareCollectionRoundOne} from '../scripts/publish-collection-round-one.mjs';import {prepareCollectionRoundTwo} from '../scripts/publish-collection-round-two.mjs';
const dataDir=mkdtempSync(join(tmpdir(),'hos-round-three-')),password=randomUUID(),app=createApp({dataDir,env:{ADMIN_PASSWORD:password},backgroundNotifications:false});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+app.server.address().port,out=new URL('../test-results/round-three/',import.meta.url);mkdirSync(out,{recursive:true});let browser;const errors=[],report={passed:false,rails:0,galleries:0};
try{
 const api=async(path,data)=>{const r=await fetch(base+'/api/admin/'+path,{headers:{Authorization:'Basic '+Buffer.from('admin:'+password).toString('base64'),'Content-Type':'application/json',Origin:base},...(data?{method:'POST',body:JSON.stringify(data)}:{})});assert(r.ok);return r.json();};
 let state=await api('content');const catalog=prepareCollectionRoundTwo(prepareCollectionRoundOne(prepareVerifiedMetadata(prepareOwnerPublication(state.draft))));state=await api('content',{revision:state.revision,catalog});await api('publish',{revision:state.revision});
 browser=await chromium.launch({args:['--no-sandbox']});const page=await browser.newPage({reducedMotion:'reduce'});page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>localStorage.setItem('hos-measurement','off'));
 const ready=async path=>{await page.goto(base+path);await page.locator('#hos-concept[data-ready="true"]').waitFor();await page.evaluate(()=>document.fonts.ready);};
 for(const width of [320,390,768,1440]){
  await page.setViewportSize({width,height:1000});await ready('/');
  for(const collection of catalog.collections){
   const chapter=page.locator('#hos-home-chapters [data-collection-section="'+collection.id+'"]'),track=chapter.locator('.hos-carousel-track'),cards=track.locator('.hos-work-card');
   const rows=await cards.evaluateAll(nodes=>nodes.map(n=>Math.round(n.getBoundingClientRect().top)));assert(rows.every(y=>y===rows[0]),'Each collection stays in one row at '+width);
   assert.equal(await cards.count(),collection.workIds.length);const overflow=await track.evaluate(n=>n.scrollWidth>n.clientWidth+2);
   // Lazy catalogue photography must actually load when the rail enters view.
   await cards.first().scrollIntoViewIfNeeded();
   const firstPhoto=cards.first().locator('img');
   await firstPhoto.evaluate(async image=>{if(!image.complete)await new Promise((resolve,reject)=>{image.addEventListener('load',resolve,{once:true});image.addEventListener('error',reject,{once:true});});await image.decode();});
   assert(await firstPhoto.evaluate(image=>image.naturalWidth>0),'Collection photograph did not render: '+collection.name);
   if(overflow){const next=chapter.getByRole('button',{name:'Next works in '+collection.name,exact:true});await next.click();await page.waitForFunction(el=>el.scrollLeft>10,await track.elementHandle());await track.focus();await page.keyboard.press('ArrowLeft');await page.waitForFunction(el=>el.scrollLeft<2,await track.elementHandle());}
   if(collection.id==='presence'&&[390,1440].includes(width))await chapter.screenshot({path:new URL(width+'-presence.jpg',out).pathname,type:'jpeg',quality:88});report.rails++;
  }
  for(const id of ['zsa-012','zsa-016','hos-queen-mother']){
   const work=catalog.works.find(w=>w.id===id);await ready('/works/'+work.slug);assert.equal(await page.locator('#hos-work-banner').isVisible(),width>700);
   const thumbs=page.locator('.hos-photo-thumbnail');assert(await thumbs.count()>1);await thumbs.nth(1).click();assert.equal(await thumbs.nth(1).getAttribute('aria-pressed'),'true');
   await page.locator('#hos-work-photo-open').click();const dialog=page.locator('#hos-photo-dialog'),stage=dialog.locator('.hos-photo-stage');await dialog.locator('img').evaluate(i=>i.decode());
   for(let n=0;n<8;n++)await page.getByRole('button',{name:'Zoom in photograph',exact:true}).click();assert.equal(await dialog.locator('.hos-zoom-status').textContent(),'500%');
   const b=await stage.boundingBox(),before=await stage.evaluate(n=>({x:n.scrollLeft,y:n.scrollTop}));await page.mouse.move(b.x+b.width*.5,b.y+b.height*.5);await page.mouse.down();await page.mouse.move(b.x+b.width*.5-55,b.y+b.height*.5-45,{steps:5});await page.mouse.up();const after=await stage.evaluate(n=>({x:n.scrollLeft,y:n.scrollTop}));assert(after.x>before.x||after.y>before.y,'Zoomed photo must pan');
   await page.getByRole('button',{name:'Fit',exact:true}).click();assert.equal(await dialog.locator('.hos-zoom-status').textContent(),'100%');await page.keyboard.press('Escape');assert(await dialog.isHidden());report.galleries++;
  }
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 }
 for(const [route,filename] of [['designers','designers-queen-mother-v1.webp'],['collectors','collectors-birds-v1.webp']]){await ready('/'+route);const image=page.locator('[data-page="'+route+'"] .hos-editorial-image img');assert((await image.getAttribute('src')).endsWith(filename));await image.evaluate(i=>i.decode());await page.screenshot({path:new URL(route+'.jpg',out).pathname,type:'jpeg',quality:88,fullPage:true});}
 assert.deepEqual(errors,[]);assert.equal(app.db.prepare('SELECT count(*) AS n FROM inquiries').get().n,0);report.passed=true;console.log(JSON.stringify(report));
}finally{writeFileSync(new URL('report.json',out),JSON.stringify({...report,errors},null,2));await browser?.close();await new Promise(r=>app.server.close(r));rmSync(dataDir,{recursive:true,force:true});}
