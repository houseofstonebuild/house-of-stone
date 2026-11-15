// Verifies the live private prototype actually serves the exact v6 source and frames.
// GitHub check passes only when Railway deploys matching bytes. Read-only.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {setTimeout as sleep} from 'node:timers/promises';
const origin=(process.env.HOS_LIVE_URL||'https://houseofmabwe.com').replace(/\/$/,'');
const paths=[
 '/prototypes/stone-to-sculpture.html',
 '/prototypes/stone-to-sculpture.css',
 '/prototypes/stone-to-sculpture-v6.js',
 '/prototypes/approved-coil-reveal.js',
 '/models/coil-uploaded-v1.glb',
 '/assets/making-coil-approved-mobile-v1.png',
 '/assets/making-chiseling-scroll-frames-v1.webp',
 '/assets/making-v6/manifest.json',
 '/assets/making-v6/desktop/frame_000.webp',
 '/assets/making-v6/desktop/frame_085.webp',
 '/assets/making-v6/mobile/frame_000.webp',
 '/assets/making-v6/mobile/frame_143.webp'];
const sha=data=>createHash('sha256').update(data).digest('hex');
const expected=new Map(paths.map(path=>[path,sha(readFileSync(new URL('../public'+path,import.meta.url)))]));
const reports=[];
for(let attempt=0;attempt<18;attempt++){
 const checks=[];
 for(const path of paths){
  try{
   const response=await fetch(origin+path+'?making-v6-audit='+encodeURIComponent(process.env.GITHUB_SHA||String(attempt)),{cache:'no-store',signal:AbortSignal.timeout(16000)});
   const actual=sha(Buffer.from(await response.arrayBuffer()));
   checks.push({path,status:response.status,match:response.ok&&actual===expected.get(path),expected:expected.get(path),actual});
  }catch(error){checks.push({path,match:false,error:error.message})}
 }
 const ok=checks.every(x=>x.match);
 reports.push({attempt:attempt+1,ok,checks});
 console.log('Making v6 live check '+(attempt+1),ok?'PASS':'WAIT',checks.filter(x=>!x.match).map(x=>x.path).join(', '));
 if(ok)break;
 if(attempt<17)await sleep(12000);
}
mkdirSync(new URL('../test-results/live-making-v6/',import.meta.url),{recursive:true});
writeFileSync(new URL('../test-results/live-making-v6/verification.json',import.meta.url),JSON.stringify({origin,commit:process.env.GITHUB_SHA,verified:reports.at(-1).ok,attempts:reports},null,2));
if(!reports.at(-1).ok)throw Error('Private Making v6 deployment not verified; do not report as live.');
console.log('Live private Making v6 verified:',origin+'/prototypes/stone-to-sculpture.html');
