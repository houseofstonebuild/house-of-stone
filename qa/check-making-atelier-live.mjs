// Compare deployed review code with this exact checkout, rather than a stale
// headline signature. The homepage remains outside the welcome experience.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root=process.env.MABWE_ORIGIN||'https://houseofmabwe.com';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
for(const path of ['/prototypes/making-atelier.html','/prototypes/making-atelier.css',
 '/prototypes/making-atelier.js','/prototypes/scroll-frame-stream.js','/prototypes/approved-coil-reveal.js']){
 const response=await fetch(root+path+'?mabwe-rebuild-verification='+Date.now(),{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(25000)});
 assert.equal(response.status,200,path);
 const actual=new Uint8Array(await response.arrayBuffer());
 const expected=readFileSync(new URL('../public'+path,import.meta.url));
 assert.equal(hash(actual),hash(expected),path+' is not this reviewed version');
 assert.match(response.headers.get('x-robots-tag')||'',/noindex/);
 console.log('VERIFIED',path,hash(actual));
}
for(const path of ['/assets/making-v7/manifest.json','/assets/making-cinema-frames-v4/manifest.json']){
 const response=await fetch(root+path,{signal:AbortSignal.timeout(25000)});assert(response.ok,path);
 const actual=await response.json(),expected=JSON.parse(readFileSync(new URL('../public'+path,import.meta.url),'utf8'));
 assert.deepEqual(actual,expected,path+' source manifest differs');
}
for(const path of ['/assets/making-v7/mobile/frame_045.webp','/assets/making-v7/mobile/frame_078.webp',
 '/assets/making-v7/desktop/frame_120.webp','/assets/making-v7/desktop/frame_138.webp',
 '/assets/making-cinema-frames-v4/frame_000.webp','/assets/making-cinema-frames-v4/frame_100.webp',
 '/assets/making-cinema-frames-v4/frame_199.webp','/assets/making-atelier-final-mobile-v1.png','/models/coil-uploaded-v1.glb']){
 const response=await fetch(root+path,{signal:AbortSignal.timeout(25000)});assert(response.ok,path);
 const actual=new Uint8Array(await response.arrayBuffer()),expected=readFileSync(new URL('../public'+path,import.meta.url));
 assert.equal(hash(actual),hash(expected),path+' source asset differs');console.log('SOURCE VERIFIED',path);
}
const homepage=await fetch(root+'/',{signal:AbortSignal.timeout(25000)});assert(homepage.ok);
assert.doesNotMatch(await homepage.text(),/data-open-story|hos-story-invite|hos-story-dialog|story-invitation\.css/);
console.log('VERIFIED: exact rebuilt introduction, original assets, and no homepage invitation at',root);
