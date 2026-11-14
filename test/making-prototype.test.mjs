import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server.mjs';
const html=readFileSync(new URL('../public/prototypes/stone-to-sculpture.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../public/prototypes/stone-to-sculpture.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/prototypes/stone-to-sculpture.css',import.meta.url),'utf8');
test('unlinked process prototype uses the approved Coil model and remains out of navigation',()=>{
 assert.match(html,/name="robots" content="noindex,nofollow,noarchive"/);
 assert.match(html,/DESIGN STUDY · NOT LINKED/);
 assert.match(js,/\/models\/coil-uploaded-v1\.glb/);
 assert.match(html,/\/works\/zsa-page-6/);
 assert.match(html,/artistic visualization/);
 assert.match(js,/prefers-reduced-motion/);
 assert.match(js,/scrollIntoView/);
 assert.match(css,/\.journey\{height:540svh/);
 const site=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.doesNotMatch(site,/prototypes\/stone-to-sculpture/);
});
test('review prototype and JS can be served without touching collection data',async()=>{
 const dataDir=mkdtempSync(join(tmpdir(),'hos-making-prototype-'));
 const app=createApp({dataDir,env:{ADMIN_PASSWORD:'prototype-testing-only-password'},backgroundNotifications:false});
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 try{
  const origin='http://127.0.0.1:'+app.server.address().port;
  for(const [path,type] of [['/prototypes/stone-to-sculpture.html','text/html'],['/prototypes/stone-to-sculpture.js','text/javascript'],['/prototypes/stone-to-sculpture.css','text/css']]){
   const response=await fetch(origin+path);assert.equal(response.status,200,path);assert.match(response.headers.get('content-type'),new RegExp(type));
  }
 }finally{await new Promise(resolve=>app.server.close(resolve));rmSync(dataDir,{recursive:true,force:true})}
});

test('advanced stone study has a single geological block, physical tooling and material-preserving final geometry',()=>{
 assert.match(js,/new THREE\.BoxGeometry\(w,h,d,30,44,20\)/);
 assert.doesNotMatch(js,/new THREE\.BoxGeometry\(1,1,1,3,4,3\)/);
 assert.match(js,/makeChalkFromModel\(source\)/);
 assert.match(js,/new THREE\.ConeGeometry/);
 assert.match(js,/if\(vStoneCoordinate\.y>uCutY\+wave\)discard/);
 assert.match(js,/effect\.polishPlane=polishedPlane/);
 assert.match(js,/source\.traverse\(node=>/);
 assert.match(html,/designers-coil-v2\.webp/);
 assert.match(js,/host\.dataset\.modelReady='true'/);
});
