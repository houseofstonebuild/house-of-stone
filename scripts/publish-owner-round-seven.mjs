import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

export const releaseId='owner-round-seven-2026-11-08';
const allowedOrigins=['https://house-of-stone-production.up.railway.app','https://houseofmabwe.com'];
const story=JSON.parse(readFileSync(new URL('../public/story.json',import.meta.url),'utf8'));

export function prepareOwnerRoundSeven(current){
  const next=structuredClone(current);
  const work=id=>{const item=next.works.find(w=>w.id===id&&!w.archived);assert(item,'Missing sculpture: '+id);return item;};
  const artist=next.artists.find(a=>a.name==='Tawanda Sere'&&!a.archived);assert(artist,'Tawanda Sere is missing');
  for(const id of ['zsa-017','zsa-031']){const item=work(id);item.artistId=artist.id;item.verification={...item.verification,artist:true};}
  for(const [id,title] of Object.entries({'hos-belonging':'Belonging','hos-inner-beauty':'Inner Beauty','zsa-013':'Open Flame','zsa-029':'Open Curls','zsa-028':'Red Interlace','zsa-014':'Paired Reflection'})){
    const item=work(id);item.title=title;item.verification={...item.verification,title:true};
  }
  const inner=work('hos-inner-beauty');inner.artistId=next.artists.find(a=>a.name==='Philip Mlimu'&&!a.archived)?.id;
  assert(inner.artistId,'Philip Mlimu is missing');inner.verification={...inner.verification,artist:true};
  const oldMan=work('zsa-027');oldMan.title='The Old Man';oldMan.material='Springstone';oldMan.verification={...oldMan.verification,title:true,material:true};
  const lovers=work('zsa-020');lovers.material='Springstone';lovers.verification={...lovers.verification,material:true};
  const queen=work('hos-queen-mother');queen.dimensions='45 × ~25 cm';queen.verification={...queen.verification,dimensions:false};
  queen.internalNotes=(queen.internalNotes||'')+' Owner-confirmed height 45 cm; approximate width 25 cm inferred from front photo silhouette, not a physical measurement.';
  for(const [id,dimensions] of [['zsa-001','40 × 25 cm'],['hos-inner-beauty','40 × 14 cm']]){
    const item=work(id);item.dimensions=dimensions;item.verification={...item.verification,dimensions:true};
  }
  for(const item of next.works){
    item.yearMade='';item.verification={...item.verification,yearMade:false};
    if(item.archived)continue;
    if(story.works[item.id]?.editorialShort){item.description=story.works[item.id].editorialShort;item.workingContent=true;}
    item.availability=['zsa-026','zsa-023'].includes(item.id)?'sold':'available';
    item.verification.availability=true;
  }
  next.site.name='House of Mabwe';
  next.site.description='Explore Zimbabwean stone sculpture, meet the artists and learn how the works are made. Inquire about individual sculptures.';
  next.site.presentation||={};
  for(const key of ['making','house','designers','collectors']){
    const page=story.pages[key],current=next.site.presentation[key]||{};
    next.site.presentation[key]={...current,title:page.heroTitle,intro:page.heroBody};
    if(page.steps)next.site.presentation[key].steps=page.steps.map(step=>({title:step.title,text:step.body}));
  }
  const making=story.pages.making;
  next.site.presentation.making.steps=making.sections.map(section=>({title:section.heading,text:section.body}));
  next.site.presentation.making.gallery=making.sections.map(section=>({image:section.image.replace(/\.webp$/,''),caption:section.caption}));
  for(const section of making.sections)next.assets[section.image.replace(/\.webp$/,'')]='/assets/'+section.image;
  for(const collection of next.collections||[]){
    const copy=story.collections[collection.id];if(!copy)continue;
    collection.description=copy.card;collection.introduction=copy.intro;
  }
  // Existing unverified stone labels remain proposals; do not turn visual inference into verification.
  return next;
}

export async function publishOwnerRoundSeven({db,origin,password,publicOrigin,fetchImpl=fetch}){
  if(!allowedOrigins.includes(publicOrigin))return {skipped:'different-service'};
  if(db.prepare('SELECT value FROM settings WHERE key=?').get(releaseId))return {skipped:'already-published'};
  const local=new URL(origin);assert(['127.0.0.1','localhost','[::1]'].includes(local.hostname));
  const headers={Authorization:'Basic '+Buffer.from('admin:'+password).toString('base64'),'Content-Type':'application/json',Origin:publicOrigin};
  const api=async(path,data,admin=true)=>{const r=await fetchImpl(new URL((admin?'/api/admin/':'/')+path,local),{headers,redirect:'error',signal:AbortSignal.timeout(30000),...(data?{method:'POST',body:JSON.stringify(data)}:{})});assert(r.ok,'Owner round seven '+path+': HTTP '+r.status);return r.json();};
  let state=await api('content');if(state.unpublished)return {skipped:'unpublished-draft-present'};
  state=await api('content',{revision:state.revision,catalog:prepareOwnerRoundSeven(state.draft)});
  state=await api('publish',{revision:state.revision});
  const live=await api('content.json',undefined,false),byId=id=>live.works.find(w=>w.id===id);
  assert.equal(live.artists.find(a=>a.id===byId('zsa-017').artistId)?.name,'Tawanda Sere');
  assert.equal(byId('zsa-027').material,'Springstone');assert.equal(byId('zsa-026').availability,'sold');
  assert.equal(byId('zsa-023').availability,'sold');assert.equal(byId('zsa-013').availability,'available');
  assert(live.works.every(w=>!w.yearMade));
  db.prepare('INSERT INTO settings(key,value) VALUES (?,?)').run(releaseId,JSON.stringify({revision:state.liveRevision,publishedAt:state.publishedAt}));
  return {published:true,revision:state.liveRevision};
}
