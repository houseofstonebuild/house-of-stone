import assert from 'node:assert/strict';
export const releaseId='owner-round-four-2026-11-03';
export const releaseOrigin='https://house-of-stone-production.up.railway.app';
export function prepareOwnerRoundFour(current){
 const next=structuredClone(current),work=id=>{const w=next.works.find(w=>w.id===id&&!w.archived);assert(w,'Missing sculpture: '+id);return w;};
 const dancers=work('zsa-007');assert(['Close','Dancers'].includes(dancers.title),'Newer Dancers title needs review');
 const artist=next.artists.find(a=>a.name==='Donald Chapenga'&&!a.archived);assert(artist,'Donald Chapenga artist record missing');
 dancers.title='Dancers';dancers.artistId=artist.id;dancers.dimensions='78 × 46 cm';dancers.verification={...dancers.verification,title:true,artist:true,dimensions:true};
 for(const id of ['zsa-031','zsa-017']){const w=work(id);w.material='Green Opal';w.verification={...w.verification,material:true};}
 const presence=next.collections.find(c=>c.id==='presence');assert(presence&&presence.workIds.includes('hos-queen-mother'),'Queen Mother collection missing');
 presence.workIds=presence.workIds.filter(id=>id!=='hos-queen-mother');presence.workIds.splice(1,0,'hos-queen-mother');
 return next;
}
export async function publishOwnerRoundFour({db,origin,password,publicOrigin,fetchImpl=fetch}){
 if(publicOrigin!==releaseOrigin)return {skipped:'different-service'};
 if(db.prepare('SELECT value FROM settings WHERE key=?').get(releaseId))return {skipped:'already-published'};
 const local=new URL(origin);assert(['127.0.0.1','localhost','[::1]'].includes(local.hostname));
 const headers={Authorization:'Basic '+Buffer.from('admin:'+password).toString('base64'),'Content-Type':'application/json',Origin:publicOrigin};
 const api=async(path,data,admin=true)=>{const r=await fetchImpl(new URL((admin?'/api/admin/':'/')+path,local),{headers,redirect:'error',signal:AbortSignal.timeout(30000),...(data?{method:'POST',body:JSON.stringify(data)}:{})});assert(r.ok,'Owner round four '+path+': HTTP '+r.status);return r.json();};
 let state=await api('content');if(state.unpublished)return {skipped:'unpublished-draft-present'};
 state=await api('content',{revision:state.revision,catalog:prepareOwnerRoundFour(state.draft)});state=await api('publish',{revision:state.revision});
 const live=await api('content.json',undefined,false),dancers=live.works.find(w=>w.id==='zsa-007');assert.equal(dancers?.title,'Dancers');assert.equal(dancers?.dimensions,'78 × 46 cm');assert.equal(live.artists.find(a=>a.id===dancers.artistId)?.name,'Donald Chapenga');
 for(const id of ['zsa-031','zsa-017'])assert.equal(live.works.find(w=>w.id===id)?.material,'Green Opal');
 assert.equal(live.collections.find(c=>c.id==='presence').workIds[1],'hos-queen-mother');
 db.prepare('INSERT INTO settings(key,value) VALUES (?,?)').run(releaseId,JSON.stringify({revision:state.liveRevision,publishedAt:state.publishedAt}));return {published:true,revision:state.liveRevision};
}
