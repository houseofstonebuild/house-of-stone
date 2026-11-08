import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createApp } from '../server.mjs';
const PASSWORD = 'test-only-admin-password-123456';
async function fixture(t, extra = {}) {
  const dataDir = mkdtempSync(join(tmpdir(),'hos-test-'));
  const app = createApp({dataDir,env:{ADMIN_PASSWORD:PASSWORD,...extra.env},backgroundNotifications:false,...extra});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const base = 'http://127.0.0.1:' + app.server.address().port;
  const headers = {'Content-Type':'application/json',Origin:base};
  const auth = {Authorization:'Basic ' + Buffer.from('admin:' + PASSWORD).toString('base64')};
  t.after(async()=>{await new Promise(resolve=>app.server.close(resolve));rmSync(dataDir,{recursive:true,force:true});});
  return {...app,base,headers,auth};
}
function enquiry(overrides = {}) { return {submissionId:randomUUID(),sessionId:randomUUID(),name:'A collector',email:'collector@example.test',interest:'Collecting a work',message:'Interested in this work.',workId:'folded-light',page:'work',attribution:{source:'launch-email',medium:'email',campaign:'founding'},...overrides}; }
async function post(f,path,data) { return fetch(f.base+path,{method:'POST',headers:f.headers,body:JSON.stringify(data)}); }

