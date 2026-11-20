import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {source as editorialSource} from './publish-artist-editorial-profiles.mjs';

export const releaseId='owner-douglas-musekiwa-biography-2026-11-20';
export const releaseOrigins=['https://house-of-stone-production.up.railway.app','https://houseofmabwe.com'];
export const source=JSON.parse(readFileSync(new URL('../content/artist-sourced-biographies-round-five.json',import.meta.url),'utf8'));
const editorial=editorialSource.profiles.find(p=>p.name==='Douglas Musekiwa');

const placeholder=(name,value)=>!value ||
  value===name+' is a stone sculptor based in Zimbabwe. The artist sources their own stone and makes each sculpture by hand.' ||
  value===name+' is represented by sculpture in the House of Stone collection.' ||
  value===name+' is represented by sculpture in the House of Mabwe collection.' ||
  value===name+' works in Zimbabwe, sourcing stone and carving each sculpture by hand.';

export function prepareDouglasMusekiwaBiography(current){
  const next=structuredClone(current);
  assert.equal(source.profiles.length,1,'Expected one Douglas Musekiwa biography');
  const profile=source.profiles[0];
  assert.equal(profile.name,'Douglas Musekiwa');
  assert.equal(profile.kind,'artist-supplied');
  assert(editorial,'Existing editorial entry missing');
  const matches=next.artists.filter(a=>!a.archived&&a.name===profile.name);
  assert.equal(matches.length,1,'Exactly one active Douglas Musekiwa artist required');
  const artist=matches[0];
  const works=next.works.filter(w=>!w.archived&&w.artistId===artist.id);
  assert(works.some(w=>w.id==='zsa-006'),'Douglas Musekiwa must remain credited on Coil');
  assert(artist.biography===profile.biography ||
    artist.biography===editorial.biography || placeholder(artist.name,artist.biography),
    'An independently edited Douglas biography requires manual review');
  const descriptionCanChange=artist.description===profile.introduction ||
    artist.description===editorial.introduction || placeholder(artist.name,artist.description);
  artist.biography=profile.biography;
  if(descriptionCanChange)artist.description=profile.introduction;
  return next;
}

export async function publishDouglasMusekiwaBiography({db,origin,password,publicOrigin,fetchImpl=fetch}){
  if(!releaseOrigins.includes(publicOrigin))return {skipped:'different-service'};
  if(db.prepare('SELECT value FROM settings WHERE key=?').get(releaseId))return {skipped:'already-published'};
  const local=new URL(origin);
  assert(['127.0.0.1','localhost','[::1]'].includes(local.hostname),'Only local authenticated publication allowed');
  const headers={Authorization:'Basic '+Buffer.from('admin:'+password).toString('base64'),
    'Content-Type':'application/json',Origin:publicOrigin};
  const api=async(path,data,admin=true)=>{
    const response=await fetchImpl(new URL((admin?'/api/admin/':'/')+path,local),{
      headers,redirect:'error',signal:AbortSignal.timeout(30000),
      ...(data?{method:'POST',body:JSON.stringify(data)}:{})});
    assert(response.ok,'Douglas biography '+path+': HTTP '+response.status);
    return response.json();
  };
  let state=await api('content');
  if(state.unpublished)return {skipped:'unpublished-draft-present'};
  const next=prepareDouglasMusekiwaBiography(state.draft);
  if(JSON.stringify(next)===JSON.stringify(state.draft)){
    db.prepare('INSERT INTO settings(key,value) VALUES (?,?)').run(releaseId,
      JSON.stringify({revision:state.liveRevision,unchanged:true}));
    return {skipped:'already-current'};
  }
  state=await api('content',{revision:state.revision,catalog:next});
  state=await api('publish',{revision:state.revision});
  const live=await api('content.json',undefined,false);
  const artist=live.artists.find(a=>a.name==='Douglas Musekiwa');
  assert(artist&&artist.biography===source.profiles[0].biography,'Live Douglas biography mismatch');
  assert(live.works.some(w=>w.id==='zsa-006'&&w.artistId===artist.id),'Coil attribution changed');
  db.prepare('INSERT INTO settings(key,value) VALUES (?,?)').run(releaseId,
    JSON.stringify({revision:state.liveRevision,publishedAt:state.publishedAt,artist:artist.name}));
  return {published:true,revision:state.liveRevision,name:artist.name};
}
