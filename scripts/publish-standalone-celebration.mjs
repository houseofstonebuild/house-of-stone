import assert from 'node:assert/strict';

export const releaseId='standalone-celebration-2026-11-10';
export const releaseOrigins=['https://house-of-stone-production.up.railway.app','https://houseofmabwe.com'];
export const standaloneWorkId='hos-celebration';

// Curatorial scope is deliberately narrow: remove Celebration from Presence,
// but retain the work, artist association, imagery, availability, and work page.
export function prepareStandaloneCelebration(current){
  const next=structuredClone(current);
  const matching=next.works.filter(work=>work.id===standaloneWorkId&&!work.archived);
  assert.equal(matching.length,1,'Celebration must have one active sculpture record');
  assert.equal(matching[0].slug,'celebration','Celebration record has changed');

  const presence=next.collections.find(c=>c.id==='presence'&&!c.archived);
  assert(presence,'Presence collection is missing');
  assert.notEqual(presence.starWorkId,standaloneWorkId,'Celebration unexpectedly became a collection star');

  const memberships=next.collections.filter(c=>!c.archived&&c.workIds.includes(standaloneWorkId));
  assert(memberships.length<=1,'Celebration is unexpectedly listed more than once');
  assert(!memberships.length||memberships[0].id==='presence',
    'Celebration has been reassigned elsewhere; review before automatic publication');
  if(memberships.length){
    presence.workIds=presence.workIds.filter(id=>id!==standaloneWorkId);
    assert(presence.workIds.includes(presence.starWorkId),'Presence star sculpture must remain');
  }
  return next;
}

export async function publishStandaloneCelebration({db,origin,password,publicOrigin,fetchImpl=fetch}){
  if(!releaseOrigins.includes(publicOrigin))return {skipped:'different-service'};
  if(db.prepare('SELECT value FROM settings WHERE key=?').get(releaseId))return {skipped:'already-published'};

  const local=new URL(origin);
  assert(['127.0.0.1','localhost','[::1]'].includes(local.hostname),'Publication must use the local server');

  const headers={Authorization:'Basic '+Buffer.from('admin:'+password).toString('base64'),
    'Content-Type':'application/json',Origin:publicOrigin};
  const api=async(path,data,admin=true)=>{
    const response=await fetchImpl(new URL((admin?'/api/admin/':'/')+path,local),{
      headers,redirect:'error',signal:AbortSignal.timeout(30000),
      ...(data?{method:'POST',body:JSON.stringify(data)}:{})});
    assert(response.ok,'Curated membership '+path+': HTTP '+response.status);
    return response.json();
  };
  let state=await api('content');
  if(state.unpublished)return {skipped:'unpublished-draft-present'};
  const next=prepareStandaloneCelebration(state.draft);
  const previous=state.draft.collections.find(c=>c.id==='presence');
  const updated=next.collections.find(c=>c.id==='presence');
  if(JSON.stringify(previous.workIds)===JSON.stringify(updated.workIds)){
    db.prepare('INSERT INTO settings(key,value) VALUES (?,?)').run(releaseId,
      JSON.stringify({revision:state.liveRevision,unchanged:true}));
    return {skipped:'already-standalone'};
  }
  state=await api('content',{revision:state.revision,catalog:next});
  state=await api('publish',{revision:state.revision});

  const live=await api('content.json',undefined,false);
  const work=live.works.find(w=>w.id===standaloneWorkId);
  assert(work&&work.slug==='celebration','Celebration must remain published');
  assert(!live.collections.some(c=>c.workIds.includes(standaloneWorkId)),
    'Celebration must not appear in a curated collection');
  assert(live.collections.find(c=>c.id==='presence')?.workIds.includes(previous.starWorkId),
    'Presence star sculpture must remain');

  db.prepare('INSERT INTO settings(key,value) VALUES (?,?)').run(releaseId,
    JSON.stringify({revision:state.liveRevision,publishedAt:state.publishedAt,workId:standaloneWorkId}));
  return {published:true,revision:state.liveRevision,workId:standaloneWorkId};
}
