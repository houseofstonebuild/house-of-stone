const root = document.getElementById('hos-concept');
const previewMode = location.pathname === '/admin/preview' || location.pathname.startsWith('/admin/preview/');
const routePath = () => previewMode ? location.pathname.slice('/admin/preview'.length) || '/' : location.pathname;
const $ = selector => root.querySelector(selector);
const uuid = () => crypto.randomUUID();
const protectedPreference = navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true;
let preference = 'on';
try { preference = localStorage.getItem('hos-measurement') || 'on'; } catch {}
let sessionId = '';
const trackingAllowed = () => !previewMode && !protectedPreference && preference !== 'off';
function session() {
  if (!trackingAllowed()) return '';
  if (sessionId) return sessionId;
  try { sessionId = sessionStorage.getItem('hos-session') || uuid(); sessionStorage.setItem('hos-session', sessionId); }
  catch { sessionId = uuid(); }
  return sessionId;
}
const search = new URLSearchParams(location.search);
const campaignValue = value => /^[a-zA-Z0-9_. -]{0,80}$/.test(value || '') ? value || '' : '';
let referrer = ''; try { referrer = new URL(document.referrer).origin; } catch {}
let attribution = { source: campaignValue(search.get('utm_source')), medium: campaignValue(search.get('utm_medium')), campaign: campaignValue(search.get('utm_campaign')), referrer };
if (trackingAllowed()) {
  try {
    const previous = JSON.parse(sessionStorage.getItem('hos-attribution') || 'null');
    if (previous) attribution = previous;
    else sessionStorage.setItem('hos-attribution', JSON.stringify(attribution));
  } catch {}
}
function track(name, details = {}) {
  if (!trackingAllowed()) return;
  const data = { id: uuid(), sessionId: session(), name, page: activePage, attribution, ...details };
  fetch('/api/events', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data), keepalive:true }).catch(() => {});
}
function el(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}
let catalog, artists, works, assets, collections = [], media = {}, editorial = {}, models = {}, viewerPromise, modelViewer;
let activePage = 'home', activeArtist, activeWork;
let inquiryContext = {}, submissionId = '', inquiryStarted = false, submitting = false, lastInquiryButton, inquiryScroll = 0;
const motionPreference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
let compactHeader;
function syncHeader() {
  const y=window.scrollY || 0,compact=y>64 || (compactHeader===true && y>24);
  if(compact!==compactHeader){compactHeader=compact;document.documentElement?.setAttribute('data-header-compact',String(compact));}
}
window.addEventListener('scroll',syncHeader,{passive:true});
syncHeader();
const heroSource = () => assets[catalog.site.heroImage] || '/assets/designer-apartment.jpg';
const heroDescription = () => catalog.site.heroImage ? catalog.site.heroAlt : 'Stone sculptures in a New York apartment overlooking Manhattan';
let pageAnimation;
function animateSurface(element, distance = 8, duration = 260) {
  if (motionPreference?.matches || !element?.animate) return;
  return element.animate([{opacity:.65,transform:`translateY(${distance}px)`},{opacity:1,transform:'translateY(0)'}],{duration,easing:'cubic-bezier(.2,.65,.3,1)'});
}
motionPreference?.addEventListener('change', event => { if (event.matches) root.getAnimations?.({subtree:true}).forEach(animation => animation.cancel()); });
const revealObserver = 'IntersectionObserver' in window ? new window.IntersectionObserver(entries => {
  for (const entry of entries) if (entry.isIntersecting) {
    revealObserver.unobserve(entry.target);
    if (!entry.target.dataset.revealed) { entry.target.dataset.revealed = 'true'; animateSurface(entry.target,10,420); }
  }
},{threshold:.08,rootMargin:'0px 0px -24px 0px'}) : null;
function observeReveals(view) { view?.querySelectorAll('[data-reveal]').forEach(element => { if (!element.dataset.revealed) revealObserver?.observe(element); }); }
const menu = $('#hos-menu'), menuToggle = $('.hos-menu-toggle'), main = $('#hos-main');
const inquiry = $('#hos-inquiry'), form = $('#hos-inquiry-form'), review = $('#hos-inquiry-review'), success = $('#hos-inquiry-success');
const status = $('#hos-form-status'), title = $('#hos-inquiry-title'), sendButton = $('#hos-inquiry-send');
function setMenu(open) {
  if (open && !menu.open) document.body.style.setProperty('--hos-scrollbar', `${Math.max(0, window.innerWidth - document.documentElement.clientWidth) || 0}px`);
  menu.hidden = !open;
  if (open && !menu.open) { menu.showModal(); if (!motionPreference?.matches) menu.animate?.([{opacity:.8,transform:'translateX(-18px)'},{opacity:1,transform:'translateX(0)'}],{duration:220,easing:'cubic-bezier(.2,.65,.3,1)'}); }
  if (!open && menu.open) { menu.getAnimations?.().forEach(animation => animation.cancel()); menu.close(); }
  document.body.classList.toggle('hos-menu-open', open);
  menuToggle.setAttribute('aria-expanded', String(open));
}
function statusMessage(text, error = false) { status.textContent = text; status.setAttribute('role', error ? 'alert' : 'status'); }
function applyImage(img, source, sizes = '(max-width: 650px) 100vw, 55vw') {
  img.decoding = 'async';
  const info = media[source];
  img.removeAttribute('srcset'); img.removeAttribute('width'); img.removeAttribute('height');
  if (info) {
    img.width = info.width; img.height = info.height;
    img.sizes = sizes; img.srcset = info.srcset;
  }
  img.src = source;
}
function image(key, alt, lazy = true, sizes) {
  const img = el('img'); applyImage(img, assets[key], sizes); img.alt = alt;
  if (lazy) img.loading = 'lazy';
  return img;
}
function link(text, data) {
  const button = el('button', 'hos-text-link cursor-interaction', text);
  button.type = 'button'; Object.assign(button.dataset, data);
  const arrow = el('span', 'hos-link-arrow'); arrow.setAttribute('aria-hidden', 'true');
  arrow.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" focusable="false"><path d="M6 18 18 6M6 6h12v12"/></svg>';
  button.append(arrow);
  return button;
}
const artistFor = work => artists.find(artist => artist.id === work.artistId);
const collectionFor = work => collections.find(collection => collection.workIds.includes(work.id));
const workLabel = work => `${work.title}${artistFor(work) ? ' by ' + artistFor(work).name : ''}`;
function availabilityLabel(work) {
  const label = {sold:'Sold',available:'Available',reserved:'Reserved'}[work.availability];
  return label ? el('span','hos-availability',label) : null;
}
function credit(work) {
  const artist = artistFor(work);
  return artist ? link(artist.name,{artist:artist.id}) : el('p','hos-credit','Artist details on inquiry');
}
function workCard(work, {compact = false} = {}) {
  const card = el('article', 'hos-work-card');card.dataset.workRecord=work.id;
  const photo = el('button','hos-work-card-photo cursor-interaction'); photo.type = 'button'; photo.dataset.work = work.id;
  photo.setAttribute('aria-label', `View ${workLabel(work)}`);
  photo.append(image(work.image,work.description || workLabel(work),true,'(max-width: 700px) 90vw, 520px'));
  const copy = el('div','hos-work-card-copy'), badge=availabilityLabel(work);
  if(badge)copy.append(badge);
  copy.append(el('h3','',work.title),credit(work));
  if(work.material || work.dimensions)copy.append(el('p','hos-card-specs',[work.material,work.dimensions].filter(Boolean).join(' · ')));
  if(work.description && !compact)copy.append(el('p','hos-card-description',work.description));
  const collection=collectionFor(work);if(collection && !compact)copy.append(link(collection.name,{collection:collection.id}));
  copy.append(link('View sculpture',{work:work.id}));card.append(photo,copy);return card;
}
function artistContext(work) {
  const artist=artistFor(work);if(!artist)return null;
  const context=el('section','hos-artist-context');context.setAttribute('aria-label','About '+artist.name);
  if(assets[artist.portrait])context.append(image(artist.portrait,'Portrait of '+artist.name,true,'96px'));
  const copy=el('div');copy.append(el('div','hos-eyebrow','THE ARTIST'),el('h3','',artist.name));
  const biography=artistBiography(artist);
  if(biography){const sentence=biography.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim() || biography;copy.append(el('p','',sentence.length>190?sentence.slice(0,187).replace(/\s+\S*$/,'')+'…':sentence));}
  copy.append(link('About the artist',{artist:artist.id}));context.append(copy);return context;
}
function collectionVisual(work) {
  const visual=el('div','hos-collection-visual'),photo=el('div','hos-collection-photo'),panel=modelPanel(work);
  visual.dataset.visualWork=work.id;
  photo.append(image(work.image,work.description || workLabel(work),true,'(max-width: 700px) 90vw, 820px'));
  visual.append(photo);
  if(!panel){photo.dataset.modelFallback=work.id;return visual;}
  panel.hidden=true;visual.append(panel);
  const modes=el('div','hos-visual-modes');modes.setAttribute('role','group');modes.setAttribute('aria-label','View '+work.title);
  for(const [mode,label] of [['photo','Photograph'],['model','View in 3D']]){
    const button=el('button','cursor-interaction',label);button.type='button';button.dataset.visualMode=mode;button.setAttribute('aria-pressed',String(mode==='photo'));modes.append(button);
  }
  visual.append(modes);return visual;
}
function supportingPreview(collection) {
  const selected=collection.workIds.filter(id=>id!==collection.starWorkId).slice(0,3).map(id=>works.find(work=>work.id===id)).filter(Boolean);
  if(!selected.length)return null;
  const preview=el('section','hos-supporting-preview');preview.dataset.reveal='';preview.setAttribute('aria-label','More from '+collection.name);
  const heading=el('div','hos-supporting-preview-heading');heading.append(el('h3','','Also in '+collection.name));
  const grid=el('div','hos-supporting-preview-grid');grid.tabIndex=0;grid.setAttribute('role','group');grid.setAttribute('aria-label',collection.name+' supporting works');
  selected.forEach(work=>grid.append(workCard(work,{compact:true})));
  const controls=el('div','hos-supporting-preview-controls'),previous=el('button','cursor-interaction','Previous'),next=el('button','cursor-interaction','Next'),count=el('span');
  previous.type=next.type='button';previous.setAttribute('aria-label','Previous supporting work');next.setAttribute('aria-label','Next supporting work');count.setAttribute('aria-live','polite');
  const position=()=>Math.max(0,Math.min(selected.length-1,Math.round(grid.scrollLeft/Math.max(1,(grid.children[1]?.offsetLeft || 0)-grid.children[0].offsetLeft))));
  const update=()=>{const index=position();previous.disabled=index===0;next.disabled=grid.scrollLeft+grid.clientWidth>=grid.scrollWidth-2;count.textContent=(index+1)+' / '+selected.length;};
  const move=direction=>{const step=(grid.children[1]?.offsetLeft || 0)-grid.children[0].offsetLeft;grid.scrollTo({left:Math.max(0,position()+direction)*step,behavior:motionPreference?.matches?'instant':'smooth'});};
  previous.addEventListener('click',()=>move(-1));next.addEventListener('click',()=>move(1));grid.addEventListener('scroll',update,{passive:true});
  previous.disabled=true;count.textContent='1 / '+selected.length;controls.append(previous,count,next);heading.append(controls);preview.append(heading,grid);return preview;
}
function collectionChapter(collection, {heading = true} = {}) {
  const work=works.find(work=>work.id===collection.starWorkId), section=el('section','hos-collection-chapter');
  section.dataset.collectionSection=collection.id;
  if(heading && collections.indexOf(collection)%2===1)section.classList.add('hos-collection-reversed');
  if(!work)return section;
  const introduction=el('div','hos-collection-introduction');introduction.dataset.reveal='';
  introduction.append(el(heading?'h2':'h1','',collection.name),el('p','',collection.description));
  const feature=el('div','hos-collection-feature');
  const visual=collectionVisual(work);
  const copy=el('div','hos-collection-copy');copy.dataset.reveal='';
  copy.append(el('div','hos-eyebrow','THE STAR SCULPTURE'));
  const badge=availabilityLabel(work);if(badge)copy.append(badge);
  copy.append(el('h2','hos-star-title',work.title));
  if(collection.introduction)copy.append(el('p','',collection.introduction));
  if(work.material || work.dimensions)copy.append(el('p','hos-card-specs',[work.material,work.dimensions].filter(Boolean).join(' · ')));
  const actions=el('div','hos-collection-actions');
  if(heading){const primary=link(work.availability==='sold'?'Explore available works':'Explore the collection',{collection:collection.id});primary.classList.add('hos-collection-primary');actions.append(primary);}
  else if(work.availability==='sold')actions.append(link('Explore available works',{scrollSupporting:collection.id}));
  const detail=link('View star sculpture',{work:work.id});detail.classList.add('hos-collection-secondary');actions.append(detail);
  const inquire=link(work.availability==='sold'?'Inquire about related works':'Inquire about this work',{inquiry:work.availability==='sold'?`Alternatives to ${workLabel(work)}`:workLabel(work),inquiryWork:work.id,inquiryArtist:artistFor(work)?.id || '',inquiryIntent:work.availability==='sold'?'alternatives':''});inquire.disabled=previewMode;actions.append(inquire);
  inquire.classList.add('hos-collection-inquiry');
  copy.append(actions);const maker=artistContext(work);if(maker)copy.append(maker);
  feature.append(visual,copy);section.append(introduction,feature);if(heading){const supporting=supportingPreview(collection);if(supporting)section.append(supporting);}return section;
}
function filteredWorks(container, selected, label = 'Browse works') {
  const section=el('section','hos-collection-browser');section.setAttribute('aria-label',label);
  const filters=el('div','hos-collection-filters'), gridHost=el('div'),counter=el('p','hos-filter-count');
  counter.setAttribute('role','status');counter.setAttribute('aria-live','polite');
  const state={};
  for(const [key,name] of [['material','Stone'],['colour','Colour'],['size','Size']]) {
    const wrapper=el('label','',name), select=el('select');select.setAttribute('aria-label',name);select.dataset.filter=key;
    const options=[['',`All ${name.toLowerCase()}s`],...[...new Set(selected.map(work=>work[key]).filter(Boolean))].sort().map(value=>[value,value])];
    if(selected.some(work=>!work[key]))options.push(['__unknown','Details on inquiry']);
    for(const [value,text] of options){const option=el('option','',text);option.value=value;select.append(option);}
    select.addEventListener('change',()=>{state[key]=select.value;update();});wrapper.append(select);filters.append(wrapper);
  }
  const reset=el('button','hos-text-link','Reset filters');reset.type='button';reset.addEventListener('click',()=>{for(const key of Object.keys(state))delete state[key];filters.querySelectorAll('select').forEach(select=>select.value='');update();});filters.append(reset);
  function update(){const result=selected.filter(work=>Object.entries(state).every(([key,value])=>!value || (value==='__unknown'?!work[key]:work[key]===value)));counter.textContent=`${result.length} ${result.length===1?'work':'works'}`;gridHost.replaceChildren(result.length?workGrid(result):el('p','hos-empty-results','No works match these filters. Try another selection.'));observeReveals(section);}
  section.append(filters,counter,gridHost);container.append(section);update();
}
function renderCollection(collection) {
  const container=$('#hos-category-content');container.replaceChildren(collectionChapter(collection,{heading:false}));
  const supporting=el('section','hos-supporting-works');supporting.id='hos-supporting-'+collection.id;
  supporting.append(el('h2','','In this collection'));
  const selected=collection.workIds.filter(id=>id!==collection.starWorkId).map(id=>works.find(work=>work.id===id)).filter(Boolean);
  filteredWorks(supporting,selected,'Supporting sculptures');container.append(supporting);watchModels(container);
}
function watchModels(container) {
  const hosts=container.querySelectorAll('[data-model-stage]');
  if(!hosts.length)return;
  if(modelViewer){modelViewer.observe?.(hosts);modelViewer.refresh();return;}
  if('IntersectionObserver' in window){const observer=new window.IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){observer.disconnect();loadViewer().then(viewer=>viewer.observe?.(root.querySelectorAll('[data-model-stage]'))).catch(()=>{});}},{rootMargin:'200px'});hosts.forEach(host=>observer.observe(host));}
}
function artistBiography(artist) {
  const value = artist.biography || editorial.biographies?.[artist.id];
  return typeof value === 'object' ? (value.name === artist.name ? value.text : artist.description) : value || artist.description;
}
function workGrid(selected) { const grid=el('div','hos-work-grid');grid.dataset.count=String(selected.length);grid.dataset.reveal='';selected.forEach(work=>grid.append(workCard(work)));return grid; }
function chapterMedia(artist, work) {
  const entry = editorial.chapters?.[artist.id];
  // Stop using the editorial set when an owner replaces either subject's photo.
  if (!entry || entry.artistName !== artist.name || entry.workId !== work.id || entry.workTitle !== work.title || entry.portraitSource !== assets[artist.portrait] || entry.workSource !== assets[work.image]) return null;
  return entry;
}
function editorialImage(source, alt, sizes) {
  const img = el('img'); applyImage(img, source, sizes); img.alt = alt; img.loading = 'lazy'; return img;
}
function modelDefinition(work) {
  const entry=models[work.id];
  if(!entry || entry.source!==assets[work.image])return null;
  if(entry.reconstruction)return entry.workId===work.id && (previewMode || work.modelVerified===true) && (!work.sourcePage || entry.sourcePage===work.sourcePage) ? entry : null;
  return entry.title===work.title ? entry : null;
}
function loadViewer() {
  if(!viewerPromise)viewerPromise=import('./sculpture-viewer.js').then(module=>{
    modelViewer=module.initializeViewer({root,models,works,reviewMode:previewMode,onInteraction:id=>{const work=works.find(w=>w.id===id);if(work)track('model_interaction',{workId:id,artistId:work.artistId});}});
    return modelViewer;
  }).catch(error=>{viewerPromise=null;throw error;});
  return viewerPromise;
}
function modelPanel(work) {
  if(!modelDefinition(work))return null;
  const panel=el('div','hos-3d-panel'),top=el('div','hos-3d-top');
  top.append(el('span','hos-eyebrow','SCULPTURE IN 3D'),link('Explore in 3D',{model:work.id}));
  const stage=el('div','hos-3d-stage');stage.dataset.modelStage='';stage.dataset.modelId=work.id;stage.dataset.modelState='waiting';
  stage.setAttribute('role','group');stage.setAttribute('aria-label',`${work.title} in three dimensions`);
  const poster=image(work.image,'',true,'(max-width: 700px) 90vw, 750px');poster.className='hos-3d-poster';poster.setAttribute('aria-hidden','true');
  const snapshot=el('canvas','hos-3d-snapshot');snapshot.hidden=true;snapshot.setAttribute('aria-hidden','true');
  stage.append(poster,snapshot);
  const hint=el('div','hos-3d-hint',motionPreference?.matches?'Explore the form in 3D':'Scroll to rotate');hint.setAttribute('role','status');
  panel.append(top,stage,hint);
  if(previewMode && modelDefinition(work).reconstruction)panel.append(el('p','hos-model-review-note','Reference-based reconstruction. Depth and unseen surfaces are inferred.'));
  return panel;
}
function sculptureSettings(artist, work, entry, withInquiry = false) {
  const carousel = el('div', 'hos-settings-carousel'); carousel.dataset.reveal = '';
  carousel.setAttribute('role', 'group'); carousel.setAttribute('aria-label', `${work.title} in different spaces`);
  const grid = el('div', 'hos-sculpture-settings'); grid.tabIndex = 0;
  grid.id = `hos-settings-${uuid()}`;
  grid.setAttribute('aria-label', 'Sculpture settings');
  for (const [setting, label, space] of [['apartment','For designers','an apartment'],['gallery','For collectors','a private gallery'],['office','For corporate offices','a corporate office']]) {
    const tile = el('article', 'hos-setting-tile');
    const photo = el('button', 'hos-setting-photo cursor-interaction'); photo.type = 'button'; photo.dataset.work = work.id;
    photo.setAttribute('aria-label', `View ${work.title} by ${artist.name} in ${space}`);
    photo.append(editorialImage(entry.settings[setting], `${work.title} by ${artist.name} in ${space}`, '(max-width: 700px) 90vw, (max-width: 1800px) 28vw, 480px'));
    tile.append(photo, el('h3', '', label)); grid.append(tile);
  }
  const tiles = [...grid.children], controls = el('div', 'hos-carousel-controls');
  const previous = el('button', 'hos-carousel-previous cursor-interaction');
  const next = el('button', 'hos-carousel-next cursor-interaction');
  for (const [button, label, path] of [[previous,'Previous setting','M15 6 9 12l6 6'],[next,'Next setting','m9 6 6 6-6 6']]) {
    button.type = 'button'; button.setAttribute('aria-label', label); button.setAttribute('aria-controls', grid.id);
    button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${path}"/></svg>`;
  }
  let index = 0;
  const counter = el('span', 'hos-carousel-position', '1 / 3');
  counter.setAttribute('role', 'status'); counter.setAttribute('aria-live', 'polite'); counter.setAttribute('aria-atomic', 'true');
  previous.disabled = true;
  const offset = i => tiles[i].offsetLeft - tiles[0].offsetLeft;
  function sync() {
    if (!grid.clientWidth) return;
    index = tiles.reduce((closest, tile, i) => Math.abs(offset(i) - grid.scrollLeft) < Math.abs(offset(closest) - grid.scrollLeft) ? i : closest, 0);
    const position = `${index + 1} / ${tiles.length}`;
    if (counter.textContent !== position) counter.textContent = position;
    previous.disabled = index === 0; next.disabled = index === tiles.length - 1;
  }
  function move(target) {
    const clamped = Math.max(0, Math.min(tiles.length - 1, target));
    grid.scrollTo({left: offset(clamped), behavior: motionPreference?.matches ? 'instant' : 'smooth'});
  }
  previous.addEventListener('click', () => move(index - 1)); next.addEventListener('click', () => move(index + 1));
  grid.addEventListener('scroll', sync, {passive:true});
  grid.addEventListener('keydown', event => {
    if (event.target !== grid || grid.scrollWidth <= grid.clientWidth) return;
    if (['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) {
      event.preventDefault(); move(event.key === 'Home' ? 0 : event.key === 'End' ? tiles.length - 1 : index + (event.key === 'ArrowRight' ? 1 : -1));
    }
  });
  if ('ResizeObserver' in window) new window.ResizeObserver(sync).observe(grid);
  const action=el('div','hos-setting-action');
  action.append(link('View sculpture',{work:work.id}));
  if(withInquiry)action.append(link('Inquire',{inquiry:`${work.title} by ${artist.name}`,inquiryWork:work.id,inquiryArtist:artist.id}));
  controls.append(previous, counter, next); carousel.append(grid, controls, action);
  return carousel;
}
function artistChapter(artist, selected, withInquiry = false) {
  const featured = selected.find(work => chapterMedia(artist, work));
  if (featured) {
    const entry = chapterMedia(artist, featured), chapter = el('section', 'hos-artist-chapter hos-editorial-chapter');
    const campaign = el('div', 'hos-artist-campaign'); campaign.dataset.reveal = '';
    const campaignImage=editorialImage(entry.landscape, `${artist.name} beside ${featured.title} in the studio`, '(max-width: 700px) 170vw, (max-width: 1800px) 90vw, 1560px');
    campaignImage.style.objectPosition=entry.mobileFocus || '50% center';campaign.append(campaignImage);
    const details = el('div', 'hos-chapter-details'); details.dataset.reveal = '';
    const artistCopy = el('div', 'hos-chapter-artist');
    artistCopy.append(el('h2','',artist.name),el('p','',artist.description === entry.descriptionSource ? entry.shortDescription : artist.description),link('About the artist',{artist:artist.id}));
    const workCopy = el('div', 'hos-chapter-work');
    const workHeading = el('div', 'hos-chapter-work-heading');
    workHeading.append(el('div','hos-eyebrow','SELECTED WORK'),el('h3','',featured.title));
    const specs = el('div', 'hos-chapter-work-specs');
    specs.append(el('p','',featured.material),el('p','',featured.dimensions));
    workCopy.append(workHeading, specs);
    details.append(artistCopy,workCopy);chapter.append(campaign,details);
    const model=modelPanel(featured);if(model)chapter.append(model);
    chapter.append(sculptureSettings(artist,featured,entry,withInquiry));
    const additional = selected.filter(work => work.id !== featured.id);
    if (additional.length) { const more = el('div','hos-chapter-additional');more.append(el('h3','','More works by '+artist.name),workGrid(additional));chapter.append(more); }
    return chapter;
  }
  const chapter=el('section','hos-artist-chapter'),intro=el('div','hos-artist-intro');intro.dataset.reveal='';
  const portrait=el('button','hos-artist-intro-photo cursor-interaction');portrait.type='button';portrait.dataset.artist=artist.id;portrait.setAttribute('aria-label',`Read about ${artist.name}`);
  portrait.append(image(artist.portrait,'Portrait of '+artist.name,true,'(max-width: 700px) 90vw, 420px'));
  const copy=el('div','hos-artist-intro-copy');copy.append(el('div','hos-eyebrow','THE ARTIST'),el('h2','',artist.name),el('p','hos-artist-style',artist.style),el('p','',artistBiography(artist)),link('About the artist',{artist:artist.id}));
  intro.append(portrait,copy);chapter.append(intro,workGrid(selected));
  if(withInquiry){const action=el('div','hos-setting-action');action.append(link('Inquire',{inquiry:`Works by ${artist.name}`,inquiryArtist:artist.id}));chapter.append(action);}
  return chapter;
}
function renderArtist(artist) {
  activeArtist = artist;
  $('#hos-artist-title').textContent = artist.name;
  $('#hos-artist-description').textContent = artist.description;
  $('#hos-artist-practice').textContent = 'Practice';
  $('#hos-artist-story').textContent = artist.story;
  $('#hos-artist-practice-section').hidden = !artist.story;
  $('#hos-artist-biography').textContent = artistBiography(artist);
  applyImage($('#hos-artist-image'), assets[artist.portrait]); $('#hos-artist-image').alt = `Portrait of ${artist.name}`;
  const selected = works.filter(w => w.artistId === artist.id);
  $('#hos-artist-work-link').hidden = selected.length === 0;
  if (selected.length) $('#hos-artist-work-link').dataset.work = selected[0].id;
  const more = $('#hos-artist-works'); more.replaceChildren();
  if (selected.length) {
    more.append(el('h2', '', 'Works by ' + artist.name), workGrid(selected));
  }
}
function renderWork(work) {
  activeWork = work; activeArtist = artistFor(work);
  $('#hos-work-title').textContent = work.title;
  const modelLink=$('#hos-work-model');modelLink.hidden=!modelDefinition(work);modelLink.dataset.model=work.id;
  const artistLink=$('#hos-work-artist');artistLink.textContent=activeArtist?.name || 'Artist details on inquiry';artistLink.dataset.artist=activeArtist?.id || '';artistLink.disabled=!activeArtist;
  for(const [id,value] of [['year',work.yearMade],['dimensions',work.dimensions],['material',work.material],['acquisition',work.acquisitionMethod]]) {
    const node=$('#hos-work-'+id);node.textContent=value || '';if(node.parentElement)node.parentElement.hidden=!value;
  }
  $('#hos-work-core-specs').hidden=![work.yearMade,work.dimensions,work.material,work.acquisitionMethod].some(Boolean);
  $('#hos-work-description').textContent = work.description || '';
  const button = $('#hos-work-inquiry'),sold=work.availability==='sold';
  button.textContent=sold?'Inquire about related works':'Inquire about this work';
  const arrow=el('span','hos-link-arrow');arrow.setAttribute('aria-hidden','true');arrow.innerHTML='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" focusable="false"><path d="M6 18 18 6M6 6h12v12"/></svg>';button.append(arrow);
  button.dataset.inquiry = sold?`Alternatives to ${workLabel(work)}`:workLabel(work);button.dataset.inquiryWork = work.id;button.dataset.inquiryArtist=activeArtist?.id || '';button.dataset.inquiryIntent=sold?'alternatives':'';
  const img = $('#hos-work-image'); applyImage(img, assets[work.image]); img.alt = work.description || workLabel(work);
  const context=$('#hos-work-context');context.replaceChildren();const badge=availabilityLabel(work);if(badge)context.append(badge);
  const collection=collectionFor(work);if(collection)context.append(link(collection.name,{collection:collection.id}));
  if(sold)context.append(el('p','','This work is sold. Explore related works or ask us about alternatives.'));
  const details=$('#hos-work-extra-specs');details.replaceChildren();
  const units = work.dimensions?.match(/([\d.]+)\s*×\s*([\d.]+)\s*×\s*([\d.]+)\s*cm/i);
  const values={...(work.details || {})};
  if(units)values.inches=units.slice(1).map(n=>(Number(n)/2.54).toFixed(1)).join(' × ')+' in';
  if(values.weightKg)values.weightKg=`${values.weightKg} kg / ${(Number(values.weightKg)*2.20462262).toFixed(1)} lb`;
  const labels={inches:'Dimensions in inches',finish:'Finish',signature:'Signature',weightKg:'Weight',base:'Base & inclusion',location:'Current location',delivery:'Delivery estimate',shipping:'Shipping',installation:'Installation',care:'Care',authenticity:'Authenticity',provenance:'Provenance'};
  for(const [key,label] of Object.entries(labels))if(values[key]){const row=el('div');row.append(el('span','',label),el('span','',values[key]));details.append(row);}
  const photos=$('#hos-work-additional-images');photos.replaceChildren();for(const key of work.additionalImages || [])photos.append(image(key,`Additional view of ${work.title}`,true,'(max-width:700px) 90vw, 700px'));
  const maker=$('#hos-work-maker');maker.replaceChildren();const contextArtist=artistContext(work);maker.hidden=!contextArtist;if(contextArtist)maker.append(contextArtist);
  const related=$('#hos-work-related');related.replaceChildren();
  const sameCollection=collection?collection.workIds.filter(id=>id!==work.id).map(id=>works.find(w=>w.id===id)).filter(Boolean):[];
  if(sameCollection.length){related.append(el('h2','',sold?'Explore related works':`More from ${collection.name}`),workGrid(sameCollection));}
  const sameArtist=activeArtist?works.filter(w=>w.artistId===activeArtist.id&&w.id!==work.id&&!sameCollection.some(other=>other.id===w.id)):[];
  if(sameArtist.length)related.append(el('h2','','More by '+activeArtist.name),workGrid(sameArtist));
}
function route(path, shouldFocus = true) {
  let page = path === '/' ? 'home' : path.slice(1);
  let item;
  if (path.startsWith('/artists/')) { item = artists.find(a => a.slug === path.split('/')[2]); if (item) { renderArtist(item); page = 'artist'; } }
  if (path.startsWith('/collections/')) { item=collections.find(c=>c.slug===path.split('/')[2]);if(item){renderCollection(item);page='category';} }
  if (path.startsWith('/works/')) { item = works.find(w => w.slug === path.split('/')[2]); if (item) { renderWork(item); page = 'work'; } }
  if (!$(`[data-page="${page.replace(/[^a-z]/g, '')}"]`) || !['home','collection','category','artists','artist','work','making','designers','collectors','house','privacy'].includes(page)) page = 'home';
  activePage = page;
  $('#hos-page-navigation').hidden = page === 'home';
  pageAnimation?.cancel();
  root.querySelectorAll('[data-page]').forEach(view => { view.hidden = view.dataset.page !== page; });
  main.hidden = false; inquiry.hidden = true; setMenu(false);
  modelViewer?.close();modelViewer?.refresh();
  const labels = {home:'Zimbabwean stone sculpture',collection:'The collection',artists:'The artists',making:'The making',designers:'For designers',collectors:'For collectors',house:'The house',privacy:'Privacy'};
  document.title = `${item?.title || item?.name || labels[page] || 'House of Stone'} | House of Stone`;
  const canonical = document.querySelector('link[rel="canonical"]'); if (canonical) canonical.href = location.origin + (previewMode ? '/admin/preview' : '') + path;
  const description = item?.description || catalog.site.description;
  const collectionImage=page==='category'?works.find(work=>work.id===item.starWorkId)?.image:'';
  const photo = location.origin + (assets[collectionImage || item?.image || item?.portrait] || heroSource());
  for (const [selector, value] of [['meta[name="description"]',description],['meta[property="og:title"]',document.title],['meta[name="twitter:title"]',document.title],['meta[property="og:description"]',description],['meta[name="twitter:description"]',description],['meta[property="og:url"]',canonical?.href],['meta[property="og:image"]',photo],['meta[name="twitter:image"]',photo]]) document.querySelector(selector)?.setAttribute('content',value);
  menu.querySelectorAll('[data-view]').forEach(button => { if ((button.dataset.view === page || (page === 'category' && button.dataset.view === 'collection'))) button.setAttribute('aria-current','page'); else button.removeAttribute('aria-current'); });
  if (shouldFocus) {
    window.scrollTo({ top:0, behavior:'instant' });
    const heading = $(`[data-page="${page}"] h1`); heading?.setAttribute('tabindex','-1'); heading?.focus({preventScroll:true});
    pageAnimation = animateSurface($(`[data-page="${page}"]`));
  }
  observeReveals($(`[data-page="${page}"]`));
  const details = page === 'category' ? {workId:item.starWorkId,artistId:artistFor(works.find(work=>work.id===item.starWorkId))?.id || ''} : page === 'work' ? { workId:activeWork.id, artistId:activeArtist?.id || '' } : page === 'artist' ? { artistId:activeArtist.id } : {};
  track('page_view', details);
  if (page === 'work') track('work_view', details);
  if (page === 'artist') track('artist_view', details);
}
function rememberScroll() {
  history.replaceState?.({...history.state,hosNavigation:{...history.state?.hosNavigation,path:routePath(),scrollY:window.scrollY || 0}},'');
}
function navigate(path) {
  if (path === routePath()) { route(path); return; }
  rememberScroll();
  history.pushState({hosNavigation:{path,previous:routePath(),scrollY:0}}, '', (previewMode ? '/admin/preview' : '') + path); route(path);
}
function navigateBack() {
  if (history.state?.hosNavigation?.previous && history.back) { history.back(); return; }
  const collection=activePage === 'work' ? collectionFor(activeWork) : null;
  navigate(collection ? '/collections/'+collection.slug : activePage === 'work' || activePage === 'category' ? '/collection' : activePage === 'artist' ? '/artists' : '/');
}
function openInquiry(topic, trigger) {
  if (previewMode) return;
  if (submitting) return;
  lastInquiryButton = trigger;
  inquiryScroll = window.scrollY || 0;
  inquiryContext = { topic, workId: trigger?.dataset.inquiryWork || '', artistId: trigger?.dataset.inquiryArtist || '', intent:trigger?.dataset.inquiryIntent || '' };
  submissionId = uuid(); inquiryStarted = false;
  form.reset(); form.hidden = false; review.hidden = true; success.hidden = true;
  title.textContent = 'Your inquiry'; statusMessage(''); $('#hos-inquiry-context').textContent = topic;
  if (inquiryContext.intent === 'alternatives') form.elements.interest.value = 'Sourcing for a project';
  if (topic === 'Designer project') form.elements.interest.value = 'Sourcing for a project';
  main.hidden = true; inquiry.hidden = false; setMenu(false);
  window.scrollTo({top:0,behavior:'instant'}); form.elements.name.focus({preventScroll:true});
  pageAnimation?.cancel();pageAnimation=animateSurface(inquiry);
  track('inquiry_opened', { workId:inquiryContext.workId, artistId:inquiryContext.artistId });
}
function closeInquiry() {
  if (submitting) return;
  main.hidden = false; inquiry.hidden = true;
  window.scrollTo({top:inquiryScroll,behavior:'instant'});
  if (lastInquiryButton && !lastInquiryButton.closest('[hidden]')) lastInquiryButton.focus({preventScroll:true});
}
function preferenceUI() {
  const checkbox = $('#hos-analytics-preference'); checkbox.checked = trackingAllowed(); checkbox.disabled = protectedPreference;
  $('#hos-privacy-status').textContent = protectedPreference ? 'Activity measurement is off because of your browser privacy signal.' : trackingAllowed() ? 'Activity measurement is on. You can turn it off at any time.' : 'Activity measurement is off for this browser.';
}
$('#hos-analytics-preference').addEventListener('change', event => {
  preference = event.target.checked ? 'on' : 'off';
  try { localStorage.setItem('hos-measurement', preference); if (!trackingAllowed()) { sessionStorage.removeItem('hos-session'); sessionStorage.removeItem('hos-attribution'); sessionId = ''; } } catch {}
  preferenceUI();
});
menuToggle.addEventListener('click', () => setMenu(menu.hidden));
$('#hos-menu-close').addEventListener('click', () => { setMenu(false); menuToggle.focus({preventScroll:true}); });
menu.addEventListener('cancel', event => { event.preventDefault(); setMenu(false); menuToggle.focus({preventScroll:true}); });
menu.addEventListener('click', event => {
  if (event.target !== menu) return;
  const bounds = menu.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) { setMenu(false); menuToggle.focus({preventScroll:true}); }
});
$('#hos-inquiry-close').addEventListener('click', closeInquiry);
$('#hos-form-privacy').addEventListener('click', () => { if (!submitting) navigate('/privacy'); });
$('#hos-inquiry-continue').addEventListener('click', () => navigate('/collection'));
root.addEventListener('keydown', event => { if (event.key === 'Escape') { if (!menu.hidden) { event.preventDefault(); setMenu(false); menuToggle.focus({preventScroll:true}); } else if (!inquiry.hidden) closeInquiry(); } });
root.addEventListener('click', event => {
  if (!catalog || submitting) return;
  const mode=event.target.closest('[data-visual-mode]');
  if(mode){
    const visual=mode.closest('.hos-collection-visual'),showModel=mode.dataset.visualMode==='model';
    visual.querySelector('.hos-collection-photo').hidden=showModel;visual.querySelector('.hos-3d-panel').hidden=!showModel;
    visual.querySelectorAll('[data-visual-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button===mode)));
    watchModels(visual);if(showModel)track('model_view',{workId:visual.dataset.visualWork,artistId:artistFor(works.find(work=>work.id===visual.dataset.visualWork))?.id || ''});return;
  }
  const collection=event.target.closest('[data-scroll-collection]');
  if(collection){
    track('explore_click');const heading=$('#hos-home-collection-title');heading.setAttribute('tabindex','-1');heading.focus({preventScroll:true});
    heading.scrollIntoView({behavior:motionPreference?.matches?'instant':'smooth',block:'start'});return;
  }
  const supporting=event.target.closest('[data-scroll-supporting]');if(supporting){const section=document.getElementById('hos-supporting-'+supporting.dataset.scrollSupporting);section?.scrollIntoView({behavior:motionPreference?.matches?'instant':'smooth',block:'start'});return;}
  const category=event.target.closest('[data-collection]');if(category){const item=collections.find(c=>c.id===category.dataset.collection);if(item){track('explore_click',{workId:item.starWorkId});navigate('/collections/'+item.slug);}return;}
  const model=event.target.closest('[data-model]');
  if(model){
    const work=works.find(w=>w.id===model.dataset.model);if(!work||!modelDefinition(work))return;
    model.disabled=true;
    loadViewer().then(viewer=>{viewer.open(work,model,assets[work.image]);track('model_view',{workId:work.id,artistId:work.artistId});}).catch(()=>{const hint=model.closest('.hos-3d-panel')?.querySelector('.hos-3d-hint');if(hint)hint.textContent='The 3D view could not load. Please try again.';}).finally(()=>{model.disabled=false;});
    return;
  }
  if (event.target.closest('[data-back]')) { navigateBack(); return; }
  const view = event.target.closest('[data-view]');
  if (view) {
    if (view.dataset.view === 'collection') track('explore_click');
    navigate(view.dataset.view === 'home' ? '/' : '/' + view.dataset.view); return;
  }
  const artist = event.target.closest('[data-artist]');
  if (artist) { const item = artists.find(a => a.id === artist.dataset.artist); if (item) navigate('/artists/' + item.slug); return; }
  const work = event.target.closest('[data-work]');
  if (work) { const item = works.find(w => w.id === work.dataset.work) || works[Number(work.dataset.work)]; if (item) navigate('/works/' + item.slug); return; }
  const trigger = event.target.closest('[data-inquiry]'); if (trigger) openInquiry(trigger.dataset.inquiry, trigger);
});
form.addEventListener('input', () => { if (!inquiryStarted) { inquiryStarted = true; track('inquiry_started', { workId:inquiryContext.workId, artistId:inquiryContext.artistId }); } });
form.addEventListener('submit', event => {
  event.preventDefault(); if (!form.reportValidity()) return;
  ['name','email','interest','message'].forEach(field => { $('#hos-review-' + field).textContent = form.elements[field].value.trim(); });
  $('#hos-review-message-row').hidden = !form.elements.message.value.trim();
  form.hidden = true; review.hidden = false; title.textContent = 'Review your inquiry.'; statusMessage(''); window.scrollTo({top:0,behavior:'instant'}); sendButton.focus({preventScroll:true});
});
$('#hos-inquiry-edit').addEventListener('click', () => {
  if (submitting) return;
  submissionId = uuid(); form.hidden = false; review.hidden = true; title.textContent = 'Your inquiry'; statusMessage(''); window.scrollTo({top:0,behavior:'instant'}); form.elements.name.focus({preventScroll:true});
});
sendButton.addEventListener('click', async () => {
  if (previewMode) return;
  if (submitting) return;
  submitting = true; sendButton.disabled = true; $('#hos-inquiry-edit').disabled = true; $('#hos-inquiry-close').disabled = true;
  statusMessage('Sending your inquiry…');
  const payload = { submissionId, ...inquiryContext, page:activePage, sessionId:session(), attribution };
  for (const field of ['name','email','interest','message','website']) payload[field] = form.elements[field].value.trim();
  try {
    const response = await fetch('/api/inquiries', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)});
    const data = await response.json();
    if (!response.ok || !data.ok || !data.reference) throw new Error(data.error || 'We could not send your inquiry. Please try again.');
    review.hidden = true; success.hidden = false; title.textContent = 'Inquiry received.';
    $('#hos-inquiry-reference').textContent = data.reference; statusMessage(''); form.reset();
    window.scrollTo({top:0,behavior:'instant'}); $('#hos-inquiry-continue').focus({preventScroll:true});
  } catch (error) {
    statusMessage(error.name === 'TimeoutError' || error.name === 'TypeError' ? 'We could not confirm receipt. Your details are still here. Please try again.' : error.message, true);
  } finally { submitting = false; sendButton.disabled = false; $('#hos-inquiry-edit').disabled = false; $('#hos-inquiry-close').disabled = false; }
});
window.addEventListener('popstate', () => {
  if (!catalog || submitting) return;
  route(routePath(), false);
  const restore = () => {
    window.scrollTo({top:history.state?.hosNavigation?.scrollY || 0,behavior:'instant'});
    const heading = $(`[data-page="${activePage}"] h1`);heading?.setAttribute('tabindex','-1');heading?.focus({preventScroll:true});
  };
  if (window.requestAnimationFrame) window.requestAnimationFrame(restore); else restore();
});

