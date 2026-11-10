import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createApp} from '../server.mjs';
import {frameStudioImage} from '../public/studio-frame.js';

test('public catalogue and image manifest compress, revalidate and update after publication',async t=>{
 const dataDir=mkdtempSync(join(tmpdir(),'hos-performance-delivery-')),password=randomUUID();
 const app=createApp({dataDir,env:{ADMIN_PASSWORD:password},backgroundNotifications:false});
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{await new Promise(resolve=>app.server.close(resolve));rmSync(dataDir,{recursive:true,force:true});});
 const origin='http://127.0.0.1:'+app.server.address().port;
 for(const path of ['/content.json','/media-manifest.json']){
   const response=await fetch(origin+path,{headers:{'Accept-Encoding':'gzip'}});
   assert.equal(response.status,200);
   assert.equal(response.headers.get('content-encoding'),'gzip');
   assert.equal(response.headers.get('vary'),'Accept-Encoding');
   assert.equal(response.headers.get('cache-control'),'public, max-age=0, must-revalidate');
   const etag=response.headers.get('etag');assert(etag);
   assert(Object.keys(await response.json()).length>0);
   const cached=await fetch(origin+path,{headers:{'If-None-Match':etag}});
   assert.equal(cached.status,304);assert.equal(await cached.text(),'');
 }
 const authorization='Basic '+Buffer.from('admin:'+password).toString('base64');
 const headers={Authorization:authorization,Origin:origin,'Content-Type':'application/json'};
 const request=async(path,body)=>{
   const response=await fetch(origin+'/api/admin/'+path,{headers,...(body?{method:'POST',body:JSON.stringify(body)}:{})});
   assert(response.ok,path+': '+response.status);return response.json();
 };
 const admin=await fetch(origin+'/api/admin/media-manifest',{headers});
 assert.equal(admin.headers.get('cache-control'),'no-store','private preview must remain uncached');
 let state=await request('content');
 const description='Updated catalogue content revalidation check.';
 const oldTag=(await fetch(origin+'/content.json')).headers.get('etag');
 state.draft.site.description=description;
 state=await request('content',{revision:state.revision,catalog:state.draft});
 await request('publish',{revision:state.revision});
 const updated=await fetch(origin+'/content.json',{headers:{'If-None-Match':oldTag}});
 assert.equal(updated.status,200,'New publication must invalidate the old public ETag');
 assert.notEqual(updated.headers.get('etag'),oldTag);
 assert.equal((await updated.json()).site.description,description);
});

test('studio image observers are shared and never installed for ordinary photos',()=>{
 const previousWindow=globalThis.window;
 const counters={resize:0,intersection:0,observed:[],removed:[]};
 class Resize {
   constructor(){counters.resize++;}
   observe(image){counters.observed.push(['resize',image]);}
   unobserve(image){counters.removed.push(['resize',image]);}
 }
 class Intersection {
   constructor(){counters.intersection++;}
   observe(image){counters.observed.push(['intersection',image]);}
   unobserve(image){counters.removed.push(['intersection',image]);}
 }
 globalThis.window={ResizeObserver:Resize,IntersectionObserver:Intersection};
 try{
   const mock=()=>({decode:async()=>{},dataset:{},style:{},complete:false,naturalWidth:0,addEventListener(){}});
   const ordinary=mock(),first=mock(),second=mock();
   frameStudioImage(ordinary,'');
   assert.equal(counters.resize,0);assert.equal(counters.intersection,0);
   frameStudioImage(first,'/assets/a.webp');
   frameStudioImage(second,'/assets/b.webp');
   assert.equal(counters.resize,1);
   assert.equal(counters.intersection,1);
   assert.equal(counters.observed.length,4);
   frameStudioImage(first,'');
   assert.equal(counters.removed.length,2);
 }finally{if(previousWindow===undefined)delete globalThis.window;else globalThis.window=previousWindow;}
});

test('first-paint hero has responsive candidates and dynamically created photos are marked lazy before src',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const js=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const gallery=readFileSync(new URL('../public/gallery.js',import.meta.url),'utf8');
 assert.match(html,/<img class="hos-hero-image"[^>]*srcset="[^"]*designer-apartment-640.webp[^"]*"[^>]*fetchpriority="high"/);
 assert.match(js,/const img = el\('img'\); if \(lazy\) img\.loading = 'lazy';\s*applyImage\(img, assets\[key\]/);
 assert.match(js,/const img = el\('img'\); img\.loading = 'lazy'; applyImage\(img, source/);
 assert.match(gallery,/const img=document\.createElement\('img'\);img\.loading='lazy';applyImage/);
 assert.match(gallery,/const image=document\.createElement\('img'\);image\.loading='lazy';applyImage/);
 assert.match(js,/ensurePageContent\(page\);/);
});
