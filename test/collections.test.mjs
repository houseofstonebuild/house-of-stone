import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createApp} from '../server.mjs';
import {validateCatalog,publicCatalog} from '../catalog.mjs';
import {prepareFoundingCollection} from '../founding-collection.mjs';
const root=new URL('../',import.meta.url),read=path=>JSON.parse(readFileSync(new URL(path,root),'utf8'));
const blueprint=read('content/founding-collection.json'),legacy=read('content/catalog.json');
const expected=[[13,9,25,29,21],[28,17,31,12],[1,26,2,23,27],[20,14,7,10,24],[5,6,18,16]];
const options={publicDir:new URL('public/',root).pathname,mediaDir:'/tmp/unused-hos-media',publish:true};
function renovated(){return validateCatalog(prepareFoundingCollection(legacy,blueprint),options);}
async function fixture(t){const dataDir=mkdtempSync(join(tmpdir(),'hos-categories-')),password=randomUUID(),app=createApp({dataDir,env:{ADMIN_PASSWORD:password},backgroundNotifications:false});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+app.server.address().port,auth={Authorization:'Basic '+Buffer.from('admin:'+password).toString('base64')};t.after(async()=>{await new Promise(resolve=>app.server.close(resolve));rmSync(dataDir,{recursive:true,force:true});});const get=async path=>(await fetch(base+path,{headers:auth})).json();const post=async(path,data,privateRequest=true)=>fetch(base+(privateRequest?'/api/admin/':'/api/')+path,{method:'POST',headers:{...(privateRequest?auth:{}),'Content-Type':'application/json',Origin:base},body:JSON.stringify(data)});return {app,base,auth,get,post};}
test('source roster contains exactly 23 unique works in the locked five collections, with the correct stars and exclusions',()=>{
 const catalog=renovated(),works=catalog.works.filter(w=>!w.archived);
 assert.equal(works.length,23);assert.deepEqual(catalog.collections.map(c=>c.name),['Rhythm','Elemental','Presence','Kinship','Wild Grace']);
 for(const [i,collection] of catalog.collections.entries()){const pages=collection.workIds.map(id=>works.find(w=>w.id===id).sourcePage);assert.deepEqual(pages,expected[i]);assert.equal(collection.starWorkId,collection.workIds[0]);}
 assert.equal(new Set(catalog.collections.flatMap(c=>c.workIds)).size,23);
 for(const page of [3,4,8,11,15,19,22,30])assert(!works.some(w=>w.sourcePage===page));
 assert.equal(works.find(w=>w.sourcePage===13).availability,'sold');assert(works.filter(w=>w.sourcePage!==13).every(w=>w.availability==='unknown'));
 for(const work of works){assert(readFileSync(new URL('public'+catalog.assets[work.image],root)).length>60000);assert.equal(work.modelStatus,expected.some(pages=>pages[0]===work.sourcePage)?'needed':'not-planned');}
});
test('unverified working content and assignments stay private, and verified dimensions support public filters',()=>{
 const catalog=renovated(),draft=publicCatalog(catalog,{preview:true}),publicView=publicCatalog(catalog);
 assert.equal(draft.works[0].title,'Flame in Motion');assert(draft.works.every(w=>w.artistId&&w.dimensions&&w.material));
 assert(publicView.works.every(w=>!w.artistId&&!w.dimensions&&!w.material&&!w.yearMade&&!w.size));
 assert(!JSON.stringify(publicView).includes('internalNotes'));assert.equal(publicView.works[0].title,'Rhythm 01');
 const work=catalog.works.find(w=>w.sourcePage===28);for(const key of ['title','artist','dimensions','material','size'])work.verification[key]=true;
 const confirmed=publicCatalog(catalog).works.find(w=>w.id===work.id);assert.equal(confirmed.title,work.title);assert.equal(confirmed.artistId,work.artistId);assert.equal(confirmed.material,work.material);assert.equal(confirmed.size,'Medium');
});
test('invalid membership, wrong star and unsupported availability cannot be saved',()=>{
 for(const mutate of [c=>c.collections[1].workIds.push('zsa-013'),c=>c.collections[0].starWorkId='zsa-028',c=>c.collections[0].workIds.pop(),c=>c.works.find(w=>w.sourcePage===13).availability='available',c=>c.works.find(w=>w.sourcePage===28).availability='available']){const catalog=renovated();mutate(catalog);assert.throws(()=>validateCatalog(catalog,options));}
});
test('safe draft import preserves history, inquiries and owner records, and is repeatable without overwriting edits',async t=>{
 const f=await fixture(t),state=await f.get('/api/admin/content');
 const originalCount=f.app.db.prepare('SELECT count(*) AS n FROM collection_history').get().n;
 let response=await f.post('prepare-founding-collection',{revision:state.revision});assert.equal(response.status,200);let staged=await response.json();
 assert.equal((await f.get('/content.json')).works.length,5);assert.equal(staged.draft.works.length,28);assert.equal(f.app.db.prepare('SELECT count(*) AS n FROM collection_history').get().n,originalCount);
 const preview=await f.get('/api/admin/preview-content');assert.equal(preview.works.length,23);assert.equal(preview.collections.length,5);
 assert.equal((await f.post('prepare-founding-collection',{revision:state.revision})).status,409);
 staged.draft.works.find(w=>w.id==='zsa-028').title='Owner edit';response=await f.post('content',{revision:staged.revision,catalog:staged.draft});staged=await response.json();
 staged=await(await f.post('prepare-founding-collection',{revision:staged.revision})).json();assert.equal(staged.draft.works.find(w=>w.id==='zsa-028').title,'Owner edit');assert.equal(staged.draft.works.length,28);
 response=await f.post('publish',{revision:staged.revision});assert.equal(response.status,200);
 const content=await f.get('/content.json');assert.equal(content.works.length,23);assert.equal(content.collections.length,5);
 for(const collection of content.collections){const page=await fetch(f.base+'/collections/'+collection.slug);assert.equal(page.status,200);assert.match(await page.text(),new RegExp(collection.name));}
 const sitemap=await(await fetch(f.base+'/sitemap.xml')).text();assert.match(sitemap,/collections\/wild-grace/);assert.match(sitemap,/works\/zsa-page-13/);
 const payload={submissionId:randomUUID(),name:'Local test',email:'qa@example.test',interest:'Collecting a work',message:'Local QA only',workId:'zsa-028',page:'category',sessionId:randomUUID()};
 response=await f.post('inquiries',payload,false);assert.equal(response.status,201);
 assert.equal(f.app.db.prepare('SELECT work_id FROM inquiries').get().work_id,'zsa-028');
 const sold={...payload,submissionId:randomUUID(),workId:'zsa-013'};assert.equal((await f.post('inquiries',sold,false)).status,400);
 response=await f.post('inquiries',{...sold,intent:'alternatives'},false);assert.equal(response.status,201);assert.match(f.app.db.prepare('SELECT topic FROM inquiries WHERE work_id=?').get('zsa-013').topic,/^Alternatives to /);
 response=await f.post('events',{id:randomUUID(),sessionId:randomUUID(),name:'page_view',page:'category',workId:'zsa-028'},false);assert.equal(response.status,202);
});
