import test from 'node:test';
import assert from 'node:assert/strict';
import {source,prepareDouglasMusekiwaBiography,releaseId,releaseOrigins} from '../scripts/publish-douglas-musekiwa-biography.mjs';
import {source as editorial} from '../scripts/publish-artist-editorial-profiles.mjs';

function fixture(){
  const old=editorial.profiles.find(p=>p.name==='Douglas Musekiwa');
  return {
    artists:[
      {id:'verified-douglas-musekiwa',slug:'douglas-musekiwa',name:'Douglas Musekiwa',
        biography:old.biography,description:old.introduction,portrait:'photo-douglas-musekiwa',archived:false},
      {id:'other',slug:'another-artist',name:'Another Artist',biography:'Verified biography',archived:false}
    ],
    works:[{id:'zsa-006',slug:'zsa-page-06',title:'Coil',artistId:'verified-douglas-musekiwa',archived:false}],
    assets:{unchanged:'/assets/example.webp'},
    collections:[{id:'nature',workIds:['zsa-006']}]
  };
}

test('supplied Douglas biography replaces only existing editorial copy',()=>{
  const before=fixture(),after=prepareDouglasMusekiwaBiography(before);
  assert.equal(source.profiles.length,1);
  assert.equal(after.artists[0].biography,source.profiles[0].biography);
  assert.equal(after.artists[0].description,source.profiles[0].introduction);
  assert.deepEqual(after.works,before.works,'Coil attribution stays unchanged');
  assert.deepEqual(after.assets,before.assets);
  assert.deepEqual(after.collections,before.collections);
  assert.deepEqual(after.artists[1],before.artists[1]);
  assert.equal(after.artists[0].slug,before.artists[0].slug);
  assert.equal(after.artists[0].portrait,before.artists[0].portrait);
  assert.deepEqual(prepareDouglasMusekiwaBiography(after),after,'Repeat publication is safe');
  assert.notEqual(before.artists[0].biography,after.artists[0].biography,'Input is not mutated');
});

test('manual edits are preserved or require review',()=>{
  const custom=fixture();
  custom.artists[0].biography='A later verified biography.';
  assert.throws(()=>prepareDouglasMusekiwaBiography(custom),/manual review/);
  const intro=fixture();
  intro.artists[0].description='Approved later editorial introduction.';
  const after=prepareDouglasMusekiwaBiography(intro);
  assert.equal(after.artists[0].description,'Approved later editorial introduction.');
});

test('missing Coil attribution or ambiguous identity prevents publication',()=>{
  const missing=fixture();
  missing.works[0].artistId='other';
  assert.throws(()=>prepareDouglasMusekiwaBiography(missing),/Coil/);
  const duplicated=fixture();
  duplicated.artists.push({...duplicated.artists[0],id:'duplicate'});
  assert.throws(()=>prepareDouglasMusekiwaBiography(duplicated),/Exactly one active/);
});

test('public copy remains grounded in supplied story and avoids invented dates',()=>{
  const bio=source.profiles[0].biography;
  for(const phrase of ['Guruve','1986','Eckel Nyamhondoro','Stindi Art Gallery','Sango art family','Tendai Rukodzi','Hatfield Art Community','Coil'])
    assert(bio.includes(phrase),'Missing supplied information: '+phrase);
  assert(!/\+263|@gmail.com/.test(bio));
  assert.equal(releaseId,'owner-douglas-musekiwa-biography-2026-11-20');
  assert(releaseOrigins.includes('https://houseofmabwe.com'));
});
