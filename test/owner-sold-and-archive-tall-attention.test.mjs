import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createApp} from '../server.mjs';
import {validateCatalog,publicCatalog} from '../catalog.mjs';
import {prepareOwnerPublication} from '../scripts/publish-owner-release.mjs';
import {prepareVerifiedMetadata} from '../scripts/publish-verified-metadata.mjs';
import {prepareCollectionRoundOne} from '../scripts/publish-collection-round-one.mjs';
import {prepareCollectionRoundTwo} from '../scripts/publish-collection-round-two.mjs';
import {prepareUploadedWorks} from '../scripts/publish-uploaded-model-works.mjs';
import {prepareSoldAndArchiveTallAttention,publishSoldAndArchiveTallAttention,releaseId,releaseOrigins,soldWorkIds,archivedWorkId} from '../scripts/publish-owner-sold-and-archive-tall-attention.mjs';

const fixture=()=>{
  const seed=JSON.parse(readFileSync(new URL('../content/catalog.json',import.meta.url),'utf8'));
  const catalog=prepareUploadedWorks(prepareCollectionRoundTwo(prepareCollectionRoundOne(prepareVerifiedMetadata(prepareOwnerPublication(seed)))));
  catalog.works.find(work=>work.id==='zsa-013').title='Open Flame';
  for(const id of soldWorkIds){
    const work=catalog.works.find(item=>item.id===id);
    work.availability='available';
    work.verification={...work.verification,availability:true};
  }
  return catalog;
};

test('sold status and Tall Attention removal preserve other sculptures and validate',()=>{
  const before=fixture(),after=prepareSoldAndArchiveTallAttention(before);
  assert.deepEqual(prepareSoldAndArchiveTallAttention(after),after);
  for(const id of soldWorkIds){
    const original=before.works.find(work=>work.id===id),current=after.works.find(work=>work.id===id);
    assert.equal(current.availability,'sold');
    assert.equal(current.verification.availability,true);
    assert.equal(current.title,original.title);
    assert.equal(current.image,original.image);
  }
  assert.equal(after.works.find(work=>work.id===archivedWorkId)?.archived,true);
  assert(after.collections.every(collection=>!collection.workIds.includes(archivedWorkId)));
  assert.deepEqual(after.works.filter(work=>![...soldWorkIds,archivedWorkId].includes(work.id)),
    before.works.filter(work=>![...soldWorkIds,archivedWorkId].includes(work.id)));
  const valid=validateCatalog(after,{publicDir:new URL('../public/',import.meta.url).pathname,
    mediaDir:'/tmp/hos-owner-sold-test',publish:true,previous:before});
  const publicView=publicCatalog(valid);
  assert(!publicView.works.some(work=>work.id===archivedWorkId));
  assert(publicView.collections.every(collection=>!collection.workIds.includes(archivedWorkId)));
  for(const id of soldWorkIds)assert.equal(publicView.works.find(work=>work.id===id)?.availability,'sold');
});

test('authenticated migration publishes once, respects drafts, and removes detail URL and sitemap entry',async t=>{
  const dataDir=mkdtempSync(join(tmpdir(),'hos-sold-archive-'));
  const password=randomUUID(),publicOrigin=releaseOrigins[0];
  const app=createApp({dataDir,env:{ADMIN_PASSWORD:password,SITE_URL:publicOrigin},backgroundNotifications:false});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{await new Promise(resolve=>app.server.close(resolve));rmSync(dataDir,{recursive:true,force:true});});
  const origin='http://127.0.0.1:'+app.server.address().port;
  const auth='Basic '+Buffer.from('admin:'+password).toString('base64');
  const api=async(path,data)=>{
    const response=await fetch(origin+'/api/admin/'+path,{headers:{Authorization:auth,Origin:publicOrigin,'Content-Type':'application/json'},
      ...(data?{method:'POST',body:JSON.stringify(data)}:{})});
    assert(response.ok,'Admin '+path+': HTTP '+response.status);return response.json();
  };
  let state=await api('content');
  state=await api('content',{revision:state.revision,catalog:fixture()});
  const params={db:app.db,origin,password,publicOrigin};
  assert.deepEqual(await publishSoldAndArchiveTallAttention(params),{skipped:'unpublished-draft-present'});
  assert(!app.db.prepare('SELECT value FROM settings WHERE key=?').get(releaseId));
  await api('publish',{revision:state.revision});
  const historyBefore=app.db.prepare('SELECT count(*) n FROM collection_history').get().n;
  const result=await publishSoldAndArchiveTallAttention(params);
  assert(result.published);
  assert.equal(app.db.prepare('SELECT count(*) n FROM collection_history').get().n,historyBefore+1);
  const live=await(await fetch(origin+'/content.json')).json();
  for(const id of soldWorkIds)assert.equal(live.works.find(work=>work.id===id)?.availability,'sold');
  assert(!live.works.some(work=>work.id===archivedWorkId));
  assert.equal((await fetch(origin+'/works/tall-attention')).status,404);
  assert(!(await(await fetch(origin+'/sitemap.xml')).text()).includes('tall-attention'));
  assert.deepEqual(await publishSoldAndArchiveTallAttention(params),{skipped:'already-published'});
  assert.deepEqual(await publishSoldAndArchiveTallAttention({...params,publicOrigin:'https://example.test'}),{skipped:'different-service'});
});
