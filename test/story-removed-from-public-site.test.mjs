import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createApp} from '../server.mjs';

test('Homepage contains no first-visit story overlay or CTA',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.doesNotMatch(html,/data-open-story|hos-story-invite|hos-story-dialog|story-invitation\.css/);
 assert.doesNotMatch(app,/initializeStoryInvitation|story-invitation\.js/);
 assert.match(html,/hos-hero-image/);
 assert.match(html,/hos-home-mission/);
});

test('Production serves only the unlinked standalone review, not the invitation',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'hos-story-off-'));
 let server;
 try{
  const app=createApp({dataDir:dir,backgroundNotifications:false,env:{
    ADMIN_PASSWORD:'test-not-a-real-password-123456',
    NODE_ENV:'production',
    SITE_URL:'https://house-of-mabwe-test.example'
  }});
  server=app.server;
  await new Promise(done=>server.listen(0,'127.0.0.1',done));
  const root='http://127.0.0.1:'+server.address().port;
  for(const path of ['/prototypes/making-atelier.html','/prototypes/making-atelier.js',
    '/prototypes/making-atelier.css','/prototypes/coil-formation.js',
    '/prototypes/approved-coil-reveal.js','/prototypes/scroll-frame-stream.js',
    '/prototypes/story-film-atlas.js']){
   const response=await fetch(root+path);
   assert.equal(response.status,200,path+' review route is inaccessible');
   assert.match(response.headers.get('x-robots-tag')||'',/noindex/);
  }
  for(const path of ['/story-invitation.js','/story-invitation.css']){
   const response=await fetch(root+path);
   assert.equal(response.status,404,path+' invitation was re-exposed');
  }
  for(const path of ['/','/collection','/making']){
   const response=await fetch(root+path);
   assert.equal(response.status,200,path+' became unavailable');
  }
 }finally{
  if(server)await new Promise(done=>server.close(done));
  rmSync(dir,{recursive:true,force:true});
 }
});
