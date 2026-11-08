import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {prepareFoundingCollection} from '../founding-collection.mjs';

// Explicit owner instruction, 23 October 2026: publish the entire renovation
// now, using the existing working content until the photoshoot is delivered.
// This is a one-time authenticated publication, not a database reseed.
export const releaseId='owner-publication-2026-10-23';
export const releaseOrigin='https://house-of-stone-production.up.railway.app';
const root=new URL('../',import.meta.url);
const read=path=>JSON.parse(readFileSync(new URL(path,root),'utf8'));

export function prepareOwnerPublication(current,blueprint=read('content/founding-collection.json'),models=read('public/models.json')) {
  const next=prepareFoundingCollection(current,blueprint);
  const expected=blueprint.collections.flatMap(c=>c.workIds);
  assert.equal(expected.length,23);assert.equal(new Set(expected).size,23);
  assert.deepEqual(next.collections.filter(c=>!c.archived).map(c=>({id:c.id,star:c.starWorkId,works:c.workIds})),blueprint.collections.map(c=>({id:c.id,star:c.starWorkId,works:c.workIds})), 'Collection membership changed; review before publication.');
  const stars=new Set(blueprint.collections.map(c=>c.starWorkId));
  for(const id of expected){
    const work=next.works.find(w=>w.id===id),source=blueprint.works.find(w=>w.id===id);
    assert(work && !work.archived && work.sourcePage===source.sourcePage,'A required source record changed.');
    assert(next.artists.some(a=>a.id===work.artistId && !a.archived),'A required artist is not visible.');
    work.workingContent=true;
    const model=models[id];
    work.workingModel=stars.has(id) && Boolean(model?.reconstruction && model.workId===id && model.sourcePage===work.sourcePage && model.source===next.assets[work.image] && existsSync(new URL('public'+model.file,root)));
  }
  assert.deepEqual(next.works.filter(w=>!w.archived).map(w=>w.id).sort(),[...expected].sort(),'Unexpected visible records; review before publication.');
  assert.equal(next.works.find(w=>w.sourcePage===13).availability,'sold');
  return next;
}

export async function publishOwnerRelease({db,origin,password,publicOrigin,fetchImpl=fetch}) {
  // Only the named production service opts in. Tests invoke this explicitly.
  if(![releaseOrigin,'https://houseofmabwe.com'].includes(publicOrigin))return {skipped:'different-service'};
  if(db.prepare('SELECT value FROM settings WHERE key=?').get(releaseId))return {skipped:'already-published'};
  const local=new URL(origin);assert(['127.0.0.1','localhost','[::1]'].includes(local.hostname));
  const headers={Authorization:'Basic '+Buffer.from('admin:'+password).toString('base64'),'Content-Type':'application/json',Origin:publicOrigin};
  const api=async(path,data)=>{
    const response=await fetchImpl(new URL('/api/admin/'+path,local),{headers,redirect:'error',signal:AbortSignal.timeout(30000),...(data?{method:'POST',body:JSON.stringify(data)}:{})});
    assert(response.ok,`Owner publication ${path}: HTTP ${response.status}`);return response.json();
  };
  let state=await api('content');
  const next=prepareOwnerPublication(state.draft);
  state=await api('content',{revision:state.revision,catalog:next});
  state=await api('publish',{revision:state.revision});
  db.prepare('INSERT INTO settings(key,value) VALUES (?,?)').run(releaseId,JSON.stringify({revision:state.liveRevision,publishedAt:state.publishedAt}));
  return {published:true,revision:state.liveRevision,collections:5,works:23};
}
