import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from '../server.mjs';
const password = 'private-test-password-long-enough';
async function fixture(t) {
  const dataDir=mkdtempSync(join(tmpdir(),'hos-content-'));
  let app;
  const start=async()=>{app=createApp({dataDir,env:{ADMIN_PASSWORD:password},backgroundNotifications:false});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));};
  await start();
  const f={dataDir,get app(){return app;},get base(){return 'http://127.0.0.1:'+app.server.address().port;},auth:{Authorization:'Basic '+Buffer.from('admin:'+password).toString('base64')}};
  f.get=async(path,privateRequest=true)=>fetch(f.base+path,{headers:privateRequest?f.auth:{}});
  f.post=async(path,input,headers={})=>fetch(f.base+'/api/admin/'+path,{method:'POST',headers:{...f.auth,'Content-Type':'application/json',Origin:f.base,...headers},body:JSON.stringify(input)});
  f.state=async()=> (await f.get('/api/admin/content')).json();
  f.save=async(catalog,revision)=> {const response=await f.post('content',{catalog,revision});assert.equal(response.status,200,JSON.stringify(await response.clone().json()));return response.json();};
  f.restart=async()=>{await new Promise(resolve=>app.server.close(resolve));await start();};
  t.after(async()=>{await new Promise(resolve=>app.server.close(resolve));rmSync(dataDir,{recursive:true,force:true});});
  return f;
}
test('draft edits stay private until publishing, then update routes and content without restart',async t=>{
  const f=await fixture(t),state=await f.state();state.draft.works[0].title='Light in Stone';state.draft.works[0].slug='light-in-stone';
  const saved=await f.save(state.draft,state.revision);assert.equal(saved.unpublished,true);
  assert.equal((await (await f.get('/content.json',false)).json()).works[0].title,'Folded Light');
  assert.equal((await (await f.get('/api/admin/preview-content')).json()).works[0].title,'Light in Stone');
  const preview=await f.get('/admin/preview/works/light-in-stone');assert.equal(preview.status,200);assert.match(await preview.text(),/Light in Stone/);assert.equal(preview.headers.get('x-robots-tag'),'noindex,nofollow');
  const response=await f.post('publish',{revision:saved.revision});assert.equal(response.status,200);
  assert.equal((await (await f.get('/content.json',false)).json()).works[0].title,'Light in Stone');
  const page=await f.get('/works/light-in-stone',false);assert.equal(page.status,200);assert.match(await page.text(),/Light in Stone/);
  assert.equal((await f.get('/works/folded-light',false)).status,404);
  assert.match(await (await f.get('/sitemap.xml',false)).text(),/light-in-stone/);
  assert.equal((await f.state()).unpublished,false);
});
test('editor, draft previews and mutations require authentication; cross-site writes are blocked',async t=>{
  const f=await fixture(t),state=await f.state();
  for(const path of ['/admin/content','/admin-content.js','/api/admin/content','/api/admin/preview-content','/admin/preview']) assert.equal((await f.get(path,false)).status,401,path);
  const mutation=await f.post('content',{revision:0,catalog:state.draft},{Authorization:''});assert.equal(mutation.status,401);
  assert.equal((await f.post('content',{revision:0,catalog:state.draft},{Origin:'https://other.example'})).status,403);
  for(const path of ['/catalog.mjs','/data/media','/.github/workflows/checks.yml'])assert.equal((await f.get(path,false)).status,404);
  assert.equal((await f.get('/admin/content')).status,200);
});
test('concurrent edits are rejected and new sculptures must be complete before publication',async t=>{
  const f=await fixture(t),a=await f.state(),b=await f.state();a.draft.works[0].description='An updated description.';
  const saved=await f.save(a.draft,a.revision);
  assert.equal((await f.post('content',{revision:b.revision,catalog:b.draft})).status,409);
  assert.equal((await f.post('publish',{revision:b.revision})).status,409);
  const work={...saved.draft.works[0],id:'new-work',slug:'new-work',title:'New Work',image:''};saved.draft.works.push(work);
  const incomplete=await f.save(saved.draft,saved.revision);assert.equal((await f.post('publish',{revision:incomplete.revision})).status,400);
  assert.equal((await (await f.get('/content.json',false)).json()).works.length,5);
  incomplete.draft.works.at(-1).image='balance';
  const complete=await f.save(incomplete.draft,incomplete.revision);assert.equal((await f.post('publish',{revision:complete.revision})).status,200);
  assert.equal((await (await f.get('/content.json',false)).json()).works.length,6);
});
test('uploads persist, unpublished media is private, and invalid image types are rejected',async t=>{
  const f=await fixture(t),bytes=readFileSync(new URL('../public/assets/fold.jpg',import.meta.url));
  assert.equal((await f.post('media',{type:'image/png',data:bytes.toString('base64')})).status,400);
  assert.equal((await f.post('media',{type:'image/svg+xml',data:Buffer.from('<svg onload="bad()"/>').toString('base64')})).status,400);
  const response=await f.post('media',{type:'image/jpeg',data:bytes.toString('base64')});assert.equal(response.status,201);const photo=await response.json();
  assert(existsSync(join(f.dataDir,photo.url.slice(1))));
  assert.equal((await f.get(photo.url,false)).status,404);assert.equal((await f.get(photo.url)).status,200);
  const state=await f.state();state.draft.assets[photo.key]=photo.url;state.draft.works[0].image=photo.key;
  const saved=await f.save(state.draft,state.revision);await f.post('publish',{revision:saved.revision});
  const publicPhoto=await f.get(photo.url,false);assert.equal(publicPhoto.status,200);assert.equal(publicPhoto.headers.get('content-type'),'image/jpeg');assert.deepEqual(Buffer.from(await publicPhoto.arrayBuffer()),bytes);
  await f.restart();assert.equal((await f.get(photo.url,false)).status,200);assert.equal((await f.state()).draft.works[0].image,photo.key);
});
test('archiving preserves records and history, and restoring creates a draft without replacing the live site',async t=>{
  const f=await fixture(t),state=await f.state();state.draft.artists[4].archived=true;
  let saved=await f.save(state.draft,state.revision);assert.equal((await f.post('publish',{revision:saved.revision})).status,200);
  const live=await (await f.get('/content.json',false)).json();assert.equal(live.artists.length,4);assert.equal(live.works.length,4);assert.equal((await f.get('/works/equilibrium',false)).status,404);
  saved=await f.state();assert.equal(saved.draft.artists.length,5);
  const removed=structuredClone(saved.draft);removed.works.pop();assert.equal((await f.post('content',{revision:saved.revision,catalog:removed})).status,400);
  const restore=await f.post('restore',{revision:saved.revision,version:0});assert.equal(restore.status,200);const restored=await restore.json();assert.equal(restored.draft.artists[4].archived,false);
  assert.equal((await (await f.get('/content.json',false)).json()).artists.length,4);
  await f.post('publish',{revision:restored.revision});assert.equal((await (await f.get('/content.json',false)).json()).artists.length,5);
});
test('invalid addresses, external images, orphaned works and empty featured selections cannot be published',async t=>{
  const f=await fixture(t),state=await f.state();
  for(const mutate of [c=>c.works[0].artistId='missing',c=>c.works[0].slug='../../private',c=>c.works[1].slug=c.works[0].slug,c=>c.assets.fold='https://external.example/photo.jpg',c=>c.artists[0]=null,c=>c.works[0].objectPosition='javascript:bad']) {
    const changed=structuredClone(state.draft);mutate(changed);assert.equal((await f.post('content',{revision:state.revision,catalog:changed})).status,400);
  }
  state.draft.works[0].archived=true;const saved=await f.save(state.draft,state.revision);assert.equal((await f.post('publish',{revision:saved.revision})).status,400);
});
test('database backup includes content versions and uploaded media',async t=>{
  const f=await fixture(t),bytes=readFileSync(new URL('../public/assets/fold.jpg',import.meta.url));
  const uploaded=await (await f.post('media',{type:'image/jpeg',data:bytes.toString('base64')})).json();
  execFileSync(process.execPath,['scripts/backup.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,DATA_DIR:f.dataDir},stdio:'pipe'});
  const file=readdirSync(join(f.dataDir,'backups')).find(file=>file.endsWith('.sqlite'));
  assert(existsSync(join(f.dataDir,'backups',file+'-media',uploaded.url.slice(7))));
  const copy=new DatabaseSync(join(f.dataDir,'backups',file));assert.equal(copy.prepare('SELECT count(*) AS n FROM collection_history').get().n,1);copy.close();
});
