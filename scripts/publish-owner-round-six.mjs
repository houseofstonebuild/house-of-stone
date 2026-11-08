import assert from 'node:assert/strict';

export const releaseId='owner-round-six-2026-11-08';
const allowedOrigins=['https://house-of-stone-production.up.railway.app','https://houseofmabwe.com'];

export function prepareOwnerRoundSix(current){
  const next=structuredClone(current);
  const artist=next.artists.find(item=>item.id==='verified-philip-mlimu'&&!item.archived);
  const work=next.works.find(item=>item.id==='zsa-027'&&!item.archived);
  assert.equal(artist?.name,'Philip Mlimu');
  assert(work,'The Old Man is missing');
  assert(['The Old Man','Quiet Forehead'].includes(work.title),'The Old Man title needs review');
  work.title='The Old Man';
  work.artistId=artist.id;
  work.verification={...work.verification,title:true,artist:true};
  // Only user-facing catalogue text changes; keep record IDs, addresses and internal notes stable.
  next.site.name='House of Mabwe';
  const replace=value=>typeof value==='string'?value.replaceAll('House of Stone','House of Mabwe'):
    Array.isArray(value)?value.map(replace):value&&typeof value==='object'?
      Object.fromEntries(Object.entries(value).map(([key,item])=>[key,key==='internalNotes'?item:replace(item)])):value;
  return replace(next);
}

export async function publishOwnerRoundSix({db,origin,password,publicOrigin,fetchImpl=fetch}){
  if(!allowedOrigins.includes(publicOrigin))return {skipped:'different-service'};
  if(db.prepare('SELECT value FROM settings WHERE key=?').get(releaseId))return {skipped:'already-published'};
  const local=new URL(origin);assert(['127.0.0.1','localhost','[::1]'].includes(local.hostname));
  const headers={Authorization:'Basic '+Buffer.from('admin:'+password).toString('base64'),'Content-Type':'application/json',Origin:publicOrigin};
  const api=async(path,data,admin=true)=>{const response=await fetchImpl(new URL((admin?'/api/admin/':'/')+path,local),{headers,redirect:'error',signal:AbortSignal.timeout(30000),...(data?{method:'POST',body:JSON.stringify(data)}:{})});assert(response.ok,'Owner round six '+path+': HTTP '+response.status);return response.json();};
  let state=await api('content');if(state.unpublished)return {skipped:'unpublished-draft-present'};
  state=await api('content',{revision:state.revision,catalog:prepareOwnerRoundSix(state.draft)});
  state=await api('publish',{revision:state.revision});
  const live=await api('content.json',undefined,false),work=live.works.find(item=>item.id==='zsa-027');
  assert.equal(live.site.name,'House of Mabwe');assert.equal(work?.title,'The Old Man');
  assert.equal(live.artists.find(item=>item.id===work.artistId)?.name,'Philip Mlimu');
  db.prepare('INSERT INTO settings(key,value) VALUES (?,?)').run(releaseId,JSON.stringify({revision:state.liveRevision,publishedAt:state.publishedAt}));
  return {published:true,revision:state.liveRevision};
}
