import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

export const releaseId='owner-artist-biographies-2026-11-10';
export const releaseOrigins=['https://house-of-stone-production.up.railway.app','https://houseofmabwe.com'];
export const source=JSON.parse(readFileSync(new URL('../content/artist-biography-sources.json',import.meta.url),'utf8'));
export const confirmedProfiles=source.profiles.filter(profile=>profile.status==='matched');

const oldBio=(name,value)=>!value ||
  value===name+' is a stone sculptor based in Zimbabwe. The artist sources their own stone and makes each sculpture by hand.' ||
  value===name+' is represented by sculpture in the House of Stone collection.';
const oldIntro=(name,value)=>!value ||
  value===name+' works in Zimbabwe, sourcing stone and carving each sculpture by hand.' ||
  value===name+' is represented by sculpture in the House of Stone collection.';

export function prepareOwnerArtistBiographies(current) {
  const next=structuredClone(current);
  assert.equal(confirmedProfiles.length,2,'Review the source file before broadening public matches');
  for(const profile of confirmedProfiles){
    assert(profile.sourceName===profile.targetName,'Only exact-name matches may be published');
    const matches=next.artists.filter(artist=>!artist.archived&&artist.name===profile.targetName);
    assert.equal(matches.length,1,'Artist identity requires review: '+profile.targetName);
    const artist=matches[0];
    assert(oldBio(artist.name,artist.biography)||artist.biography===profile.biography,
      'Existing non-placeholder biography requires manual review: '+artist.name);
    artist.biography=profile.biography;
    if(oldIntro(artist.name,artist.description)||artist.description===profile.introduction)
      artist.description=profile.introduction;
  }
  return next;
}

export async function publishOwnerArtistBiographies({db,origin,password,publicOrigin,fetchImpl=fetch}){
  if(!releaseOrigins.includes(publicOrigin))return {skipped:'different-service'};
  if(db.prepare('SELECT value FROM settings WHERE key=?').get(releaseId))return {skipped:'already-published'};
  const local=new URL(origin);
  assert(['127.0.0.1','localhost','[::1]'].includes(local.hostname),'Local publication only');
  const headers={Authorization:'Basic '+Buffer.from('admin:'+password).toString('base64'),
    'Content-Type':'application/json',Origin:publicOrigin};
  const api=async(path,data,admin=true)=>{
    const res=await fetchImpl(new URL((admin?'/api/admin/':'/')+path,local),{
      headers,redirect:'error',signal:AbortSignal.timeout(30000),
      ...(data?{method:'POST',body:JSON.stringify(data)}:{})});
    assert(res.ok,'Artist biographies '+path+': HTTP '+res.status);
    return res.json();
  };
  let state=await api('content');
  if(state.unpublished)return {skipped:'unpublished-draft-present'};
  const next=prepareOwnerArtistBiographies(state.draft);
  if(confirmedProfiles.every(profile=>{
    const old=state.draft.artists.find(artist=>!artist.archived&&artist.name===profile.targetName);
    const updated=next.artists.find(artist=>!artist.archived&&artist.name===profile.targetName);
    return old?.biography===updated?.biography&&old?.description===updated?.description;
  })){
    db.prepare('INSERT INTO settings(key,value) VALUES (?,?)').run(releaseId,JSON.stringify({revision:state.liveRevision,unchanged:true}));
    return {skipped:'already-current'};
  }
  state=await api('content',{revision:state.revision,catalog:next});
  state=await api('publish',{revision:state.revision});
  const live=await api('content.json',undefined,false);
  for(const profile of confirmedProfiles){
    const artist=live.artists.find(a=>!a.archived&&a.name===profile.targetName);
    assert.equal(artist?.biography,profile.biography,'Published biography missing: '+profile.targetName);
  }
  db.prepare('INSERT INTO settings(key,value) VALUES (?,?)').run(releaseId,
    JSON.stringify({revision:state.liveRevision,publishedAt:state.publishedAt,names:confirmedProfiles.map(p=>p.targetName)}));
  return {published:true,revision:state.liveRevision,names:confirmedProfiles.map(p=>p.targetName)};
}
