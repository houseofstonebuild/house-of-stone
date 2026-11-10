import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

export const releaseId='owner-confirmed-artist-identities-2026-11-10';
export const releaseOrigins=['https://house-of-stone-production.up.railway.app','https://houseofmabwe.com'];
const ownerSource=JSON.parse(readFileSync(new URL('../content/artist-biography-sources.json',import.meta.url),'utf8'));
export const identityProfiles=ownerSource.profiles.filter(profile=>profile.status==='confirmed-alias');

const genericBiography=(name,value)=>!value
  || value===name+' is a stone sculptor based in Zimbabwe. The artist sources their own stone and makes each sculpture by hand.'
  || value===name+' is represented by sculpture in the House of Stone collection.';
const genericDescription=(name,value)=>!value
  || value===name+' works in Zimbabwe, sourcing stone and carving each sculpture by hand.'
  || value===name+' is represented by sculpture in the House of Stone collection.';

export function prepareConfirmedArtistIdentities(current){
  const next=structuredClone(current);
  const byName=name=>next.artists.filter(a=>!a.archived&&a.name===name);
  assert.equal(identityProfiles.length,2,'Only the two owner-confirmed identity corrections are authorized');
  const tawanda=identityProfiles.find(p=>p.sourceName==='Tawanda Mukonori Seremwe');
  const yusufu=identityProfiles.find(p=>p.sourceName==='Yusufu Jamare');
  assert(tawanda && tawanda.targetName==='Tawanda Sere','Tawanda identity confirmation changed');
  assert(yusufu && yusufu.targetName==='Yusufu Jamare','Yusufu identity confirmation changed');

  const tawandaMatches=byName('Tawanda Sere');
  assert.equal(tawandaMatches.length,1,'Expected exactly one Tawanda Sere artist');
  const artist=tawandaMatches[0];
  assert(genericBiography(artist.name,artist.biography)||artist.biography===tawanda.biography,
    'An existing personal Tawanda biography requires manual review');
  artist.biography=tawanda.biography;
  if(genericDescription(artist.name,artist.description)||artist.description===tawanda.introduction)
    artist.description=tawanda.introduction;

  // Keep one stable artist ID for historical inquiries and reassign both works.
  const primaryName='Yusufu Jemalo',duplicateName='Yusuf Jemali';
  const canonical=byName('Yusufu Jamare');
  let primary,duplicate;
  if(canonical.length===1){
    primary=canonical[0];
    const duplicates=byName(duplicateName);
    assert(duplicates.length<=1,'Duplicate legacy artist ambiguity');
    duplicate=duplicates[0];
    assert(!byName(primaryName).length,'An unrelated legacy Yusufu record is still active');
  }else{
    assert.equal(canonical.length,0,'Canonical Yusufu artist identity conflict');
    assert.equal(byName(primaryName).length,1,'Expected Yusufu Jemalo record');
    assert.equal(byName(duplicateName).length,1,'Expected Yusuf Jemali record');
    primary=byName(primaryName)[0];duplicate=byName(duplicateName)[0];
  }
  if(duplicate){
    assert(duplicate.id!==primary.id,'Cannot merge an artist into itself');
    const duplicateWorks=next.works.filter(w=>w.artistId===duplicate.id);
    assert(duplicateWorks.length>0,'The duplicate record must have its existing works');
    for(const work of duplicateWorks)work.artistId=primary.id;
    duplicate.archived=true; // Retain the historical record and its slug; never delete its ID.
  }
  assert(primary.slug==='yusufu-jemalo'||primary.slug==='yusufu-jamare','Unexpected primary artist slug');
  primary.name='Yusufu Jamare';
  primary.slug='yusufu-jamare';
  assert(genericBiography(primaryName,primary.biography)||genericBiography('Yusufu Jamare',primary.biography)||primary.biography===yusufu.biography,
    'An existing personal Yusufu biography requires manual review');
  primary.biography=yusufu.biography;
  if(genericDescription(primaryName,primary.description)||genericDescription('Yusufu Jamare',primary.description)||primary.description===yusufu.introduction)
    primary.description=yusufu.introduction;

  assert.equal(next.artists.filter(a=>!a.archived&&a.name==='Yusufu Jamare').length,1);
  assert.equal(next.artists.filter(a=>!a.archived&&['Yusufu Jemalo','Yusuf Jemali'].includes(a.name)).length,0);
  for(const id of ['zsa-028','zsa-029']){
    const work=next.works.find(w=>w.id===id&&!w.archived);
    assert(work && work.artistId===primary.id,'Unexpected sculpture attribution: '+id);
  }
  return next;
}

export async function publishConfirmedArtistIdentities({db,origin,password,publicOrigin,fetchImpl=fetch}){
  if(!releaseOrigins.includes(publicOrigin))return {skipped:'different-service'};
  if(db.prepare('SELECT value FROM settings WHERE key=?').get(releaseId))return {skipped:'already-published'};
  const local=new URL(origin);
  assert(['127.0.0.1','localhost','[::1]'].includes(local.hostname));
  const headers={Authorization:'Basic '+Buffer.from('admin:'+password).toString('base64'),
    'Content-Type':'application/json',Origin:publicOrigin};
  const api=async(path,data,admin=true)=>{
    const res=await fetchImpl(new URL((admin?'/api/admin/':'/')+path,local),{
      headers,redirect:'error',signal:AbortSignal.timeout(30000),
      ...(data?{method:'POST',body:JSON.stringify(data)}:{})});
    assert(res.ok,'Confirmed artists '+path+': HTTP '+res.status);
    return res.json();
  };
  let state=await api('content');
  if(state.unpublished)return {skipped:'unpublished-draft-present'};
  const next=prepareConfirmedArtistIdentities(state.draft);
  const liveBefore=state.draft;
  if(JSON.stringify(next)===JSON.stringify(liveBefore)){
    db.prepare('INSERT INTO settings(key,value) VALUES (?,?)').run(releaseId,JSON.stringify({revision:state.liveRevision,unchanged:true}));
    return {skipped:'already-current'};
  }
  state=await api('content',{revision:state.revision,catalog:next});
  state=await api('publish',{revision:state.revision});
  const live=await api('content.json',undefined,false);
  const tawanda=identityProfiles.find(p=>p.sourceName==='Tawanda Mukonori Seremwe');
  const yusufu=identityProfiles.find(p=>p.sourceName==='Yusufu Jamare');
  const confirmed=live.artists.find(a=>a.name==='Yusufu Jamare');
  assert(confirmed && confirmed.biography===yusufu.biography,'Yusufu biography missing');
  assert.equal(live.artists.find(a=>a.name==='Tawanda Sere')?.biography,tawanda.biography);
  assert.equal(live.artists.filter(a=>a.name==='Yusufu Jamare').length,1);
  for(const id of ['zsa-028','zsa-029'])assert.equal(live.works.find(w=>w.id===id)?.artistId,confirmed.id,'Work reassignment not published: '+id);
  db.prepare('INSERT INTO settings(key,value) VALUES (?,?)').run(releaseId,
    JSON.stringify({revision:state.liveRevision,publishedAt:state.publishedAt,canonicalArtistId:confirmed.id}));
  return {published:true,revision:state.liveRevision,canonicalArtistId:confirmed.id};
}
