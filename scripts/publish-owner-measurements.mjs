import assert from 'node:assert/strict';

export const releaseId='owner-measurements-2026-11-03';
export const releaseOrigin='https://house-of-stone-production.up.railway.app';
// Matched by sculpture in IMG_8674–IMG_8678, with the owner's explicit
// clarifications for Birds, Quiet Forehead, Belonging and Massaging.
// The 178 cm × 3 m object is excluded at the owner's request.
export const measurements={
 'zsa-012':[129,36], 'zsa-031':[76,46], 'zsa-024':[43,40],
 'zsa-007':[75,38], 'zsa-023':[156,30], 'zsa-005':[68,22],
 'zsa-020':[53,18], 'zsa-028':[66,45], 'zsa-029':[85,33],
 'zsa-010':[63,23], 'zsa-026':[90,25], 'zsa-027':[125,119],
 'zsa-016':[63,33], 'zsa-014':[100,45], 'zsa-006':[48,38],
 'zsa-018':[50,28], 'hos-celebration':[78,58], 'zsa-009':[110,37],
 'zsa-025':[108,50], 'hos-belonging':[68,80], 'zsa-013':[67,55],
 'zsa-021':[120,50]
};
export function prepareOwnerMeasurements(current){
 const next=structuredClone(current);
 for(const [id,values] of Object.entries(measurements)){
  const work=next.works.find(w=>w.id===id);assert(work&&!work.archived,'Missing measured sculpture: '+id);
  const dimensions=values.join(' × ')+' cm';
  assert(!work.verification?.dimensions||work.dimensions===dimensions,'Newer verified dimensions require review: '+id);
  work.dimensions=dimensions;work.verification={...work.verification,dimensions:true};
 }
 const work=next.works.find(w=>w.id==='zsa-031');
 assert(['Mineral Tide','Protection Spirit'].includes(work.title),'A newer sculpture name requires review');
 work.title='Protection Spirit';work.verification={...work.verification,title:true};
 return next;
}
export async function publishOwnerMeasurements({db,origin,password,publicOrigin,fetchImpl=fetch}){
 if(![releaseOrigin,'https://houseofmabwe.com'].includes(publicOrigin))return {skipped:'different-service'};
 if(db.prepare('SELECT value FROM settings WHERE key=?').get(releaseId))return {skipped:'already-published'};
 const local=new URL(origin);assert(['127.0.0.1','localhost','[::1]'].includes(local.hostname));
 const headers={Authorization:'Basic '+Buffer.from('admin:'+password).toString('base64'),'Content-Type':'application/json',Origin:publicOrigin};
 const api=async(path,data,admin=true)=>{
  const response=await fetchImpl(new URL((admin?'/api/admin/':'/')+path,local),{headers,redirect:'error',signal:AbortSignal.timeout(30000),...(data?{method:'POST',body:JSON.stringify(data)}:{})});
  assert(response.ok,'Owner measurements '+path+': HTTP '+response.status);return response.json();
 };
 let state=await api('content');if(state.unpublished)return {skipped:'unpublished-draft-present'};
 state=await api('content',{revision:state.revision,catalog:prepareOwnerMeasurements(state.draft)});
 state=await api('publish',{revision:state.revision});const live=await api('content.json',undefined,false);
 for(const [id,values] of Object.entries(measurements))assert.equal(live.works.find(w=>w.id===id)?.dimensions,values.join(' × ')+' cm','Live dimensions: '+id);
 assert.equal(live.works.find(w=>w.id==='zsa-031')?.title,'Protection Spirit');
 db.prepare('INSERT INTO settings(key,value) VALUES (?,?)').run(releaseId,JSON.stringify({revision:state.liveRevision,publishedAt:state.publishedAt,count:Object.keys(measurements).length}));
 return {published:true,revision:state.liveRevision,updatedWorks:Object.keys(measurements).length};
}
