import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';
import { createApp } from '../server.mjs';

class Element {
  constructor(tag='div'){this.tagName=tag;this.children=[];this.listeners={};this.value='';this.disabled=false;this.hidden=false;this.attributes={};this.files=[];}
  append(...items){this.children.push(...items);}
  replaceChildren(...items){this.children=items;}
  setAttribute(name,value){this.attributes[name]=String(value);}
  addEventListener(name,listener){(this.listeners[name]??=[]).push(listener);}
  async dispatch(name){await Promise.all((this.listeners[name]||[]).map(listener=>listener({target:this,preventDefault(){}})));}
  click(){return this.dispatch('click');}
}
function tree(item){return [item,...item.children.filter(child=>child instanceof Element).flatMap(tree)];}
async function fixture(t){
  const dataDir=mkdtempSync(join(tmpdir(),'hos-editor-')),password='private-editor-test-password-123';
  const app=createApp({dataDir,env:{ADMIN_PASSWORD:password},backgroundNotifications:false});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+app.server.address().port;
  t.after(async()=>{await new Promise(resolve=>app.server.close(resolve));rmSync(dataDir,{recursive:true,force:true});});
  const html=readFileSync(new URL('../public/admin-content.html',import.meta.url),'utf8');
  const roots=new Map([...html.matchAll(/<([a-z]+)[^>]*\bid="([^"]+)"/g)].map(m=>[m[2],Object.assign(new Element(m[1]),{id:m[2]})]));
  const all=()=>[...new Set([...roots.values()].flatMap(tree))];
  const get=selector=>all().find(item=>item.id===selector.slice(1));
  const requests=[],tabs=[];
  const auth='Basic '+Buffer.from('admin:'+password).toString('base64');
  const fetchImpl=(path,options={})=>{
    const promise=fetch(base+path,{...options,headers:{Authorization:auth,...options.headers,...(options.method==='POST'?{Origin:base}:{})}});
    requests.push(promise);return promise;
  };
  class Reader {readAsDataURL(file){this.result='data:'+file.type+';base64,'+file.bytes.toString('base64');this.onload();}}
  const context=vm.createContext({document:{querySelector:get,querySelectorAll:selector=>all().filter(item=>selector.split(',').map(tag=>tag.trim()).includes(item.tagName)),createElement:tag=>new Element(tag)},window:{addEventListener(){},open(){const tab={location:{href:'about:blank'},close(){this.closed=true;}};tabs.push(tab);return tab;}},fetch:fetchImpl,crypto:webcrypto,structuredClone,FileReader:Reader,Blob,URL,console});
  vm.runInContext(readFileSync(new URL('../public/admin-content.js',import.meta.url),'utf8'),context);
  const flush=async()=>{for(let i=0;i<4;i++){await Promise.all(requests);await new Promise(resolve=>setImmediate(resolve));}};
  await flush();
  return {app,get,all,tabs,flush,base,auth,async input(id,value){const field=get('#field-'+id);assert(field,'Missing field '+id);field.value=value;await field.dispatch('input');},async click(id){await get('#'+id).dispatch('click');await flush();},async state(){return (await fetch(base+'/api/admin/content',{headers:{Authorization:auth}})).json();}};
}
test('actual editor saves drafts, previews privately, and publishes an added sculpture',async t=>{
  const f=await fixture(t);assert.equal(f.get('#field-title').value,'Folded Light');
  await f.input('title','Soft Light');await f.click('save');let state=await f.state();assert.equal(state.draft.works[0].title,'Soft Light');assert.equal(state.unpublished,true);
  await f.click('preview');assert.equal(f.tabs[0].location.href,'/admin/preview');
  await f.click('add-work');await f.input('title','New Form');assert.equal(f.get('#field-slug').value,'new-form');
  await f.input('dimensions','30 × 20 × 15 cm');await f.input('material','Springstone');await f.input('description','A quiet curved form.');
  const photo=tree(f.get('#fields')).find(item=>item.tagName==='button'&&item.attributes['aria-label']==='fold');assert(photo);await photo.click();
  await f.click('publish');state=await f.state();assert.equal(state.unpublished,false);assert.equal(state.draft.works.length,6);
  const live=await (await fetch(f.base+'/content.json')).json();assert.equal(live.works.at(-1).title,'New Form');assert.equal(live.works.at(-1).image,'fold');
});
test('actual editor uploads photos, edits the hero and retains unsaved edits on a conflict',async t=>{
  const f=await fixture(t),bytes=readFileSync(new URL('../public/assets/fold.jpg',import.meta.url));
  let upload=tree(f.get('#fields')).find(item=>item.tagName==='input'&&item.type==='file');upload.files=[{type:'image/jpeg',size:bytes.length,bytes}];await upload.dispatch('change');await f.flush();
  assert(f.get('#status').textContent.includes('Photo uploaded'));
  await f.click('save');assert.match((await f.state()).draft.works[0].image,/^upload_/);
  await f.click('site');const photo=tree(f.get('#fields')).find(item=>item.tagName==='button'&&item.attributes['aria-label']==='balance');await photo.click();await f.click('save');assert.equal((await f.state()).draft.assets.hero,'/assets/balance.jpg');
  await f.input('location','Harare / New York');
  const external=await f.state();external.draft.site.location='Harare';
  await fetch(f.base+'/api/admin/content',{method:'POST',headers:{Authorization:f.auth,'Content-Type':'application/json',Origin:f.base},body:JSON.stringify({revision:external.revision,catalog:external.draft})});
  await f.click('save');assert.equal(f.get('#conflict').hidden,false);assert.equal(f.get('#field-location').value,'Harare / New York');assert.equal((await f.state()).draft.site.location,'Harare');
});
