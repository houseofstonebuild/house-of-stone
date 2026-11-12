import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';

const read=path=>JSON.parse(readFileSync(new URL(path,import.meta.url),'utf8'));
const editorial=read('../public/editorial.json'),story=read('../public/story.json'),media=read('../public/media-manifest.json');

test('published sculpture settings use the selected interiors and approved campaign photographs',()=>{
  const settings=editorial.workSettings;
  assert.deepEqual(Object.keys(settings).sort(),Object.keys(story.works).filter(id=>id!=='zsa-017').sort());
  assert.equal(Object.keys(settings).length,27);
  assert.equal(new Set(Object.values(settings).map(setting=>setting.source)).size,27);
  assert.equal(settings['zsa-029'].source,'/assets/zsa-029-space-v1-1536.webp');
  for(const [id,source] of Object.entries({'zsa-001':'/assets/presence-campaign-v2.webp','zsa-020':'/assets/kinship-campaign-v2.webp','zsa-013':'/assets/rhythm-campaign-v2.webp'}))assert.equal(settings[id].source,source);
  for(const [id,setting] of Object.entries(settings)){
    assert(setting.label?.length>5,id+' needs a setting caption');
    const info=media[setting.source];assert(info,id+' needs image metadata');
    assert.equal(info.width,1536);assert.equal(info.height,1024);
    assert.match(info.srcset,/1536w/);
    if(setting.source.includes('-space-v3-'))assert.match(info.srcset,/480w/);
    for(const candidate of info.srcset.split(', ')){
      const [path]=candidate.split(' '),size=statSync(new URL('../public'+path,import.meta.url)).size;
      assert(size>1000,id+' has an empty setting image');
      assert(size<500000,id+' setting image is unnecessarily large');
    }
  }
});
