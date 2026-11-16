// Source-true live check of the independent Making Atelier prototype. Do not
// mistake a pushed commit for a successful deployment.
import assert from 'node:assert/strict';
const root=process.env.MABWE_ORIGIN||'https://houseofmabwe.com';
const files=[
 ['/prototypes/making-atelier.html','From the earth.',1500],
 ['/prototypes/making-atelier.css','.story-chapter',9000],
 ['/prototypes/making-atelier.js','window.__mabweMaking',6000],
 ['/prototypes/coil-formation.js','making-v7',6000],
 ['/assets/making-v7/manifest.json','camera_revision',6000],
 ['/assets/making-v7/desktop/frame_054.webp',null,2500],
 ['/assets/making-v7/desktop/frame_074.webp',null,2500],
 ['/assets/making-v7/desktop/frame_085.webp',null,2500],
 ['/assets/making-v7/desktop/frame_130.webp',null,2500],
 ['/assets/making-v7/mobile/frame_074.webp',null,2500],
 ['/assets/making-v7/mobile/frame_130.webp',null,2500],
 ['/assets/making-cinema-frames/manifest.json','source_sha256',60],
 ['/assets/making-cinema-frames/frame_00.webp',null,1500],
 ['/assets/making-cinema-frames/frame_24.webp',null,1500],
 ['/assets/making-cinema-frames/frame_47.webp',null,1500],
 ['/assets/making-cinema-frames-v3/manifest.json','"version":3',140],
 ['/assets/making-cinema-frames-v3/frame_000.webp',null,1500],
 ['/assets/making-cinema-frames-v3/frame_072.webp',null,1500],
 ['/assets/making-cinema-frames-v3/frame_143.webp',null,1500],
 ['/assets/making-atelier-final-mobile-v1.png',null,35000],
 ['/assets/making-chiseling-scrub-v1.mp4',null,100000],
 ['/models/coil-uploaded-v1.glb',null,100000]
];
for(const [path,marker,min] of files){
 const response=await fetch(root+path+'?atelier-verification=1',{
  headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(25000),redirect:'follow'
 });
 assert(response.ok,path+' returned '+response.status);
 const content=new Uint8Array(await response.arrayBuffer());
 assert(content.length>min,path+' is unexpectedly small: '+content.length);
 if(marker){
  const text=new TextDecoder().decode(content);
  assert(text.includes(marker),path+' missing required signature '+marker);
 }
 console.log(response.status,path,content.length);
}
const manifestResponse=await fetch(root+'/assets/making-v7/manifest.json?registered-v7=1',{cache:'no-store',signal:AbortSignal.timeout(25000)});
const manifest=await manifestResponse.json();
assert.equal(manifest.version,7,'Live site is not serving new Coil frames');
assert.equal(manifest.registered_to,'approved-coil-v1');
assert.equal(manifest.camera_revision,3);
assert.equal(manifest.frames,144);
assert(manifest.entries[65].remaining_voxels>manifest.entries[85].remaining_voxels,
  'Coil removal frames do not gradually reduce stone volume');
const denseResponse=await fetch(root+'/assets/making-cinema-frames-v3/manifest.json?dense-source-verified=1',
 {cache:'no-store',signal:AbortSignal.timeout(25000)});
assert(denseResponse.ok,'144-frame documentary manifest has not been deployed');
const dense=await denseResponse.json();
assert.equal(dense.version,3);
assert.equal(dense.frames,144);
assert.equal(dense.width,1600);
assert.equal(dense.end_seconds,8.4);
console.log('Live source-true Making Atelier v7 and 144-frame documentary verified at',root);
