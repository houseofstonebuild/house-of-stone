import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createApp} from '../server.mjs';
import {prepareOwnerPublication} from '../scripts/publish-owner-release.mjs';
import {prepareVerifiedMetadata} from '../scripts/publish-verified-metadata.mjs';
import {prepareCollectionRoundOne} from '../scripts/publish-collection-round-one.mjs';
import {prepareCollectionRoundTwo} from '../scripts/publish-collection-round-two.mjs';
import {prepareStandaloneCelebration,publishStandaloneCelebration,releaseId,releaseOrigins,standaloneWorkId} from '../scripts/publish-standalone-celebration.mjs';

function fixture(){
  const seed=JSON.parse(readFileSync(new URL('../content/catalog.json',import.meta.url),'utf8'));
  return prepareCollectionRoundTwo(prepareCollectionRoundOne(prepareVerifiedMetadata(prepareOwnerPublication(seed))));
}

test('Celebration stays in the catalogue but no longer belongs to any curated collection',()=>{
  const before=fixture(),after=prepareStandaloneCelebration(before);
  const old=before.works.find(w=>w.id===standaloneWorkId);
  const current=after.works.find(w=>w.id===standaloneWorkId);
  assert(old&&!old.archived&&old.slug==='celebration');
  assert.deepEqual(current,old,'Never alter sculpture title, artist, source photos, availability or details');
  assert.deepEqual(after.works,before.works);
  assert.deepEqual(after.artists,before.artists);
  assert.deepEqual(after.assets,before.assets);
  assert.deepEqual(after.site,before.site);
  assert.equal(before.collections.find(c=>c.id==='presence').workIds.includes(standaloneWorkId),true);
  assert.equal(after.collections.find(c=>c.id==='presence').workIds.includes(standaloneWorkId),false);
  assert(after.collections.every(c=>!c.workIds.includes(standaloneWorkId)));
  assert.equal(after.collections.find(c=>c.id==='presence').starWorkId,before.collections.find(c=>c.id==='presence').starWorkId);
  assert(after.collections.find(c=>c.id==='elemental').workIds.includes('zsa-017'),'Within stays in Elemental');
  for(const collection of before.collections){
    const updated=after.collections.find(c=>c.id===collection.id);
    if(collection.id==='presence')assert.deepEqual(updated.workIds,collection.workIds.filter(id=>id!==standaloneWorkId));
    else assert.deepEqual(updated,collection);
  }
  assert.deepEqual(prepareStandaloneCelebration(after),after,'Publication is idempotent');
  const moved=structuredClone(before);moved.collections.find(c=>c.id==='presence').workIds=moved.collections.find(c=>c.id==='presence').workIds.filter(id=>id!==standaloneWorkId);
  moved.collections.find(c=>c.id==='kinship').workIds.push(standaloneWorkId);
  assert.throws(()=>prepareStandaloneCelebration(moved),/reassigned elsewhere/);
});

test('standalone publication preserves unpublished drafts and keeps Celebration accessible under All Works',async t=>{
  const dataDir=mkdtempSync(join(tmpdir(),'hos-standalone-celebration-'));
  const password=randomUUID(),publicOrigin=releaseOrigins[0];
  const app=createApp({dataDir,env:{ADMIN_PASSWORD:password,SITE_URL:publicOrigin},backgroundNotifications:false});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{await new Promise(resolve=>app.server.close(resolve));rmSync(dataDir,{recursive:true,force:true});});
  const origin='http://127.0.0.1:'+app.server.address().port;
  const auth='Basic '+Buffer.from('admin:'+password).toString('base64');
  const api=async(path,data)=>{
    const response=await fetch(origin+'/api/admin/'+path,{
      headers:{Authorization:auth,Origin:publicOrigin,'Content-Type':'application/json'},
      ...(data?{method:'POST',body:JSON.stringify(data)}:{})});
    assert(response.ok,'Admin '+path+': HTTP '+response.status);
    return response.json();
  };
  const initial=fixture();
  let state=await api('content');
  state=await api('content',{revision:state.revision,catalog:initial});
  const params={db:app.db,origin,password,publicOrigin};
  assert.deepEqual(await publishStandaloneCelebration(params),{skipped:'unpublished-draft-present'});
  state=await api('publish',{revision:state.revision});
  const historyBefore=app.db.prepare('SELECT count(*) AS n FROM collection_history').get().n;
  const result=await publishStandaloneCelebration(params);
  assert(result.published);
  assert.equal(app.db.prepare('SELECT count(*) AS n FROM collection_history').get().n,historyBefore+1);
  assert(app.db.prepare('SELECT value FROM settings WHERE key=?').get(releaseId));
  const publicResponse=await fetch(origin+'/content.json');
  const publicCatalog=await publicResponse.json();
  const celebration=publicCatalog.works.find(w=>w.id===standaloneWorkId);
  const original=initial.works.find(w=>w.id===standaloneWorkId);
  assert.equal(celebration?.title,original.title);
  assert.equal(celebration?.slug,'celebration');
  assert.equal(celebration?.artistId,original.artistId);
  assert.equal(celebration?.availability,original.availability);
  assert.equal(publicCatalog.works.length,initial.works.filter(w=>!w.archived).length);
  assert(publicCatalog.collections.every(c=>!c.workIds.includes(standaloneWorkId)));
  assert(publicCatalog.collections.find(c=>c.id==='elemental').workIds.includes('zsa-017'));
  const page=await fetch(origin+'/works/celebration');
  assert(page.ok,'Celebration work URL must still work');
  const collectionPage=await fetch(origin+'/collection');
  assert(collectionPage.ok,'All Works catalogue remains available');
  assert.deepEqual(await publishStandaloneCelebration(params),{skipped:'already-published'});
  assert.deepEqual(await publishStandaloneCelebration({...params,publicOrigin:'https://unrelated.example'}),{skipped:'different-service'});
});
