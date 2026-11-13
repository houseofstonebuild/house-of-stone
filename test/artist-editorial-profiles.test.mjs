import test from 'node:test';
import assert from 'node:assert/strict';
import {source,prepareArtistEditorialProfiles,releaseId,releaseOrigins} from '../scripts/publish-artist-editorial-profiles.mjs';

function fixture(){
  const artists=source.profiles.map((profile,index)=>({
    id:'artist-'+index,
    slug:'artist-'+index,
    name:profile.legacyName||profile.name,
    archived:false,
    description:(profile.legacyName||profile.name)+' works in Zimbabwe, sourcing stone and carving each sculpture by hand.',
    biography:(profile.legacyName||profile.name)+' is a stone sculptor based in Zimbabwe. The artist sources their own stone and makes each sculpture by hand.'
  }));
  const works=artists.map((artist,index)=>({
    id:index===0?'zsa-005':index===1?'zsa-025':'work-'+index,
    title:'Representative sculpture '+index,
    artistId:artist.id,archived:false
  }));
  artists.push(
    {id:'verified-donald',slug:'donald-chapenga',name:'Donald Chapenga',biography:'Artist-supplied verified biography.',archived:false},
    {id:'verified-tawanda',slug:'tawanda-sere',name:'Tawanda Sere',biography:'Another verified biography.',archived:false},
    {id:'kudakwashe',slug:'kudakwashe-nyamudeza',name:'Kudakwashe Nyamudeza',biography:'Old attribution.',archived:false},
    {id:'artist-unconfirmed',slug:'artist-to-be-confirmed',name:'Artist to be confirmed',biography:'Individual maker unknown.',archived:false}
  );
  works.push(
    {id:'zsa-017',title:'Within',artistId:'verified-tawanda',archived:false},
    {id:'zsa-031',title:'Protection Spirit',artistId:'verified-tawanda',archived:false},
    {id:'hos-belonging',title:'Belonging',artistId:'artist-unconfirmed',archived:false}
  );
  return {artists,works,collections:[{id:'kinship',starWorkId:'hos-belonging',workIds:['zsa-017','hos-belonging']}],assets:{unchanged:'/assets/example.webp'}};
}

test('new sourced profiles and artwork-grounded summaries apply without inventing histories',()=>{
  assert.equal(source.profiles.length,11);
  assert.deepEqual(source.profiles.filter(p=>p.kind==='artist-supplied').map(p=>p.name),
    ['Chamu Rumano','Takunda Chiripanyanga']);
  const before=fixture(),after=prepareArtistEditorialProfiles(before);
  for(const profile of source.profiles){
    const artist=after.artists.find(a=>a.name===profile.name);
    assert(artist,'Missing artist: '+profile.name);
    assert.equal(artist.biography,profile.biography);
    assert.equal(artist.description,profile.introduction);
  }
  assert.equal(after.artists.find(a=>a.id==='artist-1').slug,before.artists.find(a=>a.id==='artist-1').slug,
    'Corrected Takunda spelling must not break old artist URLs');
  assert.equal(after.artists.find(a=>a.name==='Donald Chapenga').biography,'Artist-supplied verified biography.');
  assert.equal(after.artists.find(a=>a.name==='Tawanda Sere').biography,'Another verified biography.');
  assert.equal(after.artists.find(a=>a.id==='artist-unconfirmed').biography,'Individual maker unknown.');
  assert(after.artists.find(a=>a.name==='Kudakwashe Nyamudeza').archived,
    'Old unattributed Within artist profile should be hidden');
  assert(after.works.find(w=>w.id==='zsa-017').archived);
  assert(!after.collections.some(c=>c.workIds.includes('zsa-017')));
  assert(after.works.find(w=>w.id==='zsa-031')&&!after.works.find(w=>w.id==='zsa-031').archived);
  assert.deepEqual(after.assets,before.assets);
  assert.deepEqual(prepareArtistEditorialProfiles(after),after,'The update must be idempotent');
  assert(!before.works.find(w=>w.id==='zsa-017').archived,'Input must not be mutated');
});

test('an existing non-placeholder biography stays intact for an unsourced artist',()=>{
  const before=fixture();
  before.artists.find(a=>a.name==='Charles Manyaure').biography='A real biography supplied by the artist.';
  before.artists.find(a=>a.name==='Charles Manyaure').description='An existing editorial introduction.';
  const after=prepareArtistEditorialProfiles(before);
  assert.equal(after.artists.find(a=>a.name==='Charles Manyaure').biography,
    'A real biography supplied by the artist.');
  assert.equal(after.artists.find(a=>a.name==='Charles Manyaure').description,
    'An existing editorial introduction.');
});

test('an attribution still connected to a current sculpture is never erased',()=>{
  const before=fixture();
  before.works.push({id:'another-work',title:'Another work',artistId:'kudakwashe',archived:false});
  const after=prepareArtistEditorialProfiles(before);
  assert(!after.artists.find(a=>a.id==='kudakwashe').archived);
});

test('unexpected artist identity or missing source sculpture blocks automatic publication',()=>{
  const before=fixture();
  before.artists.find(a=>a.name==='Chamu Rumano').name='Another Person';
  assert.throws(()=>prepareArtistEditorialProfiles(before),/Expected one active artist/);
  const missing=fixture();
  missing.works=missing.works.filter(w=>w.artistId!=='artist-0');
  assert.throws(()=>prepareArtistEditorialProfiles(missing),/no currently represented sculptures/);
  assert.equal(releaseId,'owner-artist-editorial-profiles-2026-11-13');
  assert(releaseOrigins.includes('https://houseofmabwe.com'));
});
