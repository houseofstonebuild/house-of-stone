import test from 'node:test';
import assert from 'node:assert/strict';
import { closerLookPhoto, closerLookCrop } from '../public/closer-look.js';

const work={image:'hero',views:{right:'side'}};
const assets={hero:'/front.webp',side:'/right.webp'};
const note={heading:'The carved opening',copy:'A reviewed description.',photoView:'right',photoSource:'/right.webp'};

test('shows the reviewed photograph and rejects a replacement under the same angle',()=>{
  assert.equal(closerLookPhoto(work,assets,note),'/right.webp');
  assert.equal(closerLookPhoto(work,{...assets,side:'/replacement.webp'},note),null);
});

test('a primary photograph needs a valid close-up instead of repeating the full image',()=>{
  const primary={...note,photoView:'front',photoSource:'/front.webp'};
  assert.equal(closerLookPhoto(work,assets,primary),null);
  const cropped={...primary,photoCrop:{x:.2,y:.1,width:.6,height:.5,aspectRatio:1.2}};
  assert.equal(closerLookPhoto(work,assets,cropped),'/front.webp');
  assert.equal(closerLookPhoto(work,{...assets,hero:'/owner-replacement.webp'},cropped),null);
  for(const crop of [
    {x:.8,y:0,width:.5,height:.5,aspectRatio:1},
    {x:0,y:0,width:1,height:1,aspectRatio:1},
    {x:0,y:0,width:.5,height:0,aspectRatio:1},
    {x:0,y:0,width:.5,height:.5,aspectRatio:NaN}
  ])assert.equal(closerLookCrop({photoCrop:crop}),null);
});

test('hides incomplete selections, missing views and repeated hero photographs',()=>{
  assert.equal(closerLookPhoto(work,assets,{...note,photoSource:undefined}),null);
  assert.equal(closerLookPhoto(work,assets,{...note,photoView:'front'}),null);
  assert.equal(closerLookPhoto({...work,views:{}},assets,note),null);
  assert.equal(closerLookPhoto(work,{...assets,hero:'/right.webp'},note),null);
});
