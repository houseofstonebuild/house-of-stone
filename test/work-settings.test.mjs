import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';

const read=path=>JSON.parse(readFileSync(new URL(path,import.meta.url),'utf8'));
const editorial=read('../public/editorial.json'),story=read('../public/story.json'),media=read('../public/media-manifest.json');

test('every sculpture has its own complete interior composition and mobile image sizes',()=>{
  const settings=editorial.workSettings;
  assert.deepEqual(Object.keys(settings).sort(),Object.keys(story.works).sort());
  assert.equal(Object.keys(settings).length,28);
  assert.equal(new Set(Object.values(settings).map(setting=>setting.source)).size,28);
  for(const [id,setting] of Object.entries(settings)){
    assert(setting.label?.length>5,id+' needs a setting caption');
    const info=media[setting.source];assert(info,id+' needs responsive image metadata');
    assert.equal(info.width,1536);assert.equal(info.height,1024);
    assert.match(info.srcset,/480w/);assert.match(info.srcset,/960w/);assert.match(info.srcset,/1536w/);
    for(const candidate of info.srcset.split(', ')){
      const [path]=candidate.split(' '),size=statSync(new URL('../public'+path,import.meta.url)).size;
      assert(size>1000,id+' has an empty setting image');
      assert(size<500000,id+' setting image is unnecessarily large');
    }
  }
});
