import test from 'node:test';
import assert from 'node:assert/strict';
import {source,prepareVerifiedArtistBiographies,releaseId,releaseOrigins} from '../scripts/publish-verified-artist-biographies.mjs';
import {source as editorialSource} from '../scripts/publish-artist-editorial-profiles.mjs';

function fixture(){
  const artists=source.profiles.map((profile,index)=>{
    const existing=editorialSource.profiles.find(p=>p.name===(profile.legacyName||profile.name));
    assert(existing,'Editorial fixture missing: '+profile.name);
    return {
      id:'artist-'+index,
      slug:profile.legacySlug||profile.name.toLowerCase().replaceAll(' ','-'),
      name:profile.legacyName||profile.name,
      description:existing.introduction,
      biography:existing.biography,
      archived:false,
      portrait:'photo-'+index,
    };
  });
  artists.push({
    id:'artist-elsewhere',slug:'donald-chapenga',name:'Donald Chapenga',
    biography:'An existing verified biography.',archived:false
  });
  const works=artists.slice(0,3).map((a,index)=>({
    id:['zsa-009','zsa-016','hos-queen-mother'][index],
    title:['Blooming','Wingbeat','Queen Mother'][index],
    slug:['blooming','wingbeat','queen-mother'][index],
    artistId:a.id,archived:false,
  }));
  return {artists,works,collections:[{id:'presence',workIds:['hos-queen-mother']}],
    assets:{logo:'/assets/logo.png'}};
}

test('three sourced biographies replace collection interpretations without changing artwork assignment',()=>{
  assert.deepEqual(source.profiles.map(p=>p.name),
    ['Spencer Chigombe','Thomas Nyasoka','Tinodashe Mangenda']);
  const before=fixture(),after=prepareVerifiedArtistBiographies(before);
  for(const profile of source.profiles){
    const artist=after.artists.find(a=>a.name===profile.name);
    assert(artist,profile.name);
    assert.equal(artist.biography,profile.biography);
    assert.equal(artist.description,profile.introduction);
    const old=before.artists.find(a=>a.id===artist.id);
    assert(old);
  }
  const oldSpencer=before.artists.find(a=>a.name==='Spencer Rusike');
  const newSpencer=after.artists.find(a=>a.name==='Spencer Chigombe');
  assert.equal(oldSpencer.id,newSpencer.id);
  assert.equal(newSpencer.slug,'spencer-chigombe');
  assert(!after.artists.some(a=>a.name==='Spencer Rusike'&&!a.archived));
  assert.equal(after.works.find(w=>w.id==='zsa-009').artistId,oldSpencer.id);
  assert.deepEqual(before.works,after.works,'Artwork attributions and IDs must not change');
  assert.deepEqual(before.assets,after.assets);
  assert.equal(after.artists.find(a=>a.name==='Donald Chapenga').biography,'An existing verified biography.');
  assert.deepEqual(prepareVerifiedArtistBiographies(after),after,'Publication must be idempotent');
  assert(before.artists.some(a=>a.name==='Spencer Rusike'),'No mutation of input');
});

test('a previously hand-edited biography prevents silent overwriting',()=>{
  const before=fixture();
  before.artists.find(a=>a.name==='Thomas Nyasoka').biography='An independent verified artist biography.';
  assert.throws(()=>prepareVerifiedArtistBiographies(before),/requires manual review/);
});

test('an explicitly edited introduction is preserved even when the generic biography is replaced',()=>{
  const before=fixture();
  before.artists.find(a=>a.name==='Tinodashe Mangenda').description='A newer owner-approved introduction.';
  const after=prepareVerifiedArtistBiographies(before);
  const artist=after.artists.find(a=>a.name==='Tinodashe Mangenda');
  assert.equal(artist.description,'A newer owner-approved introduction.');
  assert.equal(artist.biography,source.profiles.find(p=>p.name===artist.name).biography);
});

test('a competing canonical slug or missing sculpture blocks an ambiguous identity merge',()=>{
  const duplicate=fixture();
  duplicate.artists.push({id:'another',name:'Other Artist',slug:'spencer-chigombe',archived:false});
  assert.throws(()=>prepareVerifiedArtistBiographies(duplicate),/already in use/);
  const missing=fixture(); missing.works=missing.works.filter(w=>w.id!=='zsa-009');
  assert.throws(()=>prepareVerifiedArtistBiographies(missing),/lacks a visible sculpture/);
  assert.equal(releaseId,'owner-verified-artist-biographies-2026-11-14');
  assert(releaseOrigins.includes('https://houseofmabwe.com'));
});

test('the supplied sources contain no public contact details or age that goes stale',()=>{
  for(const profile of source.profiles){
    assert(!/\+263|0718490867|071[0-9]{7}|@gmail\.com/.test(profile.biography));
    assert(!/21.year.old/.test(profile.biography));
  }
});
