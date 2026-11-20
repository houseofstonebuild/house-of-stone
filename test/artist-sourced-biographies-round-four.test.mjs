import test from 'node:test';
import assert from 'node:assert/strict';
import {source,prepareArtistSourcedBiographiesRoundFour,releaseId,releaseOrigins} from '../scripts/publish-artist-sourced-biographies-round-four.mjs';
import {source as editorialSource} from '../scripts/publish-artist-editorial-profiles.mjs';

function fixture(){
  const artists=source.profiles.map((profile,index)=>{
    const prior=editorialSource.profiles.find(p=>p.name===profile.name);
    assert(prior);
    return {id:'artist-'+index,name:profile.name,slug:profile.name.toLowerCase().replaceAll(' ','-'),archived:false,
      biography:prior.biography,description:prior.introduction,portrait:'portrait-'+index,studioImage:''};
  });
  const works=artists.map((a,i)=>({id:i===0?'hos-celebration':'zsa-014',slug:i===0?'celebration':'zsa-page-14',
    title:i===0?'Celebration':'Paired Reflection',artistId:a.id,archived:false}));
  return {artists,works,collections:[{id:'presence',workIds:['zsa-014']}],assets:{existing:'/assets/example.webp'}};
}

test('Batsirai biography and Martin memorial replace only prior editorial profiles',()=>{
  assert.deepEqual(source.profiles.map(p=>p.name),['Batsirai Chikukwa','Martin Matimura']);
  assert.deepEqual(source.profiles.map(p=>p.kind),['artist-supplied','owner-confirmed-memorial']);
  const before=fixture(),after=prepareArtistSourcedBiographiesRoundFour(before);
  for(const profile of source.profiles){
    const artist=after.artists.find(a=>a.name===profile.name);
    assert(artist);
    assert.equal(artist.biography,profile.biography);
    assert.equal(artist.description,profile.introduction);
    assert.equal(artist.slug,before.artists.find(a=>a.id===artist.id).slug);
    assert.equal(artist.portrait,before.artists.find(a=>a.id===artist.id).portrait);
  }
  assert.deepEqual(after.works,before.works);
  assert.deepEqual(after.collections,before.collections);
  assert.deepEqual(after.assets,before.assets);
  assert.deepEqual(prepareArtistSourcedBiographiesRoundFour(after),after,'Update must be repeat-safe');
  assert.notEqual(before.artists[0].biography,after.artists[0].biography,'Do not mutate input');
});

test('an independently edited or verified biography is never silently replaced',()=>{
  const before=fixture();
  before.artists[1].biography='Different previously verified biography.';
  assert.throws(()=>prepareArtistSourcedBiographiesRoundFour(before),/requires manual review/);
});

test('existing custom introductions remain intact',()=>{
  const before=fixture();
  before.artists[0].description='A newer approved introduction.';
  const after=prepareArtistSourcedBiographiesRoundFour(before);
  assert.equal(after.artists[0].description,'A newer approved introduction.');
  assert.equal(after.artists[0].biography,source.profiles[0].biography);
});

test('missing or ambiguous artist identity fails safely',()=>{
  const missing=fixture();
  missing.works=missing.works.filter(w=>w.artistId!=='artist-0');
  assert.throws(()=>prepareArtistSourcedBiographiesRoundFour(missing),/No represented sculpture/);
  const duplicated=fixture();
  duplicated.artists.push({...duplicated.artists[1],id:'duplicated-martin'});
  assert.throws(()=>prepareArtistSourcedBiographiesRoundFour(duplicated),/One active artist record required/);
});

test('public bios exclude private contacts, ambiguous date and fabricated memorial specifics',()=>{
  const batsirai=source.profiles[0],martin=source.profiles[1];
  assert.match(batsirai.biography,/Harare, Zimbabwe, in 1984/);
  assert.doesNotMatch(batsirai.biography,/0712463713|0783073881|04\/05\/1984/);
  assert.match(martin.biography,/The late Martin Matimura/);
  assert.doesNotMatch(martin.biography,/died (in|on)|cause of death|19 November 2026/);
  assert.equal(releaseId,'owner-batsirai-martin-biographies-2026-11-19');
  assert(releaseOrigins.includes('https://houseofmabwe.com'));
});
