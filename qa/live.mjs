import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from 'playwright';
import {applyWorkPhotography} from '../public/work-photography.js';
import {additions,artistPhotos} from '../scripts/publish-collection-round-two.mjs';

// Production verification is read-only. Discover routes from the published
// catalogue, not the seed: a code release must preserve the owner's database.
const origin=new URL(process.env.HOS_LIVE_URL || 'https://house-of-stone-production.up.railway.app').origin;
const models=JSON.parse(readFileSync(new URL('../public/models.json',import.meta.url),'utf8'));
const output=new URL(process.env.HOS_LIVE_OUTPUT || '../test-results/live/',import.meta.url);mkdirSync(output,{recursive:true});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const paths=new Set(['/app.js','/styles.css','/light-theme.css','/collections.css','/quality.css','/editorial-layout.css','/editorial.json','/gallery.js','/work-photography.js','/presentation.js','/media-upload.js','/models.json','/sculpture-viewer.js','/stone-surface.js']);
const vertexColorOnlyFiles=new Set();
for(const entry of Object.values(models)){
  paths.add(entry.file);
  const bytes=readFileSync(new URL('../public'+entry.file,import.meta.url));
  const doc=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
  if(!(doc.images||[]).length && (doc.meshes||[]).some(mesh=>(mesh.primitives||[]).some(primitive=>primitive.attributes?.COLOR_0!==undefined)))vertexColorOnlyFiles.add(entry.file);
  for(const image of doc.images || [])if(image.uri)paths.add(new URL(image.uri,'https://house.invalid'+entry.file).pathname);
}
const files=[...paths],expected=new Map(files.map(path=>[path,hash(readFileSync(new URL('../public'+path,import.meta.url)))]));
const attempts=Number(process.env.HOS_LIVE_ATTEMPTS || 48),retry=Number(process.env.HOS_LIVE_RETRY_MS || 10000);
let deployed=false,lastError;
for(let attempt=0;attempt<attempts;attempt++){
  try{
    const health=await fetch(origin+'/health',{signal:AbortSignal.timeout(12000)});assert(health.ok && (await health.json()).ok);
    for(const path of files){
      const response=await fetch(origin+path+'?release='+encodeURIComponent(process.env.GITHUB_SHA || expected.get(path)),{cache:'no-store',signal:AbortSignal.timeout(15000)});
      assert(response.ok,`${path}: HTTP ${response.status}`);assert.equal(hash(Buffer.from(await response.arrayBuffer())),expected.get(path),`${path}: waiting for current release`);
    }
    const manifestResponse=await fetch(origin+'/media-manifest.json',{cache:'no-store',signal:AbortSignal.timeout(15000)});assert(manifestResponse.ok);const manifest=await manifestResponse.json(),bundled=JSON.parse(readFileSync(new URL('../public/media-manifest.json',import.meta.url),'utf8'));
    for(const [source,info] of Object.entries(bundled))assert.deepEqual(manifest[source],info,'Bundled responsive image '+source);
    deployed=true;break;
  }catch(error){lastError=error.message;console.log(`Waiting for release (${attempt+1}/${attempts}): ${lastError}`);if(attempt+1<attempts)await delay(retry);}
}
assert(deployed,lastError);
const response=await fetch(origin+'/content.json');assert(response.ok);const catalog=await response.json();
const editorial=JSON.parse(readFileSync(new URL('../public/editorial.json',import.meta.url),'utf8'));
applyWorkPhotography(catalog,editorial.workPhotography);
const collections=catalog.collections || [],works=new Map(catalog.works.map(work=>[work.id,work]));
const roundTwo=works.has('hos-queen-mother');
if(process.env.HOS_EXPECT_FOUNDING_RELEASE==='true'){
  const expected=JSON.parse(readFileSync(new URL('../content/founding-collection.json',import.meta.url),'utf8'));
  if(roundTwo){
    const presence=expected.collections.find(collection=>collection.id==='presence');
    presence.workIds=presence.workIds.map(id=>id==='zsa-002'?'hos-inner-beauty':id);
    presence.workIds.push('hos-queen-mother','hos-celebration');
    expected.collections.find(collection=>collection.id==='kinship').workIds.push('hos-belonging');
    assert(!works.has('zsa-002'),'Philip’s replaced Lovers must be archived');
    assert(!catalog.artists.some(artist=>['tariro','kuda','ruvimbo','farai','tendai'].includes(artist.id)),'Fictional artist profiles must be archived');
    for(const item of additions){const work=works.get(item.id);assert.equal(work?.title,item.title);assert.equal(work.material,item.material);assert.equal(catalog.artists.find(artist=>artist.id===work.artistId)?.name,item.artist);}
    for(const photo of artistPhotos){const artist=catalog.artists.find(artist=>artist.name===photo.name),work=works.get(photo.workId);assert(artist&&work?.artistId===artist.id);assert.match(catalog.assets[artist.portrait],/\/hos-artist-/);assert(work.additionalImages.includes(artist.studioImage));}
  }
  assert.deepEqual(collections.map(c=>({id:c.id,star:c.starWorkId,works:c.workIds})),expected.collections.map(c=>({id:c.id,star:c.starWorkId,works:c.workIds})),'The current collection release must be public.');
  assert.equal(catalog.works.length,roundTwo?26:23);assert(catalog.works.every(w=>w.title && w.artistId && w.material && w.dimensions));
  assert.equal(works.get('zsa-013').availability,'sold');
}
const matchingModel=work=>{
  const entry=models[work?.id];if(!entry || entry.source!==catalog.assets[work.image])return false;
  return entry.reconstruction?entry.workId===work.id && (work.modelVerified===true || entry.ownerApproved===true) && (!work.sourcePage || entry.sourcePage===work.sourcePage):entry.title===work.title;
};
const browser=await chromium.launch({args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const failures=[],report={origin,sha:process.env.GITHUB_SHA,assets:files.length,routes:0,collections:collections.map(c=>c.name),headers:[],inquiries:[],models:[],photoFallbacks:0,relatedCardsChecked:0};
try{
  const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
  await context.addInitScript(()=>localStorage.setItem('hos-measurement','off'));
  await context.route('**/api/**',async route=>{
    if(!['GET','HEAD'].includes(route.request().method())){failures.push('Unexpected write: '+new URL(route.request().url()).pathname);await route.abort();}else await route.continue();
  });
  const page=await context.newPage();
  page.on('pageerror',error=>failures.push(error.message));
  page.on('response',r=>{if(r.url().startsWith(origin)&&r.status()>=400)failures.push(`HTTP ${r.status()}: ${new URL(r.url()).pathname}`);});
  page.on('console',m=>{if(m.type()==='error'&&/WebGLProgram|Shader Error/i.test(m.text()))failures.push(m.text());});
  const ready=async path=>{const response=await page.goto(origin+path);assert(response.ok(),path);await page.locator('#hos-concept[data-ready="true"]').waitFor();};
  const inquire=async(button,work,viewport)=>{
    assert(await button.isEnabled());if(work)assert.equal(await button.getAttribute('data-inquiry-work'),work.id);
    if(work?.availability==='sold')assert.equal(await button.getAttribute('data-inquiry-intent'),'alternatives');
    const topic=await button.getAttribute('data-inquiry');await button.scrollIntoViewIfNeeded();const scroll=await page.evaluate(()=>scrollY);await button.click();
    assert(await page.locator('#hos-inquiry-form').isVisible());assert.equal(await page.locator('#hos-inquiry-context').innerText(),topic);
    await page.locator('#hos-inquiry-close').click();assert(await button.evaluate(el=>el===document.activeElement));assert(Math.abs(await page.evaluate(()=>scrollY)-scroll)<2);
    report.inquiries.push({viewport,workId:work?.id || '',topic});
  };
  for(const viewport of [{width:1440,height:900},{width:390,height:844}]){
    await page.setViewportSize(viewport);await ready('/');
    const header=page.locator('.hos-header'),expanded=(await header.boundingBox()).height;
    const anchor=await page.locator('#hos-home-collection-title').evaluate(el=>el.getBoundingClientRect().top+scrollY);
    await page.evaluate(()=>scrollTo(0,300));await page.waitForFunction(()=>document.documentElement.dataset.headerCompact==='true');const compact=(await header.boundingBox()).height;
    assert.equal(compact,viewport.width<=700?56:expanded);assert(Math.abs(await page.locator('#hos-home-collection-title').evaluate(el=>el.getBoundingClientRect().top+scrollY)-anchor)<1);
    await header.screenshot({path:new URL(`header-${viewport.width}-compact.jpg`,output).pathname,type:'jpeg',quality:94});
    await page.locator('.hos-menu-toggle').click();assert(await page.locator('#hos-menu').isVisible());await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>scrollY),300);
    await page.evaluate(()=>scrollTo(0,0));await page.waitForFunction(()=>document.documentElement.dataset.headerCompact==='false');assert.equal((await header.boundingBox()).height,expanded);
    assert.equal(await page.locator('.hos-footer').evaluate(el=>getComputedStyle(el).position),'static');report.headers.push({viewport:viewport.width,expanded,compact});
    if(collections.length){
      const chapters=page.locator('#hos-home-chapters [data-collection-section]');assert.deepEqual(await chapters.evaluateAll(nodes=>nodes.map(n=>n.dataset.collectionSection)),collections.map(c=>c.id));
      let fallbacks=0;
      for(const collection of collections){
        const work=works.get(collection.starWorkId);assert(work,'A collection must have a published star');
        const chapter=page.locator(`#hos-home-chapters [data-collection-section="${collection.id}"]`);
        const titleLink=chapter.locator('.hos-card-title[data-work="'+work.id+'"]');
        assert.equal(await titleLink.count(),1);
        assert.deepEqual(await chapter.locator('.hos-work-card').evaluateAll(cards=>cards.map(card=>card.dataset.workRecord)),collection.workIds);
        const bannerSource=await chapter.locator('.hos-collection-photo img').getAttribute('src');
        assert.equal(bannerSource,editorial.workScenes[work.id].scenes[0].source);
        if(!matchingModel(work))fallbacks++;
        if(work.availability==='sold')assert.equal(await chapter.locator('[data-work-record="'+work.id+'"] .hos-availability').innerText(),'Sold');
        await titleLink.click();await page.locator('#hos-work-title').waitFor();await inquire(page.locator('#hos-work-inquiry'),work,viewport.width);await page.goto(origin+'/');await page.locator('#hos-concept[data-ready="true"]').waitFor();
      }
      report.photoFallbacks=fallbacks;
    }else{
      const chapters=page.locator('#hos-home-chapters .hos-artist-chapter');assert(await chapters.count()>0);
      for(let index=0;index<await chapters.count();index++){
        const chapter=chapters.nth(index),button=chapter.getByRole('button',{name:'Inquire',exact:true});assert.equal(await button.count(),1);
        const id=await button.getAttribute('data-inquiry-work');await inquire(button,works.get(id),viewport.width);
      }
    }
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  }
  await page.setViewportSize({width:1440,height:900});
  const routes=['/','/collection','/artists','/making','/designers','/collectors','/house','/privacy',...collections.map(c=>'/collections/'+c.slug),...catalog.artists.map(a=>'/artists/'+a.slug),...catalog.works.map(w=>'/works/'+w.slug)];
  for(const path of routes){await ready(path);report.routes++;}
  for(const work of catalog.works){
    await ready('/works/'+work.slug);
    const related=await page.locator('#hos-work-related .hos-work-card').evaluateAll(cards=>cards.map(card=>{const photo=card.querySelector('.hos-work-card-photo').getBoundingClientRect(),copy=card.querySelector('.hos-work-card-copy').getBoundingClientRect();return{photoWidth:photo.width,photoBottom:photo.bottom,copyWidth:copy.width,copyTop:copy.top};}));
    for(const card of related){assert(card.copyWidth>=Math.min(200,card.photoWidth-1),work.id+': related-work text must remain readable');assert(card.copyTop>=card.photoBottom-1,work.id+': related-work caption must be below its image');report.relatedCardsChecked++;}
    assert.equal(await page.locator('#hos-work-model').isVisible(),matchingModel(work),work.id+': published model eligibility');
    await inquire(page.locator('#hos-work-inquiry'),work,1440);
    if(!matchingModel(work))continue;
    await page.locator('#hos-work-model').click();const stage=page.locator('#hos-model-stage');await page.waitForFunction(()=>document.querySelector('#hos-model-stage').dataset.modelState==='ready');
    assert.equal(await stage.getAttribute('data-model-id'),work.id);assert(Number(await stage.getAttribute('data-model-triangles'))>500);if(!vertexColorOnlyFiles.has(models[work.id].file))assert(Number(await stage.getAttribute('data-model-texture-width'))>=1000);
    await stage.screenshot({path:new URL(work.id+'-desktop.jpg',output).pathname,type:'jpeg',quality:94});
    for(let turn=1;turn<=13;turn++)await page.getByRole('button',{name:'Rotate right',exact:true}).click();
    await page.waitForFunction(()=>Number(document.querySelector('#hos-model-stage').dataset.modelRotation)>2.8);
    await stage.screenshot({path:new URL(work.id+'-reverse.jpg',output).pathname,type:'jpeg',quality:94});
    await page.getByRole('button',{name:'Zoom in',exact:true}).click();await page.waitForFunction(()=>Number(document.querySelector('#hos-model-stage').dataset.modelZoom)>1);
    await page.getByRole('button',{name:'Reset',exact:true}).click();await page.waitForFunction(()=>Number(document.querySelector('#hos-model-stage').dataset.modelRotation)===-.3);
    await page.setViewportSize({width:390,height:844});await stage.screenshot({path:new URL(work.id+'-mobile.jpg',output).pathname,type:'jpeg',quality:94});
    await page.keyboard.press('Escape');assert(!await page.locator('body').evaluate(el=>el.classList.contains('hos-model-open')));report.models.push({id:work.id,title:work.title,textureWidth:Number(await stage.getAttribute('data-model-texture-width'))});await page.setViewportSize({width:1440,height:900});
  }
  assert.deepEqual(failures,[]);report.passed=true;
}finally{await browser.close();writeFileSync(new URL('report.json',output),JSON.stringify({...report,failures},null,2)+'\n');}
console.log('Live verification passed: '+JSON.stringify(report));


