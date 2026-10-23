import {defaultPresentation} from './presentation.js';
import {preparePhoto} from './media-upload.js';
const $ = selector => document.querySelector(selector);
const fields = $('#fields');
let state, draft, selection = {kind:'work',id:''}, dirty = false, busy = false;
const date = value => new Date(value).toLocaleString();
const address = value => value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,100).replace(/-$/,'');
function element(tag, text, className) { const item = document.createElement(tag); if (text !== undefined) item.textContent = text; if (className) item.className = className; return item; }
function message(value, error = false) { $('#status').textContent = value; $('#status').setAttribute('role',error?'alert':'status'); }
function status() {
  if (!state) return;
  $('#state').textContent = dirty ? 'Unsaved changes in this window' : state.unpublished ? 'Draft saved · Changes are not live yet' : `Published · ${date(state.publishedAt)}`;
}
function edited() { dirty = true; status(); }
function lock(value) {
  busy = value;
  for (const control of document.querySelectorAll('button, input, select, textarea, fieldset')) control.disabled = value;
  status();
}
async function api(path, data) {
  const response = await fetch('/api/admin/' + path, data === undefined ? {} : {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  const result = await response.json();
  if (!response.ok) { if (response.status === 409) $('#conflict').hidden = false; throw new Error(result.error || 'Please try again.'); }
  return result;
}
function accept(result) {
  state = result; draft = structuredClone(result.draft);
  if (!draft.site.heroImage) { draft.assets['designer-apartment'] ||= '/assets/designer-apartment.jpg'; draft.site.heroImage = 'designer-apartment'; draft.site.heroAlt = 'Stone sculptures in a New York apartment overlooking Manhattan'; }
  draft.site.presentation ||= structuredClone(defaultPresentation);
  dirty = false; $('#conflict').hidden = true;
}
async function save() {
  if (!dirty) return;
  accept(await api('content',{revision:state.revision,catalog:draft}));
}
async function operation(action) {
  if (busy || !state) return;
  lock(true); message('');
  try { await action(); render(); }
  catch (error) { message(error.message,true); }
  finally { lock(false); }
}
function selected() { return selection.kind === 'site' ? draft.site : draft[selection.kind === 'artist'?'artists':selection.kind === 'collection'?'collections':'works'].find(item=>item.id===selection.id); }
function field(parent, record, key, label, {wide=false, multiline=false, options, required=false, max=200} = {}) {
  const wrapper = element('label',label,wide?'wide':'');
  const input = element(options?'select':multiline?'textarea':'input'); input.id = 'field-' + key + (document.querySelector('#field-'+key)?'-'+crypto.randomUUID():''); input.name = key;
  if (options) for (const choice of options) { const option = element('option',choice.label); option.value = choice.value; input.append(option); }
  if (!options) { input.maxLength = max; if (!multiline) input.type = 'text'; }
  input.required = required; input.value = record[key] || '';
  input.addEventListener('input',()=>{
    record[key] = input.value;
    if(key==='slug') record._automaticAddress=false;
    if((key==='name'||key==='title')&&record._automaticAddress) {record.slug=address(input.value);$('#field-slug').value=record.slug;}
    edited(); if (key==='name'||key==='title') renderLists();
  });
  wrapper.append(input); parent.append(wrapper); return input;
}
function photo(record,key,label,parent=fields) {
  const section = element('div',undefined,'photo-editor'); section.append(element('h3',label));
  const current = element('div',undefined,'photo-current'), img = element('img');
  img.alt = label; img.hidden = !draft.assets[record[key]]; if (!img.hidden) img.src = draft.assets[record[key]];
  const wrapper = element('label','Upload a new photo'), input = element('input'); input.type='file'; input.accept='image/jpeg,image/png,image/webp';
  wrapper.append(input,element('span','JPEG, PNG or WebP · up to 32 MB. Original resolution is preserved; responsive sizes are prepared automatically. Use a sharp, well-lit image with the entire work visible.','note')); current.append(img,wrapper); section.append(current);
  input.addEventListener('change',()=>operation(async()=>{
    const file = input.files[0]; if (!file) return;
    if (file.size > 32*1024*1024 || !['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('Choose a JPEG, PNG or WebP image under 32 MB.');
    message('Uploading photo…');
    const uploaded=await api('media',await preparePhoto(file)); draft.assets[uploaded.key] = uploaded.url; record[key] = uploaded.key;if(selection.kind==='work' && ['image','left','right','back'].includes(key)){const work=selected();if(work.verification)work.verification.model=false;work.modelStatus='needed';}edited(); message('Photo uploaded. Save the draft or publish when ready.');
  }));
  const details = element('details'), grid = element('div',undefined,'photo-grid'); details.append(element('summary','Choose an existing photo'),grid);
  for (const [asset,url] of Object.entries(draft.assets)) {
    if (asset === 'logo') continue;
    const button = element('button'); button.type='button'; button.title = asset.startsWith('upload_')?'Uploaded photo':asset;
    button.setAttribute('aria-label',button.title); button.setAttribute('aria-pressed',String(asset===record[key]));
    const thumb=element('img'); thumb.src=url; thumb.alt=''; thumb.loading='lazy'; button.append(thumb);
    button.addEventListener('click',()=>{record[key]=asset;if(selection.kind==='work' && ['image','left','right','back'].includes(key)){const work=selected();if(work.verification)work.verification.model=false;work.modelStatus='needed';}edited();render();}); grid.append(button);
  }
  section.append(details);parent.append(section);
}
function archive(record, label) {
  const wrapper=element('label',undefined,'checkbox'), input=element('input'); input.type='checkbox'; input.checked=record.archived;
  wrapper.append(input,element('span',label)); input.addEventListener('change',()=>{record.archived=input.checked;edited();renderLists();}); fields.append(wrapper);
}
function reorder(kind,id,direction) {
  const items = draft[kind], index = items.findIndex(item=>item.id===id), target = index+direction;
  if(target<0||target>=items.length)return;
  [items[index],items[target]]=[items[target],items[index]]; edited(); renderLists();
}
function renderLists() {
  for (const [kind,target] of [['collections','#collection-list'],['works','#work-list'],['artists','#artist-list']]) {
    const list=$(target); list.replaceChildren();
    for (const item of draft[kind] || []) {
      const row=element('div',undefined,'record'), button=element('button'); button.type='button';
      if (selection.id===item.id) button.setAttribute('aria-current','true');
      const url=draft.assets[item.image||item.portrait]; if(url) {const image=element('img'); image.src=url;image.alt='';button.append(image);}
      const label=element('span',item.title||item.name); if(item.archived)label.append(element('small','Archived')); button.append(label);
      button.addEventListener('click',()=>{selection={kind:kind==='works'?'work':kind==='collections'?'collection':'artist',id:item.id};render();}); row.append(button);
      for (const [direction,text] of [[-1,'↑'],[1,'↓']]) {const order=element('button',text,'order');order.type='button';order.setAttribute('aria-label',`Move ${item.title||item.name} ${direction<0?'earlier':'later'}`);order.addEventListener('click',()=>reorder(kind,item.id,direction));row.append(order);}
      list.append(row);
    }
  }
}
function render() {
  renderLists(); status(); fields.replaceChildren(); const record = selected(); if(!record)return;
  fields.append(element('h2',selection.kind==='site'?'Homepage & site details':record.title||record.name));
  const grid=element('div',undefined,'field-grid');fields.append(grid);
  if(selection.kind==='work') {
    const ready=['Front: '+(record.image?'ready':'needed'),...['left','right','back'].map(key=>key[0].toUpperCase()+key.slice(1)+': '+(record.views?.[key]?'ready':'needed'))];fields.append(element('p','Shoot handoff · '+ready.join(' · '),'note'));
    field(grid,record,'title','Sculpture title',{required:true,max:160});
    field(grid,record,'artistId','Artist',{required:true,options:draft.artists.map(a=>({value:a.id,label:a.name+(a.archived?' · Archived':'')}))});
    field(grid,record,'slug','Page address',{max:100}); field(grid,record,'dimensions','Dimensions · height × width × depth',{max:120});
    field(grid,record,'material','Stone type',{max:120});
    field(grid,record,'yearMade','Year made (optional)',{max:80});
    field(grid,record,'acquisitionMethod','How the artist acquired the stone',{wide:true,multiline:true,max:1000});
    field(grid,record,'description','About the sculpture',{wide:true,multiline:true,max:3000});
    photo(record,'image','Front / main photograph');
    record.views ||= {};const angles=element('details',undefined,'photo-slots');angles.append(element('summary','Angles and detail photographs'));fields.append(angles);
    for(const [key,label] of [['left','Left'],['right','Right'],['back','Back'],['detail','Surface detail'],['signature','Signature'],['scale','Scale view']])photo(record.views,key,label,angles);
    archive(record,'Archive this sculpture · hide it from the website');
    record.details ||= {};
      record.details ||= {};
      for(const [key,label] of [['finish','Finish'],['signature','Signature information'],['weightKg','Weight in kilograms'],['base','Base details · state whether included'],['location','Current location'],['delivery','Delivery estimate'],['shipping','Shipping information'],['installation','Installation'],['care','Care'],['authenticity','Authenticity'],['provenance','Documented provenance']])field(grid,record.details,key,label,{wide:true,multiline:key!=='weightKg',max:2000});

    field(grid,record,'availability','Availability',{options:[{value:'unknown',label:'Details on inquiry'},{value:'available',label:'Available'},{value:'reserved',label:'Reserved'},{value:'sold',label:'Sold'}]});
    if(record.sourcePage) {
      record.verification ||= {};
      fields.append(element('p',`Original ZSA page ${record.sourcePage}. ${record.sourceCrop ? 'Source photograph is cropped at the '+record.sourceCrop+'. ' : ''}Working information below stays private until each field is confirmed.`, 'note'));
      field(grid,record,'colour','Colour visible in the source photo',{max:80});
      field(grid,record,'size','Size category',{options:[{value:'',label:'Not recorded'},{value:'Small',label:'Small'},{value:'Medium',label:'Medium'},{value:'Large',label:'Large'}]});
      const additional={photos:(record.additionalImages || []).join('\n')};field(grid,additional,'photos','Additional photo asset keys · one per line',{wide:true,multiline:true,max:3000});
      grid.querySelector('#field-photos').addEventListener('input',event=>{record.additionalImages=event.target.value.split(/\s+/).filter(Boolean);});
      field(grid,record,'internalNotes','Private content and asset notes',{wide:true,multiline:true,max:5000});
      const checks=element('div',undefined,'wide');checks.append(element('h3','Confirmed information · show on the public site'));
      for(const key of ['title','artist','material','dimensions','yearMade','description','size','finish','signature','weight','base','location','delivery','shipping','installation','care','authenticity','provenance','acquisitionMethod','availability','model']) {
        const wrapper=element('label',undefined,'checkbox'),input=element('input');input.type='checkbox';input.checked=record.verification[key]===true;
        input.addEventListener('change',()=>{record.verification[key]=input.checked;edited();});wrapper.append(input,element('span',key==='model'?'3D model · source and all visible geometry confirmed':key));checks.append(wrapper);
      }
      fields.append(checks,element('p',`3D asset: ${record.modelStatus}. Reconstructions are visible in the private preview. Confirm the 3D model only after checking its source, depth, sides and reverse.`, 'note'));
    }
  } else if(selection.kind==='collection') {
    field(grid,record,'name','Collection name',{required:true,max:120});field(grid,record,'slug','Page address',{required:true,max:100});
    field(grid,record,'description','Short description',{wide:true,multiline:true,max:400});field(grid,record,'introduction','Introduction',{wide:true,multiline:true,max:2000});
    const ordering={members:record.workIds.join('\n')};field(grid,ordering,'members','Sculpture IDs in display order · star first · one per line',{wide:true,multiline:true,max:20000});
    grid.querySelector('#field-members').addEventListener('input',event=>{record.workIds=event.target.value.split(/\s+/).filter(Boolean);});
    field(grid,record,'starWorkId','Star sculpture',{options:draft.works.filter(w=>!w.archived).map(w=>({value:w.id,label:w.title+' · '+w.id}))});
    grid.querySelector('#field-starWorkId').addEventListener('change',()=>{record.workIds=[record.starWorkId,...record.workIds.filter(id=>id!==record.starWorkId)];edited();render();});
    fields.append(element('p','Move collections with the arrows in the sidebar. Each sculpture belongs to one primary collection. Source page 13 stays Sold.','note'));
  } else if(selection.kind==='artist') {
    field(grid,record,'name','Artist name',{required:true,max:120});field(grid,record,'slug','Page address',{max:100});
    field(grid,record,'style','Style',{max:120});
    field(grid,record,'description','Introduction',{wide:true,multiline:true,max:2000});field(grid,record,'biography','Brief biography',{wide:true,multiline:true,max:5000});field(grid,record,'story','The artistic practice',{wide:true,multiline:true,max:5000});
    field(grid,record,'quote','Artist quotation · use their own words',{wide:true,multiline:true,max:1000});
    photo(record,'portrait','Artist portrait');photo(record,'studioImage','Artist beside their sculpture / studio portrait');archive(record,'Archive this artist · hide their profile and sculptures');
  } else {
    field(grid,record,'location','Location',{wide:true,max:120});field(grid,record,'description','Website description for search and sharing',{wide:true,multiline:true,max:400});
    field(grid,record,'contactEmail','Public contact email · leave empty until ready',{wide:true,max:254});field(grid,record,'inquiryNote','Inquiry response note · only promise a timing you can meet',{wide:true,multiline:true,max:400});
    field(grid,record,'heroAlt','Hero photo description for screen readers',{wide:true,max:300});
    photo(record,'heroImage','Homepage hero photo');renderPageFields(record);
  }
  renderHistory();
}
function renderPageFields(site){
  for(const key of ['designers','collectors','house','making']){
    const page=site.presentation[key] ||= structuredClone(defaultPresentation[key]);const section=element('details',undefined,'page-content-editor');section.append(element('summary',key==='house'?'The House':key==='making'?'The Making':'For '+key));fields.append(section);
    const grid=element('div',undefined,'field-grid');section.append(grid);
    for(const name of ['title','intro','vision','foundersTitle','founders','approach','caption'])if(name in page)field(grid,page,name,key+' · '+name,{wide:true,multiline:!['title','foundersTitle'].includes(name),max:name==='title'?160:3000});
    if('image' in page)photo(page,'image',key==='house'?'Founders photograph':key+' page photograph',section);
    for(const name of ['steps','questions'])if(page[name])for(const [i,item] of page[name].entries()){
      field(grid,item,'title',name+' '+(i+1)+' · heading',{wide:true,max:160});field(grid,item,'text',name+' '+(i+1)+' · text',{wide:true,multiline:true,max:3000});
    }
    if(key==='making'){
      page.gallery ||= [];while(page.gallery.length<10)page.gallery.push({image:'',caption:''});
      page.gallery.forEach((item,i)=>{const slot=element('details',undefined,'process-photo-slot');slot.append(element('summary','Process photograph '+(i+1)));section.append(slot);photo(item,'image','Process photograph '+(i+1),slot);const text=element('div');slot.append(text);field(text,item,'caption','Caption',{wide:true,max:300});});
    }
  }
}

function renderHistory() {
  const container=$('#history');container.replaceChildren();
  for(const version of state.history) {
    const row=element('div',undefined,'history-row');row.append(element('span',`${date(version.published_at)}${version.revision===state.liveRevision?' · Live version':''}`));
    const button=element('button','Restore to draft');button.type='button';button.addEventListener('click',()=>operation(async()=>{
      await save();accept(await api('restore',{revision:state.revision,version:version.revision}));message('Earlier version restored to draft. Preview it before publishing.');
    }));row.append(button);container.append(row);
  }
}
$('#prepare-founding').addEventListener('click',()=>operation(async()=>{await save();accept(await api('prepare-founding-collection',{revision:state.revision}));selection={kind:'collection',id:draft.collections[0].id};message('The 23-work renovation is in your private draft. Existing records are retained. Preview before publishing.');}));
$('#editor').addEventListener('submit',event=>event.preventDefault());
$('#save').addEventListener('click',()=>operation(async()=>{await save();message('Draft saved.');}));
$('#publish').addEventListener('click',()=>operation(async()=>{await save();accept(await api('publish',{revision:state.revision}));message('Collection published. The website will show this version on the next page load.');}));
$('#preview').addEventListener('click',()=>{
  if(busy||!state)return;
  const tab=window.open('about:blank','_blank');
  if(tab)tab.opener=null;
  void operation(async()=>{
    try {await save(); if(tab)tab.location.href='/admin/preview';else window.location.href='/admin/preview';message('Draft preview opened.');}
    catch(error){tab?.close();throw error;}
  });
});
$('#site').addEventListener('click',()=>{selection={kind:'site',id:''};render();});
$('#add-artist').addEventListener('click',()=>{
  const name='New artist', id='artist-'+crypto.randomUUID();
  draft.artists.push({id,slug:id,name,portrait:'',practice:'',style:'',description:'',story:'',archived:false,_automaticAddress:true});selection={kind:'artist',id};edited();render();
});
$('#add-work').addEventListener('click',()=>{
  const artist=draft.artists.find(a=>!a.archived)||draft.artists[0];if(!artist){message('Add an artist before adding a sculpture.',true);return;}
  const id='work-'+crypto.randomUUID();draft.works.push({id,slug:id,artistId:artist.id,title:'New sculpture',image:'',dimensions:'',material:'',acquisitionMethod:'',description:'',objectPosition:'50% center',archived:false,_automaticAddress:true});selection={kind:'work',id};edited();render();
});
$('#download').addEventListener('click',()=>{
  const url=URL.createObjectURL(new Blob([JSON.stringify(draft,null,2)],{type:'application/json'})),link=element('a');link.href=url;link.download='house-of-stone-my-edits.json';link.click();URL.revokeObjectURL(url);
});
$('#reload').addEventListener('click',()=>operation(async()=>{accept(await api('content'));message('Latest collection loaded.');}));
window.addEventListener('beforeunload',event=>{if(dirty||busy){event.preventDefault();event.returnValue='';}});
api('content').then(result=>{accept(result);selection.id=draft.works.find(work=>!work.archived)?.id||draft.works[0]?.id||'';render();lock(false);}).catch(error=>message(error.message,true));

