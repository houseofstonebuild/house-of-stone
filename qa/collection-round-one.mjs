import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright';
import {createApp} from '../server.mjs';
import {prepareOwnerPublication} from '../scripts/publish-owner-release.mjs';
import {prepareVerifiedMetadata} from '../scripts/publish-verified-metadata.mjs';
import {prepareCollectionRoundOne,corrections} from '../scripts/publish-collection-round-one.mjs';
import {applyWorkPhotography} from '../public/work-photography.js';
const dataDir=mkdtempSync(join(tmpdir(),'hos-round-one-browser-')),password=randomUUID();
const app=createApp({dataDir,env:{ADMIN_PASSWORD:password},backgroundNotifications:false});
await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+app.server.address().port,out=new URL('../test-results/collection-round-one/',import.meta.url);
mkdirSync(out,{recursive:true});let browser;
const report={passed:false,collectionLayouts:0,homeTiles:0,workGalleries:0};
try{
  const api=async(path,data)=>{
    const response=await fetch(origin+'/api/admin/'+path,{headers:{Authorization:'Basic '+Buffer.from('admin:'+password).toString('base64'),'Content-Type':'application/json',Origin:origin},...(data?{method:'POST',body:JSON.stringify(data)}:{})});
    assert(response.ok);return response.json();
  };
  let state=await api('content');
  const next=prepareCollectionRoundOne(prepareVerifiedMetadata(prepareOwnerPublication(state.draft)));
  state=await api('content',{revision:state.revision,catalog:next});await api('publish',{revision:state.revision});
  const catalog=await(await fetch(origin+'/content.json')).json();
  const editorial=JSON.parse(readFileSync(new URL('../public/editorial.json',import.meta.url),'utf8'));
  applyWorkPhotography(catalog,editorial.workPhotography);
  browser=await chromium.launch({args:['--no-sandbox']});
  const page=await browser.newPage({reducedMotion:'reduce'}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>localStorage.setItem('hos-measurement','off'));
  const ready=async path=>{assert((await page.goto(origin+path)).ok());await page.locator('#hos-concept[data-ready="true"]').waitFor();await page.evaluate(()=>document.fonts.ready);};
  for(const width of [320,390,768,1440]){
    await page.setViewportSize({width,height:1000});await ready('/');
    const banners=new Map();
    for(const collection of catalog.collections){
      const chapter=page.locator('#hos-home-chapters [data-collection-section="'+collection.id+'"]');
      banners.set(collection.id,await chapter.locator('.hos-collection-photo img').getAttribute('src'));
      for(const id of collection.workIds){
        const work=catalog.works.find(work=>work.id===id),card=chapter.locator('[data-work-record="'+id+'"]');
        assert.equal(await card.locator('h3').innerText(),work.title);
        assert.equal(await card.locator('.hos-card-stone').evaluate(node=>[...node.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>n.textContent).join('').trim()),work.material+(work.materialEstimated?' (estimated)':''));
        assert(await card.locator('.hos-card-stone').evaluate(node=>parseFloat(getComputedStyle(node).fontSize)>=11));
        assert.equal(await card.locator('[data-artist]').evaluate(node=>[...node.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>n.textContent).join('').trim()),catalog.artists.find(artist=>artist.id===work.artistId).name);
        assert.equal(await card.locator('img').getAttribute('src'),catalog.assets[work.image]);
        if(work.availability==='sold')assert.equal(await card.locator('.hos-availability').textContent(),'Sold');
        report.homeTiles++;
      }
    }
    for(const collection of catalog.collections){
      await ready('/collections/'+collection.slug);
      const campaign=page.locator('#hos-category-content > .hos-category-campaign');
      assert.equal(await campaign.locator('.hos-collection-visual,.hos-collection-photo').count(),0);
      assert.equal(await campaign.locator('h1').textContent(),collection.name);
      assert.deepEqual(await page.locator('#hos-category-content .hos-work-card').evaluateAll(cards=>cards.map(card=>card.dataset.workRecord)),collection.workIds);
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      if([390,1440].includes(width))await page.screenshot({path:new URL(width+'-'+collection.id+'.jpg',out).pathname,type:'jpeg',quality:88});
      report.collectionLayouts++;
    }
  }
  for(const work of catalog.works){
    await ready('/works/'+work.slug);
    const sources=await page.locator('#hos-work-photo-open img,.hos-photo-thumbnail img,#hos-work-gallery-story img').evaluateAll(images=>images.map(image=>image.getAttribute('src')));
    assert(sources.length>0);
    const allowed=new Set([catalog.assets[work.image],...Object.values(work.views||{}).map(key=>catalog.assets[key]),...(editorial.workScenes?.[work.id]?.scenes||[]).map(scene=>scene.source)]);
    for(const source of sources)assert(allowed.has(source),'Unexpected gallery source '+source);
    if(corrections.some(fix=>fix.id===work.id)){
      await page.locator('#hos-work-image').evaluate(image=>image.decode());
      await page.locator('#hos-work-photo-open').click();
      assert(await page.locator('#hos-photo-dialog').isVisible());
      await page.locator('#hos-photo-dialog img').evaluate(image=>image.decode());
      await page.screenshot({path:new URL(work.id+'-inspect.jpg',out).pathname,type:'jpeg',quality:90});
      await page.keyboard.press('Escape');
    }
    report.workGalleries++;
  }
  assert.deepEqual(errors,[]);
  assert.equal(app.db.prepare('SELECT count(*) AS n FROM inquiries').get().n,0);
  report.passed=true;console.log(JSON.stringify(report));
}finally{
  writeFileSync(new URL('report.json',out),JSON.stringify(report,null,2));
  await browser?.close();await new Promise(resolve=>app.server.close(resolve));rmSync(dataDir,{recursive:true,force:true});
}

