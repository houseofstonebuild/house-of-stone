import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,mkdirSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright';
import {createApp} from '../server.mjs';
import {prepareOwnerPublication} from '../scripts/publish-owner-release.mjs';

const dataDir=mkdtempSync(join(tmpdir(),'hos-closeups-')),password=randomUUID();
const app=createApp({dataDir,env:{ADMIN_PASSWORD:password},backgroundNotifications:false});
await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+app.server.address().port;
const story=JSON.parse(readFileSync(new URL('../public/story.json',import.meta.url),'utf8'));
const out=new URL('../test-results/closeups/',import.meta.url);mkdirSync(out,{recursive:true});
let browser;
try{
  const api=async(path,data)=>{const r=await fetch(origin+'/api/admin/'+path,{headers:{Authorization:'Basic '+Buffer.from('admin:'+password).toString('base64'),'Content-Type':'application/json',Origin:origin},...(data?{method:'POST',body:JSON.stringify(data)}:{})});assert(r.ok);return r.json();};
  const current=await api('content');
  const state=await api('content',{revision:current.revision,catalog:prepareOwnerPublication(current.draft)});
  await api('publish',{revision:state.revision});
  const catalog=await(await fetch(origin+'/content.json')).json();
  const cropped=catalog.works.filter(w=>story.works[w.id]?.closerLook?.photoCrop);
  assert(cropped.length>=10,'Exercise the actual revised sculpture routes');
  browser=await chromium.launch({args:['--no-sandbox']});
  const page=await browser.newPage({reducedMotion:'reduce'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>localStorage.setItem('hos-measurement','off'));
  for(const width of [390,1440]){
    await page.setViewportSize({width,height:1000});
    for(const work of cropped){
      const note=story.works[work.id].closerLook;
      assert((await page.goto(origin+'/works/'+work.slug)).ok());
      await page.locator('#hos-concept[data-ready="true"]').waitFor();
      const identity=await page.locator('.hos-work-heading').evaluate(header=>({
        bottom:header.getBoundingClientRect().bottom,
        photoTop:document.querySelector('.hos-work-photo').getBoundingClientRect().top,
        title:header.querySelector('h1').textContent,
        artist:header.querySelector('#hos-work-artist').textContent
      }));
      assert.equal(identity.title,work.title);
      assert.equal(identity.artist,catalog.artists.find(a=>a.id===work.artistId).name);
      assert(identity.bottom<=identity.photoTop+1,'Title and artist must appear above the sculpture photograph');
      const detail=page.locator('#hos-work-detail');await detail.waitFor({state:'visible'});
      assert.equal(await page.locator('#hos-work-detail-title').textContent(),note.heading);
      await detail.scrollIntoViewIfNeeded();
      await page.locator('#hos-work-detail-image').evaluate(img=>img.decode());
      const geometry=await page.locator('#hos-work-detail figure').evaluate(figure=>{
        const img=figure.querySelector('img'),f=figure.getBoundingClientRect(),i=img.getBoundingClientRect();
        return{width:f.width,height:f.height,imageWidth:i.width,imageHeight:i.height,naturalRatio:img.naturalWidth/img.naturalHeight,source:img.getAttribute('src'),overflow:getComputedStyle(figure).overflow,objectFit:getComputedStyle(img).objectFit};
      });
      assert.equal(geometry.source,note.photoSource);
      assert.equal(geometry.overflow,'hidden');
      assert.equal(geometry.objectFit,'contain');
      assert(Math.abs(geometry.width/geometry.height-note.photoCrop.aspectRatio)<.01,'Crop frame changed proportions');
      assert(Math.abs(geometry.imageWidth/geometry.imageHeight-geometry.naturalRatio)<.015,'Cropping distorted the sculpture');
      assert(geometry.height<=561&&geometry.width<=width,'Close-up overflows its viewport');
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      await detail.screenshot({path:new URL(work.id+'-'+width+'.png',out).pathname});
    }
    // Returning to a section retained from the previous release must clear the crop.
    const retained=catalog.works.find(w=>w.id==='zsa-020');
    await page.goto(origin+'/works/'+retained.slug);
    await page.locator('#hos-concept[data-ready="true"]').waitFor();
    assert.equal(await page.locator('#hos-work-detail figure[data-detail-crop]').count(),0);
  }
  assert.deepEqual(errors,[]);
  console.log(`Close-up QA passed: ${cropped.length} revised routes, desktop/mobile crops, natural proportions and retained sections.`);
}finally{await browser?.close();await new Promise(r=>app.server.close(r));rmSync(dataDir,{recursive:true,force:true});}
