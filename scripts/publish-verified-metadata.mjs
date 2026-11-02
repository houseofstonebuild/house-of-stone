import assert from 'node:assert/strict';

// Owner-supplied ZSA/William WhatsApp identifiers, IMG_8627–IMG_8631.
// Matching is by photographed sculpture, never by photoshoot number.
export const releaseId='supplier-metadata-verified-2026-11-01';
export const releaseOrigin='https://house-of-stone-production.up.railway.app';
export const corrections=[
 ['zsa-025','Turning Line','Abstract Flower','Takunda Chiripanganga','Leopard rock','IMG_8627'],
 ['zsa-009','Orbit','Blooming','Spencer Rusike','Springstone','IMG_8627'],
 ['zsa-024','Family Circle','Family','Donald Chapenga','Serpentine','IMG_8627'],
 ['zsa-016','Wingbeat','Happy Times','Thomas Nyasoka','Springstone','IMG_8628'],
 ['zsa-026','Crowned','Reflection','Philip Mlimu','Springstone','IMG_8628'],
 ['zsa-010','A Kiss','Sisters','Philip Mlimu','Springstone','IMG_8628'],
 ['zsa-002','Two Surfaces','Lovers','Philip Mlimu','Springstone','IMG_8628'],
 ['zsa-001','Aperture',null,'Philip Mlimu',null,'IMG_8628'],
 ['zsa-018','Listening','Rabbit','John Gurira','Springstone','IMG_8629'],
 ['zsa-014','Shared Horizon','Reflection','Martin Matimura','Green Opal','IMG_8629'],
 ['zsa-021','Reaching','Dancers','Donald Chapenga','Springstone','IMG_8629'],
 ['zsa-013','Flame in Motion','Abstract','Charles Manyaure','Green Opal','IMG_8629'],
 ['zsa-020','Held','Lovers','Chamu Rumano',null,'IMG_8629'],
 ['zsa-005','In Company','Birds','Chamu Rumano','Green Opal','IMG_8630'],
 ['zsa-028','Red Current','Abstract','Yusufu Jemalo','Red Jasper','IMG_8630'],
 ['zsa-006','Spiral Bird','Coil','Douglas Musekiwa','Springstone','IMG_8630'],
 ['zsa-012','Earthward','Chiefs Head','Tawanda Sere','Green Opal','IMG_8630'],
 ['zsa-023','Ascending','Reflection','Luckmore Joseph','Springstone','IMG_8631'],
 ['zsa-029','Unfurl','Abstract','Yusuf Jemali','Springstone','IMG_8631']
];
const slug=s=>s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
export function prepareVerifiedMetadata(current){
 const next=structuredClone(current),byId=new Map(next.works.map(w=>[w.id,w]));
 const seen=new Set();
 for(const [id,oldTitle,title,name,stone,shot] of corrections){
  assert(!seen.has(id),'Duplicate source work: '+id);seen.add(id);
  const w=byId.get(id);
  assert(w&&!w.archived,'Missing visible work: '+id);
  assert.equal(w.sourcePage,Number(id.split('-')[1]),'Source page mismatch: '+id);
  assert([oldTitle,title].filter(Boolean).includes(w.title),'Newer title must not be overwritten: '+id);
  let artist=next.artists.find(a=>a.name===name&&!a.archived);
  if(!artist){
   const aid='verified-'+slug(name);
   assert(!next.artists.some(a=>a.id===aid||a.slug===slug(name)),'Artist identifier conflict: '+name);
   artist={id:aid,slug:slug(name),name,archived:false,portrait:w.image,
    studioImage:'',quote:'',practice:'',style:'',
    // The image is an identified work by the sculptor, not a claimed portrait.
    description:name+' is represented by sculpture in the House of Stone collection.',
    biography:'',story:''};
   next.artists.push(artist);
  }
  w.artistId=artist.id;
  if(title)w.title=title;
  if(stone)w.material=stone;
  w.verification={...w.verification,artist:true,...(title?{title:true}:{}),...(stone?{material:true}:{})};
  const note='Supplier metadata: '+shot+' (1 Nov 2026).';
  if(!String(w.internalNotes||'').includes(note))w.internalNotes=[w.internalNotes,note].filter(Boolean).join('\n');
 }
 const assigned=new Set(next.works.filter(w=>!w.archived).map(w=>w.artistId));
 for(const a of next.artists)if(['tariro','kuda','ruvimbo','farai','tendai'].includes(a.id)&&!assigned.has(a.id))a.archived=true;
 assert.equal(seen.size,19);
 return next;
}
export async function publishVerifiedMetadata({db,origin,password,publicOrigin,fetchImpl=fetch}){
 if(publicOrigin!==releaseOrigin)return {skipped:'different-service'};
 if(db.prepare('SELECT value FROM settings WHERE key=?').get(releaseId))return {skipped:'already-published'};
 const local=new URL(origin);
 assert(['127.0.0.1','localhost','[::1]'].includes(local.hostname));
 const headers={Authorization:'Basic '+Buffer.from('admin:'+password).toString('base64'),
  'Content-Type':'application/json',Origin:publicOrigin};
 const api=async(path,data,admin=true)=>{
  const response=await fetchImpl(new URL((admin?'/api/admin/':'/')+path,local),{
   headers,redirect:'error',signal:AbortSignal.timeout(30000),
   ...(data?{method:'POST',body:JSON.stringify(data)}:{})});
  assert(response.ok,'Verified metadata '+path+': HTTP '+response.status);
  return response.json();
 };
 let state=await api('content');
 // A pending edit must not be silently included in this publication.
 if(state.unpublished)return {skipped:'unpublished-draft-present'};
 const next=prepareVerifiedMetadata(state.draft);
 state=await api('content',{revision:state.revision,catalog:next});
 state=await api('publish',{revision:state.revision});
 const live=await api('content.json',undefined,false);
 for(const [id,,title,name,stone] of corrections){
  const w=live.works.find(w=>w.id===id),a=live.artists.find(a=>a.id===w?.artistId);
  assert(w&&a?.name===name,'Live artist not confirmed: '+id);
  if(title)assert.equal(w.title,title,'Live title not confirmed: '+id);
  if(stone)assert.equal(w.material,stone,'Live stone not confirmed: '+id);
 }
 db.prepare('INSERT INTO settings(key,value) VALUES (?,?)').run(releaseId,
  JSON.stringify({revision:state.liveRevision,publishedAt:state.publishedAt,count:corrections.length}));
 return {published:true,revision:state.liveRevision,updatedWorks:corrections.length};
}
