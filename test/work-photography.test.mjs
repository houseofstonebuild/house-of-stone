import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyWorkPhotography} from '../public/work-photography.js';

test('photoshoot replaces the matching work and preserves its identity and detail views', () => {
  const work={id:'zsa-016',slug:'wingbeat',image:'old',views:{signature:'signature'}};
  const catalog={works:[work],assets:{old:'/old.jpg'}};
  applyWorkPhotography(catalog,{'zsa-016':{source:'/old.jpg',front:'/front.webp',views:{back:'/back.webp'}}});
  assert.equal(catalog.assets[work.image],'/front.webp');
  assert.equal(catalog.assets[work.views.back],'/back.webp');
  assert.equal(work.views.signature,'signature');
  assert.equal(work.id,'zsa-016');
  assert.equal(work.slug,'wingbeat');
});

test('an owner replacement takes precedence over the photoshoot configuration', () => {
  const catalog={works:[{id:'zsa-016',image:'owner'}],assets:{owner:'/new.jpg'}};
  const before=structuredClone(catalog);
  applyWorkPhotography(catalog,{'zsa-016':{source:'/old.jpg',front:'/front.webp'}});
  assert.deepEqual(catalog,before);
});

test('a sculpture used as an artist lead image follows its white photograph while a real portrait stays intact', () => {
  const catalog={works:[{id:'work',image:'old'}],artists:[{id:'maker',portrait:'old'},{id:'other',portrait:'portrait'}],assets:{old:'/outdoors.jpg',portrait:'/portrait.jpg'}};
  applyWorkPhotography(catalog,{work:{source:'/outdoors.jpg',front:'/white.webp'}});
  assert.equal(catalog.assets[catalog.artists[0].portrait],'/white.webp');
  assert.equal(catalog.assets[catalog.artists[1].portrait],'/portrait.jpg');
});

