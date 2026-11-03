import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createApp} from '../server.mjs';
import {prepareFoundingCollection} from '../founding-collection.mjs';
import {prepareVerifiedMetadata} from '../scripts/publish-verified-metadata.mjs';
import {prepareCollectionRoundOne} from '../scripts/publish-collection-round-one.mjs';
import {prepareCollectionRoundTwo,publishCollectionRoundTwo,releaseId,releaseOrigin,additions,artistPhotos} from '../scripts/publish-collection-round-two.mjs';
import {validateCatalog,publicCatalog} from '../catalog.mjs';
const read=path=>JSON.parse(readFileSync(new URL('../'+path,import.meta.url),'utf8'));
export function roundOneFixture(){
  const next=prepareFoundingCollection(read('content/catalog.json'),read('content/founding-collection.json'));
  for(const work of next.works)if(work.sourcePage)work.workingContent=true;
  return prepareCollectionRoundOne(prepareVerifiedMetadata(next));
}
test('four additions replace only Philip’s Lovers, preserving collection stars and Chamu’s Lovers',()=>{
  const original=roundOneFixture(),next=prepareCollectionRoundTwo(original);
  assert.equal(next.works.filter(work=>!work.archived).length,26);
  assert.deepEqual(next.collections.map(collection=>collection.starWorkId),original.collections.map(collection=>collection.starWorkId));
  assert.deepEqual(next.collections.map(collection=>collection.workIds.length),[5,4,7,6,4]);
  assert.equal(next.works.find(work=>work.id==='zsa-002').archived,true);
  assert.deepEqual(next.works.find(work=>work.id==='zsa-020'),original.works.find(work=>work.id==='zsa-020'));
  for(const item of additions){const work=next.works.find(work=>work.id===item.id);assert.equal(work.material,item.material);assert.equal(work.availability,'unknown');assert.equal(work.dimensions,'On inquiry');assert.equal(Object.keys(work.views).length,3);assert(next.collections.find(collection=>collection.id===item.collection).workIds.includes(item.id));}
  assert(!original.works.some(work=>work.id==='hos-queen-mother'));
  assert.deepEqual(prepareCollectionRoundTwo(next),next);
});
test('real portraits and paired work photographs replace fictional identities without unsupported biographies',()=>{
  const next=prepareCollectionRoundTwo(roundOneFixture());
  const fake=new Set(['tariro','kuda','ruvimbo','farai','tendai']);
  assert(next.artists.filter(artist=>fake.has(artist.id)).every(artist=>artist.archived));
  assert(next.works.filter(work=>!work.archived).every(work=>!fake.has(work.artistId)));
  for(const photo of artistPhotos){
    const artist=next.artists.find(artist=>artist.name===photo.name&&!artist.archived),work=next.works.find(work=>work.id===photo.workId);
    assert.equal(work.artistId,artist.id);assert.match(next.assets[artist.portrait],/\/hos-artist-/);
    assert(work.additionalImages.includes(artist.studioImage));assert.match(artist.biography,/based in Zimbabwe/);assert.equal(artist.quote,'');
  }
  const unknown=next.artists.find(artist=>artist.id==='artist-unconfirmed');assert.equal(unknown.name,'Artist to be confirmed');
  assert.equal(next.works.find(work=>work.id==='hos-belonging').verification.material,false);
  const validated=validateCatalog(next,{publicDir:new URL('../public',import.meta.url).pathname,mediaDir:'/tmp/unused-hos-media',publish:true});
  const live=publicCatalog(validated);assert.equal(live.works.length,26);assert(!live.artists.some(artist=>fake.has(artist.id)));
  assert(!JSON.stringify(live.works).includes('internalNotes'));assert(!JSON.stringify(live.works).includes('Springstone is provisional'));
});
test('newer owner additions cannot be silently overwritten',()=>{
  const next=prepareCollectionRoundTwo(roundOneFixture());next.assets['hos-queen-mother-front']='/assets/hero.jpg';
  assert.throws(()=>prepareCollectionRoundTwo(next),/newer addition asset/);
});
test('authenticated publication persists new works and photographs, preserves enquiries and history, and runs once',async t=>{
  const dataDir=mkdtempSync(join(tmpdir(),'hos-round-two-')),password=randomUUID();
  const app=createApp({dataDir,env:{ADMIN_PASSWORD:password,SITE_URL:releaseOrigin},backgroundNotifications:false});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{await new Promise(resolve=>app.server.close(resolve));rmSync(dataDir,{recursive:true,force:true});});
  const origin='http://127.0.0.1:'+app.server.address().port;
  const api=async(path,data)=>{const response=await fetch(origin+'/api/admin/'+path,{headers:{Authorization:'Basic '+Buffer.from('admin:'+password).toString('base64'),'Content-Type':'application/json',Origin:releaseOrigin},...(data?{method:'POST',body:JSON.stringify(data)}:{})});assert(response.ok);return response.json();};
  let state=await api('content');state=await api('content',{revision:state.revision,catalog:roundOneFixture()});await api('publish',{revision:state.revision});
  const initial=app.db.prepare('SELECT catalog FROM collection_history WHERE revision=0').get().catalog;
  const params={db:app.db,origin,password,publicOrigin:releaseOrigin};
  assert.deepEqual(await publishCollectionRoundTwo({...params,publicOrigin:'https://other.example'}),{skipped:'different-service'});
  assert((await publishCollectionRoundTwo(params)).published);
  assert.equal(app.catalog.works.length,26);assert(app.db.prepare('SELECT value FROM settings WHERE key=?').get(releaseId));
  for(const item of additions)assert.equal((await fetch(origin+'/works/'+item.slug)).status,200);
  assert.equal(app.db.prepare('SELECT catalog FROM collection_history WHERE revision=0').get().catalog,initial);
  assert.deepEqual(await publishCollectionRoundTwo(params),{skipped:'already-published'});
  assert.equal(app.db.prepare('SELECT count(*) AS n FROM inquiries').get().n,0);
});
test('pending drafts are never included in the one-time publication',async()=>{
  let calls=0;
  const result=await publishCollectionRoundTwo({db:{prepare:()=>({get:()=>undefined})},origin:'http://localhost:8000',password:'test-only',publicOrigin:releaseOrigin,fetchImpl:async()=>{calls++;return {ok:true,json:async()=>({unpublished:true})};}});
  assert.deepEqual(result,{skipped:'unpublished-draft-present'});assert.equal(calls,1);
});
