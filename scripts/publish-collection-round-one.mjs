import assert from 'node:assert/strict';

// Owner-requested corrections, 2 November 2026. Stable work IDs and addresses
// retain enquiries and links; the approved interior campaigns are untouched.
export const releaseId='collection-round-one-2026-11-02';
export const releaseOrigin='https://house-of-stone-production.up.railway.app';
export const corrections=[
  {id:'zsa-013',titles:['Flame in Motion','Abstract'],title:'Abstract',artist:'Charles Manyaure'},
  {id:'zsa-021',titles:['Reaching','Dancers','Massaging'],title:'Massaging',artist:'Bernard Sakarombe',availability:'sold'},
  {id:'zsa-017',titles:['Within'],title:'Within',artist:'Kudakwashe Nyamudeza',availability:'sold'},
  {id:'zsa-001',titles:['Aperture','Witness'],title:'Witness',artist:'Philip Mlimu'}
];
const slug=value=>value.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
export function prepareCollectionRoundOne(current){
  const next=structuredClone(current);
  for(const fix of corrections){
    const work=next.works.find(work=>work.id===fix.id);
    assert(work&&!work.archived,'Missing visible work: '+fix.id);
    assert.equal(work.sourcePage,Number(fix.id.split('-')[1]),'Source page mismatch: '+fix.id);
    assert(fix.titles.includes(work.title),'A newer title needs review: '+fix.id);
    const original='/assets/zsa-page-'+String(work.sourcePage).padStart(2,'0')+'.jpg';
    const source='/assets/'+work.id+'-studio-front-v4.webp';
    const existing=next.assets[work.image];
    // A later owner photograph is never silently replaced.
    assert([original,source].includes(existing),'A newer photograph needs review: '+fix.id);
    const key=work.id+'-studio-front-v4';
    next.assets[key]=source;work.image=key;
    let artist=next.artists.find(artist=>artist.name===fix.artist&&!artist.archived);
    if(!artist){
      const id='verified-'+slug(fix.artist),address=slug(fix.artist);
      assert(!next.artists.some(artist=>artist.id===id||artist.slug===address),'Artist identifier conflict: '+fix.artist);
      artist={id,slug:address,name:fix.artist,archived:false,portrait:key,studioImage:'',quote:'',practice:'',style:'',description:fix.artist+' is represented by sculpture in the House of Stone collection.',biography:'',story:''};
      next.artists.push(artist);
    }
    // Some verified artist records use a work photograph, not a portrait.
    if(next.assets[artist.portrait]===original)artist.portrait=key;
    work.title=fix.title;work.artistId=artist.id;
    if(fix.availability)work.availability=fix.availability;
    work.verification={...work.verification,title:true,artist:true,...(fix.availability?{availability:true}:{})};
    // Replacing the source photograph must not certify an inferred model.
    work.workingModel=false;work.verification.model=false;
    const note='Owner corrections and white-background photograph: 2 Nov 2026.';
    if(!String(work.internalNotes||'').includes(note))work.internalNotes=[work.internalNotes,note].filter(Boolean).join('\n');
  }
  return next;
}

export async function publishCollectionRoundOne({db,origin,password,publicOrigin,fetchImpl=fetch}){
  if(![releaseOrigin,'https://houseofmabwe.com'].includes(publicOrigin))return {skipped:'different-service'};
  if(db.prepare('SELECT value FROM settings WHERE key=?').get(releaseId))return {skipped:'already-published'};
  const local=new URL(origin);
  assert(['127.0.0.1','localhost','[::1]'].includes(local.hostname));
  const headers={Authorization:'Basic '+Buffer.from('admin:'+password).toString('base64'),'Content-Type':'application/json',Origin:publicOrigin};
  const api=async(path,data,admin=true)=>{
    const response=await fetchImpl(new URL((admin?'/api/admin/':'/')+path,local),{headers,redirect:'error',signal:AbortSignal.timeout(30000),...(data?{method:'POST',body:JSON.stringify(data)}:{})});
    assert(response.ok,'Collection round one '+path+': HTTP '+response.status);
    return response.json();
  };
  let state=await api('content');
  // Do not publish unrelated pending edits or replace an owner's draft.
  if(state.unpublished)return {skipped:'unpublished-draft-present'};
  state=await api('content',{revision:state.revision,catalog:prepareCollectionRoundOne(state.draft)});
  state=await api('publish',{revision:state.revision});
  const live=await api('content.json',undefined,false);
  for(const fix of corrections){
    const work=live.works.find(work=>work.id===fix.id);
    assert.equal(work?.title,fix.title,'Live title: '+fix.id);
    assert.equal(live.artists.find(artist=>artist.id===work.artistId)?.name,fix.artist,'Live artist: '+fix.id);
    if(fix.availability)assert.equal(work.availability,fix.availability,'Live status: '+fix.id);
    assert.equal(live.assets[work.image],'/assets/'+fix.id+'-studio-front-v4.webp','Live photograph: '+fix.id);
  }
  db.prepare('INSERT INTO settings(key,value) VALUES (?,?)').run(releaseId,JSON.stringify({revision:state.liveRevision,publishedAt:state.publishedAt,count:corrections.length}));
  return {published:true,revision:state.liveRevision,updatedWorks:corrections.length};
}
