import { frameStudioImage } from '../public/studio-frame.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import {presentationFor,pageDescriptions} from '../public/presentation.js';
import {initializeGallery} from '../public/gallery.js';
import {applyWorkPhotography} from '../public/work-photography.js';
import { createApp } from '../server.mjs';

// A small DOM adapter exercises the actual client script and real HTTP server.
// It verifies interaction state and network contracts, not browser layout.
class Element {
  constructor() { this.hidden=false;this.disabled=false;this.dataset={};this.style={};this.children=[];this.listeners={};this.value='';this.textContent='';this.classList={contains:()=>false,toggle(){},add(){},remove(){}};this.nodes=new Map(); }
  addEventListener(name,listener) { (this.listeners[name] ??= []).push(listener); }
  async dispatch(name,extra={}) { const event={target:this,preventDefault(){},...extra};await Promise.all((this.listeners[name]||[]).map(listener=>listener(event))); }
  setAttribute(name,value) { this[name]=String(value); }
  getAttribute(name) { return this[name]; }
  removeAttribute(name) { delete this[name]; }
  showModal() { this.open=true; }
  close() { this.open=false; }
  querySelector(selector){if(!this.nodes.has(selector))this.nodes.set(selector,new Element());return this.nodes.get(selector);}
  toggleAttribute(name,value){if(value)this.setAttribute(name,'');else this.removeAttribute(name);}
  get childElementCount(){return this.children.length;}
  scrollTo(){}
  querySelectorAll() { return []; }
  append(...children) { this.children.push(...children); }
  prepend(...children) { this.children.unshift(...children); }
  after(...children) { this.children.push(...children); }
  before(...children) { this.children.unshift(...children); }
  remove() {}
  replaceChildren(...children) { this.children=children; }
  focus() { this.focused=true; }
  scrollIntoView(options) { this.scrolled=true;this.scrollOptions=options; }
  closest(selector) { const match=selector.match(/^\[data-([a-z-]+)\]$/); if(match){const key=match[1].replace(/-([a-z])/g,(_,c)=>c.toUpperCase());return this.dataset[key]!==undefined?this:null;}return null; }
}
class Storage { constructor(){this.values=new Map();}getItem(key){return this.values.get(key)||null;}setItem(key,value){this.values.set(key,String(value));}removeItem(key){this.values.delete(key);} }
async function clientFixture(t, {privacy=false,loseConfirmation=false,preview=false,initialPath='/'}={}) {
  const dataDir=mkdtempSync(join(tmpdir(),'hos-client-'));
  const password=webcrypto.randomUUID(),app=createApp({dataDir,env:{ADMIN_PASSWORD:password},backgroundNotifications:false});
  // Each isolated fixture creates a fresh credential in memory; no saved login is used.
  const previewHeaders=preview?{Authorization:'Basic '+Buffer.from(['admin',password].join(':')).toString('base64')}:{};
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
  const location={origin:base,pathname:preview?'/admin/preview/collection':initialPath,search:'?utm_source=designers&utm_campaign=first-look'};
  const windowListeners=new Map();
  const browserWindow={scrollY:0,scrollTo({top}){this.scrollY=top;},addEventListener(name,listener){windowListeners.set(name,listener);}};
  const entries=[{state:null,path:location.pathname}];let entryIndex=0;
  const browserHistory={state:null,
    pushState(state,title,path){entries.splice(++entryIndex);entries.push({state,path});this.state=state;location.pathname=path;},
    replaceState(state){entries[entryIndex]={state,path:location.pathname};this.state=state;},
    back(){if(entryIndex){const entry=entries[--entryIndex];this.state=entry.state;location.pathname=entry.path;windowListeners.get('popstate')?.();}}
  };
  const requests=[];let lost=false;
  const fetchImpl=async(path,options={})=>{
    const promise=(async()=>{const response=await fetch(base+path,{...options,headers:{...options.headers,...previewHeaders,...(options.method==='POST'?{Origin:base}:{})}});if(path==='/api/inquiries'&&loseConfirmation&&!lost){lost=true;throw new TypeError('Connection interrupted after server saved the enquiry');}return response;})();requests.push(promise.catch(()=>{}));return promise;
  };
  const context=vm.createContext({document:{body:new Element(),getElementById:id=>get('#'+id),querySelector:get,createElement:()=>new Element(),createTextNode:text=>Object.assign(new Element(),{textContent:String(text)}),referrer:'https://example.test/path?private=value'},navigator:{doNotTrack:privacy?'1':'0'},crypto:webcrypto,localStorage:new Storage(),sessionStorage:new Storage(),location,history:browserHistory,window:browserWindow,URL,URLSearchParams,AbortSignal,fetch:fetchImpl,presentationFor,pageDescriptions,initializeGallery,applyWorkPhotography,frameStudioImage,console});
  vm.runInContext(readFileSync(new URL('../public/app.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,''),context);
  async function flush(){for(let i=0;i<3;i++){await Promise.all([...requests]);await new Promise(resolve=>setImmediate(resolve));}}
  await flush();
  for(let attempt=0;root.dataset.ready!=='true'&&attempt<50;attempt++){await new Promise(resolve=>setTimeout(resolve,5));await flush();}
  assert.equal(root.dataset.ready,'true','The actual client must finish loading before interaction tests: '+get('.hos-hero-copy').children.map(node=>node.textContent).join(' | '));
  return {...app,get,form,root,location,browserWindow,flush,async delegated(data){const button=new Element();Object.assign(button.dataset,data);await root.dispatch('click',{target:button});await flush();}};
}
test('Back restores the visitor route and scroll position through work and artist pages',async t=>{
  const f=await clientFixture(t);f.browserWindow.scrollY=1840;
  await f.delegated({work:'folded-light'});assert.equal(f.location.pathname,'/works/folded-light');
  f.browserWindow.scrollY=240;await f.delegated({artist:'tariro'});assert.equal(f.location.pathname,'/artists/tariro-mavhunga');
  await f.delegated({back:''});assert.equal(f.location.pathname,'/works/folded-light');assert.equal(f.browserWindow.scrollY,240);
  await f.delegated({back:''});assert.equal(f.location.pathname,'/');assert.equal(f.browserWindow.scrollY,1840);assert.equal(f.get('#hos-page-navigation').hidden,true);
});
test('editorial copy loads with sculpture detail and process sections',async t=>{
  const f=await clientFixture(t);
  assert.equal(f.get('[data-page="making"]').querySelector('.hos-process-steps').children.length,5);
  // Approved homepage copy remains in place rather than being overwritten by story.json.
  assert.match(f.get('[data-page="home"]').querySelector('.hos-home-mission p').textContent,/House of Mabwe presents handcrafted sculpture/);
  await f.delegated({work:'folded-light'});
  assert.equal(f.get('#hos-work-story').hidden,true); // legacy seed has no matched editorial essay
});
test('Back on a directly opened sculpture safely returns to the collection',async t=>{
  const f=await clientFixture(t,{initialPath:'/works/folded-light'});assert.equal(f.get('#hos-page-navigation').hidden,false);
  await f.delegated({back:''});assert.equal(f.location.pathname,'/collection');
});
test('Discover scrolls to the home collection and records demand without opening another page',async t=>{
  const f=await clientFixture(t);await f.delegated({scrollCollection:''});
  assert.equal(f.location.pathname,'/');assert.equal(f.get('#hos-home-collection-title').scrolled,true);
  assert.equal(f.get('#hos-home-collection-title').focused,true);
  assert.equal(f.db.prepare("SELECT count(*) AS n FROM events WHERE name='explore_click'").get().n,1);
  assert.equal(f.db.prepare("SELECT count(*) AS n FROM events WHERE name='page_view'").get().n,1);
});
test('client navigates to a work and sends its reviewed enquiry to the private inbox',async t=>{
  const f=await clientFixture(t);await f.delegated({view:'collection'});assert.equal(f.location.pathname,'/collection');
  await f.delegated({work:'folded-light'});assert.equal(f.get('#hos-work-title').textContent,'Folded Light');
  await f.delegated({inquiry:'Folded Light by Tariro Mavhunga',inquiryWork:'folded-light'});
  f.form.elements.name.value='Client visitor';f.form.elements.email.value='client@example.test';f.form.elements.message.value='Please tell me more.';
  await f.form.dispatch('input');await f.form.dispatch('submit');assert.equal(f.form.hidden,true);assert.equal(f.get('#hos-inquiry-review').hidden,false);
  await f.get('#hos-inquiry-send').dispatch('click');await f.flush();
  assert.equal(f.get('#hos-inquiry-success').hidden,false);assert.equal(f.get('#hos-inquiry-title').textContent,'Inquiry received.');
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

