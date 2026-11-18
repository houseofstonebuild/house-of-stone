import test from 'node:test';
import assert from 'node:assert/strict';
import {source,prepareArtistSourcedBiographiesRoundThree} from '../scripts/publish-artist-sourced-biographies-round-three.mjs';
import {source as editorialSource} from '../scripts/publish-artist-editorial-profiles.mjs';

function fixture(){
  const artists=source.profiles.map((p,i)=>{
    const legacy=p.legacyName||p.name;
    const old=editorialSource.profiles.find(v=>v.name===legacy);
    return {id:'artist-'+i,name:legacy,slug:legacy.toLowerCase().replaceAll(' ','-'),
      biography:old?.biography || legacy+' is a stone sculptor based in Zimbabwe. The artist sources their own stone and makes each sculpture by hand.',
      description:old?.introduction || legacy+' works in Zimbabwe, sourcing stone and carving each sculpture by hand.',archived:false};
  });
  const works=artists.map((a,i)=>({id:['zsa-021','zsa-013'][i],title:['Massaging','Open Flame'][i],
    artistId:a.id,archived:false}));
  return {artists,works,collections:[],assets:{hero:'/assets/hero.webp'}};
}

test('Bernard and Charles receive supplied biographies without changing sculptures',()=>{
  const before=fixture(),after=prepareArtistSourcedBiographiesRoundThree(before);
  for(const profile of source.profiles){
    const artist=after.artists.find(a=>a.name===profile.name);
    assert(artist);
    assert.equal(artist.biography,profile.biography);
    assert.equal(artist.description,profile.introduction);
  }
  assert.equal(after.artists.find(a=>a.name==='Charles Manyaura')?.slug,'charles-manyaura');
  assert.equal(after.artists.find(a=>a.name==='Bernard Sakarombe')?.slug,'bernard-sakarombe');
  assert(!after.artists.some(a=>a.name==='Charles Manyaure'&&!a.archived));
  assert.deepEqual(after.works,before.works);
  assert.deepEqual(after.assets,before.assets);
  assert.deepEqual(prepareArtistSourcedBiographiesRoundThree(after),after);
  assert.equal(before.artists[1].name,'Charles Manyaure');
});

test('existing manual biographies are not overwritten',()=>{
  const item=fixture();
  item.artists.find(a=>a.name==='Charles Manyaure').biography='Another approved artist biography.';
  assert.throws(()=>prepareArtistSourcedBiographiesRoundThree(item),/requires manual review/);
});

test('artist identity conflicts or missing attribution block publication',()=>{
  const item=fixture();
  item.artists.push({id:'other',name:'Other Artist',slug:'charles-manyaura',archived:false});
  assert.throws(()=>prepareArtistSourcedBiographiesRoundThree(item),/conflicts/);
  const missing=fixture();
  missing.works=missing.works.filter(w=>w.artistId!=='artist-0');
  assert.throws(()=>prepareArtistSourcedBiographiesRoundThree(missing),/no active sculpture/);
});
