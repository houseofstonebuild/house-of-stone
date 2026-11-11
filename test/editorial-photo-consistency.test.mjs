import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const at=path=>new URL(path,import.meta.url);
const story=JSON.parse(readFileSync(at('../public/story.json'),'utf8'));
const editorial=JSON.parse(readFileSync(at('../public/editorial.json'),'utf8'));
const allowed=new Set(['right','left','back','detail','detail2']);
const owned=new Set(['hos-queen-mother','hos-celebration','hos-belonging','hos-inner-beauty']);
const uploaded=new Set(['hos-tall-attention','hos-kissing-lovers']);
const photoPath=(id,view)=>{
  if(owned.has(id))return '/assets/'+id+'-'+view+'-v1.webp';
  if(uploaded.has(id))return '/assets/'+id+'-'+view+'-v1.png';
  return editorial.workPhotography[id]?.views?.[view]||null;
};

test('each sculpture story focuses on meaning and has enough substance to be useful',()=>{
  assert.equal(Object.keys(story.works).length,28,'Include both newly uploaded works');
  for(const [id,work] of Object.entries(story.works)){
    assert(work.editorialShort?.trim().split(/\s+/).length>=55,id+' needs a developed interpretation');
    assert(work.editorialShort?.trim().split(/\s+/).length<=130,id+' reads like an essay, not a blurb');
    assert(!/the artist (told us|said in an interview|recalled|explained that)/i.test(work.editorialShort),id+' invents an attribution');
  }
});

test('closer-look text uses one explicit, real alternate photograph of the same work',()=>{
  let selected=0,hidden=0;
  for(const [id,work] of Object.entries(story.works)){
    const note=work.closerLook;
    if(!note?.photoView){
      hidden++;
      continue;
    }
    selected++;
    assert(allowed.has(note.photoView),id+' selected an unsupported view');
    assert(note.heading?.length>=10,id+' has no detail heading');
    assert(note.copy?.trim().split(/\s+/).length>=25,id+' has no specific explanation');
    const path=photoPath(id,note.photoView);
    assert(path,id+' does not have the selected '+note.photoView+' view');
    assert(existsSync(fileURLToPath(at('../public'+path))),id+' view missing from repository: '+path);
    if(editorial.workPhotography[id])assert.notEqual(path,editorial.workPhotography[id].front,id+' close look repeats the hero');
  }
  assert.equal(selected,24,'Only works with matched secondary photographs should show this section');
  assert.equal(hidden,4,'Do not substitute unrelated views for four works without extra photographs');
});

test('Queen Mother detail points to the side photograph showing jewellery and headdress',()=>{
  const detail=story.works['hos-queen-mother'].closerLook;
  assert.equal(detail.photoView,'right');
  assert.match(detail.heading,/headdress and jewellery/i);
  assert.equal(photoPath('hos-queen-mother',detail.photoView),'/assets/hos-queen-mother-right-v1.webp');
});
