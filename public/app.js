import { frameStudioImage } from './studio-frame.js';
import { presentationFor, pageDescriptions } from './presentation.js';
import { initializeGallery } from './gallery.js';
import { applyWorkPhotography } from './work-photography.js';
import { closerLookPhoto, closerLookCrop } from './closer-look.js';
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
let catalog, artists, works, assets, collections = [], media = {}, editorial = {}, story = {}, models = {}, viewerPromise, modelViewer;
let activePage = 'home', activeArtist, activeWork;
let gallery;
let collectionDirectoryReady=false,artistDirectoryReady=false;
const inquiryDrafts=new Map();
let inquiryDraftKey='', privacyReturn=false;
const inquiryKey=context=>[context.workId,context.artistId,context.intent,context.topic].join('|');
function saveInquiryDraft(){
 if(!inquiryDraftKey || success.hidden===false)return;
 inquiryDrafts.set(inquiryDraftKey,{context:{...inquiryContext},submissionId,started:inquiryStarted,values:Object.fromEntries(['name','email','interest','message'].map(key=>[key,form.elements[key].value]))});
}

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
function animateSurface(element, distance = 22, duration = 700) {
  if (motionPreference?.matches || !element?.animate) return;
  return element.animate([{opacity:0,transform:`translateY(${distance}px)`},{opacity:1,transform:'translateY(0)'}],{duration,easing:'cubic-bezier(.16,1,.3,1)'});
}
motionPreference?.addEventListener('change', event => { if (event.matches) root.getAnimations?.({subtree:true}).forEach(animation => animation.cancel()); });
const revealObserver = 'IntersectionObserver' in window ? new window.IntersectionObserver(entries => {
  for (const entry of entries) if (entry.isIntersecting) {
    revealObserver.unobserve(entry.target);
    if (!entry.target.dataset.revealed) { entry.target.dataset.revealed = 'true'; animateSurface(entry.target,30,850); }
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
  const artistPhoto=editorial.artistPhotography?.[source];
  if(artistPhoto)source=artistPhoto.original;
  img.toggleAttribute('data-artist-original', Boolean(artistPhoto));
  if(!source){img.removeAttribute('src');img.removeAttribute('srcset');return;}
  img.decoding = 'async';
  const info = media[source];
  img.removeAttribute('srcset'); img.removeAttribute('width'); img.removeAttribute('height');
  if (info) {
    img.width = info.width; img.height = info.height;
    img.sizes = sizes; img.srcset = info.srcset;
  }
  img.src = source;
  const studio=/^\/assets\/(?:zsa-.*(?:studio|photoshoot).*|wingbeat-shoot-.*|hos-(?:queen-mother|celebration|belonging|inner-beauty)-(?:front|back|left|right)-v1(?:-\d+)?)\.webp$/.test(source);
  frameStudioImage(img,studio?source:'');
  // A single studio mat fills the aspect-ratio space around the original photo.
  // It does not sample edge pixels or alter the sculpture bitmap.
  img.classList.toggle('hos-studio-photo', /^\/assets\/zsa-\d+-(?:studio-(?:front|back|left|right)-v[234]|photoshoot-(?:front|back|left|right)-v1)\.webp$/.test(source));
}
function image(key, alt, lazy = true, sizes) {
  const img = el('img'); if (lazy) img.loading = 'lazy';
  applyImage(img, assets[key], sizes); img.alt = alt;
  return img;
}
function routeURL(path) { return (previewMode ? '/admin/preview' : '') + path; }
function destination(data) {
  if(data.view)return data.view==='home'?'/':'/'+data.view;
  if(data.work!==undefined){const work=works?.find(w=>w.id===data.work)||works?.[Number(data.work)];if(work)return '/works/'+work.slug;}
  if(data.artist){const artist=artists?.find(a=>a.id===data.artist);if(artist)return '/artists/'+artist.slug;}
  if(data.collection){const collection=collections.find(c=>c.id===data.collection);if(collection)return '/collections/'+collection.slug+(data.available?'#hos-supporting-'+collection.id:'');}
  if(data.scrollSupporting)return '/collections/'+collections.find(c=>c.id===data.scrollSupporting)?.slug+'#hos-supporting-'+data.scrollSupporting;
  return '';
}
function refreshLinks(container=root){
  for(const node of container.querySelectorAll('a[data-view],a[data-work],a[data-artist],a[data-collection],a[data-scroll-supporting]')){
    const path=destination(node.dataset);if(path){node.href=routeURL(path);node.removeAttribute('aria-disabled');}else{node.removeAttribute('href');node.setAttribute('aria-disabled','true');}
  }
}
function link(text, data) {
  const path=destination(data),button=el(path?'a':'button','hos-text-link cursor-interaction',text);
  if(path)button.href=routeURL(path);else button.type='button';Object.assign(button.dataset,data);
  const arrow=el('span','hos-link-arrow');arrow.setAttribute('aria-hidden','true');
  arrow.innerHTML=path?'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 12h16m-6-6 6 6-6 6"/></svg>':'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M6 18 18 6M6 6h12v12"/></svg>';
  button.append(arrow);return button;
}
function photoLink(className,data,label){const node=el('a',className);Object.assign(node.dataset,data);node.href=routeURL(destination(data));node.setAttribute('aria-label',label);return node;}
function artistLeadAlt(artist) { return /\/hos-artist-/.test(assets[artist.portrait] || '') ? artist.name : 'Sculpture by '+artist.name; }
const artistFor = work => artists.find(artist => artist.id === work.artistId);
const collectionFor = work => collections.find(collection => collection.workIds.includes(work.id));
const workLabel = work => `${work.title}${artistFor(work) ? ' by ' + artistFor(work).name : ''}`;
const stoneLabel = work => work.material ? work.material+(work.materialEstimated&&work.material!=='Details on inquiry'?' (estimated)':'') : '';
function availabilityLabel(work) {
  const label = {sold:'Sold',available:'Available',reserved:'Reserved'}[work.availability];
  const badge=label ? el('span','hos-availability',label) : null;
  if(badge)badge.dataset.availability=work.availability;
  return badge;
}
function credit(work) {
  const artist = artistFor(work);
  return artist ? link(artist.name,{artist:artist.id}) : el('p','hos-credit','Artist details on inquiry');
}
function workCard(work, {compact = false} = {}) {
  const card = el('article', 'hos-work-card');card.dataset.workRecord=work.id;
  const photo = photoLink('hos-work-card-photo cursor-interaction',{work:work.id},`View ${workLabel(work)}`);
  photo.setAttribute('aria-label', `View ${workLabel(work)}`);
  photo.append(image(work.image,work.description || workLabel(work),true,'(max-width: 700px) 90vw, 520px'));
  if(modelDefinition(work)){const badge=el('span','hos-work-card-3d','3D VIEW');badge.setAttribute('aria-hidden','true');photo.append(badge);}
  const copy = el('div','hos-work-card-copy'), badge=availabilityLabel(work);
  if(badge && work.availability!=='available')photo.append(badge);
  const heading=el('h3'),titleLink=photoLink('hos-card-title',{work:work.id},`View ${workLabel(work)}`);titleLink.textContent=work.title;heading.append(titleLink);
  const artist=artistFor(work),author=artist?photoLink('hos-text-link',{artist:artist.id},'About '+artist.name):el('p','hos-credit','Artist details on inquiry');if(artist)author.append(el('span','hos-meta-label','Artist'),document.createTextNode(artist.name));
  copy.append(heading,author);
  if(work.material){const stone=el('p','hos-card-stone');stone.append(el('span','hos-meta-label','Stone'),document.createTextNode(stoneLabel(work)));copy.append(stone);}
  card.append(photo,copy);return card;
}
function artistContext(work) {
  const artist=artistFor(work);if(!artist)return null;
  const context=el('section','hos-artist-context');context.setAttribute('aria-label','About '+artist.name);
  if(assets[artist.portrait])context.append(image(artist.portrait,artistLeadAlt(artist),true,'96px'));
  const copy=el('div');copy.append(el('div','hos-eyebrow','THE ARTIST'),el('h3','',artist.name));
  const biography=artistBiography(artist);
  if(biography){const sentence=biography.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim() || biography;copy.append(el('p','',sentence.length>190?sentence.slice(0,187).replace(/\s+\S*$/,'')+'…':sentence));}
  copy.append(link('About the artist',{artist:artist.id}));context.append(copy);return context;
}
function workScenes(work) {
  const entry=editorial.workScenes?.[work.id];
  return entry?.source===assets[work.image] ? entry.scenes || [] : [];
}
function collectionVisual(work, collection, {interior = false} = {}) {
  const visual=el('div','hos-collection-visual'),photo=el('div','hos-collection-photo');
  visual.dataset.visualWork=work.id;
  const portrait=collection && editorial.collectionPortraits?.[collection.id],artist=artistFor(work);
  const portraitMatches=portrait && portrait.workId===work.id && portrait.workSource===assets[work.image] && portrait.artistId===artist?.id && portrait.portraitSource===assets[artist?.portrait];
  const interiorScene=interior && workScenes(work)[0];
  if(interiorScene){
    photo.classList.add('hos-collection-landscape','hos-collection-interior');
    photo.append(editorialImage(interiorScene.source,work.title+' in an interior setting','100vw'));
  }else if(portraitMatches){
    photo.classList.add('hos-collection-landscape');
    photo.append(editorialImage(portrait.source,artist.name+' beside '+work.title,'(max-width: 700px) 100vw, 90vw'));
  }else photo.append(image(work.image,work.description || workLabel(work),true,'(max-width: 700px) 90vw, 1200px'));
  visual.append(photo);return visual;
}
function collectionSelection(collection) {
  const selected=collection.workIds.map(id=>works.find(work=>work.id===id)).filter(Boolean);
  if(!selected.length)return null;
  const section=el('section','hos-collection-selection');section.dataset.reveal='';section.setAttribute('aria-label','Works in '+collection.name);
  const heading=el('div','hos-selection-heading');heading.append(el('h3','','The works'),el('span','',selected.length+' sculptures'));
  const grid=workGrid(selected);grid.classList.add('hos-equal-works');
  section.append(heading,collectionRail(grid,collection.name+' sculptures'));return section;
}
function collectionRail(grid,label) {
  const rail=el('div','hos-collection-rail');grid.classList.add('hos-horizontal-works');grid.tabIndex=0;grid.setAttribute('aria-label',label);
  const controls=el('div','hos-collection-rail-controls');controls.append(el('span','','Scroll to explore'));
  for(const [step,text] of [[-1,'Previous sculptures'],[1,'Next sculptures']]){
    const button=el('button','',step<0?'Previous':'Next');button.type='button';button.setAttribute('aria-label',text+' in '+label);
    button.addEventListener('click',()=>grid.scrollBy({left:step*grid.clientWidth,behavior:motionPreference?.matches?'instant':'smooth'}));controls.append(button);
  }
  const update=()=>{const overflow=grid.scrollWidth>grid.clientWidth+2;controls.hidden=!overflow;const buttons=controls.querySelectorAll('button');buttons[0].disabled=grid.scrollLeft<=1;buttons[1].disabled=grid.scrollLeft+grid.clientWidth>=grid.scrollWidth-2;};
  grid.addEventListener('scroll',update,{passive:true});if(typeof ResizeObserver==='function')new ResizeObserver(update).observe(grid);
  controls.hidden=true;rail.append(controls,grid);return rail;
}
function collectionChapter(collection, {heading = true} = {}) {
  const work=works.find(work=>work.id===collection.starWorkId),section=el('section','hos-collection-chapter hos-collection-editorial');
  section.dataset.collectionSection=collection.id;if(heading)section.id='hos-home-'+collection.id;
  if(!work)return section;
  if(heading){
    section.classList.add('hos-collection-campaign');
    const visual=collectionVisual(work,collection,{interior:true});
    const selection=collectionSelection(collection);
    const title=el('div','hos-campaign-heading');title.append(el('h2','',collection.name));
    selection.querySelector('.hos-selection-heading').remove();
    const action=link('Explore the collection',{collection:collection.id});
    action.classList.add('hos-collection-route');
    action.setAttribute('aria-label','Explore '+collection.name);
    const footer=el('div','hos-campaign-action');footer.append(action);
    section.append(title,visual,selection,footer);
    return section;
  }
  section.classList.add('hos-collection-campaign','hos-category-campaign');
  const introduction=el('div','hos-collection-introduction');
  introduction.append(el('h1','',collection.name));
  const description=el('div','hos-collection-description');
  description.append(el('p','hos-collection-tagline',story.collections?.[collection.id]?.card||collection.description));
  description.append(el('p','hos-collection-story',story.collections?.[collection.id]?.intro||collection.introduction||''));
  introduction.append(description);
  section.append(introduction);
  return section;
}
function filteredWorks(container, selected, label = 'Browse works') {
  const section=el('section','hos-collection-browser');section.setAttribute('aria-label',label);
  const filters=el('div','hos-collection-filters'), gridHost=el('div'),counter=el('p','hos-filter-count');
  counter.setAttribute('role','status');counter.setAttribute('aria-live','polite');
  const toolbar=el('div','hos-filter-toolbar'),toggle=el('button','hos-filter-toggle','Filters');
  toggle.type='button';toggle.setAttribute('aria-expanded','false');
  filters.id='hos-filters-'+(container.id || Math.random().toString(36).slice(2));
  toggle.setAttribute('aria-controls',filters.id);
  toggle.addEventListener('click',()=>{const open=toggle.getAttribute('aria-expanded')!=='true';toggle.setAttribute('aria-expanded',String(open));section.dataset.filtersOpen=String(open);});
  const state={};
  selected=selected.map(work=>({...work,collectionName:collectionFor(work)?.name || '',artistName:artistFor(work)?.name || ''}));
  for(const [key,name] of [['collectionName','Collection'],['artistName','Artist'],['material','Stone'],['colour','Color'],['size','Size']]) {
    if(new Set(selected.map(work=>work[key]).filter(Boolean)).size<2)continue;
    const wrapper=el('label','',name), select=el('select');select.setAttribute('aria-label',name);select.dataset.filter=key;
    const options=[['',`All ${name.toLowerCase()}s`],...[...new Set(selected.map(work=>work[key]).filter(Boolean))].sort().map(value=>[value,value])];
    if(selected.some(work=>!work[key]))options.push(['__unknown','Details on inquiry']);
    for(const [value,text] of options){const option=el('option','',text);option.value=value;select.append(option);}
    select.addEventListener('change',()=>{state[key]=select.value;update();});wrapper.append(select);filters.append(wrapper);
  }
  const reset=el('button','hos-text-link','Reset filters');reset.type='button';reset.addEventListener('click',()=>{for(const key of Object.keys(state))delete state[key];filters.querySelectorAll('select').forEach(select=>select.value='');update();});filters.append(reset);if(!filters.querySelector('select'))filters.hidden=true;
  function update(){const result=selected.filter(work=>Object.entries(state).every(([key,value])=>!value || (value==='__unknown'?!work[key]:work[key]===value)));counter.textContent=`${result.length} ${result.length===1?'work':'works'}`;const grid=result.length?workGrid(result):null;gridHost.replaceChildren(grid||el('p','hos-empty-results','No works match these filters. Try another selection.'));refreshLinks(section);observeReveals(section);}
  toggle.hidden=!filters.querySelector('select');toolbar.append(counter,toggle);
  section.append(toolbar,filters,gridHost);container.append(section);update();
}
function renderCollection(collection) {
  const container=$('#hos-category-content');container.replaceChildren(collectionChapter(collection,{heading:false}));
  const supporting=el('section','hos-supporting-works');supporting.id='hos-supporting-'+collection.id;
  supporting.append(el('h2','','The works in '+collection.name));
  const selected=collection.workIds.map(id=>works.find(work=>work.id===id)).filter(Boolean);
  filteredWorks(supporting,selected,'Collection sculptures');container.append(supporting);watchModels(container);
}
function relatedRail(selected,label) {
  const container=el('section','hos-related-rail');container.setAttribute('aria-label',label);
  const grid=workGrid(selected.slice(0,3));container.append(grid);return container;
}
function collectionIndex(container,{home=false}={}) {
  const nav=el('nav',home?'hos-collection-jumps':'hos-collection-index');nav.setAttribute('aria-label',home?'Jump to a collection':'Browse collections');
  for(const collection of collections){
    const work=works.find(work=>work.id===collection.starWorkId);if(!work)continue;
    if(home){const anchor=el('a','',collection.name);anchor.href='#hos-home-'+collection.id;anchor.dataset.jumpCollection='hos-home-'+collection.id;nav.append(anchor);}
    else{const card=el('a','hos-collection-index-card');card.href=routeURL('/collections/'+collection.slug);card.dataset.collection=collection.id;card.append(image(work.image,collection.name+' collection',true,'(max-width:700px) 90vw, 420px'),el('h2','',collection.name),el('p','',story.collections?.[collection.id]?.card||collection.description),el('span','hos-index-count',collection.workIds.length+' works'));nav.append(card);}
  }
  container.append(nav);
}
function renderOverview(){
  const container=$('#hos-collection-chapters');container.replaceChildren();
  if(collections.length)collectionIndex(container);
  const heading=el('div','hos-browse-heading');heading.id='hos-all-works';heading.append(el('h2','','All works'),el('p','',works.length+' sculptures in the Founding Collection.'));container.append(heading);
  filteredWorks(container,works,'All sculptures');
}
function storySection(section){
  const article=el('article','hos-story-section');article.dataset.reveal='';
  if(section.eyebrow)article.append(el('span','hos-eyebrow',section.eyebrow));
  article.append(el('h2','',section.heading),el('p','',section.body));
  if(section.image){const figure=el('figure');figure.append(editorialImage('/assets/'+section.image,section.caption||section.heading,'(max-width:700px) 90vw, 50vw'),el('figcaption','',section.caption||''));article.prepend(figure);}
  return article;
}
function renderStory(){
  // Preserve the approved homepage hero and For Designers / For Collectors copy.
  // Editorial depth belongs on The Making; do not inject extra homepage sections.
  const makingImage=$('.hos-home-making img');
  if(makingImage){
    makingImage.removeAttribute('data-asset');
    applyImage(makingImage,'/assets/making-chisel-at-work.webp');
    makingImage.alt='A sculptor carving stone with a hammer and chisel';
  }
  const making=story.pages?.making,process=$('[data-page="making"]');
  if(making?.sections?.length && process){
    process.querySelector('.hos-page-heading p').textContent=making.intro;
    process.querySelector('.hos-process-steps').replaceChildren(...making.sections.map(storySection));
    process.querySelector('.hos-process-image').hidden=true;
    process.querySelector('#hos-process-gallery').replaceChildren();
    process.querySelector('#hos-process-gallery').hidden=true;
    const end=process.querySelector('.hos-page-end');
    if(making.closing)end.before(el('p','hos-story-closing',making.closing));
  }
  // Use the original House page's three editorial fields, not a six-section essay.
  const house=story.pages?.house;
  if(house){
    $('#hos-house-vision').textContent=house.vision;
    $('#hos-house-founders').textContent=house.founders;
    $('#hos-house-approach').textContent=house.approach;
  }
}
function renderPresentation(){
  for(const key of ['designers','collectors']){
    const page=$(`[data-page="${key}"]`),content=presentationFor(catalog.site,key);
    page.querySelector('h1').textContent=content.title;page.querySelector('.hos-page-heading p').textContent=content.intro;
    const img=page.querySelector('.hos-editorial-image img'),campaign=editorial.pageBanners?.[key],bannerSource=campaign?.source||assets[content.image],caption=campaign?.caption||content.caption;if(bannerSource){applyImage(img,bannerSource,'90vw');img.alt=caption;}page.querySelector('figcaption').textContent=caption;
    const homeBanner=$('.hos-home-services .hos-summary-photo[data-view="'+key+'"] img') || $('.hos-summary-photo[data-view="'+key+'"] img');if(homeBanner&&bannerSource){applyImage(homeBanner,bannerSource,'(max-width:700px) 100vw, 50vw');homeBanner.alt=caption;}
    const steps=page.querySelector('.hos-service-grid');steps.replaceChildren();content.steps.forEach((step,i)=>{const card=el('div');card.dataset.reveal='';card.append(el('div','hos-eyebrow',String(i+1).padStart(2,'0')),el('h2','',step.title),el('p','',step.text));steps.append(card);});
    const faq=page.querySelector('.hos-service-questions');faq.replaceChildren(el('h2','','A few practical questions'));
    for(const question of content.questions){const item=el('details'),summary=el('summary','',question.title);item.append(summary,el('p','',question.text));faq.append(item);}
  }
  const house=presentationFor(catalog.site,'house'),page=$('[data-page="house"]');page.querySelector('h1').textContent=house.title;page.querySelector('.hos-page-heading p').textContent=house.intro;
  $('#hos-house-vision').textContent=house.vision;$('#hos-house-founders-title').textContent=house.foundersTitle;$('#hos-house-founders').textContent=house.founders;$('#hos-house-approach').textContent=house.approach;
  const founderPhoto=$('#hos-house-image');founderPhoto.hidden=!assets[house.image];if(assets[house.image]){const img=founderPhoto.querySelector('img');applyImage(img,assets[house.image],'90vw');img.alt=house.caption;founderPhoto.querySelector('figcaption').textContent=house.caption;}
  const making=presentationFor(catalog.site,'making'),process=$('[data-page="making"]');process.querySelector('h1').textContent=making.title;process.querySelector('.hos-page-heading p').textContent=making.intro;
  const steps=process.querySelector('.hos-process-steps');steps.replaceChildren();making.steps.forEach((step,i)=>{const card=el('div');card.dataset.reveal='';card.append(el('span','',String(i+1).padStart(2,'0')),el('h2','',step.title),el('p','',step.text));steps.append(card);});
  const processGallery=$('#hos-process-gallery');processGallery.replaceChildren();
  const configured=making.gallery.filter(photo=>assets[photo.image]);
  const galleryPhotos=configured.length?configured.map(photo=>({source:assets[photo.image],caption:photo.caption})):[{source:assets.process || '/assets/process.jpg',caption:'Carving the stone'}];
  galleryPhotos.forEach(photo=>{const figure=el('figure');figure.dataset.reveal='';figure.append(editorialImage(photo.source,photo.caption,'(max-width:700px) 90vw, 45vw'),el('figcaption','',photo.caption));processGallery.append(figure);});
  const contact=$('#hos-contact-email');contact.hidden=!catalog.site.contactEmail;if(catalog.site.contactEmail){contact.href='mailto:'+catalog.site.contactEmail;contact.textContent=catalog.site.contactEmail;}
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
  const img = el('img'); img.loading = 'lazy'; applyImage(img, source, sizes); img.alt = alt; return img;
}
function modelDefinition(work) {
  const entry=models[work.id];
  if(!entry || entry.source!==assets[work.image])return null;
  if(entry.uploaded)return entry.workId===work.id && entry.ownerApproved===true ? entry : null;
  if(entry.reconstruction)return entry.workId===work.id && (previewMode || work.modelVerified===true || entry.ownerApproved===true) && (!work.sourcePage || entry.sourcePage===work.sourcePage) ? entry : null;
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
  const hint=el('div','hos-3d-hint','Drag to rotate');hint.setAttribute('role','status');
  panel.append(top,stage,hint);
  if(previewMode && modelDefinition(work).reconstruction)panel.append(el('p','hos-model-review-note','Reference-based reconstruction. Depth and unseen surfaces are inferred.'));
  return panel;
}
function setWorkVisual(view, {trackView = true} = {}) {
  const modes=$('#hos-work-view-modes'),photo=$('.hos-work-primary-photo'),thumbs=$('#hos-work-additional-images'),host=$('#hos-work-inline-model');
  const showModel=view==='model' && !modes.hidden && Boolean(host.firstElementChild);
  photo.hidden=showModel;thumbs.hidden=showModel || thumbs.children.length<2;host.hidden=!showModel;
  modes.querySelectorAll('[data-work-visual]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.workVisual===(showModel?'model':'photos'))));
  if(showModel){watchModels(host);if(trackView && activeWork)track('model_view',{workId:activeWork.id,artistId:activeWork.artistId});}
  else modelViewer?.refresh();
}
function sculptureSettings(artist, work, entry, withInquiry = false) {
  const carousel = el('div', 'hos-settings-carousel'); carousel.dataset.reveal = '';
  carousel.setAttribute('role', 'group'); carousel.setAttribute('aria-label', `${work.title} in different spaces`);
  const grid = el('div', 'hos-sculpture-settings'); grid.tabIndex = 0;
  grid.id = `hos-settings-${uuid()}`;
  grid.setAttribute('aria-label', 'Sculpture settings');
  for (const [setting, label, space] of [['apartment','For designers','an apartment'],['gallery','For collectors','a private gallery'],['office','For corporate offices','a corporate office']]) {
    const tile = el('article', 'hos-setting-tile');
    const photo = photoLink('hos-setting-photo cursor-interaction',{work:work.id},'View '+workLabel(work));
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
    const entry = chapterMedia(artist, featured), chapter = el('section', 'hos-artist-chapter hos-editorial-chapter');chapter.id='hos-home-artist-'+artist.id;
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
    chapter.append(sculptureSettings(artist,featured,entry,withInquiry));
    const additional = selected.filter(work => work.id !== featured.id);
    if (additional.length) { const more = el('div','hos-chapter-additional');more.append(el('h3','','More works by '+artist.name),workGrid(additional));chapter.append(more); }
    return chapter;
  }
  const chapter=el('section','hos-artist-chapter');chapter.id='hos-home-artist-'+artist.id;const intro=el('div','hos-artist-intro');intro.dataset.reveal='';
  const portrait=photoLink('hos-artist-intro-photo cursor-interaction',{artist:artist.id},`Read about ${artist.name}`);portrait.setAttribute('aria-label',`Read about ${artist.name}`);
  portrait.append(image(artist.portrait,artistLeadAlt(artist),true,'(max-width: 700px) 90vw, 420px'));
  const copy=el('div','hos-artist-intro-copy');copy.append(el('div','hos-eyebrow','THE ARTIST'),el('h2','',artist.name),el('p','hos-artist-style',artist.style),el('p','',artist.description || artistBiography(artist)),link('About the artist',{artist:artist.id}));
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
  applyImage($('#hos-artist-image'), assets[artist.portrait]); $('#hos-artist-image').alt = artistLeadAlt(artist);
  const selected = works.filter(w => w.artistId === artist.id);
  $('#hos-artist-work-link').hidden = selected.length === 0;
  if (selected.length) $('#hos-artist-work-link').dataset.work = selected[0].id;
  const studio=$('#hos-artist-studio');studio.replaceChildren();
  const legacyStudio=editorial.chapters?.[artist.id];
  const studioSource=assets[artist.studioImage] || (legacyStudio?.artistName===artist.name && legacyStudio.portraitSource===assets[artist.portrait]?legacyStudio.landscape:'');
  if(studioSource && studioSource!==assets[artist.portrait]){const figure=el('figure');figure.append(editorialImage(studioSource,artist.name+' with a sculpture from the collection','90vw'));const caption=el('figcaption','',artist.name+' · With the work');figure.append(caption);studio.append(figure);}
  if(artist.quote){const quote=el('blockquote','',artist.quote);studio.append(quote);}
  studio.hidden=!studio.childElementCount;
  const more = $('#hos-artist-works'); more.replaceChildren();
  if (selected.length) {
    more.append(el('h2', '', artist.id==='artist-unconfirmed'?'Works awaiting attribution':'Works by ' + artist.name), workGrid(selected));
  }
}
let workActionObserver;
function renderWork(work) {
  activeWork = work; activeArtist = artistFor(work);
  $('#hos-work-title').textContent = work.title;
  $('#hos-work-breadcrumb-title').textContent = work.title;
  const setting=editorial.workSettings?.[work.id],settingSection=$('#hos-work-setting'),settingImage=$('#hos-work-setting-image');
  settingSection.hidden=!setting?.source;
  if(setting?.source){
    applyImage(settingImage,setting.source,'(max-width:700px) 92vw, (max-width:1600px) 90vw, 1460px');
    settingImage.alt=work.title+' in '+setting.label.toLowerCase();
    $('#hos-work-setting-caption').textContent=setting.label;
  }else{
    for(const attribute of ['src','srcset','sizes','width','height'])settingImage.removeAttribute(attribute);
    settingImage.alt='';$('#hos-work-setting-caption').textContent='';
  }
  const campaign = workScenes(work)[0] || (assets[work.views?.interior] ? {source:assets[work.views.interior]} : null);
  const banner = $('#hos-work-banner');
  banner.dataset.workRecord = work.id;
  banner.classList.toggle('hos-work-banner-scene',Boolean(campaign));
  banner.classList.toggle('hos-work-banner-studio',!campaign);
  const bannerImage = $('#hos-work-banner-image');
  applyImage(bannerImage,campaign?.source || assets[work.image],'100vw');
  bannerImage.alt = campaign ? `${work.title} in an interior setting` : `Front photograph of ${work.title}`;
  $('#hos-work-banner-collection').textContent = collectionFor(work)?.name || 'INDIVIDUAL WORK';
  $('#hos-work-banner-title').textContent = work.title;
  $('#hos-work-banner-artist').textContent = activeArtist?.name || '';
  $('#hos-work-banner-stone').textContent = stoneLabel(work) || 'Stone details on inquiry';
  const collectionForBreadcrumb=collectionFor(work),breadcrumbLink=$('#hos-work-breadcrumb-collection');
  breadcrumbLink.hidden=!collectionForBreadcrumb;
  $('.hos-work-breadcrumb-divider').hidden=!collectionForBreadcrumb;
  if(collectionForBreadcrumb){breadcrumbLink.textContent=collectionForBreadcrumb.name;breadcrumbLink.dataset.collection=collectionForBreadcrumb.id;breadcrumbLink.href=routeURL('/collections/'+collectionForBreadcrumb.slug);}
  $('#hos-work-overline').textContent=(collectionForBreadcrumb?.name ? collectionForBreadcrumb.name.toUpperCase()+' / ' : '')+'ORIGINAL STONE SCULPTURE';
  const modelLink=$('#hos-work-model');modelLink.hidden=!modelDefinition(work);modelLink.dataset.model=work.id;
  const artistLink=$('#hos-work-artist');artistLink.textContent=activeArtist?.name || 'Artist details on inquiry';artistLink.dataset.artist=activeArtist?.id || '';artistLink.toggleAttribute('aria-disabled',!activeArtist);
  for(const [id,value] of [['year',work.yearMade],['dimensions',work.dimensions],['material',stoneLabel(work)],['acquisition',work.acquisitionMethod]]) {
    const node=$('#hos-work-'+id);node.textContent=value || '';if(node.parentElement)node.parentElement.hidden=!value;
  }
  $('#hos-work-core-specs').hidden=![work.yearMade,work.dimensions,work.material,work.acquisitionMethod].some(Boolean);
  const description=$('#hos-work-description');
  description.textContent=story.works?.[work.id]?.editorialShort || work.description || '';
  const essayHost=$('#hos-work-story');essayHost.replaceChildren();essayHost.hidden=true;
  const compactSpecs=$('#hos-work-short-specs');
  compactSpecs.textContent=[stoneLabel(work),work.dimensions].filter(Boolean).join('  ·  ');
  compactSpecs.hidden=!compactSpecs.textContent;
  $('#hos-work-essential-stone').textContent=stoneLabel(work)||'On inquiry';
  $('#hos-work-essential-dimensions').textContent=work.dimensions||'On inquiry';
  $('#hos-work-essential-availability').textContent=({available:'Available',sold:'Sold',reserved:'Reserved'})[work.availability]||'On inquiry';
  const button = $('#hos-work-inquiry'),sold=work.availability==='sold';
  button.textContent=sold?'Inquire about related works':'Inquire about this work';
  const arrow=el('span','hos-link-arrow');arrow.setAttribute('aria-hidden','true');arrow.innerHTML='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" focusable="false"><path d="M6 18 18 6M6 6h12v12"/></svg>';button.append(arrow);
  button.dataset.inquiry = sold?`Alternatives to ${workLabel(work)}`:workLabel(work);button.dataset.inquiryWork = work.id;button.dataset.inquiryArtist=activeArtist?.id || '';button.dataset.inquiryIntent=sold?'alternatives':'';
  const img = $('#hos-work-image'); applyImage(img, assets[work.image]); img.alt = work.description || workLabel(work);
  const context=$('#hos-work-context');context.replaceChildren();const badge=availabilityLabel(work);if(badge)context.append(badge);
  const collection=collectionFor(work);if(collection)context.append(link(collection.name,{collection:collection.id}));
  if(sold)context.append(el('p','','This work is sold. You can inquire about related works.'));
  const details=$('#hos-work-extra-specs'),serviceDetails=$('#hos-work-service-specs'),provenanceDetails=$('#hos-work-provenance-specs');details.replaceChildren();serviceDetails.replaceChildren();provenanceDetails.replaceChildren();
  const units = work.dimensions?.match(/([\d.]+)\s*×\s*([\d.]+)(?:\s*×\s*([\d.]+))?\s*cm/i);
  const values={...(work.details || {})};
  if(units)values.inches=units.slice(1).filter(Boolean).map(n=>(Number(n)/2.54).toFixed(1)).join(' × ')+' in';
  if(values.weightKg)values.weightKg=`${values.weightKg} kg / ${(Number(values.weightKg)*2.20462262).toFixed(1)} lb`;
  const labels={inches:'Dimensions in inches',finish:'Finish',signature:'Signature',weightKg:'Weight',base:'Base & inclusion',location:'Current location',delivery:'Delivery estimate',shipping:'Shipping',installation:'Installation',care:'Care',authenticity:'Authenticity',provenance:'Provenance'};
  for(const [key,label] of Object.entries(labels))if(values[key]){const row=el('div');row.append(el('span','',label),el('span','',values[key]));(['delivery','shipping','installation','care'].includes(key)?serviceDetails:['authenticity','provenance'].includes(key)?provenanceDetails:details).append(row);}
  $('#hos-work-provenance').hidden=!provenanceDetails.childElementCount;
  $('#hos-work-delivery-note').hidden=Boolean(serviceDetails.childElementCount);
  $('#hos-work-specifications').hidden=$('#hos-work-core-specs').hidden && !details.childElementCount;
  for(const id of ['#hos-work-specifications','#hos-work-delivery','#hos-work-provenance'])$(id).open=false;
  // A campaign photograph leads the page once, instead of recurring at the
  // end of the sculpture's angle gallery.
  const hasModel=Boolean(modelDefinition(work));
  gallery?.setWork(work,assets,workScenes(work),window.matchMedia?.('(max-width:700px)')?.matches?'':campaign?.source,hasModel);
  const modes=$('#hos-work-view-modes'),inlineModel=$('#hos-work-inline-model');
  modes.hidden=!hasModel;inlineModel.replaceChildren();
  if(hasModel){const panel=modelPanel(work);panel.classList.add('hos-work-3d-panel');inlineModel.append(panel);}
  setWorkVisual('photos',{trackView:false});
  const mobileAction=$('#hos-mobile-work-action'),mobileButton=$('#hos-mobile-work-inquiry');mobileButton.textContent=button.textContent;Object.assign(mobileButton.dataset,button.dataset);mobileButton.setAttribute('aria-label',(sold?'Inquire about alternatives to ':'Inquire about ')+work.title);mobileAction.hidden=true;
  workActionObserver?.disconnect();
  if('IntersectionObserver' in window && !previewMode){let originalVisible=false,footerVisible=false;workActionObserver=new window.IntersectionObserver(entries=>{for(const entry of entries){if(entry.target===button)originalVisible=entry.isIntersecting;else footerVisible=entry.isIntersecting;}mobileAction.hidden=originalVisible||footerVisible;});workActionObserver.observe(button);workActionObserver.observe($('.hos-footer'));}
  const maker=$('#hos-work-maker');maker.replaceChildren();const contextArtist=artistContext(work);maker.hidden=!contextArtist;if(contextArtist)maker.append(contextArtist);
  const detail=$('#hos-work-detail'),detailCopy=$('#hos-work-detail-copy'),detailImage=$('#hos-work-detail-image');
  const closer=story.works?.[work.id]?.closerLook;
  // The editorial record names the precise photograph that illustrates its text.
  // Never silently substitute a different angle: doing so can make the caption false.
  const viewKey=closer?.photoView;
  const detailSource=closerLookPhoto(work,assets,closer);
  const crop=detailSource&&closerLookCrop(closer),detailFigure=detail.querySelector('figure');
  detailFigure.toggleAttribute('data-detail-crop',Boolean(crop));
  if(crop){
    for(const [key,value] of Object.entries({aspect:crop.aspectRatio,left:-100*crop.x/crop.width+'%',top:-100*crop.y/crop.height+'%',width:100/crop.width+'%',height:100/crop.height+'%'}))detailFigure.style.setProperty('--detail-'+key,value);
  }
  detail.hidden=!detailSource;
  if(!detail.hidden){
    $('#hos-work-detail-title').textContent=closer.heading;
    detailCopy.textContent=closer.copy;
    applyImage(detailImage,detailSource,crop?`(max-width:700px) ${Math.ceil(90/crop.width)}vw, ${Math.ceil(52/crop.width)}vw`:'(max-width:700px) 90vw, 52vw');
    if(crop)frameStudioImage(detailImage,'');
    detailImage.alt=closer.photoAlt||({front:'Close-up',right:'Right side',left:'Left side',back:'Rear',detail:'Detail',detail2:'Second detail'})[viewKey]+' photograph of '+work.title+', showing '+closer.heading.toLowerCase();
  }else{
    detailCopy.textContent='';
    applyImage(detailImage,null);
    detailImage.alt='';
  }
  const related=$('#hos-work-related');related.replaceChildren();
  const sameCollection=collection?collection.workIds.filter(id=>id!==work.id).map(id=>works.find(w=>w.id===id)).filter(Boolean):[];
  if(sameCollection.length){related.append(el('h2','',sold?'Explore related works':`More from ${collection.name}`),relatedRail(sameCollection,'More from '+collection.name),link('Explore '+collection.name,{collection:collection.id}));}
  const sameArtist=activeArtist?works.filter(w=>w.artistId===activeArtist.id&&w.id!==work.id&&!sameCollection.some(other=>other.id===w.id)):[];
  if(sameArtist.length)related.append(el('h2','','More by '+activeArtist.name),relatedRail(sameArtist,'More by '+activeArtist.name),link('All works by '+activeArtist.name,{artist:activeArtist.id}));
}
function renderArtistDirectory() {
  const grids=root.querySelectorAll('[data-artist-grid]');
  const ordered=[...artists].sort((a,b)=>(a.name==='Artist to be confirmed')-(b.name==='Artist to be confirmed') || a.name.localeCompare(b.name));
  grids.forEach(grid=>{
    const fragment=document.createDocumentFragment();
    ordered.forEach(artist=>{
      const card=photoLink('hos-portrait-card cursor-interaction',{artist:artist.id},'About '+artist.name);
      card.dataset.reveal='';
      card.append(image(artist.portrait,artistLeadAlt(artist),true,'(max-width: 700px) 90vw, 29vw'),el('h3','',artist.name),el('p','hos-artist-style',artist.style || 'Stone sculpture · Zimbabwe'));
      fragment.append(card);
    });
    grid.replaceChildren(fragment);
  });
}
function ensurePageContent(page){
  if(page==='collection'&&!collectionDirectoryReady){renderOverview();collectionDirectoryReady=true;}
  if(page==='artists'&&!artistDirectoryReady){renderArtistDirectory();artistDirectoryReady=true;}
}
function route(path, shouldFocus = true) {
  let page = path === '/' ? 'home' : path.slice(1);
  let item;
  if (path.startsWith('/artists/')) { item = artists.find(a => a.slug === path.split('/')[2]); if (item) { renderArtist(item); page = 'artist'; } }
  if (path.startsWith('/collections/')) { item=collections.find(c=>c.slug===path.split('/')[2]);if(item){renderCollection(item);page='category';} }
  if (path.startsWith('/works/')) { item = works.find(w => w.slug === path.split('/')[2]); if (item) { renderWork(item); page = 'work'; } }
  if (!$(`[data-page="${page.replace(/[^a-z]/g, '')}"]`) || !['home','collection','category','artists','artist','work','making','designers','collectors','house','privacy','notfound'].includes(page)) page = 'notfound';
  ensurePageContent(page);
  activePage = page;
  $('#hos-page-navigation').hidden = page === 'home';
  pageAnimation?.cancel();
  root.querySelectorAll('[data-page]').forEach(view => { view.hidden = view.dataset.page !== page; });
  main.hidden = false; inquiry.hidden = true; setMenu(false);
  modelViewer?.close();modelViewer?.refresh();gallery?.close();refreshLinks();
  const labels = {home:'Zimbabwean stone sculpture',collection:'The collection',artists:'The artists',making:'The making',designers:'For designers',collectors:'For collectors',house:'The house',privacy:'Privacy',notfound:'Page not found'};
  document.title = `${item?.title || item?.name || labels[page] || 'House of Mabwe'} | House of Mabwe`;
  const canonical = document.querySelector('link[rel="canonical"]'); if (canonical) canonical.href = location.origin + (previewMode ? '/admin/preview' : '') + path;
  const description = item?.description || pageDescriptions[page] || catalog.site.description;
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
  if(!inquiry.hidden)saveInquiryDraft();
  if (path === routePath()) { route(path); return; }
  rememberScroll();
  history.pushState({hosNavigation:{path,previous:routePath(),scrollY:0}}, '', routeURL(path));route(path.split('#')[0]);scrollToHash();
}
function scrollToHash(){
  if(!location.hash)return;let id;try{id=decodeURIComponent(location.hash.slice(1));}catch{return;}
  const target=document.getElementById(id);if(target&&!target.closest('[hidden]'))requestAnimationFrame(()=>{target.setAttribute('tabindex','-1');target.focus({preventScroll:true});target.scrollIntoView({block:'start',behavior:'instant'});});
}
function navigateBack() {
  if(privacyReturn && activePage==='privacy'){history.back();return;}
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
  inquiryDraftKey=inquiryKey(inquiryContext);const saved=inquiryDrafts.get(inquiryDraftKey);
  submissionId=saved?.submissionId || uuid();inquiryStarted=saved?.started || false;
  form.reset(); form.hidden = false; review.hidden = true; success.hidden = true;
  $('#hos-inquiry-discard').hidden=false;title.textContent = 'Your inquiry'; statusMessage(''); $('#hos-inquiry-context').textContent = topic;
  const artwork=works?.find(work=>work.id===inquiryContext.workId);
  const artworkPreview=$('#hos-inquiry-artwork');
  artworkPreview.hidden=!artwork;
  if(artwork){
    applyImage($('#hos-inquiry-artwork-image'),assets[artwork.image],'96px');
    $('#hos-inquiry-artwork-image').alt=artwork.title;
    $('#hos-inquiry-artwork-title').textContent=artwork.title;
    $('#hos-inquiry-artwork-info').textContent=[artistFor(artwork)?.name,stoneLabel(artwork),artwork.dimensions].filter(Boolean).join(' · ');
  }else $('#hos-inquiry-artwork-image').removeAttribute('src');
  if (['Designer project','Corporate project'].includes(topic))form.elements.interest.value='Sourcing for a project';
  if (topic==='Sculpture commission')form.elements.interest.value='Commissioning a sculpture';
  if(saved)for(const [key,value] of Object.entries(saved.values))form.elements[key].value=value;
  $('#hos-inquiry-response-note').textContent=catalog.site.inquiryNote || 'Your inquiry starts a direct conversation with House of Mabwe. We will respond by email.';
  main.hidden = true; inquiry.hidden = false; setMenu(false);
  window.scrollTo({top:0,behavior:'instant'}); form.elements.name.focus({preventScroll:true});
  pageAnimation?.cancel();pageAnimation=animateSurface(inquiry);
  track('inquiry_opened', { workId:inquiryContext.workId, artistId:inquiryContext.artistId });
}
function closeInquiry() {
  if (submitting) return;
  saveInquiryDraft();
  main.hidden = false; inquiry.hidden = true;
  window.scrollTo({top:inquiryScroll,behavior:'instant'});
  if (lastInquiryButton && !lastInquiryButton.closest?.('[hidden]')) lastInquiryButton.focus?.({preventScroll:true});
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
$('#hos-form-privacy').addEventListener('click', () => { if (!submitting){saveInquiryDraft();privacyReturn=true;navigate('/privacy');} });
$('#hos-inquiry-discard').addEventListener('click',()=>{inquiryDrafts.delete(inquiryDraftKey);form.reset();inquiryStarted=false;submissionId=uuid();statusMessage('Inquiry draft cleared.');});
$('#hos-inquiry-continue').addEventListener('click', () => navigate('/collection'));
root.addEventListener('keydown', event => { if (event.key === 'Escape') { if (!menu.hidden) { event.preventDefault(); setMenu(false); menuToggle.focus({preventScroll:true}); } else if (!inquiry.hidden) closeInquiry(); } });
root.addEventListener('click', event => {
  if (!catalog || submitting) return;
  const anchor=event.target.closest('a');if(anchor){if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||anchor.target==='_blank'||anchor.hasAttribute('download'))return;if(anchor.getAttribute('aria-disabled')==='true'){event.preventDefault();return;}if(anchor.matches('[data-view],[data-work],[data-artist],[data-collection],[data-scroll-supporting],[data-scroll-collection],[data-jump-collection]'))event.preventDefault();}
  const jump=event.target.closest('[data-jump-collection]');if(jump){const target=document.getElementById(jump.dataset.jumpCollection);target?.scrollIntoView({behavior:motionPreference?.matches?'instant':'smooth',block:'start'});return;}
  const workVisual=event.target.closest('[data-work-visual]');
  if(workVisual){setWorkVisual(workVisual.dataset.workVisual);return;}
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
  const category=event.target.closest('[data-collection]');if(category){const item=collections.find(c=>c.id===category.dataset.collection);if(item){track('explore_click',{workId:item.starWorkId});navigate(destination(category.dataset));}return;}
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
  submissionId = uuid(); form.hidden = false; review.hidden = true; $('#hos-inquiry-discard').hidden=false;title.textContent = 'Your inquiry'; statusMessage(''); window.scrollTo({top:0,behavior:'instant'}); form.elements.name.focus({preventScroll:true});
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
    inquiryDrafts.delete(inquiryDraftKey);$('#hos-inquiry-discard').hidden=true;
    review.hidden = true; success.hidden = false; title.textContent = 'Inquiry received.';
    $('#hos-inquiry-reference').textContent = data.reference; statusMessage(''); form.reset();
    window.scrollTo({top:0,behavior:'instant'}); $('#hos-inquiry-continue').focus({preventScroll:true});
  } catch (error) {
    statusMessage(error.name === 'TimeoutError' || error.name === 'TypeError' ? 'We could not confirm receipt. Your details are still here. Please try again.' : error.message, true);
  } finally { submitting = false; sendButton.disabled = false; $('#hos-inquiry-edit').disabled = false; $('#hos-inquiry-close').disabled = false; }
});
window.addEventListener('popstate', () => {
  if (!catalog || submitting) return;
  if(!inquiry.hidden)saveInquiryDraft();
  route(routePath(), false);
  const returning=privacyReturn && activePage!=='privacy';
  const restore = () => {
    if(returning){privacyReturn=false;const draft=inquiryDrafts.get(inquiryDraftKey);if(draft){openInquiry(draft.context.topic,lastInquiryButton || {dataset:{inquiryWork:draft.context.workId,inquiryArtist:draft.context.artistId,inquiryIntent:draft.context.intent}});return;}}
    window.scrollTo({top:history.state?.hosNavigation?.scrollY || 0,behavior:'instant'});
    const heading = $(`[data-page="${activePage}"] h1`);heading?.setAttribute('tabindex','-1');heading?.focus({preventScroll:true});
  };
  if (window.requestAnimationFrame) window.requestAnimationFrame(restore); else restore();
});

async function start() {
  const [response,mediaResponse,editorialResponse,modelResponse,storyResponse] = await Promise.all([fetch(previewMode ? '/api/admin/preview-content' : '/content.json'),fetch(previewMode?'/api/admin/media-manifest':'/media-manifest.json').catch(()=>({ok:false})),fetch('/editorial.json').catch(()=>({ok:false})),fetch('/models.json').catch(()=>({ok:false})),fetch('/story.json').catch(()=>({ok:false}))]); if (!response.ok) throw new Error('The collection could not load. Please refresh the page.');
  if (mediaResponse.ok) media = await mediaResponse.json();
  if (editorialResponse.ok) editorial = await editorialResponse.json();
  if (modelResponse.ok) models = await modelResponse.json();
  if (storyResponse.ok) story = await storyResponse.json();
  catalog = await response.json(); applyWorkPhotography(catalog, editorial.workPhotography); ({artists,works,assets} = catalog);collections=catalog.collections || [];
  catalog.site.description = catalog.site.description.replace(/\benquir/gi, word => word[0] === 'E' ? 'Inquir' : 'inquir');
  $('#hos-copyright').textContent = `© ${new Date().getFullYear()} House of Mabwe`;
  $('#hos-location').textContent = catalog.site.location;
  $('.hos-founding-heading p').textContent = collections.length ? `${collections.length} collections. ${collections.reduce((sum,c)=>sum+c.workIds.length,0)} sculptures.` : `${artists.length} artists. Selected works.`;
  root.querySelectorAll('[data-asset]').forEach(img => { if(!assets[img.dataset.asset])return;applyImage(img,assets[img.dataset.asset]); if (!img.classList.contains('hos-brand-mark')) img.loading = 'lazy'; });
  applyImage($('.hos-hero-image'),heroSource(),'100vw');$('.hos-hero-image').alt=heroDescription();
  root.querySelectorAll('.hos-editorial-image img,.hos-summary-photo img[src]').forEach(img=>applyImage(img,img.getAttribute('src'),'90vw'));
  gallery=initializeGallery({root,document,applyImage,rotationFor:source=>source==='/assets/zsa-012-photoshoot-front-v1.webp'?'-4deg':source==='/assets/zsa-012-studio-front-v3.webp'?'6deg':'',resolveSource:source=>editorial.artistPhotography?.[source]?.original||source,motionPreference,onView:()=>track('photo_view',{workId:activeWork?.id || '',artistId:activeArtist?.id || ''})});
  renderPresentation();
  renderStory();
  const chapters=$('#hos-home-chapters');chapters.replaceChildren();
  if(collections.length){collectionIndex($('#hos-home-collection-index'),{home:true});collections.forEach(collection=>chapters.append(collectionChapter(collection)));}
  else {const jumps=el('nav','hos-collection-jumps');jumps.setAttribute('aria-label','Jump to an artist');artists.forEach(artist=>{const selected=works.filter(work=>work.artistId===artist.id);if(selected.length){chapters.append(artistChapter(artist,selected,true));const anchor=el('a','',artist.name);anchor.href='#hos-home-artist-'+artist.id;anchor.dataset.jumpCollection='hos-home-artist-'+artist.id;jumps.append(anchor);}});$('#hos-home-collection-index').append(jumps);}
  refreshLinks();
  watchModels(root);
  if (previewMode) {
    root.querySelectorAll('[data-inquiry]').forEach(button=>{ button.disabled=true; });
  }
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  rememberScroll();
  preferenceUI();route(routePath(),false);scrollToHash();root.dataset.ready='true';
}
start().catch(error => {
  const notice = el('p','hos-form-note',error.message || 'The collection could not load. Please refresh the page.'); notice.setAttribute('role','alert'); $('.hos-hero-copy').append(notice);
});








