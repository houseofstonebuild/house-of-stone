import assert from 'node:assert/strict';

export const releaseId='owner-archive-kissing-lovers-2026-11-14';
const releaseOrigins=['https://house-of-stone-production.up.railway.app','https://houseofmabwe.com'];
export const excludedWorkId='hos-kissing-lovers';

// Reversible removal from the public catalogue. Preserve the artwork ID,
// photographs and historical inquiries; do not delete inventory records.
export function prepareArchiveKissingLovers(current){
  const next=structuredClone(current);
  const work=next.works.find(item=>item.id===excludedWorkId);
  assert(work,'The Kissing Lovers catalogue record was not found');
  work.archived=true;
  for(const collection of next.collections||[]){
    assert(collection.starWorkId!==excludedWorkId,'Kissing Lovers is a featured work; review before archiving');
    collection.workIds=collection.workIds.filter(id=>id!==excludedWorkId);
  }
  return next;
}

export async function publishArchiveKissingLovers({db,origin,password,publicOrigin,fetchImpl=fetch}){
  if(!releaseOrigins.includes(publicOrigin))return {skipped:'different-service'};
  if(db.prepare('SELECT value FROM settings WHERE key=?').get(releaseId))return {skipped:'already-published'};
  const local=new URL(origin);
  assert(['127.0.0.1','localhost','[::1]'].includes(local.hostname),'Local authenticated publication only');
  const headers={Authorization:'Basic '+Buffer.from('admin:'+password).toString('base64'),
    'Content-Type':'application/json',Origin:publicOrigin};
  const api=async(path,data,admin=true)=>{
    const response=await fetchImpl(new URL((admin?'/api/admin/':'/')+path,local),{
      headers,redirect:'error',signal:AbortSignal.timeout(30000),
      ...(data?{method:'POST',body:JSON.stringify(data)}:{})});
    assert(response.ok,'Archive Kissing Lovers '+path+': HTTP '+response.status);
    return response.json();
  };
  let state=await api('content');
  if(state.unpublished)return {skipped:'unpublished-draft-present'};
  const next=prepareArchiveKissingLovers(state.draft);
  if(JSON.stringify(next)!==JSON.stringify(state.draft)){
    state=await api('content',{revision:state.revision,catalog:next});
    state=await api('publish',{revision:state.revision});
  }
  const live=await api('content.json',undefined,false);
  assert(!live.works.some(work=>work.id===excludedWorkId),'Excluded sculpture is still publicly visible');
  assert(!(live.collections||[]).some(collection=>collection.workIds.includes(excludedWorkId)),
    'Excluded sculpture remains in a collection');
  db.prepare('INSERT INTO settings(key,value) VALUES (?,?)').run(releaseId,
    JSON.stringify({revision:state.liveRevision,publishedAt:state.publishedAt,archivedWorkId:excludedWorkId}));
  return {published:true,revision:state.liveRevision,archivedWorkId:excludedWorkId};
}
