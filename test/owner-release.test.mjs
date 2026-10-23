import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';import {tmpdir} from 'node:os';import {randomUUID} from 'node:crypto';
import {createApp} from '../server.mjs';
import {validateCatalog,publicCatalog} from '../catalog.mjs';
import {prepareOwnerPublication,publishOwnerRelease,releaseId,releaseOrigin} from '../scripts/publish-owner-release.mjs';
const root=new URL('../',import.meta.url),seed=()=>JSON.parse(readFileSync(new URL('content/catalog.json',root),'utf8'));
const options={publicDir:new URL('public/',root).pathname,mediaDir:'/tmp/hos-unused-media',publish:true};

test('the owner release publishes all working content and five source-matched models without falsely confirming factual fields',()=>{
 const content=validateCatalog(prepareOwnerPublication(seed()),options),live=publicCatalog(content);
 assert.equal(live.collections.length,5);assert.equal(live.works.length,23);assert.equal(live.works.filter(w=>w.modelVerified).length,5);
 assert.deepEqual(live.collections.map(c=>c.starWorkId),['zsa-013','zsa-028','zsa-001','zsa-020','zsa-005']);
 assert(live.works.every(w=>w.title && w.artistId && w.material && w.dimensions));
 assert.equal(live.works.find(w=>w.id==='zsa-013').availability,'sold');assert(live.works.filter(w=>w.id!=='zsa-013').every(w=>w.availability==='unknown'));
 assert(content.works.filter(w=>w.sourcePage).every(w=>Object.values(w.verification).every(v=>v===false)));
 assert(!JSON.stringify(live).includes('internalNotes'));assert(!JSON.stringify(live).includes('workingContent'));
 const work=content.works.find(w=>w.id==='zsa-028');work.details.provenance='Unsupported provenance';work.details.signature='Unsupported signature';work.acquisitionMethod='Unsupported sourcing';
 const projected=publicCatalog(content).works.find(w=>w.id===work.id);assert.equal(projected.details.provenance,undefined);assert.equal(projected.details.signature,undefined);assert.equal(projected.acquisitionMethod,'');
 work.workingContent=false;work.workingModel=false;const hidden=publicCatalog(content).works.find(w=>w.id===work.id);assert.equal(hidden.artistId,'');assert.equal(hidden.material,'');assert.equal(hidden.modelVerified,false);
});

test('changed source photographs never inherit a working 3D model',()=>{
 const current=prepareOwnerPublication(seed());current.assets['new-front']=current.assets.hero;current.works.find(w=>w.id==='zsa-028').image='new-front';
 assert.equal(prepareOwnerPublication(current).works.find(w=>w.id==='zsa-028').workingModel,false);
});

test('authenticated owner publication preserves history and inquiries and runs only once across future content edits',async t=>{
 const dataDir=mkdtempSync(join(tmpdir(),'hos-owner-release-')),password=randomUUID();
 const app=createApp({dataDir,env:{ADMIN_PASSWORD:password,SITE_URL:releaseOrigin},backgroundNotifications:false});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 t.after(async()=>{await new Promise(r=>app.server.close(r));rmSync(dataDir,{recursive:true,force:true});});
 const origin='http://127.0.0.1:'+app.server.address().port;
 const request=async(path,data,owner=false)=>fetch(origin+path,{headers:{'Content-Type':'application/json',Origin:releaseOrigin,...(owner?{Authorization:'Basic '+Buffer.from('admin:'+password).toString('base64')}:{})},...(data?{method:'POST',body:JSON.stringify(data)}:{})});
 assert.equal((await request('/api/inquiries',{submissionId:randomUUID(),name:'Release QA',email:'release@example.test',interest:'Collecting a work',message:'Local fixture only',workId:'folded-light',page:'work',sessionId:randomUUID()})).status,201);
 const initial=app.db.prepare('SELECT catalog FROM collection_history WHERE revision=0').get().catalog;
 const params={db:app.db,origin,password,publicOrigin:releaseOrigin};
 await assert.rejects(publishOwnerRelease({...params,password:'incorrect-password'}),/HTTP 401/);assert.equal(app.catalog.works.length,5);
 const result=await publishOwnerRelease(params);assert(result.published);assert.equal(app.catalog.works.length,23);assert.equal(app.catalog.collections.length,5);
 assert.equal(app.db.prepare('SELECT catalog FROM collection_history WHERE revision=0').get().catalog,initial);assert.equal(app.db.prepare('SELECT count(*) n FROM inquiries').get().n,1);assert(app.db.prepare('SELECT value FROM settings WHERE key=?').get(releaseId));
 const state=await(await request('/api/admin/content',null,true)).json();state.draft.works.find(w=>w.id==='zsa-028').title='Later owner edit';
 assert.equal((await request('/api/admin/content',{revision:state.revision,catalog:state.draft},true)).status,200);
 assert.deepEqual(await publishOwnerRelease(params),{skipped:'already-published'});assert.equal(app.catalog.works.find(w=>w.id==='zsa-028').title,'Red Current');
 const inquiry=await request('/api/inquiries',{submissionId:randomUUID(),name:'Release QA',email:'release@example.test',interest:'Collecting a work',message:'Local fixture only',workId:'zsa-028',page:'work',sessionId:randomUUID()});assert.equal(inquiry.status,201);assert.equal(app.db.prepare('SELECT count(*) n FROM inquiries').get().n,2);
 assert.deepEqual(await publishOwnerRelease({...params,publicOrigin:'https://other.example'}),{skipped:'different-service'});
});
