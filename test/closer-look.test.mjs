import test from 'node:test';
import assert from 'node:assert/strict';
import { closerLookPhoto } from '../public/closer-look.js';

const work={image:'hero',views:{right:'side'}};
const assets={hero:'/front.webp',side:'/right.webp'};
const note={heading:'The carved opening',copy:'A reviewed description.',photoView:'right',photoSource:'/right.webp'};

test('shows the reviewed photograph and rejects a replacement under the same angle',()=>{
  assert.equal(closerLookPhoto(work,assets,note),'/right.webp');
  assert.equal(closerLookPhoto(work,{...assets,side:'/replacement.webp'},note),null);
});

test('hides incomplete selections, missing views and repeated hero photographs',()=>{
  assert.equal(closerLookPhoto(work,assets,{...note,photoSource:undefined}),null);
  assert.equal(closerLookPhoto(work,assets,{...note,photoView:'front'}),null);
  assert.equal(closerLookPhoto({...work,views:{}},assets,note),null);
  assert.equal(closerLookPhoto(work,{...assets,hero:'/right.webp'},note),null);
});
