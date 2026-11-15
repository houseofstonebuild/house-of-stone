// Read-only verification of the exact private sculpture process code and
// versioned phone animation served by the public House of Mabwe origin.
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';

// Verify the exact v5 private process source after the mobile frame publisher commits.
const origin=(process.env.HOS_LIVE_URL||'https://houseofmabwe.com').replace(/\/$/,'');
const paths=['/prototypes/stone-to-sculpture.html','/prototypes/stone-to-sculpture.js','/prototypes/stone-to-sculpture.css',
 '/assets/making-mobile-atlas-v5-manifest.json','/assets/making-mobile-atlas-v5-00.webp','/assets/making-mobile-atlas-v5-31.webp'];
const expected=new Map(paths.map(path=>[path,createHash('sha256').update(readFileSync(new URL('../public'+path,import.meta.url))).digest('hex')]));
const output=new URL('../test-results/live-making/',import.meta.url);mkdirSync(output,{recursive:true});
const findings=[];
for(let attempt=0;attempt<12;attempt++){
 const checks=[];
 for(const path of paths){
  try{
   const url=origin+path+'?making-verification='+encodeURIComponent(process.env.GITHUB_SHA||String(attempt));
   const response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(16000)});
   const bytes=Buffer.from(await response.arrayBuffer());
   const sha256=createHash('sha256').update(bytes).digest('hex');
   checks.push({path,status:response.status,expected:expected.get(path),received:sha256,match:response.ok&&sha256===expected.get(path)});
  }catch(err){checks.push({path,match:false,error:err.message})}
 }
 const ok=checks.every(x=>x.match);
 findings.push({attempt:attempt+1,ok,checks});
 console.log('Making live release check',attempt+1,ok?'matched':'not deployed',checks.filter(c=>!c.match).map(c=>c.path+':'+(c.status||c.error)).join(', '));
 if(ok)break;
 if(attempt<11)await delay(10000);
}
const verified=findings.at(-1).ok;
const report={origin,commit:process.env.GITHUB_SHA,verified,findings};
writeFileSync(new URL('verification.json',output),JSON.stringify(report,null,2));
if(!verified)throw new Error('Latest workshop prototype and v4 imagery have not reached the public origin. Do not report live.');
console.log('Verified exact workshop release at',origin);
