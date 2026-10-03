import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from '../server.mjs';

test('live database backup is consistent and explicit removal deletes an enquiry and its activity',async t=>{
  const dataDir=mkdtempSync(join(tmpdir(),'hos-ops-'));
  const app=createApp({dataDir,env:{ADMIN_PASSWORD:'test-inbox-password-123456789'},backgroundNotifications:false});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+app.server.address().port;
  t.after(async()=>{await new Promise(resolve=>app.server.close(resolve));rmSync(dataDir,{recursive:true,force:true});});
  const response=await fetch(base+'/api/inquiries',{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({submissionId:randomUUID(),sessionId:randomUUID(),name:'Backup visitor',email:'backup@example.test',interest:'Collecting a work',message:'A test enquiry.'})});
  const saved=await response.json();assert.equal(response.status,201);
  execFileSync(process.execPath,['scripts/backup.mjs'],{cwd:resolve(import.meta.dirname,'..'),env:{...process.env,DATA_DIR:dataDir},stdio:'pipe'});
  const files=readdirSync(join(dataDir,'backups')).filter(file=>file.endsWith('.sqlite'));assert.equal(files.length,1);
  const copy=new DatabaseSync(join(dataDir,'backups',files[0]));assert.equal(copy.prepare('SELECT count(*) AS n FROM inquiries').get().n,1);copy.close();
  assert.throws(()=>execFileSync(process.execPath,['scripts/remove-enquiry.mjs',saved.reference],{cwd:resolve(import.meta.dirname,'..'),env:{...process.env,DATA_DIR:dataDir},stdio:'pipe'}));
  assert.equal(app.db.prepare('SELECT count(*) AS n FROM inquiries').get().n,1);
  execFileSync(process.execPath,['scripts/remove-enquiry.mjs',saved.reference,'--confirm'],{cwd:resolve(import.meta.dirname,'..'),env:{...process.env,DATA_DIR:dataDir},stdio:'pipe'});
  assert.equal(app.db.prepare('SELECT count(*) AS n FROM inquiries').get().n,0);assert.equal(app.db.prepare('SELECT count(*) AS n FROM events').get().n,0);
});
