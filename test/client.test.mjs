import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { createApp } from '../server.mjs';

// A small DOM adapter exercises the actual client script and real HTTP server.
// It verifies interaction state and network contracts, not browser layout.
class Element {
  constructor() { this.hidden=false;this.disabled=false;this.dataset={};this.style={};this.children=[];this.listeners={};this.value='';this.textContent='';this.classList={contains:()=>false,toggle(){},add(){}}; }
  addEventListener(name,listener) { (this.listeners[name] ??= []).push(listener); }
  async dispatch(name,extra={}) { const event={target:this,preventDefault(){},...extra};await Promise.all((this.listeners[name]||[]).map(listener=>listener(event))); }
  setAttribute(name,value) { this[name]=String(value); }
  getAttribute(name) { return this[name]; }
  removeAttribute(name) { delete this[name]; }
  showModal() { this.open=true; }
  close() { this.open=false; }
  querySelectorAll() { return []; }
  append(...children) { this.children.push(...children); }
  prepend(...children) { this.children.unshift(...children); }
  replaceChildren(...children) { this.children=children; }
  focus() { this.focused=true; }
  closest(selector) { const match=selector.match(/^\[data-([a-z-]+)\]$/); if(match){const key=match[1].replace(/-([a-z])/g,(_,c)=>c.toUpperCase());return this.dataset[key]!==undefined?this:null;}return null; }
}
class Storage { constructor(){this.values=new Map();}getItem(key){return this.values.get(key)||null;}setItem(key,value){this.values.set(key,String(value));}removeItem(key){this.values.delete(key);} }
async function clientFixture(t, {privacy=false,loseConfirmation=false,preview=false}={}) {
  const dataDir=mkdtempSync(join(tmpdir(),'hos-client-'));
  const app=createApp({dataDir,env:{ADMIN_PASSWORD:'test-only-inbox-password-123456'},backgroundNotifications:false});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+app.server.address().port;
  t.after(async()=>{await new Promise(resolve=>app.server.close(resolve));rmSync(dataDir,{recursive:true,force:true});});
  const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  const selectors=new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>['#'+m[1],new Element()]));
  const root=selectors.get('#hos-concept');
  const get=selector=>{if(!selectors.has(selector)) selectors.set(selector,new Element());return selectors.get(selector);};
  const pages=['home','collection','artists','artist','work','making','designers','collectors','house','privacy'].map(page=>{const node=get(`[data-page="${page}"]`);node.dataset.page=page;return node;});
  root.querySelector=get;root.querySelectorAll=selector=>selector==='[data-page]'?pages:[];
  const form=get('#hos-inquiry-form');form.elements={};
  for(const field of ['name','email','interest','message','website'])form.elements[field]=new Element();
  form.reset=()=>{for(const field of Object.values(form.elements))field.value='';form.elements.interest.value='Collecting a work';};form.reportValidity=()=>Boolean(form.elements.name.value&&form.elements.email.value);form.reset();
  const location={origin:base,pathname:preview?'/admin/preview/collection':'/',search:'?utm_source=designers&utm_campaign=first-look'};
  const requests=[];let lost=false;
  const fetchImpl=async(path,options={})=>{
    const promise=(async()=>{const response=await fetch(base+path,{...options,headers:{...options.headers,...(preview?{Authorization:'Basic '+Buffer.from('admin:test-only-inbox-password-123456').toString('base64')}:{}) ,...(options.method==='POST'?{Origin:base}:{})}});if(path==='/api/inquiries'&&loseConfirmation&&!lost){lost=true;throw new TypeError('Connection interrupted after server saved the enquiry');}return response;})();requests.push(promise.catch(()=>{}));return promise;
  };
  const context=vm.createContext({document:{body:new Element(),getElementById:id=>get('#'+id),querySelector:get,createElement:()=>new Element(),referrer:'https://example.test/path?private=value'},navigator:{doNotTrack:privacy?'1':'0'},crypto:webcrypto,localStorage:new Storage(),sessionStorage:new Storage(),location,history:{pushState(state,title,path){location.pathname=path;}},window:{scrollTo(){},addEventListener(){}},URL,URLSearchParams,AbortSignal,fetch:fetchImpl,console});
  vm.runInContext(readFileSync(new URL('../public/app.js',import.meta.url),'utf8'),context);
  async function flush(){for(let i=0;i<3;i++){await Promise.all([...requests]);await new Promise(resolve=>setImmediate(resolve));}}
  await flush();
  return {...app,get,form,root,location,flush,async delegated(data){const button=new Element();Object.assign(button.dataset,data);await root.dispatch('click',{target:button});await flush();}};
}
test('client navigates to a work and sends its reviewed enquiry to the private inbox',async t=>{
  const f=await clientFixture(t);await f.delegated({view:'collection'});assert.equal(f.location.pathname,'/collection');
  await f.delegated({work:'folded-light'});assert.equal(f.get('#hos-work-title').textContent,'Folded Light');
  await f.delegated({inquiry:'Folded Light by Tariro Mavhunga',inquiryWork:'folded-light'});
  f.form.elements.name.value='Client visitor';f.form.elements.email.value='client@example.test';f.form.elements.message.value='Please tell me more.';
  await f.form.dispatch('input');await f.form.dispatch('submit');assert.equal(f.form.hidden,true);assert.equal(f.get('#hos-inquiry-review').hidden,false);
  await f.get('#hos-inquiry-send').dispatch('click');await f.flush();
  assert.equal(f.get('#hos-inquiry-success').hidden,false);assert.equal(f.get('#hos-inquiry-title').textContent,'Enquiry received.');
  const inquiry=f.db.prepare('SELECT * FROM inquiries').get();assert.equal(inquiry.work_id,'folded-light');assert.equal(inquiry.source,'designers');assert.equal(inquiry.name,'Client visitor');
  for(const name of ['page_view','explore_click','work_view','inquiry_opened','inquiry_started','inquiry_submitted'])assert(f.db.prepare('SELECT count(*) AS n FROM events WHERE name=?').get(name).n>0,name+' missing');
});
test('lost confirmation keeps the draft, and a client retry reaches success without duplicate enquiries',async t=>{
  const f=await clientFixture(t,{loseConfirmation:true});await f.delegated({inquiry:'General interest'});
  f.form.elements.name.value='Retry visitor';f.form.elements.email.value='retry@example.test';await f.form.dispatch('submit');
  await f.get('#hos-inquiry-send').dispatch('click');assert.equal(f.get('#hos-inquiry-review').hidden,false);assert.equal(f.form.elements.name.value,'Retry visitor');assert(f.get('#hos-form-status').textContent.includes('Please try again'));
  await f.get('#hos-inquiry-send').dispatch('click');await f.flush();assert.equal(f.get('#hos-inquiry-success').hidden,false);assert.equal(f.db.prepare('SELECT count(*) AS n FROM inquiries').get().n,1);
});
test('browser privacy signal disables client activity while allowing a real enquiry',async t=>{
  const f=await clientFixture(t,{privacy:true});await f.delegated({view:'collection'});await f.delegated({inquiry:'General interest'});
  f.form.elements.name.value='Private visitor';f.form.elements.email.value='private@example.test';await f.form.dispatch('input');await f.form.dispatch('submit');await f.get('#hos-inquiry-send').dispatch('click');await f.flush();
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM inquiries').get().n,1);assert.equal(f.db.prepare('SELECT count(*) AS n FROM events').get().n,0);assert.equal(f.get('#hos-analytics-preference').disabled,true);
});
test('private preview navigation remains private and cannot record demand or send enquiries',async t=>{
  const f=await clientFixture(t,{preview:true});await f.delegated({work:'folded-light'});assert.equal(f.location.pathname,'/admin/preview/works/folded-light');
  assert.equal(f.get('#hos-work-title').textContent,'Folded Light');
  await f.delegated({inquiry:'General interest'});await f.get('#hos-inquiry-send').dispatch('click');await f.flush();
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM inquiries').get().n,0);assert.equal(f.db.prepare('SELECT count(*) AS n FROM events').get().n,0);
});
