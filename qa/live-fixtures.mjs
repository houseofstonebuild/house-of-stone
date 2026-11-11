// Exercise the read-only deployment verifier against every supported public
// catalogue state. All publication below is confined to this temporary DB.
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createApp} from '../server.mjs';
import {prepareOwnerPublication} from '../scripts/publish-owner-release.mjs';
import {applyWorkPhotography} from '../public/work-photography.js';
const exec=promisify(execFile),dataDir=mkdtempSync(join(tmpdir(),'hos-release-fixtures-')),password=randomUUID();
const app=createApp({dataDir,env:{ADMIN_PASSWORD:password},backgroundNotifications:false});
await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+app.server.address().port,auth={Authorization:'Basic '+Buffer.from('admin:'+password).toString('base64')};
const api=async(path,data)=>{
 const response=await fetch(origin+'/api/admin/'+path,{headers:{...auth,...(data?{'Content-Type':'application/json',Origin:origin}:{})},...(data?{method:'POST',body:JSON.stringify(data)}:{})});
 assert(response.ok);return response.json();
};
// The public manifest may contain newly approved models for owner-replaced photos.
// Temporary catalogue fixtures use historical photos, so only source-matched and
// eligible models should be expected, rather than an old fixed count.
async function eligiblePublishedModelCount(){
 const catalog=await (await fetch(origin+'/content.json')).json();
 // The browser applies owner-approved studio photographs before checking model sources.
 // Count models against those same displayed photographs, not the unmodified DB assets.
 const editorial=JSON.parse(readFileSync(new URL('../public/editorial.json',import.meta.url),'utf8'));
 applyWorkPhotography(catalog,editorial.workPhotography);
 const manifest=JSON.parse(readFileSync(new URL('../public/models.json',import.meta.url),'utf8'));
 return catalog.works.filter(work=>{
   const entry=manifest[work.id];if(!entry||entry.source!==catalog.assets[work.image])return false;
   if(entry.uploaded)return entry.workId===work.id&&entry.ownerApproved===true;
   if(entry.reconstruction)return entry.workId===work.id&&(work.modelVerified===true||entry.ownerApproved===true)&&(!work.sourcePage||entry.sourcePage===work.sourcePage);
   return entry.title===work.title;
 }).length;
}
async function verify(name,modelCount,fallbackCount){
 const out=new URL(`../test-results/live-fixtures/${name}/`,import.meta.url);
 const env={...process.env,HOS_LIVE_URL:origin,HOS_LIVE_ATTEMPTS:'1',HOS_LIVE_RETRY_MS:'0',HOS_LIVE_OUTPUT:out.href};
 await exec(process.execPath,['qa/live.mjs'],{cwd:new URL('../',import.meta.url),env,maxBuffer:2*1024*1024});
 const report=JSON.parse(readFileSync(new URL('report.json',out),'utf8'));assert(report.passed);assert.equal(report.models.length,modelCount);assert.equal(report.photoFallbacks,fallbackCount);
 await exec(process.execPath,['qa/light-theme.mjs'],{cwd:new URL('../',import.meta.url),env:{...env,HOS_LIGHT_PREVIEW_URL:origin},maxBuffer:2*1024*1024});
 assert.equal(app.db.prepare('SELECT count(*) AS n FROM inquiries').get().n,0);assert.equal(app.db.prepare('SELECT count(*) AS n FROM events').get().n,0);
 console.log(`Release fixture passed: ${name}; ${report.routes} routes, ${modelCount} models, ${fallbackCount} photographic stars, zero writes.`);
}
try{
 if(process.env.HOS_RELEASE_FIXTURE==='owner-working'){
  const current=await api('content');const legacyModels=JSON.parse(readFileSync(new URL('../content/legacy-models.json',import.meta.url),'utf8'));let state=await api('content',{revision:current.revision,catalog:prepareOwnerPublication(current.draft,undefined,legacyModels)});await api('publish',{revision:state.revision});
  const live=await(await fetch(origin+'/content.json')).json();assert.equal(live.works.length,23);assert(live.works.every(w=>w.artistId&&w.title&&w.material&&w.dimensions));assert.equal(live.works.filter(w=>w.modelVerified).length,5);
  await verify('collections-owner-working',17,5);
 }else{
 await verify('legacy',5,0);
 let state=await api('prepare-founding-collection',{revision:0});await api('publish',{revision:state.revision});
 await verify('collections-unconfirmed',await eligiblePublishedModelCount(),5);
 state=await api('content');for(const work of state.draft.works)if(work.modelStatus==='review')work.verification.model=true;
 state=await api('content',{revision:state.revision,catalog:state.draft});await api('publish',{revision:state.revision});
 await verify('collections-confirmed',await eligiblePublishedModelCount(),5);
 }
}finally{await new Promise(resolve=>app.server.close(resolve));rmSync(dataDir,{recursive:true,force:true});}
