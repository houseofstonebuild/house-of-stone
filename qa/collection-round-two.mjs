import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright';
import {createApp} from '../server.mjs';
import {prepareOwnerPublication} from '../scripts/publish-owner-release.mjs';
import {prepareVerifiedMetadata} from '../scripts/publish-verified-metadata.mjs';
import {prepareCollectionRoundOne} from '../scripts/publish-collection-round-one.mjs';
import {prepareCollectionRoundTwo,additions,artistPhotos} from '../scripts/publish-collection-round-two.mjs';
const dataDir=mkdtempSync(join(tmpdir(),'hos-round-two-browser-')),password=randomUUID();
const app=createApp({dataDir,env:{ADMIN_PASSWORD:password},backgroundNotifications:false});
await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+app.server.address().port,out=new URL('../test-results/collection-round-two/',import.meta.url);
mkdirSync(out,{recursive:true});let browser;
const report={passed:false,intros:0,artistPages:0,artistIndexes:0,galleryPairs:0};
try{
  const api=async(path,data)=>{const response=await fetch(origin+'/api/admin/'+path,{headers:{Authorization:'Basic '+Buffer.from('admin:'+password).toString('base64'),'Content-Type':'application/json',Origin:origin},...(data?{method:'POST',body:JSON.stringify(data)}:{})});assert(response.ok,await response.clone().text());return response.json();};
  let state=await api('content');
  const next=prepareCollectionRoundTwo(prepareCollectionRoundOne(prepareVerifiedMetadata(prepareOwnerPublication(state.draft))));
  state=await api('content',{revision:state.revision,catalog:next});await api('publish',{revision:state.revision});
  const catalog=await(await fetch(origin+'/content.json')).json();assert.equal(catalog.works.length,26);
  browser=await chromium.launch({args:['--no-sandbox']});const page=await browser.newPage({reducedMotion:'reduce'}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));await page.addInitScript(()=>localStorage.setItem('hos-measurement','off'));
  const ready=async path=>{assert((await page.goto(origin+path)).ok());await page.locator('#hos-concept[data-ready="true"]').waitFor();await page.evaluate(()=>document.fonts.ready);};
  for(const width of [320,390,768,1440]){
    await page.setViewportSize({width,height:1000});
    for(const work of catalog.works){
      await ready('/works/'+work.slug);await page.mouse.move(0,0);
      const banner=page.locator('#hos-work-banner'),photo=banner.locator('img'),caption=banner.locator('figcaption');
      await photo.evaluate(image=>image.decode());
      assert.equal(await banner.locator('#hos-work-banner-title').innerText(),work.title);
      assert.equal(await banner.locator('#hos-work-banner-artist').innerText(),catalog.artists.find(artist=>artist.id===work.artistId).name);
      assert.equal(await banner.locator('#hos-work-banner-stone').innerText(),work.material);
      if(width>700){
        const a=await caption.boundingBox(),b=await photo.boundingBox();assert(a.x+a.width<=b.x+1,work.title+': caption must be left of image');
        assert(b.width<=width*.6+1,work.title+': image must occupy right column');assert((await banner.boundingBox()).height<=701);
      }
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),work.title+': overflow at '+width);
      if(work.id==='zsa-012')assert.equal(await photo.evaluate(image=>getComputedStyle(image).transform),'none');
      if([390,1440].includes(width)&&(additions.some(item=>item.id===work.id)||['zsa-001','zsa-013','zsa-026','zsa-031','zsa-012','zsa-024'].includes(work.id)))await banner.screenshot({path:new URL(width+'-'+work.id+'-intro.jpg',out).pathname,type:'jpeg',quality:88});
      report.intros++;
    }
    await ready('/artists');
    const cards=page.locator('[data-artist-grid="all"] .hos-portrait-card');assert.equal(await cards.count(),catalog.artists.length);
    const boxes=await cards.locator('img').evaluateAll(images=>images.map(image=>{const r=image.getBoundingClientRect();return{width:r.width,height:r.height};}));
    assert(Math.max(...boxes.map(box=>box.height))-Math.min(...boxes.map(box=>box.height))<2,'Artist frames must align');
    assert(!/Tariro Mavhunga|Kudakwashe Nyamudeza|Ruvimbo Chikore|Farai Munetsi|Tendai Nyakudya/.test(await page.locator('[data-page="artists"]').innerText()));
    if([390,1440].includes(width))await page.screenshot({path:new URL(width+'-artists.jpg',out).pathname,type:'jpeg',quality:88,fullPage:true});
    report.artistIndexes++;
  }
  for(const photo of artistPhotos){
    const artist=catalog.artists.find(artist=>artist.name===photo.name),work=catalog.works.find(work=>work.id===photo.workId);
    await ready('/artists/'+artist.slug);await page.locator('#hos-artist-image').evaluate(image=>image.decode());
    assert.match(await page.locator('#hos-artist-image').getAttribute('src'),/\/hos-artist-/);
    assert.equal(await page.locator('#hos-artist-works [data-work-record="'+work.id+'"]').count(),1);
    assert(await page.locator('#hos-artist-biography').innerText());
    if(['Chamu Rumano','Philip Mlimu','Tinodashe Mangenda'].includes(artist.name))await page.screenshot({path:new URL('artist-'+artist.slug+'.jpg',out).pathname,type:'jpeg',quality:88,fullPage:true});
    report.artistPages++;
    await ready('/works/'+work.slug);const images=page.locator('#hos-work-gallery-story img');
    assert((await images.evaluateAll(images=>images.map(image=>image.getAttribute('src')))).some(source=>source.includes(photo.slug+'-with-'+photo.pair)));
    report.galleryPairs++;
  }
  const editorial=JSON.parse(readFileSync(new URL('../public/editorial.json',import.meta.url),'utf8'));
  for(const collection of catalog.collections){const work=catalog.works.find(work=>work.id===collection.starWorkId);await ready('/');const source=await page.locator('#hos-home-chapters [data-collection-section="'+collection.id+'"] .hos-collection-photo img').getAttribute('src');assert.equal(source,editorial.workScenes[work.id].scenes[0].source);}
  assert.deepEqual(errors,[]);assert.equal(app.db.prepare('SELECT count(*) AS n FROM inquiries').get().n,0);report.passed=true;console.log(JSON.stringify(report));
}finally{writeFileSync(new URL('report.json',out),JSON.stringify(report,null,2));await browser?.close();await new Promise(resolve=>app.server.close(resolve));rmSync(dataDir,{recursive:true,force:true});}