async function start() {
  const [response,mediaResponse,editorialResponse,modelResponse] = await Promise.all([fetch(previewMode ? '/api/admin/preview-content' : '/content.json'),fetch('/media-manifest.json').catch(()=>({ok:false})),fetch('/editorial.json').catch(()=>({ok:false})),fetch('/models.json').catch(()=>({ok:false}))]); if (!response.ok) throw new Error('The collection could not load. Please refresh the page.');
  if (mediaResponse.ok) media = await mediaResponse.json();
  if (editorialResponse.ok) editorial = await editorialResponse.json();
  if (modelResponse.ok) models = await modelResponse.json();
  catalog = await response.json(); ({artists,works,assets} = catalog);collections=catalog.collections || [];
  catalog.site.description = catalog.site.description.replace(/\benquir/gi, word => word[0] === 'E' ? 'Inquir' : 'inquir');
  $('#hos-copyright').textContent = `© ${new Date().getFullYear()} House of Stone`;
  $('#hos-location').textContent = catalog.site.location;
  $('.hos-founding-heading p').textContent = collections.length ? `${collections.length} collections. ${collections.reduce((sum,c)=>sum+c.workIds.length,0)} sculptures.` : `${artists.length} artists. Selected works.`;
  root.querySelectorAll('[data-asset]').forEach(img => { if(!assets[img.dataset.asset])return;applyImage(img,assets[img.dataset.asset]); if (!img.classList.contains('hos-brand-mark')) img.loading = 'lazy'; });
  applyImage($('.hos-hero-image'),heroSource(),'100vw');$('.hos-hero-image').alt=heroDescription();
  root.querySelectorAll('.hos-editorial-image img,.hos-summary-photo img[src]').forEach(img=>applyImage(img,img.getAttribute('src'),'90vw'));
  root.querySelectorAll('[data-artist-grid]').forEach(grid => {
    artists.forEach(artist => {
      const card=el('button','hos-portrait-card cursor-interaction');card.type='button';card.dataset.artist=artist.id;card.dataset.reveal='';
      card.append(image(artist.portrait,'Portrait of '+artist.name,true,'(max-width: 700px) 90vw, 29vw'),el('h3','',artist.name),el('p','',artist.style));grid.append(card);
    });
  });
  for (const target of ['#hos-home-chapters','#hos-collection-chapters']) {
    const chapters=$(target);chapters.replaceChildren();
    if(collections.length){collections.forEach(collection=>chapters.append(collectionChapter(collection)));}
    else artists.forEach(artist=>{const selected=works.filter(work=>work.artistId===artist.id);if(selected.length)chapters.append(artistChapter(artist,selected,target==='#hos-home-chapters'));});
  }
  watchModels(root);
  if (previewMode) {
    document.body.classList.add('hos-preview');
    const banner = el('div','hos-preview-bar'); banner.append(el('span','','Draft preview · Working information awaits confirmation.'));
    const back = el('a','','Return to editor'); back.href = '/admin/content'; banner.append(back); document.body.prepend(banner);
    const sizeBanner=()=>{if(banner.getBoundingClientRect)document.body.style.setProperty('--hos-preview-height',Math.ceil(banner.getBoundingClientRect().height)+'px');};sizeBanner();if('ResizeObserver' in window)new window.ResizeObserver(sizeBanner).observe(banner);
    root.querySelectorAll('[data-inquiry]').forEach(button=>{ button.disabled=true; });
  }
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  rememberScroll();
  preferenceUI(); route(routePath(), false); root.dataset.ready = 'true';
}
start().catch(error => {
  const notice = el('p','hos-form-note',error.message || 'The collection could not load. Please refresh the page.'); notice.setAttribute('role','alert'); $('.hos-hero-copy').append(notice);
});



