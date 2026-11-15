import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server.mjs';

const html=readFileSync(new URL('../public/prototypes/stone-to-sculpture.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../public/prototypes/stone-to-sculpture.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/prototypes/stone-to-sculpture.css',import.meta.url),'utf8');

test('scroll-driven source map is factual but does not imply a verified Coil quarry',()=>{
 assert.match(html,/name="robots" content="noindex,nofollow,noarchive"/);
 assert.match(html,/Z I M B A B W E/);
 assert.match(html,/GURUVE/);
 assert.match(html,/HARARE/);
 assert.match(html,/Illustrative region and transfer|a regional illustration/i);
 assert.match(html,/specific quarry, transport route and workshop location for Coil have not been verified/);
 assert.match(js,/const stops=\[0,\.075,\.17,\.29,\.37,\.45,\.53,\.765,\.835,\.90,\.96,1\]/);
 assert.match(js,/svg\.setAttribute\('viewBox'/);
 assert.match(js,/route\.getPointAtLength/);
 assert.match(html,/class="pin-halo"/);
});

test('natural springstone, synchronized chisel and traditional finish stages',()=>{
 assert.match(js,/new THREE\.IcosahedronGeometry\(1,5\)/);
 assert.doesNotMatch(js,/const rows=5,cols=3/);
 assert.match(js,/if\(outside>marginHere\+fracturedEdge\)discard/);
 assert.match(js,/const removed=\(Math\.floor\(strokes\)\+impact\)\/strokeCount/);
 assert.match(js,/hammerHead\.position\.set\(-\.70,-\.145,-\.02\)/);
 assert.match(js,/contact\.position\.set\(-\.70,-\.26,-\.02\)/);
 assert.match(js,/host\.dataset\.contactError=/);
 assert.match(js,/const distances=new Float32Array\(W\*H\)/);
 assert.match(js,/uCarveMask/);
 assert.match(js,/const centerX=lerp/);
 assert.match(js,/const sceneOpacity=smooth/);
 assert.match(js,/const strokeCount=28/);
 assert.match(js,/function makeCarvingBlank\(rows\)/);
 assert.match(js,/updateCarvingBlank\(removed\)/);
 assert.match(js,/const toBlank=smooth/);
 assert.match(js,/toRough=smooth/);
 assert.match(js,/blank:true/);
 assert.match(js,/uCarveProgress/);
 assert.match(js,/float layerProgress=smoothstep/);
 assert.match(js,/if\(excess>threshold\+roughEdge\)discard/);
 assert.match(js,/const localHeight=clamp\(v\.y\/3\.35\)/);
 assert.match(js,/e\.carveProgress\.value=removed/);
 assert.match(js,/const toBlank=smooth\(\(carve-\.007\)\/\.13\),toRough=smooth\(\(carve-\.82\)\/\.17\)/);
 assert.match(js,/host\.dataset\.tipSurfaceError=/);
 assert.match(js,/host\.dataset\.apertureProgress=/);
 assert.match(js,/e\.blankHidePlane\.constant=frontier/);
 assert.match(js,/e\.carveRevealPlane\.constant=-frontier/);
 assert.match(js,/e\.rough\.visible=carve>\.035/);
 assert.match(js,/host\.dataset\.realShapeReveal=/);
 assert.match(js,/float bandStart=\(1\.0-localHeight\)\*\.83/);
 assert.match(js,/float frontCut=mix\(\.95,\.13,bandT\)/);
 assert.match(js,/const invSmooth|const part=fract|const phase=fract/);
 assert.match(js,/makeChalkFromModel\(original\)/);
 assert.match(js,/wet abrasives|wet sanding|Wet sanding/);
 assert.match(js,/Clear wax|clear wax/);
 assert.match(js,/makeFinishingTools/);
 assert.match(js,/if\(e\.torch\)/);
 assert.match(js,/if\(e\.wax\)/);
 assert.match(js,/\/models\/coil-uploaded-v1\.glb/);
 assert.match(js,/host\.dataset\.modelReady='true'/);
});

test('review remains unlinked and delivers mobile and reduced-motion support',async()=>{
 assert.match(html,/THE MAKING \/ A PRIVATE STUDY/);
 assert.match(html,/works\/zsa-page-6/);
 assert.match(html,/designers-coil-v2\.webp/);
 assert.match(html,/house-of-mabwe-making-web-v1\.mp4/);
 assert.match(html,/not as a verified record of Coil being carved/);
 assert.match(html,/<video controls playsinline preload="metadata"/);
 assert.doesNotMatch(html,/<video[^>]*autoplay/);
 assert.match(css,/\.film-note\{/);
 assert.match(js,/prefers-reduced-motion/);
 assert.match(js,/scrollIntoView/);
 assert.match(css,/@media\(max-width:800px\)/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 const index=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.doesNotMatch(index,/prototypes\/stone-to-sculpture/);
 const dataDir=mkdtempSync(join(tmpdir(),'hos-making-v4-test-'));
 const app=createApp({dataDir,env:{ADMIN_PASSWORD:'test-only-prototype-password'},backgroundNotifications:false});
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 try{
  const url='http://127.0.0.1:'+app.server.address().port;
  for(const [route,mime] of [['/prototypes/stone-to-sculpture.html','text/html'],['/prototypes/stone-to-sculpture.js','text/javascript'],['/prototypes/stone-to-sculpture.css','text/css']]){
   const response=await fetch(url+route);
   assert.equal(response.status,200,route);
   assert.match(response.headers.get('content-type'),new RegExp(mime));
  }
 }finally{await new Promise(resolve=>app.server.close(resolve));rmSync(dataDir,{recursive:true,force:true})}
});
