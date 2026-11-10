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
import {source,confirmedProfiles,prepareOwnerArtistBiographies,publishOwnerArtistBiographies,releaseId,releaseOrigins} from '../scripts/publish-owner-artist-biographies.mjs';

const fixture=()=>prepareCollectionRoundTwo(prepareCollectionRoundOne(prepareVerifiedMetadata(
  prepareOwnerPublication(JSON.parse(readFileSync(new URL('../content/catalog.json',import.meta.url),'utf8'))))));

test('owner artist biographies are assigned strictly by exact artist identity',()=>{
  assert.equal(source.profiles.length,4);
  assert.deepEqual(confirmedProfiles.map(p=>p.targetName),['Donald Chapenga','Luckmore Joseph']);
  assert.deepEqual(source.profiles.filter(p=>p.status==='confirmed-alias').map(p=>p.sourceName),
    ['Tawanda Mukonori Seremwe','Yusufu Jamare']);
  const before=fixture(),after=prepareOwnerArtistBiographies(before);
  for(const profile of confirmedProfiles){
    const original=before.artists.find(a=>a.name===profile.targetName);
    const updated=after.artists.find(a=>a.name===profile.targetName);
    assert(updated);
    assert.equal(updated.id,original.id);
    assert.equal(updated.slug,original.slug);
    assert.equal(updated.biography,profile.biography);
    assert.equal(updated.description,profile.introduction);
  }
  const modifiedIds=new Set(confirmedProfiles.map(p=>before.artists.find(a=>a.name===p.targetName).id));
  for(const artist of before.artists){
    if(!modifiedIds.has(artist.id))assert.deepEqual(after.artists.find(a=>a.id===artist.id),artist);
  }
  assert.deepEqual(after.works,before.works);
  assert.deepEqual(after.assets,before.assets);
  assert.deepEqual(after.collections,before.collections);
  assert.deepEqual(prepareOwnerArtistBiographies(after),after,'Re-running on the same copy must be idempotent');
  const manuallyEdited=structuredClone(before);
  manuallyEdited.artists.find(a=>a.name==='Donald Chapenga').biography='A separate previously verified personal biography.';
  assert.throws(()=>prepareOwnerArtistBiographies(manuallyEdited),/manual review/);
  const missing=structuredClone(before);
  missing.artists.find(a=>a.name==='Donald Chapenga').name='Another Artist';
  assert.throws(()=>prepareOwnerArtistBiographies(missing),/identity requires review/);
});

test('publication preserves pending drafts and changes only confirmed biographies',async t=>{
  const dataDir=mkdtempSync(join(tmpdir(),'hos-bios-')),password=randomUUID(),publicOrigin=releaseOrigins[0];
  const app=createApp({dataDir,env:{ADMIN_PASSWORD:password,SITE_URL:publicOrigin},backgroundNotifications:false});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{await new Promise(resolve=>app.server.close(resolve));rmSync(dataDir,{recursive:true,force:true});});
  const origin='http://127.0.0.1:'+app.server.address().port;
  const api=async(path,data)=>{
    const r=await fetch(origin+'/api/admin/'+path,{headers:{Authorization:'Basic '+Buffer.from('admin:'+password).toString('base64'),
      Origin:publicOrigin,'Content-Type':'application/json'},...(data?{method:'POST',body:JSON.stringify(data)}:{})});
    assert(r.ok,'Request '+path+' HTTP '+r.status);return r.json();
  };
  let state=await api('content');
  state=await api('content',{revision:state.revision,catalog:fixture()});
  const params={db:app.db,origin,password,publicOrigin};
  assert.deepEqual(await publishOwnerArtistBiographies(params),{skipped:'unpublished-draft-present'});
  await api('publish',{revision:state.revision});
  const count=app.db.prepare('SELECT count(*) AS n FROM collection_history').get().n;
  const result=await publishOwnerArtistBiographies(params);
  assert(result.published);assert.equal(result.names.length,2);
  assert.equal(app.db.prepare('SELECT count(*) AS n FROM collection_history').get().n,count+1);
  assert(app.db.prepare('SELECT value FROM settings WHERE key=?').get(releaseId));
  const live=await (await fetch(origin+'/content.json')).json();
  for(const profile of confirmedProfiles)assert.equal(live.artists.find(a=>a.name===profile.targetName).biography,profile.biography);
  for(const name of ['Tawanda Sere','Yusufu Jemalo','Yusuf Jemali']){
    const artist=live.artists.find(a=>a.name===name);
    if(artist)assert(!source.profiles.some(p=>p.sourceName===name&&p.status==='identity-review'));
  }
  assert.deepEqual(await publishOwnerArtistBiographies(params),{skipped:'already-published'});
  assert.deepEqual(await publishOwnerArtistBiographies({...params,publicOrigin:'https://other.example.com'}),{skipped:'different-service'});
});