test('real enquiry persists, retry is idempotent, and conversion is counted only once',async t=>{
  const f=await fixture(t),input=enquiry();
  const response=await post(f,'/api/inquiries',input); assert.equal(response.status,201);
  const saved=await response.json();assert.equal(saved.ok,true);assert.match(saved.reference,/^[0-9a-f-]{36}$/);
  const retry=await post(f,'/api/inquiries',input);assert.equal(retry.status,200);assert.equal((await retry.json()).reference,saved.reference);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM inquiries').get().n,1);
  assert.equal(f.db.prepare("SELECT count(*) AS n FROM events WHERE name='inquiry_submitted'").get().n,1);
  const row=f.db.prepare('SELECT * FROM inquiries').get();assert.equal(row.work_id,'folded-light');assert.equal(row.notification,'inbox_only');assert.notEqual(row.session_hash,input.sessionId);
  const changed=await post(f,'/api/inquiries',{...input,message:'Different message'});assert.equal(changed.status,409);
  const inbox=await fetch(f.base+'/api/admin/inquiries',{headers:f.auth});assert.equal((await inbox.json())[0].email,input.email);
});
test('activity deduplicates, excludes input content, and cannot forge conversions',async t=>{
  const f=await fixture(t),id=randomUUID(),sessionId=randomUUID();
  const input={id,sessionId,name:'work_view',page:'work',workId:'folded-light',attribution:{source:'instagram',referrer:'https://example.test/private?email=secret'},email:'never-store@example.test',message:'never-store'};
  assert.equal((await post(f,'/api/events',input)).status,202);assert.equal((await post(f,'/api/events',input)).status,202);
  const rows=f.db.prepare('SELECT * FROM events').all();assert.equal(rows.length,1);assert.equal(rows[0].referrer,'example.test');assert(!JSON.stringify(rows).includes('never-store'));assert.notEqual(rows[0].session_hash,sessionId);
  assert.equal((await post(f,'/api/events',{...input,id:randomUUID(),name:'inquiry_submitted'})).status,400);
  assert.equal((await post(f,'/api/events',{...input,id:randomUUID(),workId:'missing'})).status,400);
});
test('invalid enquiries, spam field, oversized payloads, and cross-site requests are rejected',async t=>{
  const f=await fixture(t);
  for(const changes of [{email:'not-an-email'},{name:''},{message:'x'.repeat(5001)},{website:'spam'},{interest:'Unknown'},{workId:'not-listed'}]) assert.equal((await post(f,'/api/inquiries',enquiry(changes))).status,400);
  assert.equal((await post(f,'/api/inquiries',enquiry({message:'x'.repeat(25000)}))).status,413);
  const external=await fetch(f.base+'/api/inquiries',{method:'POST',headers:{...f.headers,Origin:'https://unrelated.example'},body:JSON.stringify(enquiry())});assert.equal(external.status,403);
  const wrongType=await fetch(f.base+'/api/inquiries',{method:'POST',headers:{'Content-Type':'text/plain'},body:'hello'});assert.equal(wrongType.status,415);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM inquiries').get().n,0);
});
test('inbox, exports, credentials and server files are private; CSV neutralizes formulas',async t=>{
  const f=await fixture(t);
  for(const path of ['/admin','/admin.html','/admin.js','/api/admin/inquiries','/api/admin/export/inquiries.csv']) assert.equal((await fetch(f.base+path)).status,401);
  for(const path of ['/.env','/server.mjs','/content/catalog.json','/data/house-of-stone.sqlite']) assert.equal((await fetch(f.base+path)).status,404);
  assert.equal((await fetch(f.base+'/assets%2f..%2fadmin.html')).status,400);
  assert.equal((await fetch(f.base+'/ADMIN.html')).status,401);
  assert.equal((await fetch(f.base+'/admin',{headers:f.auth})).status,200);
  await post(f,'/api/inquiries',enquiry({name:'=FORMULA()',message:' \t=HYPERLINK("bad")'}));
  const response=await fetch(f.base+'/api/admin/export/inquiries.csv',{headers:f.auth});assert.equal(response.status,200);const text=await response.text();assert(text.includes("'=FORMULA()"));assert(text.includes("'=HYPERLINK"));
});
test('measurement opt-out still accepts an enquiry, and direct enquiries appear in work demand',async t=>{
  const f=await fixture(t);assert.equal((await post(f,'/api/inquiries',enquiry({sessionId:''}))).status,201);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM events').get().n,0);
  const result=await (await fetch(f.base+'/api/admin/summary',{headers:f.auth})).json();assert.equal(result.inquiries,1);assert.equal(result.works[0].inquiries,1);assert.equal(result.works[0].views,0);
});
test('funnel counts distinct sessions, records campaign attribution, and rate limits abuse',async t=>{
  const f=await fixture(t),sessionId=randomUUID();
  for(const name of ['page_view','explore_click','work_view','work_view','inquiry_started','photo_view']) assert.equal((await post(f,'/api/events',{id:randomUUID(),sessionId,name,page:'collection',workId:name==='work_view'?'folded-light':'',attribution:{source:'designer-outreach'}})).status,202);
  for(let i=0;i<5;i++) assert.equal((await post(f,'/api/inquiries',enquiry({sessionId}))).status,201);
  assert.equal((await post(f,'/api/inquiries',enquiry({sessionId}))).status,429);
  const result=await (await fetch(f.base+'/api/admin/summary?days=30',{headers:f.auth})).json();assert.equal(result.funnel.find(s=>s.name==='work_view').sessions,1);assert.equal(result.funnel.find(s=>s.name==='work_view').events,2);assert.equal(result.sources[0].source,'designer-outreach');assert.equal(result.photoActivity.sessions,1);
});
test('artist and work links, metadata, sitemap and health are ready for hosting',async t=>{
  const f=await fixture(t);
  for(const path of ['/','/collection','/artists','/making','/designers','/collectors','/house','/artists/tariro-mavhunga','/works/folded-light','/privacy']) {const r=await fetch(f.base+path);assert.equal(r.status,200);const html=await r.text();assert(!html.includes('{{TITLE}}'));assert(html.includes('name="robots" content="noindex,nofollow"'));assert(r.headers.get('content-security-policy').includes("connect-src 'self'"));}
  const html=await (await fetch(f.base+'/works/folded-light')).text();assert(html.includes('Folded Light | House of Mabwe'));
  assert((await (await fetch(f.base+'/sitemap.xml')).text()).includes('/works/folded-light'));
  assert((await (await fetch(f.base+'/sitemap.xml')).text()).includes('/collectors'));
  for (const path of ['/media-manifest.json','/editorial.json']) {const response=await fetch(f.base+path);assert.equal(response.status,200);assert(response.headers.get('content-type').includes('application/json'));assert(Object.keys(await response.json()).length);}
  assert((await (await fetch(f.base+'/robots.txt')).text()).includes('Disallow: /'));
  assert.equal((await fetch(f.base+'/health')).status,200);assert.equal((await fetch(f.base+'/missing')).status,404);
});
test('email notification failure keeps the enquiry and retries without sending a duplicate',async t=>{
  let calls=0,lastHeaders,payload;
  const f=await fixture(t,{env:{ADMIN_PASSWORD:PASSWORD,RESEND_API_KEY:'test-key',INQUIRY_EMAIL_FROM:'house@example.test',INQUIRY_EMAIL_TO:'founder@example.test'},fetchImpl:async(url,options)=>{calls++;lastHeaders=options.headers;payload=JSON.parse(options.body);return calls===1?{ok:false}:{ok:true,json:async()=>({id:'accepted-email-id'})};}});
  const response=await post(f,'/api/inquiries',enquiry());assert.equal(response.status,201);
  await f.flushNotifications();let row=f.db.prepare('SELECT * FROM inquiries').get();assert.equal(row.notification,'retrying');assert.equal(calls,1);
  f.db.prepare('UPDATE inquiries SET notification_next_at=?').run(new Date(0).toISOString());
  await f.flushNotifications();row=f.db.prepare('SELECT * FROM inquiries').get();assert.equal(row.notification,'sent');assert.equal(row.notification_id,'accepted-email-id');assert.equal(lastHeaders['Idempotency-Key'],'hos-'+row.id);assert.equal(payload.reply_to,'collector@example.test');assert.equal(calls,2);
  await f.flushNotifications();assert.equal(calls,2);
});
test('saved enquiries survive a server restart',async t=>{
  const dataDir=mkdtempSync(join(tmpdir(),'hos-persistence-'));
  const env={ADMIN_PASSWORD:PASSWORD};
  const first=createApp({dataDir,env,backgroundNotifications:false});await new Promise(resolve=>first.server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+first.server.address().port;
  assert.equal((await fetch(base+'/api/inquiries',{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify(enquiry())})).status,201);
  await new Promise(resolve=>first.server.close(resolve));
  const second=createApp({dataDir,env,backgroundNotifications:false});assert.equal(second.db.prepare('SELECT count(*) AS n FROM inquiries').get().n,1);
  second.server.emit('close');rmSync(dataDir,{recursive:true,force:true});
});
