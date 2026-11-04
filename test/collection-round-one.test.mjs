import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createApp} from '../server.mjs';
import {prepareFoundingCollection} from '../founding-collection.mjs';
import {prepareVerifiedMetadata} from '../scripts/publish-verified-metadata.mjs';
import {prepareCollectionRoundOne,publishCollectionRoundOne,releaseId,releaseOrigin,corrections} from '../scripts/publish-collection-round-one.mjs';
import {applyWorkPhotography} from '../public/work-photography.js';
const read=path=>JSON.parse(readFileSync(new URL('../'+path,import.meta.url),'utf8'));
function fixtureCatalog(){
  const catalog=prepareFoundingCollection(read('content/catalog.json'),read('content/founding-collection.json'));
  for(const work of catalog.works)if(work.sourcePage)work.workingContent=true;
  return prepareVerifiedMetadata(catalog);
}

test('only the four requested works change, retaining IDs, addresses, collections, stone and unrelated fields',()=>{
  const original=fixtureCatalog(),next=prepareCollectionRoundOne(original);
  assert.deepEqual(next.collections,original.collections);assert.deepEqual(next.site,original.site);
  for(const work of next.works){
    const before=original.works.find(item=>item.id===work.id),fix=corrections.find(fix=>fix.id===work.id);
    if(!fix){assert.deepEqual(work,before);continue;}
    assert.equal(work.slug,before.slug);assert.equal(work.material,before.material);
    assert.equal(work.dimensions,before.dimensions);assert.equal(work.title,fix.title);
    assert.equal(next.artists.find(artist=>artist.id===work.artistId).name,fix.artist);
    assert.equal(work.availability,fix.availability||before.availability);
    assert.equal(work.workingModel,false);assert.equal(work.verification.model,false);
  }
  assert.equal(original.works.find(work=>work.id==='zsa-021').title,'Dancers');
  assert.deepEqual(prepareCollectionRoundOne(next),next);
});

test('newer owner titles and photographs require review instead of being overwritten',()=>{
  for(const field of ['title','image']){
    const catalog=fixtureCatalog(),work=catalog.works.find(work=>work.id==='zsa-021');
    if(field==='title')work.title='A newer owner title';
    else{work.image='owner-upload';catalog.assets[work.image]='/media/new-owner-photo.webp';}
    assert.throws(()=>prepareCollectionRoundOne(catalog),/newer/i);
  }
});

test('all 23 sculpture fronts use studio photos and the current approved campaign paths are used',()=>{
  const editorial=read('public/editorial.json'),catalog=prepareCollectionRoundOne(fixtureCatalog());
  applyWorkPhotography(catalog,editorial.workPhotography);
  const campaigns=['rhythm','elemental','presence','kinship','wild-grace'];
  for(const [index,collection] of catalog.collections.entries()){
    const work=catalog.works.find(work=>work.id===collection.starWorkId),scene=editorial.workScenes[work.id];
    assert.equal(scene.source,catalog.assets[work.image]);
    assert.equal(scene.scenes[0].source,'/assets/'+campaigns[index]+'-campaign-v'+(collection.id==='elemental'?'3':'2')+'.webp');
    for(const id of collection.workIds){
      const work=catalog.works.find(work=>work.id===id);
      assert.match(catalog.assets[work.image],/(?:studio-front-v[234]|wingbeat-shoot-front-v1)\.webp$/);
      for(const source of Object.values(work.views||{}).map(key=>catalog.assets[key]))assert.match(source,/(?:studio-(?:front|back|left|right)-v[234]|wingbeat-shoot-(?:front|back|left|right)-v1)\.webp$/);
    }
  }
});

test('authenticated publication persists corrections, rejects acquisition of sold works, preserves history and runs once',async t=>{
  const dataDir=mkdtempSync(join(tmpdir(),'hos-round-one-')),password=randomUUID();
  const app=createApp({dataDir,env:{ADMIN_PASSWORD:password,SITE_URL:releaseOrigin},backgroundNotifications:false});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{await new Promise(resolve=>app.server.close(resolve));rmSync(dataDir,{recursive:true,force:true});});
  const origin='http://127.0.0.1:'+app.server.address().port;
  const request=async(path,data)=>fetch(origin+path,{headers:{Authorization:'Basic '+Buffer.from('admin:'+password).toString('base64'),'Content-Type':'application/json',Origin:releaseOrigin},...(data?{method:'POST',body:JSON.stringify(data)}:{})});
  const initial=app.db.prepare('SELECT catalog FROM collection_history WHERE revision=0').get().catalog;
  let state=await(await request('/api/admin/content')).json();
  state=await(await request('/api/admin/content',{revision:state.revision,catalog:fixtureCatalog()})).json();
  await request('/api/admin/publish',{revision:state.revision});
  const params={db:app.db,origin,password,publicOrigin:releaseOrigin};
  assert.deepEqual(await publishCollectionRoundOne({...params,publicOrigin:'https://other.example'}),{skipped:'different-service'});
  await assert.rejects(publishCollectionRoundOne({...params,password:'incorrect-password'}),/HTTP 401/);
  const result=await publishCollectionRoundOne(params);assert(result.published);
  assert(app.db.prepare('SELECT value FROM settings WHERE key=?').get(releaseId));
  assert.equal(app.db.prepare('SELECT catalog FROM collection_history WHERE revision=0').get().catalog,initial);
  const live=await(await request('/content.json')).json();
  assert.equal(live.works.find(work=>work.id==='zsa-001').title,'Witness');
  assert.equal(live.works.find(work=>work.id==='zsa-021').title,'Massaging');
  for(const id of ['zsa-017','zsa-021']){
    assert.equal(live.works.find(work=>work.id===id).availability,'sold');
    const data={submissionId:randomUUID(),name:'Local QA',email:'qa@example.test',interest:'Collecting a work',message:'Local fixture only',workId:id,page:'work',sessionId:randomUUID()};
    assert.equal((await request('/api/inquiries',data)).status,400);
    assert.equal((await request('/api/inquiries',{...data,intent:'alternatives'})).status,201);
  }
  state=await(await request('/api/admin/content')).json();state.draft.works.find(work=>work.id==='zsa-001').title='Later owner edit';
  await request('/api/admin/content',{revision:state.revision,catalog:state.draft});
  assert.deepEqual(await publishCollectionRoundOne(params),{skipped:'already-published'});
  assert.equal(app.db.prepare('SELECT count(*) AS n FROM inquiries').get().n,2);
});

test('an existing unpublished draft is left intact and never published as part of this release',async()=>{
  const draft=fixtureCatalog(),requests=[];
  const result=await publishCollectionRoundOne({db:{prepare:()=>({get:()=>undefined})},origin:'http://127.0.0.1:8000',password:'test-only',publicOrigin:releaseOrigin,fetchImpl:async(url,options)=>{requests.push({url:String(url),options});return {ok:true,json:async()=>({revision:9,unpublished:true,draft})};}});
  assert.deepEqual(result,{skipped:'unpublished-draft-present'});assert.equal(requests.length,1);assert.equal(requests[0].options.method,undefined);
});

