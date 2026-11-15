// Source-true live check of the independent Making Atelier prototype. Do not
// mistake a pushed commit for a successful deployment.
import assert from 'node:assert/strict';
const root=process.env.MABWE_ORIGIN||'https://houseofmabwe.com';
const files=[
 ['/prototypes/making-atelier.html','From the earth.',1500],
 ['/prototypes/making-atelier.css','.story-chapter',9000],
 ['/prototypes/making-atelier.js','window.__mabweMaking',6000],
 ['/assets/making-cinema-frames/manifest.json','source_sha256',60],
 ['/assets/making-cinema-frames/frame_00.webp',null,1500],
 ['/assets/making-cinema-frames/frame_24.webp',null,1500],
 ['/assets/making-cinema-frames/frame_47.webp',null,1500],
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
console.log('Live source-true Making Atelier verification passed at',root);
