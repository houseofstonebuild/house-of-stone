import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {source as editorialSource} from './publish-artist-editorial-profiles.mjs';

export const releaseId='owner-batsirai-martin-biographies-2026-11-19';
export const releaseOrigins=['https://house-of-stone-production.up.railway.app','https://houseofmabwe.com'];
export const source=JSON.parse(readFileSync(new URL('../content/artist-sourced-biographies-round-four.json',import.meta.url),'utf8'));
const editorialByName=new Map(editorialSource.profiles.map(profile=>[profile.name,profile]));

const isPlaceholder=(name,value)=>!value
  || value===name+' is a stone sculptor based in Zimbabwe. The artist sources their own stone and makes each sculpture by hand.'
  || value===name+' is represented by sculpture in the House of Stone collection.'
  || value===name+' is represented by sculpture in the House of Mabwe collection.'
  || value===name+' works in Zimbabwe, sourcing stone and carving each sculpture by hand.';

export function prepareArtistSourcedBiographiesRoundFour(current){
  const next=structuredClone(current);
  assert.deepEqual(source.profiles.map(p=>p.name),['Batsirai Chikukwa','Martin Matimura']);
  assert.deepEqual(source.profiles.map(p=>p.kind),['artist-supplied','owner-confirmed-memorial']);
  for(const profile of source.profiles){
    const matches=next.artists.filter(a=>!a.archived&&a.name===profile.name);
    assert.equal(matches.length,1,'One active artist record required: '+profile.name);
    const artist=matches[0];
    assert(next.works.some(w=>!w.archived&&w.artistId===artist.id),
      'No represented sculpture for '+profile.name);
    const old=editorialByName.get(profile.name);
    assert(old,'Missing older editorial reference: '+profile.name);
    // Do not replace an unrelated verified biography or private owner draft.
    const allowedBio=artist.biography===profile.biography
      || artist.biography===old.biography || isPlaceholder(profile.name,artist.biography);
    assert(allowedBio,'A separately edited biography requires manual review: '+profile.name);
    const allowedDescription=artist.description===profile.introduction
      || artist.description===old.introduction || isPlaceholder(profile.name,artist.description);
    artist.biography=profile.biography;
    if(allowedDescription)artist.description=profile.introduction;
    // Keep the artist's name, URL, portrait and all artwork relationships unchanged.
  }
  return next;
}

export async function publishArtistSourcedBiographiesRoundFour({db,origin,password,publicOrigin,fetchImpl=fetch}){
  if(!releaseOrigins.includes(publicOrigin))return {skipped:'different-service'};
  if(db.prepare('SELECT value FROM settings WHERE key=?').get(releaseId))return {skipped:'already-published'};
  const local=new URL(origin);
  assert(['127.0.0.1','localhost','[::1]'].includes(local.hostname),'Only local authenticated publication is allowed');
  const headers={Authorization:'Basic '+Buffer.from('admin:'+password).toString('base64'),
    'Content-Type':'application/json',Origin:publicOrigin};
  const api=async(path,data,admin=true)=>{
    const response=await fetchImpl(new URL((admin?'/api/admin/':'/')+path,local),{
      headers,redirect:'error',signal:AbortSignal.timeout(30000),
      ...(data?{method:'POST',body:JSON.stringify(data)}:{})});
    assert(response.ok,'Batsirai/Martin biographies '+path+': HTTP '+response.status);
    return response.json();
  };
  let state=await api('content');
  if(state.unpublished)return {skipped:'unpublished-draft-present'};
  const next=prepareArtistSourcedBiographiesRoundFour(state.draft);
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
    assert(artist&&artist.biography===profile.biography,
      'Published biography missing: '+profile.name);
    assert(live.works.some(w=>w.artistId===artist.id),
      'Existing artwork attribution was lost: '+profile.name);
  }
  db.prepare('INSERT INTO settings(key,value) VALUES (?,?)').run(releaseId,
    JSON.stringify({revision:state.liveRevision,publishedAt:state.publishedAt,names:source.profiles.map(p=>p.name)}));
  return {published:true,revision:state.liveRevision,names:source.profiles.map(p=>p.name)};
}
