import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium,firefox,webkit} from 'playwright';
import {createApp} from '../server.mjs';
const output = new URL('../test-results/browser/',import.meta.url);
mkdirSync(output,{recursive:true});
const catalog=JSON.parse(readFileSync(new URL('../content/catalog.json',import.meta.url),'utf8'));
const routes=['/','/collection','/artists','/making','/designers','/collectors','/house','/privacy',...catalog.artists.map(a=>'/artists/'+a.slug),...catalog.works.map(w=>'/works/'+w.slug)];
const sizes=[[320,568],[390,844],[844,390],[768,1024],[1024,768],[1440,900],[1920,1080],[2048,1152],[2560,1440],[3440,1440],[3840,2160]];
const report={engines:{},errors:[]};
const password='only-for-isolated-browser-tests-12345';
for(const [engineName,engine] of Object.entries({chromium,firefox,webkit})) {
  const dataDir=mkdtempSync(join(tmpdir(),'hos-browser-'));
  const app=createApp({dataDir,env:{ADMIN_PASSWORD:password},backgroundNotifications:false});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+app.server.address().port;
  let browser;
  const errors=[],pageErrors=[],failedResponses=[];
  const auth={Authorization:'Basic '+Buffer.from('admin:'+password).toString('base64')};
  const adminGet=async path=>(await fetch(base+path,{headers:auth})).json();
  async function ready(page,path='/',search='') {await page.goto(base+path+search);await page.locator('#hos-concept[data-ready="true"]').waitFor();await page.emulateMedia({reducedMotion:'reduce'});}
  try {
    browser=await engine.launch();
    const context=await browser.newContext({deviceScaleFactor:2,reducedMotion:'reduce'});
    await context.addInitScript(()=>localStorage.setItem('hos-measurement','off'));
    const page=await context.newPage();
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
            return {viewport:innerWidth,clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,root:rect('#hos-concept'),header:rect('.hos-header'),footer:rect('.hos-footer'),main:rect('#hos-main'),hero:rect('.hos-hero-image'),images:visible('#hos-concept img').map(img=>({src:img.currentSrc,naturalWidth:img.naturalWidth,fit:getComputedStyle(img).objectFit,hero:img.classList.contains('hos-hero-image')})),text:visible('#hos-main p').filter(el=>!el.classList.contains('hos-artist-style')&&!el.classList.contains('hos-card-specs')).map(el=>({size:parseFloat(getComputedStyle(el).fontSize),text:el.textContent.slice(0,60)}))};
          });
          assert(layout.scrollWidth<=layout.clientWidth+1,`Horizontal overflow ${JSON.stringify(layout)}`);
          assert(Math.abs(layout.root.left)<1&&Math.abs(layout.root.right-layout.clientWidth)<2,`Root does not fill the page width ${JSON.stringify(layout)}`);
          assert(Math.abs(layout.header.top)<1,'Header not anchored');
          assert(Math.abs(layout.footer.bottom-height)<2,'Footer not anchored');
          assert(layout.main.top>=layout.header.bottom-1,'Header covers content');
          assert(layout.images.every(i=>i.naturalWidth>0&&i.fit===(i.hero?'cover':'contain')),'Broken image or wrong framing');
          assert(layout.text.every(t=>t.size>=15),`Reading text is too small: ${JSON.stringify(layout.text.filter(t=>t.size<15))}`);
          if(path==='/') {
            assert(Math.abs(layout.hero.left)<1&&Math.abs(layout.hero.right-layout.clientWidth)<2,'Hero has side gaps');
            assert(Math.abs(layout.hero.top-layout.header.bottom)<2&&Math.abs(layout.hero.bottom-layout.footer.top)<2,'Hero does not fill the visible screen');
            assert.equal(await page.locator('#hos-home-chapters .hos-artist-chapter').count(),catalog.artists.length);
            assert.equal(await page.locator('#hos-home-chapters .hos-artist-campaign').count(),catalog.artists.length);
            assert.equal(await page.locator('#hos-home-chapters .hos-setting-tile').count(),catalog.artists.length*3);
            assert.equal(await page.locator('.hos-hero-copy h1 span').last().evaluate(el=>getComputedStyle(el).color),'rgb(255, 255, 255)');
            assert.equal(await page.locator('#hos-home-collection-title').evaluate(el=>getComputedStyle(el).color),'rgb(255, 255, 255)');
            assert(await page.locator('#hos-page-navigation').isHidden(),'Home should not show Back');
          }
          if(path.startsWith('/artists/')) {
            const profile=await page.evaluate(()=>({image:document.querySelector('.hos-artist-portrait').getBoundingClientRect(),copy:document.querySelector('.hos-artist-copy').getBoundingClientRect()}));
            if(width>700)assert(Math.abs(profile.image.top-profile.copy.top)<2,'Portrait and biography are not aligned');
          }
          await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));
          const bottom=await page.evaluate(()=>({headerTop:document.querySelector('.hos-header').getBoundingClientRect().top,footerBottom:document.querySelector('.hos-footer').getBoundingClientRect().bottom,mainBottom:document.querySelector('#hos-main').getBoundingClientRect().bottom,footerTop:document.querySelector('.hos-footer').getBoundingClientRect().top}));
          assert(Math.abs(bottom.headerTop)<1&&Math.abs(bottom.footerBottom-height)<2,'Chrome does not stay fixed while scrolling');
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
    for(const view of ['collection','artists','making','designers','collectors','house']) {
      await page.locator('.hos-menu-toggle').click();
      await page.locator(`#hos-menu [data-view="${view}"]`).click();
      assert(new URL(page.url()).pathname==='/'+view,'Menu navigation failed');
      assert(await page.locator(`[data-page="${view}"]`).isVisible());
      assert(await page.locator('#hos-menu').isHidden());
    }
    await page.locator('.hos-header [data-view="home"]').click();
    await page.locator('.hos-hero-copy [data-view="collection"]').click();
    await page.locator('[data-page="collection"] .hos-setting-photo').first().click();
    assert(new URL(page.url()).pathname==='/works/folded-light');
    await page.goBack();assert(new URL(page.url()).pathname==='/collection');
    await page.goForward();assert(await page.locator('#hos-work-title').textContent()==='Folded Light');
    // Every setting for an artist opens the same work. Back restores the chapter.
    await page.setViewportSize({width:1440,height:900});
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
      await page.locator('#hos-home-chapters .hos-artist-chapter').nth(artistIndex).getByRole('button',{name:'About the artist'}).click();
      assert.equal(new URL(page.url()).pathname,'/artists/'+artist.slug);
      await page.locator('#hos-page-navigation [data-back]').click();await page.waitForURL(base+'/');
    }
    await ready(page,'/works/folded-light');await page.locator('#hos-page-navigation [data-back]').click();await page.waitForURL(base+'/collection');
    await ready(page,'/artists/tariro-mavhunga');await page.locator('#hos-page-navigation [data-back]').click();await page.waitForURL(base+'/artists');
    // A separate tracked browser session exercises real form submissions and attribution.
    const tracked=await browser.newContext({viewport:{width:390,height:844}});
    const visitor=await tracked.newPage();
    await ready(visitor,'/','?utm_source=qa&utm_medium=browser&utm_campaign=launch');
    await visitor.locator('.hos-hero-copy [data-view="collection"]').click();
    await visitor.locator('[data-page="collection"] .hos-setting-photo').first().click();
    await visitor.reload();await visitor.locator('#hos-concept[data-ready="true"]').waitFor();
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
    await visitor.waitForFunction(()=>scrollY===0&&document.querySelector('.hos-header').getBoundingClientRect().top===0&&document.querySelector('.hos-footer').getBoundingClientRect().bottom===innerHeight);
    await visitor.screenshot({path:new URL(`${engineName}-inquiry-success.jpg`,output).pathname,type:'jpeg',quality:85,scale:'css',fullPage:true});
    assert(app.db.prepare('SELECT count(*) AS n FROM inquiries').get().n===1,'Retry duplicated enquiry');
    const entry=(await adminGet('/api/admin/inquiries'))[0];
    assert.equal(entry.work_id,'folded-light');assert.equal(entry.source,'qa');
    const sessionHashes=app.db.prepare('SELECT DISTINCT session_hash FROM events').all();assert.equal(sessionHashes.length,1);
    for(const name of ['page_view','explore_click','work_view','inquiry_opened','inquiry_started','inquiry_submitted']) assert(app.db.prepare('SELECT count(*) AS n FROM events WHERE name=?').get(name).n>0,`Missing event ${name}`);
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
    // Actual owner interface: biography, draft isolation, publish, restore and preview.
    const owner=await browser.newContext({httpCredentials:{username:'admin',password},viewport:{width:1440,height:900}});
    const editor=await owner.newPage();await editor.goto(base+'/admin/content');await editor.locator('#field-title').waitFor();
    await editor.locator('#field-yearMade').fill('2026');await editor.locator('#save').click();await editor.locator('#status').filter({hasText:'Draft saved.'}).waitFor();
    await editor.locator('#artist-list .record button').first().click();
    await editor.locator('#field-biography').fill('A biography entered through the real editor.');
    await editor.locator('#save').click();await editor.locator('#status').filter({hasText:'Draft saved.'}).waitFor();
    await editor.locator('input[type="file"]').setInputFiles(new URL('../public/assets/fold.jpg',import.meta.url).pathname);
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
      await editor.locator('.photo-editor summary').click();await editor.locator('.photo-grid button[title="fold"]').click();
    }
    await editor.locator('#publish').click();await editor.locator('#status').filter({hasText:'Collection published.'}).waitFor();
    for(const [width,columns] of [[1440,3],[768,2],[390,1]]) {
      await page.setViewportSize({width,height:900});await ready(page,'/collection');
      const grid=page.locator('#hos-collection-chapters .hos-work-grid').first();
      assert.equal(await grid.locator('.hos-work-card').count(),3);
      assert.equal(await grid.evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),columns);
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),'Multiple sculpture tiles overflow the screen');
    }
    await page.locator('#hos-collection-chapters .hos-work-card .hos-text-link').nth(2).click();
    assert.equal(await page.locator('#hos-work-title').textContent(),'Browser QA sculpture 4');
    await editor.goto(base+'/admin');await editor.locator('#inbox .enquiry').first().waitFor();
    assert((await editor.locator('#inbox').textContent()).includes('Browser QA collector'));
    await owner.close();await context.close();
    // Motion remains interruptible; reduced-motion visitors keep content visible.
    const motion=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'no-preference'});
    await motion.addInitScript(()=>localStorage.setItem('hos-measurement','off'));
    const motionPage=await motion.newPage();motionPage.on('pageerror',error=>pageErrors.push(error.message));
    await motionPage.goto(base+'/');await motionPage.locator('#hos-concept[data-ready="true"]').waitFor();
    await motionPage.locator('.hos-hero-copy [data-view="collection"]').click();
    assert(new URL(motionPage.url()).pathname==='/collection');
    assert(await motionPage.evaluate(()=>document.querySelector('[data-page="collection"]').getAnimations().length>0),'Navigation has no entrance animation');
    await motionPage.locator('.hos-header [data-view="home"]').click();assert(new URL(motionPage.url()).pathname==='/');
    await motionPage.locator('.hos-menu-toggle').click();await motionPage.keyboard.press('Escape');assert(await motionPage.locator('#hos-menu').isHidden());
    await motionPage.emulateMedia({reducedMotion:'reduce'});
    await motionPage.locator('.hos-hero-copy [data-view="collection"]').click();
    assert.equal(await motionPage.evaluate(()=>document.querySelector('[data-page="collection"]').getAnimations().length),0,'Reduced-motion still animates');
    assert.equal(await motionPage.locator('[data-page="collection"]').evaluate(el=>getComputedStyle(el).opacity),'1');
    await motion.close();
    assert.equal(pageErrors.length,0,`Browser JS errors: ${pageErrors.join('; ')}`);
    assert.equal(failedResponses.length,0,`HTTP failures: ${JSON.stringify(failedResponses)}`);
    report.engines[engineName]={pagesChecked:checked,viewports:sizes.length,errors};
  } catch(error) {errors.push(error.stack||error.message);report.engines[engineName]={errors};}
  finally {await browser?.close();await new Promise(resolve=>app.server.close(resolve));rmSync(dataDir,{recursive:true,force:true});}
  report.errors.push(...errors.map(e=>engineName+': '+e));
  console.log(engineName,JSON.stringify(report.engines[engineName]));
}
writeFileSync(new URL('report.json',output),JSON.stringify(report,null,2));
assert.equal(report.errors.length,0,report.errors.join('\n'));
console.log(`Browser QA passed: ${routes.length*sizes.length*3} route/viewport checks, three engines, real enquiries, navigation, motion, measurement and owner editing.`);
