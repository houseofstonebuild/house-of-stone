import assert from 'node:assert/strict';

export const releaseId='owner-round-eight-2026-11-11';
const allowedOrigins=['https://house-of-stone-production.up.railway.app','https://houseofmabwe.com'];

export function prepareOwnerRoundEight(current){
  const next=structuredClone(current);
  const within=next.works.find(work=>work.id==='zsa-017');
  const flower=next.works.find(work=>work.id==='zsa-025'&&!work.archived);
  assert(within && flower,'Expected owner sculpture records are missing');
  within.archived=true;
  for(const collection of next.collections||[]){
    collection.workIds=collection.workIds.filter(id=>id!=='zsa-017');
    assert(collection.starWorkId!=='zsa-017','A collection still features Within');
  }
  flower.title='Turning Line';
  flower.verification={...flower.verification,title:false};
  return next;
}

export async function publishOwnerRoundEight({db,origin,password,publicOrigin,fetchImpl=fetch}){
  if(!allowedOrigins.includes(publicOrigin))return {skipped:'different-service'};
  if(db.prepare('SELECT value FROM settings WHERE key=?').get(releaseId))return {skipped:'already-published'};
  const local=new URL(origin);assert(['127.0.0.1','localhost','[::1]'].includes(local.hostname));
  const headers={Authorization:'Basic '+Buffer.from('admin:'+password).toString('base64'),'Content-Type':'application/json',Origin:publicOrigin};
  const api=async(path,data,admin=true)=>{
    const response=await fetchImpl(new URL((admin?'/api/admin/':'/')+path,local),{headers,redirect:'error',signal:AbortSignal.timeout(30000),...(data?{method:'POST',body:JSON.stringify(data)}:{})});
    assert(response.ok,'Owner round eight '+path+': HTTP '+response.status);return response.json();
  };
  let state=await api('content');if(state.unpublished)return {skipped:'unpublished-draft-present'};
  state=await api('content',{revision:state.revision,catalog:prepareOwnerRoundEight(state.draft)});
  state=await api('publish',{revision:state.revision});
  const live=await api('content.json',undefined,false);
  assert(!live.works.some(work=>work.id==='zsa-017'));
  assert(live.collections.every(collection=>!collection.workIds.includes('zsa-017')));
  assert.equal(live.works.find(work=>work.id==='zsa-025')?.title,'Turning Line');
  db.prepare('INSERT INTO settings(key,value) VALUES (?,?)').run(releaseId,JSON.stringify({revision:state.liveRevision,publishedAt:state.publishedAt}));
  return {published:true,revision:state.liveRevision};
}
