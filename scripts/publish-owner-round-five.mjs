import assert from 'node:assert/strict';

export const releaseId='owner-round-five-2026-11-07';
const releaseOrigin='https://house-of-stone-production.up.railway.app';

export function prepareOwnerRoundFive(current){
  const next=structuredClone(current);
  for(const [id,title] of [['zsa-027','The Old Man'],['zsa-026','Polygamist']]){
    const work=next.works.find(item=>item.id===id&&!item.archived);
    assert(work,'Missing sculpture: '+id);
    work.title=title;
    work.verification={...work.verification,title:true};
  }
  return next;
}

export async function publishOwnerRoundFive({db,origin,password,publicOrigin,fetchImpl=fetch}){
  if(![releaseOrigin,'https://houseofmabwe.com'].includes(publicOrigin))return {skipped:'different-service'};
  if(db.prepare('SELECT value FROM settings WHERE key=?').get(releaseId))return {skipped:'already-published'};
  const local=new URL(origin);assert(['127.0.0.1','localhost','[::1]'].includes(local.hostname));
  const headers={Authorization:'Basic '+Buffer.from('admin:'+password).toString('base64'),'Content-Type':'application/json',Origin:publicOrigin};
  const api=async(path,data,admin=true)=>{const response=await fetchImpl(new URL((admin?'/api/admin/':'/')+path,local),{headers,redirect:'error',signal:AbortSignal.timeout(30000),...(data?{method:'POST',body:JSON.stringify(data)}:{})});assert(response.ok,'Owner round five '+path+': HTTP '+response.status);return response.json();};
  let state=await api('content');if(state.unpublished)return {skipped:'unpublished-draft-present'};
  state=await api('content',{revision:state.revision,catalog:prepareOwnerRoundFive(state.draft)});
  state=await api('publish',{revision:state.revision});
  const live=await api('content.json',undefined,false);
  assert.equal(live.works.find(w=>w.id==='zsa-027')?.title,'The Old Man');
  assert.equal(live.works.find(w=>w.id==='zsa-026')?.title,'Polygamist');
  db.prepare('INSERT INTO settings(key,value) VALUES (?,?)').run(releaseId,JSON.stringify({revision:state.liveRevision,publishedAt:state.publishedAt}));
  return {published:true,revision:state.liveRevision};
}
