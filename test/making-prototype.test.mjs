import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server.mjs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const html=readFileSync(new URL('../public/prototypes/stone-to-sculpture.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../public/prototypes/stone-to-sculpture.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/prototypes/stone-to-sculpture.css',import.meta.url),'utf8');

test('prototype browser module parses as valid JavaScript',()=>{
 const result=spawnSync(process.execPath,['--check',new URL('../public/prototypes/stone-to-sculpture.js',import.meta.url).pathname],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr||result.stdout);
});

test('scroll-driven source map is factual but does not imply a verified Coil quarry',()=>{
 assert.match(html,/name="robots" content="noindex,nofollow,noarchive"/);
 assert.match(html,/Z I M B A B W E/);
 assert.match(html,/GURUVE/);
 assert.match(html,/HARARE/);
 assert.match(html,/Illustrative region and transfer|a regional illustration/i);
 assert.match(html,/specific quarry, transport route and workshop location for Coil have not been verified/);
 assert.match(js,/const stops=\[0,\.075,\.17,\.29,\.37,\.45,\.565,\.765,\.835,\.90,\.96,1\]/);
 assert.match(js,/svg\.setAttribute\('viewBox'/);
 assert.match(js,/route\.getPointAtLength/);
 assert.doesNotMatch(js,/truck\.setAttribute\('transform',[^\n]*rotate/);
 assert.match(html,/class="pin-halo"/);
});

test('post-Harare process follows original Coil and credible material transitions',()=>{
 assert.match(js,/new THREE\.IcosahedronGeometry\(1,5\)/);
 assert.match(js,/function makeRock\(\)/);
 assert.match(js,/normals\.needsUpdate=true;return geo/);
 assert.match(js,/makeChalkFromModel\(original\)/);
 assert.match(js,/host\.dataset\.markingVisibility=/);
 assert.match(js,/const removed=\(Math\.floor\(strokes\)\+impact\)\/strokeCount/);
 assert.match(js,/float cutY=3\.46-3\.65\*smoothstep/);
 assert.match(js,/if\(uCarveProgress>\.002 && vLocalStone\.y\+1\.69>cutY\+ridge\)discard/);
 assert.match(js,/e\.carveRevealPlane\.constant=-revealHeight\+\.09/);
 assert.match(js,/e\.rock\.visible=handoff>\.02&&p<stops\[6\]/);
 assert.match(js,/e\.rock\.material\.transparent=false/);
 assert.match(js,/e\.rough\.visible=p>=stops\[6\]&&wax<\.999/);
 assert.match(js,/mat\.transparent=false;mat\.opacity=1;mat\.depthWrite=true/);
 assert.doesNotMatch(js,/e\.rock\.material\.opacity=1-rockFade/);
 assert.match(js,/const roughFade=1/);
 assert.match(js,/const roughOpacity=roughFade/);
 assert.match(js,/e\.intermediate\)e\.intermediate\.visible=false/);
 assert.match(js,/e\.blankCap\)e\.blankCap\.visible=false/);
 assert.match(js,/host\.dataset\.toolsHidden='true'/);
 assert.match(js,/makeRock\(\);makeStudio\(\);loadCoil\(\)/);
 assert.doesNotMatch(js,/makeFinishingTools\(\);loadCoil\(\)/);
 assert.match(js,/\/models\/coil-uploaded-v1\.glb/);
 assert.match(js,/host\.dataset\.modelReady='true'/);
 assert.match(js,/mat\.color\.setRGB\(lerp\(lerp\(\.092/);
 assert.match(js,/e\.polished\.visible=p>=\.90/);
 assert.match(js,/approvedRoughness/);
 assert.match(js,/e\.finishLight\.intensity=warming/);
 assert.match(js,/e\.root\.add\(base\);e\.plinth=base/);
 assert.match(js,/const mobileFrame=mobile\(\)\?smooth/);
 assert.match(css,/\.stage\[data-phase="6"\] \.archive-cutaway/);
 assert.match(css,/\.stage\[data-phase="6"\] \.stage-info/);
 assert.match(js,/\['CARVING','The form takes shape\.'/);
});

test('high-resolution mobile sculpture frames preserve detail without live WebGL',()=>{
 const manifest=JSON.parse(readFileSync(new URL('../public/assets/making-mobile-atlas-v5-manifest.json',import.meta.url),'utf8'));
 assert.equal(manifest.frameCount,192);
 assert.equal(manifest.columns,2);
 assert.equal(manifest.rows,3);
 assert.equal(manifest.generated.length,32);
 for(const idx of [0,15,31]){
  const asset=manifest.generated[idx];
  const bytes=readFileSync(new URL('../public/assets/'+asset.name,import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha256,'Baked frame checksum differs from manifest: '+asset.name);
 }
 assert(manifest.tileWidth>=450 && manifest.tileHeight>=950,'Phone source image must have native-size detail');
 assert(statSync(new URL('../public/assets/making-mobile-atlas-v5-00.webp',import.meta.url)).size>10000);
 assert(statSync(new URL('../public/assets/making-mobile-atlas-v5-31.webp',import.meta.url)).size>10000);
 assert.match(js,/atlasColumns=2,atlasRows=3,atlasGroupSize=6/);
 assert.match(js,/making-mobile-atlas-v5-/);
 assert.match(css,/background-size:200% 300%/);
 assert.match(js,/if\(mobile\(\)&&!atlasCapture\)setupMobileAtlas\(\)/);
 assert.match(js,/atlasCapture\?1\.5/);
});

test('review remains unlinked and delivers mobile and reduced-motion support',async()=>{
 assert.match(html,/THE MAKING \/ A PRIVATE STUDY/);
 assert.match(html,/works\/zsa-page-6/);
 assert.match(html,/designers-coil-v2\.webp/);
 assert.match(html,/making-chiseling-scrub-v1\.mp4/);
 assert.doesNotMatch(html,/house-of-mabwe-making-web-v1\.mp4/);
 assert(statSync(new URL('../public/assets/making-chiseling-scrub-v1.mp4',import.meta.url)).size>50000,'Verified chiseling-only clip must exist');
 assert(statSync(new URL('../public/assets/making-chiseling-poster-v1.jpg',import.meta.url)).size>5000,'Mobile first-frame fallback must exist');
 assert(statSync(new URL('../public/assets/making-chiseling-scroll-frames-v1.webp',import.meta.url)).size>10000,'Mobile scroll atlas must exist');
 assert.match(html,/id="archive-cutaway" aria-hidden="true"/);
 assert.match(html,/id="archive-film" muted playsinline/);
 assert.match(js,/const documentary=smooth/);
 assert.match(js,/function seekArchiveVideo\(p\)/);
 assert.match(js,/archiveFilm\.currentTime=archiveDesiredTime/);
 assert.match(js,/archiveFilm\.addEventListener\('seeked',\(\)=>/);
 assert.doesNotMatch(js,/archiveFilm\.play\(\)/);
 assert.match(js,/archiveFilm\.pause\(\)/);
 assert.match(css,/\.archive-cutaway\{/);
 assert.match(css,/\.archive-cutaway\[data-frame-ready/);
 assert.match(css,/\.archive-mobile-frames\{/);
 assert.match(css,/background-size:700% 600%/);
 assert.match(js,/archiveMobileFrames\.style\.backgroundPosition/);
 assert.match(html,/id="archive-mobile-frames"/);
 assert.match(js,/journey\.offsetHeight-stage\.offsetHeight/);
 assert.match(js,/if\(reduced\.matches\|\|mobile\(\)\)shownProgress=next/);
 assert.match(html,/not a record of Coil being carved/);
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
