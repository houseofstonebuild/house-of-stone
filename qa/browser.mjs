import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {chromium,firefox,webkit} from 'playwright';
import {createApp} from '../server.mjs';
const output = new URL('../test-results/browser/',import.meta.url);
mkdirSync(output,{recursive:true});
const catalog=JSON.parse(readFileSync(new URL('../content/catalog.json',import.meta.url),'utf8'));
const routes=['/','/collection','/artists','/making','/designers','/collectors','/house','/privacy',...catalog.artists.map(a=>'/artists/'+a.slug),...catalog.works.map(w=>'/works/'+w.slug)];
const sizes=[[320,568],[390,844],[844,390],[768,1024],[1024,768],[1440,900],[1920,1080],[2048,1152],[2560,1440],[3440,1440],[3840,2160]];
const report={engines:{},errors:[]};
const password=randomUUID();
const engines=Object.entries({chromium,firefox,webkit}).filter(([name])=>!process.env.QA_ENGINE||name===process.env.QA_ENGINE);
for(const [engineName,engine] of engines) {
  const dataDir=mkdtempSync(join(tmpdir(),'hos-browser-'));
  const app=createApp({dataDir,env:{ADMIN_PASSWORD:password},backgroundNotifications:false});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+app.server.address().port;
  let browser;
  const errors=[],pageErrors=[],failedResponses=[];
  const auth={Authorization:'Basic '+Buffer.from('admin:'+password).toString('base64')};
  const adminGet=async path=>(await fetch(base+path,{headers:auth})).json();
  async function ready(page,path='/',search='') {await page.goto(base+path+search);await page.locator('#hos-concept[data-ready="true"]').waitFor();await page.emulateMedia({reducedMotion:'reduce'});}
  const launchOptions=engineName==='chromium'?{args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']}:engineName==='firefox'?{firefoxUserPrefs:{'webgl.force-enabled':true,'webgl.disabled':false}}:{};
  try {
    browser=await engine.launch(launchOptions);
    let context=await browser.newContext({deviceScaleFactor:2,reducedMotion:'reduce'});
    await context.addInitScript(()=>localStorage.setItem('hos-measurement','off'));
    // Keep the route/layout matrix independent of software-GPU resource pressure.
    // The dedicated contexts below exercise every real mesh and its controls.
    await context.addInitScript(()=>{
      const original=HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl2'?null:original.call(this,type,...args);};
    });
    let page=await context.newPage();
    page.on('pageerror',error=>pageErrors.push(error.message));
    page.on('response',r=>{if(r.url().startsWith(base)&&r.status()>=400)failedResponses.push({url:r.url(),status:r.status()});});
    let checked=0;
    for(const [width,height] of sizes) {
      await page.setViewportSize({width,height});
      for(const path of routes) {
        try {
          await ready(page,path);
          await page.evaluate(async()=>{
            const visible=[...document.querySelectorAll('#hos-concept img')].filter(img=>img.getClientRects().length);
            visible.forEach(img=>{img.loading='eager';});
            await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
          });
          await page.waitForFunction(()=>[...document.querySelectorAll('#hos-concept img')].filter(img=>img.getClientRects().length).every(img=>img.complete&&img.naturalWidth>0));
          const decodeErrors=await page.evaluate(async()=>{
            const results=await Promise.all([...document.querySelectorAll('#hos-concept img')].filter(img=>img.getClientRects().length).map(async img=>{try{await img.decode();return null;}catch(error){return {src:img.currentSrc,error:error.message};}}));
            return results.filter(Boolean);
          });
          assert.equal(decodeErrors.length,0,`Images could not decode: ${JSON.stringify(decodeErrors)}`);
          const layout=await page.evaluate(()=>{
            const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,height:r.height};};
            const visible=selector=>[...document.querySelectorAll(selector)].filter(el=>el.getClientRects().length);
            return {viewport:innerWidth,clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,root:rect('#hos-concept'),header:rect('.hos-header'),footer:rect('.hos-footer'),footerPosition:getComputedStyle(document.querySelector('.hos-footer')).position,main:rect('#hos-main'),hero:rect('.hos-hero-image'),images:visible('#hos-concept img').map(img=>({src:img.currentSrc,naturalWidth:img.naturalWidth,fit:getComputedStyle(img).objectFit,hero:img.classList.contains('hos-hero-image'),campaign:!!img.closest('.hos-artist-campaign'),process:!!img.closest('.hos-process-steps .hos-story-section figure')})),text:visible('#hos-main p').filter(el=>!el.classList.contains('hos-artist-style')&&!el.matches('.hos-card-specs,.hos-card-stone,.hos-filter-count,.hos-work-short-specs,.hos-photo-caption')&&!el.classList.contains('hos-photo-caption')&&!el.classList.contains('hos-work-short-specs')).map(el=>({size:parseFloat(getComputedStyle(el).fontSize),text:el.textContent.slice(0,60)}))};
          });
          assert(layout.scrollWidth<=layout.clientWidth+1,`Horizontal overflow ${JSON.stringify(layout)}`);
          assert(Math.abs(layout.root.left)<1&&Math.abs(layout.root.right-layout.clientWidth)<2,`Root does not fill the page width ${JSON.stringify(layout)}`);
          assert(Math.abs(layout.header.top)<1,'Header not anchored');
          assert.equal(layout.footerPosition,'static','Footer must remain in normal page flow');
          assert(layout.footer.top>=layout.main.bottom-1,'Footer overlaps the page');
          assert(layout.main.top>=layout.header.bottom-1,'Header covers content');
          assert(layout.images.every(i=>i.naturalWidth>0&&i.fit===(i.hero||i.process||(i.campaign&&width<=700)?'cover':'contain')),'Broken image or wrong framing');
          assert(layout.text.every(t=>t.size>=15),`Reading text is too small: ${JSON.stringify(layout.text.filter(t=>t.size<15))}`);
          assert(await page.locator('.hos-view:visible .hos-card-stone').evaluateAll(nodes=>nodes.every(node=>parseFloat(getComputedStyle(node).fontSize)>=11)),'Stone captions are too small');
          if(path==='/') {
            assert(Math.abs(layout.hero.left)<1&&Math.abs(layout.hero.right-layout.clientWidth)<2,'Hero has side gaps');
            assert(Math.abs(layout.hero.top-layout.header.bottom)<2&&Math.abs(layout.hero.bottom-height)<2,'Hero does not fill the visible screen');
            assert.equal(await page.locator('#hos-home-chapters .hos-artist-chapter').count(),catalog.artists.length);
            assert.equal(await page.locator('#hos-home-chapters .hos-artist-campaign').count(),catalog.artists.length);
            assert.equal(await page.locator('#hos-home-chapters .hos-setting-tile').count(),catalog.artists.length*3);
            assert.equal(await page.locator('#hos-home-chapters .hos-setting-action [data-work]').count(),catalog.artists.length);
            assert.equal(await page.locator('#hos-home-chapters .hos-setting-tile .hos-text-link').count(),0);
            if(width<=700)assert((await page.locator('#hos-home-chapters .hos-artist-campaign').first().boundingBox()).height>=Math.min(390,width),'Mobile artist campaign should have a large crop');
            assert.equal(await page.locator('.hos-hero-copy h1 span').last().evaluate(el=>getComputedStyle(el).color),'rgb(255, 255, 255)');
            assert.equal(await page.locator('#hos-home-collection-title').evaluate(el=>getComputedStyle(el).color),'rgb(36, 36, 36)');
            assert(await page.locator('#hos-page-navigation').isHidden(),'Home should not show Back');
          }
          if(path.startsWith('/artists/')) {
            const profile=await page.evaluate(()=>({image:document.querySelector('.hos-artist-portrait').getBoundingClientRect(),copy:document.querySelector('.hos-artist-copy').getBoundingClientRect()}));
            if(width>700)assert(Math.abs((profile.image.top+profile.image.bottom-profile.copy.top-profile.copy.bottom)/2)<2,'Portrait and biography must share a vertical centre');
          }
          await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));
          const bottom=await page.evaluate(()=>({headerTop:document.querySelector('.hos-header').getBoundingClientRect().top,footerBottom:document.querySelector('.hos-footer').getBoundingClientRect().bottom,mainBottom:document.querySelector('#hos-main').getBoundingClientRect().bottom,footerTop:document.querySelector('.hos-footer').getBoundingClientRect().top}));
          assert(Math.abs(bottom.headerTop)<1,'Header does not stay fixed while scrolling');
          assert(Math.abs(bottom.footerBottom-height)<2,'Footer does not finish at the end of the page');
          assert(bottom.mainBottom<=bottom.footerTop+2,'Footer covers the last content');
          if(width===1440||width===390||([844,2048,3440].includes(width)&&path==='/')) {
            await page.evaluate(async()=>{
              const frame=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
              for(let y=0;y<document.documentElement.scrollHeight;y+=Math.max(200,innerHeight-160)){scrollTo(0,y);await frame();}
              scrollTo(0,0);await frame();
            });
            await page.screenshot({path:new URL(`${engineName}-${width}-${path==='/'?'home':path.slice(1).replaceAll('/','-')}.jpg`,output).pathname,type:'jpeg',quality:85,scale:'css',fullPage:![844,3440].includes(width)});
          }
          checked++;
        } catch(error) {errors.push(`${width}x${height} ${path}: ${error.message}`);}
      }
      await ready(page);
      const before=await page.locator('.hos-hero-copy h1').boundingBox();
      await page.locator('.hos-menu-toggle').click();
      assert(await page.locator('#hos-menu').evaluate(el=>el.open),'Drawer did not open');
      const after=await page.locator('.hos-hero-copy h1').boundingBox();
      assert(Math.abs(before.y-after.y)<1&&Math.abs(before.x-after.x)<1,'Drawer moves page content');
      assert(await page.evaluate(()=>document.querySelector('#hos-menu').contains(document.activeElement)),'Focus escaped menu');
      if(width===1440)await page.screenshot({path:new URL(`${engineName}-drawer.jpg`,output).pathname,type:'jpeg',quality:85,scale:'css'});
      await page.keyboard.press('Escape');
      assert(await page.locator('#hos-menu').isHidden(),'Escape did not close menu');
      await page.locator('.hos-menu-toggle').click();
      await page.mouse.click(width-8,height/2);
      assert(await page.locator('#hos-menu').isHidden(),'Backdrop did not close menu');
      await page.locator('.hos-menu-toggle').click();
      await page.locator('#hos-menu-close').click();
      assert(await page.locator('#hos-menu').isHidden(),'Close button did not close menu');
    }
    // Release the decoded ultra-wide screenshots and compositor surfaces before
    // interaction checks; every large viewport and its menu was checked above.
    await browser.close();browser=await engine.launch(launchOptions);
    context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:2,reducedMotion:'reduce'});
    await context.addInitScript(()=>localStorage.setItem('hos-measurement','off'));
    page=await context.newPage();
    page.on('pageerror',error=>pageErrors.push(error.message));
    page.on('response',r=>{if(r.url().startsWith(base)&&r.status()>=400)failedResponses.push({url:r.url(),status:r.status()});});
    await ready(page);
    for(const view of ['collection','artists','making','designers','collectors','house']) {
      await page.locator('.hos-menu-toggle').click();
      await page.locator(`#hos-menu [data-view="${view}"]`).click();
      assert(new URL(page.url()).pathname==='/'+view,'Menu navigation failed');
      assert(await page.locator(`[data-page="${view}"]`).isVisible());
      assert(await page.locator('#hos-menu').isHidden());
    }
    await page.locator('.hos-header [data-view="home"]').click();
    await page.locator('.hos-hero-copy [data-scroll-collection]').click();
    assert.equal(new URL(page.url()).pathname,'/');
    assert((await page.locator('#hos-home-collection-title').boundingBox()).y>=64,'Collection scroll must clear the header');
    await page.locator('[data-page="home"] .hos-setting-photo').first().click();
    assert(new URL(page.url()).pathname==='/works/folded-light');
    await page.goBack();assert(new URL(page.url()).pathname==='/');
    await page.goForward();assert(await page.locator('#hos-work-title').textContent()==='Folded Light');
    // Every setting for an artist opens the same work. Back restores the chapter.
    await page.setViewportSize({width:1440,height:900});
    await ready(page);
    const hierarchy=await page.locator('#hos-home-chapters .hos-artist-chapter').first().evaluate(chapter=>({artist:chapter.querySelector('.hos-chapter-artist').getBoundingClientRect().bottom,work:chapter.querySelector('.hos-chapter-work').getBoundingClientRect().top}));
    assert(hierarchy.work>hierarchy.artist,'Artist and sculpture should have separate rows');
    assert(await page.locator('#hos-home-chapters .hos-carousel-controls').first().isHidden(),'Desktop should show three tiles without carousel controls');
    for(const [artistIndex,artist] of catalog.artists.entries()) {
      const work=catalog.works.find(work=>work.artistId===artist.id);
      for(let setting=0;setting<3;setting++) {
        await ready(page);
        const tile=page.locator('#hos-home-chapters .hos-artist-chapter').nth(artistIndex).locator('.hos-setting-photo').nth(setting);
        await tile.scrollIntoViewIfNeeded();
        const scroll=await page.evaluate(()=>scrollY);
        await tile.click();assert.equal(new URL(page.url()).pathname,'/works/'+work.slug);
        assert(await page.locator('#hos-page-navigation').isVisible());
        await page.locator('#hos-page-navigation [data-back]').click();
        await page.waitForURL(base+'/');
        await page.waitForFunction(y=>Math.abs(scrollY-y)<3,scroll);
      }
      await page.locator('#hos-home-chapters .hos-artist-chapter').nth(artistIndex).getByRole('link',{name:'About the artist'}).click();
      assert.equal(new URL(page.url()).pathname,'/artists/'+artist.slug);
      await page.locator('#hos-page-navigation [data-back]').click();await page.waitForURL(base+'/');
    }
    await ready(page,'/works/folded-light');await page.locator('#hos-page-navigation [data-back]').click();await page.waitForURL(base+'/collection');
    await ready(page,'/artists/tariro-mavhunga');await page.locator('#hos-page-navigation [data-back]').click();await page.waitForURL(base+'/artists');
    // The mobile settings stay in a single swipeable row; controls and keyboard
    // navigation must agree with native scroll, including restored Back state.
    await page.setViewportSize({width:390,height:844});
    await ready(page);
    for(const [artistIndex,artist] of catalog.artists.entries()) {
      const chapter=page.locator('#hos-home-chapters .hos-artist-chapter').nth(artistIndex);
      const track=chapter.locator('.hos-sculpture-settings'),counter=chapter.locator('.hos-carousel-position');
      const dimensions=await track.evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth,tops:[...el.children].map(tile=>tile.getBoundingClientRect().top)}));
      assert(dimensions.scroll>dimensions.width&&dimensions.tops.every(y=>Math.abs(y-dimensions.tops[0])<1),'Mobile settings should form a horizontal carousel');
      assert(await chapter.getByRole('button',{name:'Previous setting'}).isDisabled());
      await chapter.getByRole('button',{name:'Next setting'}).click();
      await counter.filter({hasText:'2 / 3'}).waitFor();
      await track.focus();await page.keyboard.press('End');await counter.filter({hasText:'3 / 3'}).waitFor();
      assert(await chapter.getByRole('button',{name:'Next setting'}).isDisabled());
      await track.evaluate(el=>el.scrollTo({left:0,behavior:'instant'}));await counter.filter({hasText:'1 / 3'}).waitFor();
      await track.focus();await page.keyboard.press('ArrowRight');await counter.filter({hasText:'2 / 3'}).waitFor();
      const work=catalog.works.find(work=>work.artistId===artist.id);
      await chapter.locator('.hos-setting-action').getByRole('link',{name:'View sculpture',exact:true}).click();
      assert.equal(new URL(page.url()).pathname,'/works/'+work.slug);
      await page.locator('#hos-page-navigation [data-back]').click();await page.waitForURL(base+'/');
      await counter.filter({hasText:'2 / 3'}).waitFor();
    }
    await ready(page);await page.locator('#hos-home-chapters .hos-artist-chapter').first().screenshot({path:new URL(`${engineName}-mobile-chapter.jpg`,output).pathname,type:'jpeg',quality:90,scale:'css'});
    await page.setViewportSize({width:1440,height:900});await ready(page);
    await page.locator('#hos-home-chapters .hos-artist-chapter').first().screenshot({path:new URL(`${engineName}-desktop-chapter.jpg`,output).pathname,type:'jpeg',quality:90,scale:'css'});
    await page.locator('.hos-footer').screenshot({path:new URL(`${engineName}-footer.jpg`,output).pathname,type:'jpeg',quality:90,scale:'css'});
    for(const view of ['collection','artists','making','designers','collectors','house','privacy']) {
      await page.locator(`.hos-footer [data-view="${view}"]`).click();assert.equal(new URL(page.url()).pathname,'/'+view);
    }
    await page.locator('.hos-footer [data-inquiry="Corporate project"]').click();
    assert(await page.locator('#hos-inquiry-form').isVisible());
    assert.equal(await page.locator('#hos-inquiry-context').textContent(),'Corporate project');
    await page.locator('#hos-inquiry-close').click();
    assert(!/\benquir/i.test(await page.locator('#hos-concept').innerText()),'Visitor copy should use American English');
    // A separate tracked browser session exercises real form submissions and attribution.
    const tracked=await browser.newContext({viewport:{width:390,height:844}});
    const visitor=await tracked.newPage();
    await ready(visitor,'/','?utm_source=qa&utm_medium=browser&utm_campaign=launch');
    await visitor.locator('.hos-hero-copy [data-scroll-collection]').click();
    assert.equal(new URL(visitor.url()).pathname,'/');
    await visitor.locator('[data-page="home"] .hos-setting-photo').first().click();
    await visitor.reload();await visitor.locator('#hos-concept[data-ready="true"]').waitFor();
    await visitor.locator('#hos-work-model').click();
    await visitor.locator('#hos-model-dialog').waitFor();
    await visitor.waitForFunction(()=>['ready','unavailable'].includes(document.querySelector('#hos-model-stage').dataset.modelState));
    if(await visitor.locator('#hos-model-stage').getAttribute('data-model-state')==='ready')await visitor.getByRole('button',{name:'Rotate right',exact:true}).click();
    await visitor.locator('#hos-model-close').click();
    await visitor.locator('#hos-work-inquiry').click();
    await visitor.locator('#hos-inquiry-form button[type="submit"]').click();
    assert(await visitor.locator('#hos-inquiry-form').isVisible(),'Blank form reached review');
    await visitor.locator('[name="name"]').fill('Browser QA collector');
    await visitor.locator('[name="email"]').fill('not-an-email');
    await visitor.locator('#hos-inquiry-form button[type="submit"]').click();
    assert(await visitor.locator('#hos-inquiry-form').isVisible(),'Invalid email reached review');
    await visitor.locator('[name="email"]').fill('collector@example.test');
    await visitor.locator('[name="message"]').fill('Please tell me about Folded Light.');
    await visitor.locator('#hos-inquiry-form button[type="submit"]').click();
    assert(await visitor.locator('#hos-review-message').textContent()==='Please tell me about Folded Light.');
    await visitor.screenshot({path:new URL(`${engineName}-inquiry-review.jpg`,output).pathname,type:'jpeg',quality:85,scale:'css',fullPage:true});
    await visitor.locator('#hos-inquiry-edit').click();
    assert(await visitor.locator('[name="message"]').inputValue()==='Please tell me about Folded Light.');
    await visitor.locator('#hos-inquiry-form button[type="submit"]').click();
    // Server saves successfully but the response is lost. Retry must preserve the receipt.
    let lost=false;
    await visitor.route('**/api/inquiries',async route=>{if(!lost){lost=true;await route.fetch();await route.abort('failed');}else await route.continue();});
    await visitor.locator('#hos-inquiry-send').click();
    await visitor.locator('#hos-form-status').filter({hasText:'Please try again'}).waitFor();
    assert(app.db.prepare('SELECT count(*) AS n FROM inquiries').get().n===1);
    await visitor.locator('#hos-inquiry-send').click();
    await visitor.locator('#hos-inquiry-success').waitFor();
    await visitor.waitForFunction(()=>scrollY===0&&document.querySelector('.hos-header').getBoundingClientRect().top===0);
    assert.equal(await visitor.locator('#hos-inquiry-title').textContent(),'Inquiry received.');
    await visitor.screenshot({path:new URL(`${engineName}-inquiry-success.jpg`,output).pathname,type:'jpeg',quality:85,scale:'css',fullPage:true});
    assert(app.db.prepare('SELECT count(*) AS n FROM inquiries').get().n===1,'Retry duplicated enquiry');
    const entry=(await adminGet('/api/admin/inquiries'))[0];
    assert.equal(entry.work_id,'folded-light');assert.equal(entry.source,'qa');
    const sessionHashes=app.db.prepare('SELECT DISTINCT session_hash FROM events').all();assert.equal(sessionHashes.length,1);
    for(const name of ['page_view','explore_click','work_view','model_view','inquiry_opened','inquiry_started','inquiry_submitted']) assert(app.db.prepare('SELECT count(*) AS n FROM events WHERE name=?').get(name).n>0,`Missing event ${name}`);
    const eventsBefore=app.db.prepare('SELECT count(*) AS n FROM events').get().n;
    await visitor.locator('#hos-inquiry-continue').click();
    await visitor.locator('.hos-footer [data-view="privacy"]').click();
    await visitor.locator('#hos-analytics-preference').uncheck();
    await visitor.locator('.hos-header [data-view="home"]').click();
    await visitor.locator('.hos-enquire').click();
    await visitor.locator('[name="name"]').fill('Private collector');await visitor.locator('[name="email"]').fill('private@example.test');
    await visitor.locator('#hos-inquiry-form button[type="submit"]').click();await visitor.locator('#hos-inquiry-send').click();await visitor.locator('#hos-inquiry-success').waitFor();
    const privateEntry=app.db.prepare("SELECT * FROM inquiries WHERE email='private@example.test'").get();assert.equal(privateEntry.session_hash,null);
    assert(app.db.prepare('SELECT count(*) AS n FROM events').get().n<=eventsBefore+2,'Opt-out records activity');
    await tracked.close();
    // Exercise actual WebGL models, reversible scroll rotation, demand-only
    // rendering, orbit controls, pinch, keyboard, and a non-WebGL fallback.
    const threeD=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'no-preference'});
    await threeD.addInitScript(()=>localStorage.setItem('hos-measurement','off'));
    const modelPage=await threeD.newPage();modelPage.on('pageerror',error=>pageErrors.push(error.message));
    modelPage.on('console',message=>{if(message.type()==='error'&&/WebGLProgram|Shader Error/i.test(message.text()))pageErrors.push(message.text());});
    await ready(modelPage);await modelPage.emulateMedia({reducedMotion:'no-preference'});
    let webglReady;
    for(const [index,artist] of catalog.artists.entries()) {
      const work=catalog.works.find(w=>w.artistId===artist.id);
      await ready(modelPage,'/works/'+work.slug);
      await modelPage.locator('#hos-work-model').click();
      const stage=modelPage.locator('#hos-model-stage');
      await modelPage.waitForFunction(()=>['ready','unavailable'].includes(document.querySelector('#hos-model-stage').dataset.modelState));
      const state=await stage.getAttribute('data-model-state');
      if(index===0){webglReady=state==='ready';if(engineName==='chromium')assert(webglReady,'Chromium must render the actual 3D mesh');}
      if(webglReady){assert.equal(state,'ready');assert(Number(await stage.getAttribute('data-model-triangles'))>500);}
      assert.equal(await modelPage.locator('#hos-model-title').textContent(),catalog.works.find(w=>w.artistId===artist.id).title);
      if(webglReady){
        const modal=modelPage.locator('#hos-model-stage');
        await modelPage.getByRole('button',{name:'Rotate right',exact:true}).click();await modelPage.waitForFunction(()=>Number(document.querySelector('#hos-model-stage').dataset.modelRotation)>-.1);
        await modelPage.getByRole('button',{name:'Zoom in',exact:true}).click();await modelPage.waitForFunction(()=>Number(document.querySelector('#hos-model-stage').dataset.modelZoom)>1);
        await modelPage.getByRole('button',{name:'Reset',exact:true}).click();await modelPage.waitForFunction(()=>Number(document.querySelector('#hos-model-stage').dataset.modelZoom)===1&&Number(document.querySelector('#hos-model-stage').dataset.modelRotation)===-.3);
        await modal.screenshot({path:new URL(`${engineName}-model-${catalog.works.find(w=>w.artistId===artist.id).id}-front.jpg`,output).pathname,type:'jpeg',quality:94,scale:'css'});
        // Inspect the polished side and reverse, not only the source-photo pose.
        for(let turn=1;turn<=13;turn++) {
          await modelPage.getByRole('button',{name:'Rotate right',exact:true}).click();
          if(turn===7||turn===13) {
            await modelPage.waitForFunction(expected=>Math.abs(Number(document.querySelector('#hos-model-stage').dataset.modelRotation)-expected)<.001,-.3+turn*.24);
            await modal.screenshot({path:new URL(`${engineName}-model-${catalog.works.find(w=>w.artistId===artist.id).id}-${turn===7?'side':'back'}.jpg`,output).pathname,type:'jpeg',quality:94,scale:'css'});
          }
        }
        await modelPage.getByRole('button',{name:'Reset',exact:true}).click();
        await modelPage.waitForFunction(()=>Number(document.querySelector('#hos-model-stage').dataset.modelRotation)===-.3);
        const canvas=modal.locator('.hos-3d-canvas'),bounds=await canvas.boundingBox();
        await modelPage.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);await modelPage.mouse.down();await modelPage.mouse.move(bounds.x+bounds.width/2+90,bounds.y+bounds.height/2+25,{steps:5});await modelPage.mouse.up();
        await modelPage.waitForFunction(()=>Number(document.querySelector('#hos-model-stage').dataset.modelRotation)>.2);
        await modal.screenshot({path:new URL(`${engineName}-model-${catalog.works.find(w=>w.artistId===artist.id).id}-turned.jpg`,output).pathname,type:'jpeg',quality:94,scale:'css'});
        await canvas.focus();await modelPage.keyboard.press('Home');await modelPage.keyboard.press('ArrowUp');await modelPage.waitForFunction(()=>Number(document.querySelector('#hos-model-stage').dataset.modelPitch)>0);
      }
      await modelPage.keyboard.press('Escape');assert(await modelPage.locator('#hos-model-dialog').isHidden());assert(!await modelPage.locator('body').evaluate(el=>el.classList.contains('hos-model-open')));
    }
    await ready(modelPage,'/works/folded-light');await modelPage.locator('#hos-work-model').click();await modelPage.waitForFunction(()=>['ready','unavailable'].includes(document.querySelector('#hos-model-stage').dataset.modelState));
    if(webglReady){
      await modelPage.locator('#hos-model-dialog').screenshot({path:new URL(`${engineName}-3d-viewer.jpg`,output).pathname,type:'jpeg',quality:90,scale:'css'});
      if(engineName==='chromium'){
        const session=await threeD.newCDPSession(modelPage),b=await modelPage.locator('#hos-model-stage').boundingBox(),x=b.x+b.width/2,y=b.y+b.height/2;
        await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x-35,y,id:1},{x:x+35,y,id:2}]});
        await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-65,y,id:1},{x:x+65,y,id:2}]});
        await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await modelPage.waitForFunction(()=>Number(document.querySelector('#hos-model-stage').dataset.modelZoom)>1.2);await session.detach();
      }
    }
    await modelPage.locator('#hos-model-close').click();assert(await modelPage.locator('#hos-work-model').evaluate(el=>el===document.activeElement));await threeD.close();
    const fallbackContext=await browser.newContext({viewport:{width:390,height:844}});
    await fallbackContext.addInitScript(()=>{localStorage.setItem('hos-measurement','off');const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl2'?null:original.call(this,type,...args);};});
    const fallbackPage=await fallbackContext.newPage();fallbackPage.on('pageerror',error=>pageErrors.push(error.message));
    await ready(fallbackPage,'/works/folded-light');await fallbackPage.locator('#hos-work-model').click();await fallbackPage.waitForFunction(()=>document.querySelector('#hos-model-stage').dataset.modelState==='unavailable');
    assert(await fallbackPage.locator('#hos-model-stage .hos-3d-poster').isVisible());assert(await fallbackPage.getByRole('button',{name:'Rotate right',exact:true}).isDisabled());
    await fallbackPage.locator('#hos-model-close').click();await fallbackPage.locator('#hos-work-inquiry').click();assert(await fallbackPage.locator('#hos-inquiry-form').isVisible());await fallbackContext.close();
    // Actual owner interface: biography, draft isolation, publish, restore and preview.
    const owner=await browser.newContext({httpCredentials:{username:'admin',password},viewport:{width:1440,height:900}});
    const editor=await owner.newPage();await editor.goto(base+'/admin/content');await editor.locator('#field-title').waitFor();
    await editor.locator('#field-yearMade').fill('2026');await editor.locator('#save').click();await editor.locator('#status').filter({hasText:'Draft saved.'}).waitFor();
    await editor.locator('#artist-list .record button').first().click();
    await editor.locator('#field-biography').fill('A biography entered through the real editor.');
    await editor.locator('#save').click();await editor.locator('#status').filter({hasText:'Draft saved.'}).waitFor();
    await editor.locator('input[type="file"]').first().setInputFiles(new URL('../public/assets/fold.jpg',import.meta.url).pathname);
    await editor.locator('#status').filter({hasText:'Photo uploaded.'}).waitFor();
    await editor.locator('#save').click();await editor.locator('#status').filter({hasText:'Draft saved.'}).waitFor();
    const state=await adminGet('/api/admin/content');const uploadedUrl=state.draft.assets[state.draft.artists[0].portrait];
    assert(uploadedUrl.startsWith('/media/'));assert.equal((await fetch(base+uploadedUrl)).status,404);
    const publishedBefore=(await (await fetch(base+'/content.json')).json()).artists[0].biography;
    assert.notEqual(publishedBefore,'A biography entered through the real editor.');
    const previewPage=await owner.newPage();await ready(previewPage,'/admin/preview/artists/tariro-mavhunga');
    assert.equal(await previewPage.locator('#hos-artist-biography').textContent(),'A biography entered through the real editor.');
    const beforePreview=app.db.prepare('SELECT count(*) AS n FROM events').get().n;
    await previewPage.locator('.hos-menu-toggle').click();await previewPage.locator('#hos-menu [data-view="collectors"]').click();
    assert(new URL(previewPage.url()).pathname==='/admin/preview/collectors');
    assert.equal(app.db.prepare('SELECT count(*) AS n FROM events').get().n,beforePreview);
    await editor.locator('#publish').click();await editor.locator('#status').filter({hasText:'Collection published.'}).waitFor();
    assert.equal((await (await fetch(base+'/content.json')).json()).artists[0].biography,'A biography entered through the real editor.');
    await ready(page,'/works/folded-light');assert.equal(await page.locator('#hos-work-year').textContent(),'2026');
    assert.equal((await fetch(base+uploadedUrl)).status,200);
    await editor.locator('#history button').last().click();await editor.locator('#status').filter({hasText:'Earlier version restored'}).waitFor();
    await editor.locator('#publish').click();await editor.locator('#status').filter({hasText:'Collection published.'}).waitFor();
    assert.equal((await (await fetch(base+'/content.json')).json()).artists[0].biography,publishedBefore);
    // Several sculptures beneath one artist must form usable tiles at each breakpoint.
    for(let i=2;i<=4;i++) {
      await editor.locator('#add-work').click();
      await editor.locator('#field-title').fill('Browser QA sculpture '+i);
      await editor.locator('#field-artistId').selectOption('tariro');
      await editor.locator('#field-dimensions').fill('40 × 20 × 15 cm');
      await editor.locator('#field-material').fill('Springstone');
      await editor.locator('#field-description').fill('A sculpture added through the collection editor.');
      await editor.locator('.photo-editor summary').first().click();await editor.locator('.photo-grid button[title="fold"]').first().click();
    }
    await editor.locator('#publish').click();await editor.locator('#status').filter({hasText:'Collection published.'}).waitFor();
    for(const [width,columns] of [[1440,3],[768,2],[390,2]]) {
      await page.setViewportSize({width,height:900});await ready(page,'/collection');
      const grid=page.locator('#hos-collection-chapters .hos-work-grid').first();
      assert.equal(await grid.locator('.hos-work-card').count(),8);
      assert.equal(await grid.evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),columns);
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),'Multiple sculpture tiles overflow the screen');
    }
    await page.locator('#hos-collection-chapters .hos-work-card h3 [data-work]').last().click();
    assert.equal(await page.locator('#hos-work-title').textContent(),'Browser QA sculpture 4');
    await editor.goto(base+'/admin');await editor.locator('#inbox .inquiry').first().waitFor();
    assert((await editor.locator('#inbox').textContent()).includes('Browser QA collector'));
    await owner.close();await context.close();
    // Motion remains interruptible; reduced-motion visitors keep content visible.
    const motion=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'no-preference'});
    await motion.addInitScript(()=>localStorage.setItem('hos-measurement','off'));
    const motionPage=await motion.newPage();motionPage.on('pageerror',error=>pageErrors.push(error.message));
    await motionPage.goto(base+'/');await motionPage.locator('#hos-concept[data-ready="true"]').waitFor();
    await motionPage.locator('.hos-footer [data-view="collection"]').click();
    assert(new URL(motionPage.url()).pathname==='/collection');
    assert(await motionPage.evaluate(()=>document.querySelector('[data-page="collection"]').getAnimations().length>0),'Navigation has no entrance animation');
    await motionPage.locator('.hos-header [data-view="home"]').click();assert(new URL(motionPage.url()).pathname==='/');
    await motionPage.locator('.hos-menu-toggle').click();await motionPage.keyboard.press('Escape');assert(await motionPage.locator('#hos-menu').isHidden());
    await motionPage.emulateMedia({reducedMotion:'reduce'});
    await motionPage.locator('.hos-footer [data-view="collection"]').click();
    assert.equal(await motionPage.evaluate(()=>document.querySelector('[data-page="collection"]').getAnimations().length),0,'Reduced-motion still animates');
    assert.equal(await motionPage.locator('[data-page="collection"]').evaluate(el=>getComputedStyle(el).opacity),'1');
    await motion.close();
    assert.equal(pageErrors.length,0,`Browser JS errors: ${pageErrors.join('; ')}`);
    assert.equal(failedResponses.length,0,`HTTP failures: ${JSON.stringify(failedResponses)}`);
    report.engines[engineName]={pagesChecked:checked,viewports:sizes.length,webglReady,errors};
  } catch(error) {errors.push(error.stack||error.message);report.engines[engineName]={errors};}
  finally {await browser?.close();await new Promise(resolve=>app.server.close(resolve));rmSync(dataDir,{recursive:true,force:true});}
  report.errors.push(...errors.map(e=>engineName+': '+e));
  console.log(engineName,JSON.stringify(report.engines[engineName]));
}
writeFileSync(new URL('report.json',output),JSON.stringify(report,null,2));
assert.equal(report.errors.length,0,report.errors.join('\n'));
console.log(`Browser QA passed: ${routes.length*sizes.length*engines.length} route/viewport checks, ${engines.length} engine(s), real inquiries, navigation, motion, measurement, 3D and owner editing.`);




