import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {createApp} from '../server.mjs';
import {validateCatalog,publicCatalog} from '../catalog.mjs';
import {prepareOwnerPublication} from '../scripts/publish-owner-release.mjs';
import {prepareVerifiedMetadata} from '../scripts/publish-verified-metadata.mjs';
import {prepareCollectionRoundOne} from '../scripts/publish-collection-round-one.mjs';
import {prepareCollectionRoundTwo} from '../scripts/publish-collection-round-two.mjs';
import {prepareUploadedWorks,publishUploadedWorks,newWorks,releaseId} from '../scripts/publish-uploaded-model-works.mjs';
const root=new URL('../',import.meta.url),read=path=>readFileSync(new URL(path,root));
const fixture=()=>[prepareOwnerPublication,prepareVerifiedMetadata,prepareCollectionRoundOne,prepareCollectionRoundTwo].reduce((catalog,prepare)=>prepare(catalog),JSON.parse(read('content/catalog.json')));

test('two supplied sculptures append to Kinship with original photos and unconfirmed facts, preserving existing records',()=>{
  const original=fixture(),next=prepareUploadedWorks(original);
  assert.deepEqual(next.works.slice(0,original.works.length),original.works);
  assert.deepEqual(next.artists,original.artists);
  for(const collection of original.collections){const updated=next.collections.find(item=>item.id===collection.id);assert.equal(updated.starWorkId,collection.starWorkId);assert.deepEqual(updated.workIds.slice(0,collection.workIds.length),collection.workIds);}
  const validated=validateCatalog(next,{publicDir:new URL('public/',root).pathname,mediaDir:'/tmp/hos-uploaded-work-test',publish:true,previous:original});
  for(const item of newWorks){
    const work=validated.works.find(work=>work.id===item.id);
    assert.equal(work.artistId,'artist-unconfirmed');assert.equal(work.availability,'unknown');
    assert.equal(work.verification.artist,false);assert.equal(work.verification.material,false);assert.equal(work.verification.dimensions,false);
    assert.equal(work.dimensions,'On inquiry');assert.equal(work.material,'Details on inquiry');
    assert(validated.collections.find(collection=>collection.id==='kinship').workIds.includes(work.id));
    assert(!JSON.stringify(publicCatalog(validated)).includes('internalNotes'));
  }
  assert.deepEqual(prepareUploadedWorks(next),next);
  next.works.find(work=>work.id===newWorks[0].id).title='Later owner title';assert.equal(prepareUploadedWorks(next).works.at(-2).title,'Later owner title');
  const conflicting=fixture();conflicting.works.push({...conflicting.works[0],id:'conflict',slug:'tall-attention'});assert.throws(()=>prepareUploadedWorks(conflicting),/conflicts/);
  for(const record of JSON.parse(read('content/uploaded-photo-audit.json')))assert.equal(createHash('sha256').update(read('public'+record.file)).digest('hex'),record.sha256);
});

test('authenticated additions preserve drafts, enquiries and history, then publish once with revision checks',async t=>{
  const dataDir=mkdtempSync(join(tmpdir(),'hos-uploaded-works-')),password=randomUUID(),publicOrigin='https://houseofmabwe.com';
  const app=createApp({dataDir,env:{ADMIN_PASSWORD:password,SITE_URL:publicOrigin},backgroundNotifications:false});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{await new Promise(resolve=>app.server.close(resolve));rmSync(dataDir,{recursive:true,force:true});});
  const origin='http://127.0.0.1:'+app.server.address().port;
  const api=async(path,data)=>{const response=await fetch(origin+'/api/admin/'+path,{headers:{Authorization:'Basic '+Buffer.from('admin:'+password).toString('base64'),'Content-Type':'application/json',Origin:publicOrigin},...(data?{method:'POST',body:JSON.stringify(data)}:{})});assert(response.ok);return response.json();};
  let state=await api('content');state=await api('content',{revision:state.revision,catalog:fixture()});
  const params={db:app.db,origin,password,publicOrigin};
  assert.deepEqual(await publishUploadedWorks(params),{skipped:'unpublished-draft-present'});
  assert(!app.db.prepare('SELECT value FROM settings WHERE key=?').get(releaseId));
  await api('publish',{revision:state.revision});
  const inquiry=await fetch(origin+'/api/inquiries',{method:'POST',headers:{'Content-Type':'application/json',Origin:publicOrigin},body:JSON.stringify({submissionId:randomUUID(),name:'Local model QA',email:'models@example.test',interest:'Collecting a work',message:'Local test only',workId:'zsa-020',page:'work',sessionId:randomUUID()})});assert.equal(inquiry.status,201);
  const history=app.db.prepare('SELECT count(*) n FROM collection_history').get().n;
  await assert.rejects(publishUploadedWorks({...params,password:'incorrect'}),/HTTP 401/);
  assert((await publishUploadedWorks(params)).published);
  assert.equal(app.db.prepare('SELECT count(*) n FROM collection_history').get().n,history+1);
  assert.equal(app.db.prepare('SELECT count(*) n FROM inquiries').get().n,1);
  const live=await(await fetch(origin+'/content.json')).json();assert.equal(live.works.length,28);
  assert(newWorks.every(item=>live.works.some(work=>work.id===item.id)));
  assert.deepEqual(await publishUploadedWorks(params),{skipped:'already-published'});
  assert.deepEqual(await publishUploadedWorks({...params,publicOrigin:'https://other.example'}),{skipped:'different-service'});
});
