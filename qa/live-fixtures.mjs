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
const exec=promisify(execFile),dataDir=mkdtempSync(join(tmpdir(),'hos-release-fixtures-')),password=randomUUID();
const app=createApp({dataDir,env:{ADMIN_PASSWORD:password},backgroundNotifications:false});
await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+app.server.address().port,auth={Authorization:'Basic '+Buffer.from('admin:'+password).toString('base64')};
const api=async(path,data)=>{
 const response=await fetch(origin+'/api/admin/'+path,{headers:{...auth,...(data?{'Content-Type':'application/json',Origin:origin}:{})},...(data?{method:'POST',body:JSON.stringify(data)}:{})});
 assert(response.ok);return response.json();
};
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
 await verify('legacy',5,0);
 let state=await api('prepare-founding-collection',{revision:0});await api('publish',{revision:state.revision});
 await verify('collections-unconfirmed',0,5);
 state=await api('content');for(const work of state.draft.works)if(work.modelStatus==='review')work.verification.model=true;
 state=await api('content',{revision:state.revision,catalog:state.draft});await api('publish',{revision:state.revision});
 await verify('collections-confirmed',5,0);
}finally{await new Promise(resolve=>app.server.close(resolve));rmSync(dataDir,{recursive:true,force:true});}
