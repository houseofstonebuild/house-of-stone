import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {source as editorialSource} from './publish-artist-editorial-profiles.mjs';

export const releaseId='owner-sourced-biographies-round-three-2026-11-17';
export const releaseOrigins=['https://house-of-stone-production.up.railway.app','https://houseofmabwe.com'];
export const source=JSON.parse(readFileSync(new URL('../content/artist-sourced-biographies-round-three.json',import.meta.url),'utf8'));
const editorialByName=new Map(editorialSource.profiles.map(p=>[p.name,p]));

const placeholder=(name,value)=>!value ||
  value===name+' is a stone sculptor based in Zimbabwe. The artist sources their own stone and makes each sculpture by hand.' ||
  value===name+' is represented by sculpture in the House of Stone collection.' ||
  value===name+' is represented by sculpture in the House of Mabwe collection.' ||
  value===name+' works in Zimbabwe, sourcing stone and carving each sculpture by hand.';

export function prepareArtistSourcedBiographiesRoundThree(current){
  const next=structuredClone(current);
  assert.deepEqual(source.profiles.map(p=>p.name),['Bernard Sakarombe','Charles Manyaura']);
  for(const profile of source.profiles){
    assert.equal(profile.kind,'artist-supplied');
    const existingName=profile.legacyName||profile.name;
    const matches=next.artists.filter(a=>!a.archived&&(a.name===profile.name||a.name===existingName));
    assert.equal(matches.length,1,'One matching active artist required: '+profile.name);
    const artist=matches[0];
    assert(next.works.some(w=>!w.archived&&w.artistId===artist.id),'Artist has no active sculpture: '+profile.name);
    const editorial=editorialByName.get(existingName);
    const oldBio=artist.biography;
    const allowedBio=oldBio===profile.biography || placeholder(existingName,oldBio) ||
      placeholder(profile.name,oldBio) || (editorial&&oldBio===editorial.biography);
    assert(allowedBio,'An independently edited biography requires manual review: '+profile.name);
    const allowedIntro=artist.description===profile.introduction ||
      placeholder(existingName,artist.description)||placeholder(profile.name,artist.description) ||
      (editorial&&artist.description===editorial.introduction);
    if(profile.legacyName){
      assert(['charles-manyaure','charles-manyaura'].includes(artist.slug),
        'Unexpected Charles artist URL');
      assert(!next.artists.some(a=>a.id!==artist.id&&!a.archived&&a.slug==='charles-manyaura'),
        'Canonical artist URL conflicts with existing artist');
      artist.name=profile.name;
      artist.slug='charles-manyaura';
    }
    artist.biography=profile.biography;
    if(allowedIntro)artist.description=profile.introduction;
  }
  return next;
}

export async function publishArtistSourcedBiographiesRoundThree({db,origin,password,publicOrigin,fetchImpl=fetch}){
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
    assert(response.ok,'Artist source biographies '+path+': HTTP '+response.status);
    return response.json();
  };
  let state=await api('content');
  if(state.unpublished)return {skipped:'unpublished-draft-present'};
  const next=prepareArtistSourcedBiographiesRoundThree(state.draft);
  if(JSON.stringify(next)===JSON.stringify(state.draft)){
    db.prepare('INSERT INTO settings(key,value) VALUES (?,?)').run(releaseId,
      JSON.stringify({revision:state.liveRevision,unchanged:true}));
    return {skipped:'already-current'};
  }
  state=await api('content',{revision:state.revision,catalog:next});
  state=await api('publish',{revision:state.revision});
  const live=await api('content.json',undefined,false);
  for(const profile of source.profiles){
    const artist=live.artists.find(a=>a.name===profile.name);
    assert(artist&&artist.biography===profile.biography,'Artist biography not live: '+profile.name);
  }
  assert(!live.artists.some(a=>a.name==='Charles Manyaure'),'Legacy artist name must no longer appear');
  db.prepare('INSERT INTO settings(key,value) VALUES (?,?)').run(releaseId,
    JSON.stringify({revision:state.liveRevision,publishedAt:state.publishedAt,names:source.profiles.map(p=>p.name)}));
  return {published:true,revision:state.liveRevision,names:source.profiles.map(p=>p.name)};
}
