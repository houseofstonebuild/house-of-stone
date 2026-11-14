import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {source as editorialSource} from './publish-artist-editorial-profiles.mjs';

export const releaseId='owner-verified-artist-biographies-2026-11-14';
export const releaseOrigins=['https://house-of-stone-production.up.railway.app','https://houseofmabwe.com'];
export const source=JSON.parse(readFileSync(new URL('../content/artist-sourced-biographies-round-two.json',import.meta.url),'utf8'));
const editorialByName=new Map(editorialSource.profiles.map(profile=>[profile.name,profile]));

const isPlaceholder=(name,value)=>!value
  || value===name+' is a stone sculptor based in Zimbabwe. The artist sources their own stone and makes each sculpture by hand.'
  || value===name+' is represented by sculpture in the House of Stone collection.'
  || value===name+' is represented by sculpture in the House of Mabwe collection.'
  || value===name+' works in Zimbabwe, sourcing stone and carving each sculpture by hand.';

export function prepareVerifiedArtistBiographies(current){
  const next=structuredClone(current);
  assert.deepEqual(source.profiles.map(p=>p.name),
    ['Spencer Chigombe','Thomas Nyasoka','Tinodashe Mangenda']);
  for(const profile of source.profiles){
    assert.equal(profile.kind,'artist-supplied','A source biography is required');
    const legacy=profile.legacyName||profile.name;
    const matches=next.artists.filter(artist=>!artist.archived&&[profile.name,legacy].includes(artist.name));
    assert.equal(matches.length,1,'Expected one artist record for '+profile.name);
    const artist=matches[0];
    assert(next.works.some(work=>!work.archived&&work.artistId===artist.id),
      'Artist lacks a visible sculpture: '+profile.name);
    const old=editorialByName.get(legacy);
    assert(old,'Existing editorial reference missing: '+legacy);
    // Do not replace a different, hand-edited biography without review.
    assert(artist.biography===profile.biography
      || artist.biography===old.biography
      || isPlaceholder(legacy,artist.biography)
      || isPlaceholder(profile.name,artist.biography),
      'An independently edited biography requires manual review: '+profile.name);
    const introMayChange=artist.description===profile.introduction
      || artist.description===old.introduction
      || isPlaceholder(legacy,artist.description)
      || isPlaceholder(profile.name,artist.description);
    if(profile.legacyName){
      assert(profile.slug&&profile.legacySlug,'A historical identity needs both page slugs');
      assert([profile.legacySlug,profile.slug].includes(artist.slug),
        'Unexpected artist address for '+profile.name);
      assert(!next.artists.some(a=>a.id!==artist.id&&!a.archived&&a.slug===profile.slug),
        'The canonical artist page address is already in use');
      artist.name=profile.name;
      artist.slug=profile.slug;
    }
    if(introMayChange)artist.description=profile.introduction;
    artist.biography=profile.biography;
  }
  assert.equal(next.artists.filter(a=>!a.archived&&a.name==='Spencer Chigombe').length,1);
  assert(!next.artists.some(a=>!a.archived&&a.name==='Spencer Rusike'));
  return next;
}

export async function publishVerifiedArtistBiographies({db,origin,password,publicOrigin,fetchImpl=fetch}){
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
    assert(response.ok,'Verified artist biographies '+path+': HTTP '+response.status);
    return response.json();
  };
  let state=await api('content');
  if(state.unpublished)return {skipped:'unpublished-draft-present'};
  const next=prepareVerifiedArtistBiographies(state.draft);
  if(JSON.stringify(next)===JSON.stringify(state.draft)){
    db.prepare('INSERT INTO settings(key,value) VALUES (?,?)').run(releaseId,
      JSON.stringify({revision:state.liveRevision,unchanged:true}));
    return {skipped:'already-current'};
  }
  state=await api('content',{revision:state.revision,catalog:next});
  state=await api('publish',{revision:state.revision});
  const live=await api('content.json',undefined,false);
  assert(!live.artists.some(a=>a.name==='Spencer Rusike'));
  const spencer=live.artists.find(a=>a.name==='Spencer Chigombe');
  assert.equal(spencer?.slug,'spencer-chigombe','Canonical Spencer page missing');
  for(const profile of source.profiles){
    const artist=live.artists.find(a=>a.name===profile.name);
    assert(artist && artist.biography===profile.biography,
      'Verified artist biography not published: '+profile.name);
  }
  db.prepare('INSERT INTO settings(key,value) VALUES (?,?)').run(releaseId,
    JSON.stringify({revision:state.liveRevision,publishedAt:state.publishedAt,names:source.profiles.map(p=>p.name)}));
  return {published:true,revision:state.liveRevision,names:source.profiles.map(p=>p.name)};
}
