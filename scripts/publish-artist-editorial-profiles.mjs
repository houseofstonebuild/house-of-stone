import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

export const releaseId='owner-artist-editorial-profiles-2026-11-13';
export const releaseOrigins=['https://house-of-stone-production.up.railway.app','https://houseofmabwe.com'];
export const source=JSON.parse(readFileSync(new URL('../content/artist-editorial-profiles.json',import.meta.url),'utf8'));

const placeholder=(name,value)=>!value
  || value===name+' is a stone sculptor based in Zimbabwe. The artist sources their own stone and makes each sculpture by hand.'
  || value===name+' is represented by sculpture in the House of Stone collection.'
  || value===name+' is represented by sculpture in the House of Mabwe collection.'
  || value===name+' works in Zimbabwe, sourcing stone and carving each sculpture by hand.'
  || value==='Works whose individual maker is awaiting confirmation.'
  || value==='These sculptures were made by hand in Zimbabwe. Individual artist details will be added when confirmed.';

export function prepareArtistEditorialProfiles(current){
  const next=structuredClone(current);
  assert.equal(source.profiles.length,11,'Artist editorial source requires review');
  const updated=[];
  for(const profile of source.profiles){
    const names=[profile.name,...(profile.legacyName?[profile.legacyName]:[])];
    const matches=next.artists.filter(artist=>!artist.archived&&names.includes(artist.name));
    assert.equal(matches.length,1,'Expected one active artist for '+profile.name);
    const artist=matches[0];
    const assigned=next.works.filter(work=>!work.archived&&work.artistId===artist.id);
    assert(assigned.length>0,'Artist has no currently represented sculptures: '+profile.name);
    if(profile.kind==='artist-supplied'){
      // Newly supplied biographical material supersedes old placeholders; retain stable IDs/URLs.
      artist.name=profile.name;
      artist.description=profile.introduction;
      artist.biography=profile.biography;
      updated.push(artist.name);
    }else{
      assert.equal(profile.kind,'collection-interpretation','Unknown source category');
      // Never replace already verified or hand-edited artist biographies with interpretation.
      if(placeholder(artist.name,artist.biography)){
        artist.biography=profile.biography;
        if(placeholder(artist.name,artist.description))artist.description=profile.introduction;
        updated.push(artist.name);
      }
    }
  }
  // 'Within' was withdrawn. Preserve its identifier for historical records, but never
  // show it or an obsolete artist whose only represented work was Within.
  const within=next.works.find(work=>work.id==='zsa-017');
  if(within){
    within.archived=true;
    for(const collection of next.collections||[]){
      collection.workIds=collection.workIds.filter(id=>id!=='zsa-017');
      assert(collection.starWorkId!=='zsa-017','Within must not remain a featured sculpture');
    }
  }
  // This attribution appeared early in the project, before the owner identified the
  // actual sculptor of Protection Spirit as Tawanda Sere. Do not archive a maker who
  // is still assigned to any current work.
  const retired=next.artists.filter(artist=>!artist.archived&&artist.name==='Kudakwashe Nyamudeza');
  for(const artist of retired){
    if(!next.works.some(work=>!work.archived&&work.artistId===artist.id))artist.archived=true;
  }
  // The maker of Belonging/Tall Attention/Kissing Lovers has not yet been confirmed.
  // Their shared "Artist to be confirmed" record must be preserved, not invented.
  return next;
}

export async function publishArtistEditorialProfiles({db,origin,password,publicOrigin,fetchImpl=fetch}){
  if(!releaseOrigins.includes(publicOrigin))return {skipped:'different-service'};
  if(db.prepare('SELECT value FROM settings WHERE key=?').get(releaseId))return {skipped:'already-published'};
  const local=new URL(origin);
  assert(['127.0.0.1','localhost','[::1]'].includes(local.hostname),'Local publication only');
  const headers={Authorization:'Basic '+Buffer.from('admin:'+password).toString('base64'),
    'Content-Type':'application/json',Origin:publicOrigin};
  const api=async(path,data,admin=true)=>{
    const response=await fetchImpl(new URL((admin?'/api/admin/':'/')+path,local),{
      headers,redirect:'error',signal:AbortSignal.timeout(30000),
      ...(data?{method:'POST',body:JSON.stringify(data)}:{})});
    assert(response.ok,'Artist editorial '+path+': HTTP '+response.status);
    return response.json();
  };
  let state=await api('content');
  if(state.unpublished)return {skipped:'unpublished-draft-present'};
  const next=prepareArtistEditorialProfiles(state.draft);
  if(JSON.stringify(next)===JSON.stringify(state.draft)){
    db.prepare('INSERT INTO settings(key,value) VALUES (?,?)').run(releaseId,
      JSON.stringify({revision:state.liveRevision,unchanged:true}));
    return {skipped:'already-current'};
  }
  state=await api('content',{revision:state.revision,catalog:next});
  state=await api('publish',{revision:state.revision});
  const live=await api('content.json',undefined,false);
  assert(!live.works.some(work=>work.id==='zsa-017'),'Within must remain hidden');
  const retiredPublic=live.artists.find(artist=>artist.name==='Kudakwashe Nyamudeza');
  assert(!retiredPublic || live.works.some(work=>work.artistId===retiredPublic.id && work.id!=='zsa-017'),
    'An unrepresented Within artist must not remain public');
  for(const profile of source.profiles.filter(profile=>profile.kind==='artist-supplied')){
    const artist=live.artists.find(a=>a.name===profile.name);
    assert(artist&&artist.biography===profile.biography,'Sourced biography missing: '+profile.name);
  }
  db.prepare('INSERT INTO settings(key,value) VALUES (?,?)').run(releaseId,
    JSON.stringify({revision:state.liveRevision,publishedAt:state.publishedAt,profiles:source.profiles.length}));
  return {published:true,revision:state.liveRevision,profiles:source.profiles.length};
}
