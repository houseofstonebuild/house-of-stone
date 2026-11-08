import assert from 'node:assert/strict';import {mkdtempSync,rmSync,mkdirSync,writeFileSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {randomUUID} from 'node:crypto';import {chromium} from 'playwright';
import {prepareOwnerMeasurements,measurements} from '../scripts/publish-owner-measurements.mjs';
import {createApp} from '../server.mjs';import {prepareOwnerPublication} from '../scripts/publish-owner-release.mjs';import {prepareVerifiedMetadata} from '../scripts/publish-verified-metadata.mjs';import {prepareCollectionRoundOne} from '../scripts/publish-collection-round-one.mjs';import {prepareCollectionRoundTwo} from '../scripts/publish-collection-round-two.mjs';
const dataDir=mkdtempSync(join(tmpdir(),'hos-round-three-')),password=randomUUID(),app=createApp({dataDir,env:{ADMIN_PASSWORD:password},backgroundNotifications:false});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+app.server.address().port,out=new URL('../test-results/round-three/',import.meta.url);mkdirSync(out,{recursive:true});let browser;const errors=[],report={passed:false,rails:0,galleries:0};
try{
 const api=async(path,data)=>{const r=await fetch(base+'/api/admin/'+path,{headers:{Authorization:'Basic '+Buffer.from('admin:'+password).toString('base64'),'Content-Type':'application/json',Origin:base},...(data?{method:'POST',body:JSON.stringify(data)}:{})});assert(r.ok);return r.json();};
 let state=await api('content');const catalog=prepareOwnerMeasurements(prepareCollectionRoundTwo(prepareCollectionRoundOne(prepareVerifiedMetadata(prepareOwnerPublication(state.draft)))));state=await api('content',{revision:state.revision,catalog});await api('publish',{revision:state.revision});
 browser=await chromium.launch({args:['--no-sandbox']});const page=await browser.newPage({reducedMotion:'reduce'});page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>localStorage.setItem('hos-measurement','off'));
 const ready=async path=>{await page.goto(base+path);await page.locator('#hos-concept[data-ready="true"]').waitFor();await page.evaluate(()=>document.fonts.ready);};
 for(const width of [320,390,768,1440]){
  await page.setViewportSize({width,height:1000});await ready('/');
  for(const collection of catalog.collections){
   const chapter=page.locator('#hos-home-chapters [data-collection-section="'+collection.id+'"]'),track=chapter.locator('.hos-work-grid'),cards=track.locator('.hos-work-card');
   if(width>700){const rows=await cards.evaluateAll(nodes=>nodes.map(n=>Math.round(n.getBoundingClientRect().top)));assert(rows.every(y=>y===rows[0]),'Desktop sculptures stay in one row');if(await track.evaluate(n=>n.scrollWidth>n.clientWidth+2)){await chapter.getByRole('button',{name:'Next sculptures in '+collection.name+' sculptures',exact:true}).click();await page.waitForFunction(n=>n.scrollLeft>10,await track.elementHandle());}}
   assert.equal(await cards.count(),collection.workIds.length);
   assert.equal(await cards.first().locator('[data-artist] .hos-meta-label').textContent(),'Artist');
   // Lazy catalogue photography must actually load when the rail enters view.
   const visibleCount=Math.min(await cards.count(),width>1100?4:width>700?3:1);
   for(let photoIndex=0;photoIndex<visibleCount;photoIndex++){
    const photo=cards.nth(photoIndex).locator('img');await photo.scrollIntoViewIfNeeded();
    await photo.evaluate(async image=>{if(!image.complete)await new Promise((resolve,reject)=>{image.addEventListener('load',resolve,{once:true});image.addEventListener('error',reject,{once:true});});await image.decode();});
    assert(await photo.evaluate(image=>image.naturalWidth>0),'Collection photograph did not render: '+collection.name+' / '+photoIndex);
    if(/(?:studio|photoshoot|wingbeat-shoot)/.test(await photo.getAttribute('src')))await page.waitForFunction(image=>image.dataset.studioFramed==='true',await photo.elementHandle());
    if(await photo.getAttribute('data-studio-framed'))assert(await photo.evaluate(async image=>{const bg=new Image();bg.src=image.style.backgroundImage.slice(5,-2);await bg.decode();const canvas=document.createElement('canvas');canvas.width=bg.width;canvas.height=bg.height;const ctx=canvas.getContext('2d');ctx.drawImage(bg,0,0);const p=ctx.getImageData(0,0,bg.width,bg.height).data;for(let n=0;n<p.length;n+=4)if(Math.min(p[n],p[n+1],p[n+2])<230)return false;return true;}),'Backdrop extension must not contain black or sculpture pixels');
   }
   if(collection.id==='elemental'&&width===390){const banner=chapter.locator('.hos-collection-photo.hos-collection-interior');await banner.locator('img').evaluate(image=>image.decode());const bounds=await banner.boundingBox();assert(bounds.width/bounds.height<1.0,'Elemental mobile banner preserves approved portrait composition');await banner.screenshot({path:new URL('390-elemental.jpg',out).pathname,type:'jpeg',quality:90});}
   if(collection.id==='presence'&&[390,1440].includes(width))await chapter.screenshot({path:new URL(width+'-presence.jpg',out).pathname,type:'jpeg',quality:88});report.rails++;
  }
  for(const id of ['zsa-012','zsa-016','hos-queen-mother']){
   const work=catalog.works.find(w=>w.id===id);await ready('/works/'+work.slug);assert.equal(await page.locator('#hos-work-banner').isVisible(),width>700);if(id==='zsa-012'&&[390,1440].includes(width)){await page.locator('#hos-work-image').evaluate(image=>image.decode());await page.locator('#hos-work-photo-open').screenshot({path:new URL(width+'-chief.jpg',out).pathname,type:'jpeg',quality:90});}
   const rail=page.locator('#hos-work-gallery-story');
   const rows=await rail.locator('figure').evaluateAll(nodes=>nodes.map(n=>Math.round(n.getBoundingClientRect().top)));
   assert(rows.length>1,'Sculpture gallery includes multiple images');
   if(width<=700){
    assert(rows.every(y=>y===rows[0]),'Mobile sculpture photos stay in one horizontal carousel row');
    await page.getByRole('button',{name:'Scroll photographs right',exact:true}).click();
    await page.waitForFunction(el=>el.scrollLeft>10,await rail.elementHandle());
   }else{
    assert(rows.every((y,i)=>i===0||y>rows[i-1]),'Desktop sculpture photos stay in a vertical sequence');
   }
   if(id==='zsa-012'&&[390,1440].includes(width))await page.locator('.hos-photo-carousel').screenshot({path:new URL(width+'-sculpture-carousel.jpg',out).pathname,type:'jpeg',quality:90});
   const thumbs=page.locator('.hos-photo-thumbnail');assert(await thumbs.count()>1);await thumbs.nth(1).click();assert.equal(await thumbs.nth(1).getAttribute('aria-pressed'),'true');
   await page.locator('#hos-work-photo-open').click();const dialog=page.locator('#hos-photo-dialog'),stage=dialog.locator('.hos-photo-stage');await dialog.locator('img').evaluate(i=>i.decode());
   for(let n=0;n<8;n++)await page.getByRole('button',{name:'Zoom in photograph',exact:true}).click();assert.equal(await dialog.locator('.hos-zoom-status').textContent(),'500%');
   const b=await stage.boundingBox(),before=await stage.evaluate(n=>({x:n.scrollLeft,y:n.scrollTop}));await page.mouse.move(b.x+b.width*.5,b.y+b.height*.5);await page.mouse.down();await page.mouse.move(b.x+b.width*.5-55,b.y+b.height*.5-45,{steps:5});await page.mouse.up();const after=await stage.evaluate(n=>({x:n.scrollLeft,y:n.scrollTop}));assert(after.x>before.x||after.y>before.y,'Zoomed photo must pan');
   await page.getByRole('button',{name:'Fit',exact:true}).click();assert.equal(await dialog.locator('.hos-zoom-status').textContent(),'100%');await page.keyboard.press('Escape');assert(await dialog.isHidden());report.galleries++;
  }
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 }
 for(const collection of catalog.collections){await page.setViewportSize({width:1440,height:1000});await ready('/collections/'+collection.slug);assert.equal(await page.locator('#hos-category-content .hos-collection-visual').count(),0);const track=page.locator('#hos-category-content .hos-horizontal-works');const rows=await track.locator('.hos-work-card').evaluateAll(nodes=>nodes.map(n=>Math.round(n.getBoundingClientRect().top)));assert(rows.every(y=>y===rows[0]));await page.screenshot({path:new URL(collection.id+'-without-banner.jpg',out).pathname,type:'jpeg',quality:88});}
 for(const [id,values] of Object.entries(measurements)){const work=catalog.works.find(w=>w.id===id);await ready('/works/'+work.slug);assert.equal(await page.locator('#hos-work-dimensions').textContent(),values.join(' × ')+' cm');if(id==='zsa-031')assert.equal(await page.locator('#hos-work-title').textContent(),'Protection Spirit');}
 const paired=catalog.works.filter(w=>(w.additionalImages||[]).some(key=>catalog.assets[key]?.includes('/hos-artist-')));
 for(const work of paired){await ready('/works/'+work.slug);const artistPhoto=page.locator('#hos-work-gallery-story .hos-gallery-artist img');assert((await artistPhoto.getAttribute('src')).includes('-owner-v4.jpg'));await artistPhoto.evaluate(i=>i.decode());await page.locator('#hos-work-gallery-story .hos-gallery-artist button').click();const enlarged=page.locator('#hos-photo-dialog img');await enlarged.evaluate(i=>i.decode());assert((await enlarged.getAttribute('src')).includes('-owner-v4.jpg'));await page.keyboard.press('Escape');}
 for(const [route,filename] of [['designers','designers-coil-v2.webp'],['collectors','collectors-red-stone-v2.webp']]){await ready('/'+route);const image=page.locator('[data-page="'+route+'"] .hos-editorial-image img');assert((await image.getAttribute('src')).endsWith(filename));await image.evaluate(i=>i.decode());await page.screenshot({path:new URL(route+'.jpg',out).pathname,type:'jpeg',quality:88,fullPage:true});}
 for(const side of ['front','back']){const src='/assets/zsa-002-studio-'+side+'-v4.webp';assert(await page.evaluate(async src=>{const image=new Image();image.src=src;try{await image.decode();return image.naturalWidth===1200&&image.naturalHeight===1600;}catch{return false;}},src),'Archived source photo must decode: '+src);}
 assert.deepEqual(errors,[]);assert.equal(app.db.prepare('SELECT count(*) AS n FROM inquiries').get().n,0);report.passed=true;console.log(JSON.stringify(report));
}finally{writeFileSync(new URL('report.json',out),JSON.stringify({...report,errors},null,2));await browser?.close();await new Promise(r=>app.server.close(r));rmSync(dataDir,{recursive:true,force:true});}
