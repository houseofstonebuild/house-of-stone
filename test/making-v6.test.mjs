import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

const asset=path=>new URL('../public/'+path,import.meta.url);
const player=readFileSync(asset('prototypes/stone-to-sculpture-v6.js'),'utf8');
const page=readFileSync(asset('prototypes/stone-to-sculpture.html'),'utf8');
const manifest=JSON.parse(readFileSync(asset('assets/making-v6/manifest.json'),'utf8'));

test('private Making V6 runs deterministic non-WebGL scroll animation',()=>{
 const result=spawnSync(process.execPath,['--check',asset('prototypes/stone-to-sculpture-v6.js').pathname],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
 assert.match(page,/stone-to-sculpture-v6\.js/);
 assert.match(page,/robots" content="noindex,nofollow,noarchive/);
 assert.match(player,/frameIndex/);
 assert.match(player,/window\.addEventListener\('scroll',schedule/);
 assert.match(player,/archiveFilm\.play\(\)/);
 assert.match(player,/archiveFilm\.pause\(\)/);
 assert.doesNotMatch(player,/WebGLRenderer|new THREE|GLTFLoader/);
 assert.match(player,/route\.getPointAtLength/);
 assert.match(player,/truck\.setAttribute\('transform'/);
 assert.match(player,/prefers-reduced-motion/);
});

test('verified exact Coil source and all frames are present',()=>{
 assert.equal(manifest.version,6);
 assert.equal(manifest.frames,144);
 assert.equal(manifest.first,.305);
 assert.equal(manifest.last,1);
 assert.equal(manifest.entries.length,144);
 for(const [profile,expected] of [['desktop',{width:1280,height:720}],['mobile',{width:720,height:1560}]]){
  assert.deepEqual(manifest.profiles[profile],expected);
  for(let frame=0;frame<144;frame++){
   const path=asset('assets/making-v6/'+profile+'/frame_'+String(frame).padStart(3,'0')+'.webp');
   assert(statSync(path).size>1500,profile+': empty frame '+frame);
  }
 }
 const volumes=manifest.entries.map(x=>x.remaining_voxels);
 for(let i=1;i<volumes.length;i++)assert(volumes[i]<=volumes[i-1],'material regrowth at frame '+i);
 assert(volumes.at(-1)<volumes[0]*.25,'material removal did not reveal true Coil');
});

test('public making page remains separate',()=>{
 const index=readFileSync(asset('index.html'),'utf8');
 assert.doesNotMatch(index,/stone-to-sculpture-v6\.js|prototypes\/stone-to-sculpture\.html/);
});
