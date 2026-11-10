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
import {source as bios,prepareOwnerArtistBiographies} from '../scripts/publish-owner-artist-biographies.mjs';
import {identityProfiles,prepareConfirmedArtistIdentities,publishConfirmedArtistIdentities,releaseId,releaseOrigins} from '../scripts/publish-confirmed-artist-identities.mjs';

function fixture(){
  const seed=JSON.parse(readFileSync(new URL('../content/catalog.json',import.meta.url),'utf8'));
  return prepareOwnerArtistBiographies(prepareCollectionRoundTwo(prepareCollectionRoundOne(
    prepareVerifiedMetadata(prepareOwnerPublication(seed)))));
}
const active=(c,name)=>c.artists.filter(a=>!a.archived&&a.name===name);

test('confirmed names merge works under one canonical Yusufu profile without destroying history',()=>{
  assert.deepEqual(identityProfiles.map(p=>p.sourceName),['Tawanda Mukonori Seremwe','Yusufu Jamare']);
  const original=fixture(),next=prepareConfirmedArtistIdentities(original);
  assert.equal(active(next,'Tawanda Sere').length,1);
  const sourceT=bios.profiles.find(p=>p.sourceName==='Tawanda Mukonori Seremwe');
  const sourceY=bios.profiles.find(p=>p.sourceName==='Yusufu Jamare');
  assert.equal(active(next,'Tawanda Sere')[0].biography,sourceT.biography);
  assert.equal(active(next,'Yusufu Jamare').length,1);
  const canonical=active(next,'Yusufu Jamare')[0];
  assert.equal(canonical.slug,'yusufu-jamare');
  assert.equal(canonical.biography,sourceY.biography);
  assert.equal(canonical.id,active(original,'Yusufu Jemalo')[0].id,'Preserve established primary ID');
  assert.equal(active(next,'Yusuf Jemali').length,0);
  assert(next.artists.find(a=>a.name==='Yusuf Jemali')?.archived,'Retain duplicate as archived record');
  assert(next.artists.some(a=>a.slug==='yusuf-jemali'));
  for(const id of ['zsa-028','zsa-029']){
    const before=original.works.find(w=>w.id===id),after=next.works.find(w=>w.id===id);
    assert.equal(after.artistId,canonical.id);
    assert.deepEqual({...after,artistId:before.artistId},before,'Only artist association may change');
  }
  for(const work of original.works.filter(w=>!['zsa-028','zsa-029'].includes(w.id)))
    assert.deepEqual(next.works.find(w=>w.id===work.id),work);
  assert.deepEqual(next.assets,original.assets);
  assert.deepEqual(next.collections,original.collections);
  assert.deepEqual(next.site,original.site);
  assert.equal(next.artists.length,original.artists.length);
  assert.deepEqual(prepareConfirmedArtistIdentities(next),next,'Repeated release must be idempotent');
  const bad=structuredClone(original);bad.artists.find(a=>a.name==='Tawanda Sere').biography='A newer verified biography';
  assert.throws(()=>prepareConfirmedArtistIdentities(bad),/manual review/);
});

test('confirmed identity publication is revision checked and legacy artist URLs redirect',async t=>{
  const dataDir=mkdtempSync(join(tmpdir(),'hos-artist-identities-'));
  const password=randomUUID(),publicOrigin=releaseOrigins[0];
  const app=createApp({dataDir,env:{ADMIN_PASSWORD:password,SITE_URL:publicOrigin},backgroundNotifications:false});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{await new Promise(resolve=>app.server.close(resolve));rmSync(dataDir,{recursive:true,force:true});});
  const origin='http://127.0.0.1:'+app.server.address().port;
  const auth='Basic '+Buffer.from('admin:'+password).toString('base64');
  const api=async(path,data)=>{
    const r=await fetch(origin+'/api/admin/'+path,{headers:{Authorization:auth,Origin:publicOrigin,'Content-Type':'application/json'},
      ...(data?{method:'POST',body:JSON.stringify(data)}:{})});
    assert(r.ok,'Admin '+path+' HTTP '+r.status);return r.json();
  };
  let state=await api('content');
  state=await api('content',{revision:state.revision,catalog:fixture()});
  const params={db:app.db,origin,password,publicOrigin};
  assert.deepEqual(await publishConfirmedArtistIdentities(params),{skipped:'unpublished-draft-present'});
  await api('publish',{revision:state.revision});
  const historyBefore=app.db.prepare('SELECT count(*) AS n FROM collection_history').get().n;
  const result=await publishConfirmedArtistIdentities(params);
  assert(result.published);
  assert.equal(app.db.prepare('SELECT count(*) AS n FROM collection_history').get().n,historyBefore+1);
  assert(app.db.prepare('SELECT value FROM settings WHERE key=?').get(releaseId));
  const live=await (await fetch(origin+'/content.json')).json();
  const artist=active(live,'Yusufu Jamare')[0];
  assert(artist && artist.biography.includes('age of nine'));
  assert.equal(live.works.find(w=>w.id==='zsa-028').artistId,artist.id);
  assert.equal(live.works.find(w=>w.id==='zsa-029').artistId,artist.id);
  assert.equal(active(live,'Tawanda Sere')[0].biography,bios.profiles.find(x=>x.sourceName==='Tawanda Mukonori Seremwe').biography);
  const sitemap=await (await fetch(origin+'/sitemap.xml')).text();
  assert(sitemap.includes('/artists/yusufu-jamare'));
  assert(!sitemap.includes('/artists/yusuf-jemali'));
  assert(!sitemap.includes('/artists/yusufu-jemalo'));
  for(const old of ['/artists/yusufu-jemalo','/artists/yusuf-jemali']){
    const response=await fetch(origin+old+'?ref=old',{redirect:'manual'});
    assert.equal(response.status,308);
    assert.equal(response.headers.get('location'),'/artists/yusufu-jamare?ref=old');
  }
  assert((await fetch(origin+'/artists/yusufu-jamare')).ok());
  assert.deepEqual(await publishConfirmedArtistIdentities(params),{skipped:'already-published'});
  assert.deepEqual(await publishConfirmedArtistIdentities({...params,publicOrigin:'https://other.example'}),{skipped:'different-service'});
});
