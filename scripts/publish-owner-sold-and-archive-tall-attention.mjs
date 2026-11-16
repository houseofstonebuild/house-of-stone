import assert from 'node:assert/strict';

export const releaseId='owner-sold-and-archive-tall-attention-2026-11-15';
export const releaseOrigins=['https://house-of-stone-production.up.railway.app','https://houseofmabwe.com'];
export const soldWorkIds=['zsa-013','zsa-021'];
export const archivedWorkId='hos-tall-attention';

// Archive instead of deleting: historical inquiries and inventory IDs remain intact.
export function prepareSoldAndArchiveTallAttention(current){
  const next=structuredClone(current);
  for(const id of soldWorkIds){
    const work=next.works.find(item=>item.id===id);
    assert(work&&!work.archived,'Sold sculpture record is missing: '+id);
    work.availability='sold';
    work.verification={...work.verification,availability:true};
  }
  const removed=next.works.find(item=>item.id===archivedWorkId);
  if(removed)removed.archived=true;
  for(const collection of next.collections||[]){
    collection.workIds=collection.workIds.filter(id=>id!==archivedWorkId);
    if(collection.starWorkId===archivedWorkId){
      assert(collection.workIds.length,'Cannot remove the final sculpture from a featured collection');
      collection.starWorkId=collection.workIds[0];
    }
  }
  if(next.site.featuredWorkId===archivedWorkId){
    const replacement=next.works.find(work=>!work.archived&&next.artists.some(artist=>artist.id===work.artistId&&!artist.archived));
    assert(replacement,'A visible sculpture is required for the homepage');
    next.site.featuredWorkId=replacement.id;
  }
  return next;
}

export async function publishSoldAndArchiveTallAttention({db,origin,password,publicOrigin,fetchImpl=fetch}){
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
    assert(response.ok,'Availability and archive publication '+path+': HTTP '+response.status);
    return response.json();
  };
  let state=await api('content');
  if(state.unpublished)return {skipped:'unpublished-draft-present'};
  const next=prepareSoldAndArchiveTallAttention(state.draft);
  if(JSON.stringify(next)!==JSON.stringify(state.draft)){
    state=await api('content',{revision:state.revision,catalog:next});
    state=await api('publish',{revision:state.revision});
  }
  const live=await api('content.json',undefined,false);
  for(const id of soldWorkIds){
    assert.equal(live.works.find(work=>work.id===id)?.availability,'sold','Unsold public sculpture: '+id);
  }
  assert(!live.works.some(work=>work.id===archivedWorkId),'Tall Attention remains public');
  assert((live.collections||[]).every(collection=>!collection.workIds.includes(archivedWorkId)),
    'Tall Attention remains in a collection');
  const sitemap=await fetchImpl(new URL('/sitemap.xml',local),{redirect:'error',signal:AbortSignal.timeout(30000)});
  assert(sitemap.ok,'Cannot verify public sitemap');
  assert(!(await sitemap.text()).includes('/works/tall-attention'),'Tall Attention remains in sitemap');
  const oldPage=await fetchImpl(new URL('/works/tall-attention',local),{redirect:'error',signal:AbortSignal.timeout(30000)});
  assert.equal(oldPage.status,404,'Tall Attention page should no longer resolve');
  db.prepare('INSERT INTO settings(key,value) VALUES (?,?)').run(releaseId,
    JSON.stringify({revision:state.liveRevision,publishedAt:state.publishedAt,
      soldWorkIds,archivedWorkId}));
  return {published:true,revision:state.liveRevision,soldWorkIds,archivedWorkId};
}
