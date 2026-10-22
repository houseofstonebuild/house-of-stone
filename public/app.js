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
let catalog, artists, works, assets, media = {}, editorial = {}, models = {}, viewerPromise, modelViewer;
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
function workCard(work) {
  const card = el('article', 'hos-work-card');
  const photo = el('button','hos-work-card-photo cursor-interaction'); photo.type = 'button'; photo.dataset.work = work.id;
  photo.setAttribute('aria-label', `View ${work.title} by ${artists.find(a => a.id === work.artistId).name}`);
  photo.append(image(work.image, `${work.title}, a stone sculpture by ${artists.find(a => a.id === work.artistId).name}`,true,'(max-width: 700px) 90vw, 420px'));
  const copy = el('div','hos-work-card-copy');
  copy.append(el('h3','',work.title),el('p','hos-card-specs',`${work.material} · ${work.dimensions}`),el('p','hos-card-description',work.description),link('View sculpture',{work:work.id}));
  card.append(photo,copy);return card;
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
  return entry && entry.title===work.title && entry.source===assets[work.image] ? entry : null;
}
function loadViewer() {
  if(!viewerPromise)viewerPromise=import('./sculpture-viewer.js').then(module=>{
    modelViewer=module.initializeViewer({root,models,works,onInteraction:id=>{const work=works.find(w=>w.id===id);if(work)track('model_interaction',{workId:id,artistId:work.artistId});}});
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
  panel.append(top,stage,hint);return panel;
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
  activeWork = work; activeArtist = artists.find(a => a.id === work.artistId);
  $('#hos-work-title').textContent = work.title;
  const modelLink=$('#hos-work-model');modelLink.hidden=!modelDefinition(work);modelLink.dataset.model=work.id;
  $('#hos-work-artist').textContent = activeArtist.name.toUpperCase();
  $('#hos-work-artist').dataset.artist = activeArtist.id;
  $('#hos-work-year').textContent = work.yearMade || 'Available on inquiry';
  $('#hos-work-dimensions').textContent = work.dimensions;
  $('#hos-work-material').textContent = work.material;
  $('#hos-work-acquisition').textContent = !work.acquisitionMethod || /^On (?:enquiry|inquiry)$/i.test(work.acquisitionMethod) ? 'Available on inquiry' : work.acquisitionMethod;
  $('#hos-work-description').textContent = work.description;
  const button = $('#hos-work-inquiry');
  button.dataset.inquiry = `${work.title} by ${activeArtist.name}`; button.dataset.inquiryWork = work.id;
  const img = $('#hos-work-image'); applyImage(img, assets[work.image]); img.alt = `${work.title}, a stone sculpture by ${activeArtist.name}`;
}
function route(path, shouldFocus = true) {
  let page = path === '/' ? 'home' : path.slice(1);
  let item;
  if (path.startsWith('/artists/')) { item = artists.find(a => a.slug === path.split('/')[2]); if (item) { renderArtist(item); page = 'artist'; } }
  if (path.startsWith('/works/')) { item = works.find(w => w.slug === path.split('/')[2]); if (item) { renderWork(item); page = 'work'; } }
  if (!$(`[data-page="${page.replace(/[^a-z]/g, '')}"]`) || !['home','collection','artists','artist','work','making','designers','collectors','house','privacy'].includes(page)) page = 'home';
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
  const photo = location.origin + (assets[item?.image || item?.portrait] || heroSource());
  for (const [selector, value] of [['meta[name="description"]',description],['meta[property="og:title"]',document.title],['meta[name="twitter:title"]',document.title],['meta[property="og:description"]',description],['meta[name="twitter:description"]',description],['meta[property="og:url"]',canonical?.href],['meta[property="og:image"]',photo],['meta[name="twitter:image"]',photo]]) document.querySelector(selector)?.setAttribute('content',value);
  menu.querySelectorAll('[data-view]').forEach(button => { if (button.dataset.view === page) button.setAttribute('aria-current','page'); else button.removeAttribute('aria-current'); });
  if (shouldFocus) {
    window.scrollTo({ top:0, behavior:'instant' });
    const heading = $(`[data-page="${page}"] h1`); heading?.setAttribute('tabindex','-1'); heading?.focus({preventScroll:true});
    pageAnimation = animateSurface($(`[data-page="${page}"]`));
  }
  observeReveals($(`[data-page="${page}"]`));
  const details = page === 'work' ? { workId:activeWork.id, artistId:activeArtist.id } : page === 'artist' ? { artistId:activeArtist.id } : {};
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
  navigate(activePage === 'work' ? '/collection' : activePage === 'artist' ? '/artists' : '/');
}
function openInquiry(topic, trigger) {
  if (previewMode) return;
  if (submitting) return;
  lastInquiryButton = trigger;
  inquiryScroll = window.scrollY || 0;
  inquiryContext = { topic, workId: trigger?.dataset.inquiryWork || '', artistId: trigger?.dataset.inquiryArtist || '' };
  submissionId = uuid(); inquiryStarted = false;
  form.reset(); form.hidden = false; review.hidden = true; success.hidden = true;
  title.textContent = 'Your inquiry'; statusMessage(''); $('#hos-inquiry-context').textContent = topic;
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
  const collection=event.target.closest('[data-scroll-collection]');
  if(collection){
    track('explore_click');const heading=$('#hos-home-collection-title');heading.setAttribute('tabindex','-1');heading.focus({preventScroll:true});
    heading.scrollIntoView({behavior:motionPreference?.matches?'instant':'smooth',block:'start'});return;
  }
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
  catalog = await response.json(); ({artists,works,assets} = catalog);
  catalog.site.description = catalog.site.description.replace(/\benquir/gi, word => word[0] === 'E' ? 'Inquir' : 'inquir');
  $('#hos-copyright').textContent = `© ${new Date().getFullYear()} House of Stone`;
  $('#hos-location').textContent = catalog.site.location;
  $('.hos-founding-heading p').textContent = `${artists.length} artists. Selected works.`;
  root.querySelectorAll('[data-asset]').forEach(img => { applyImage(img,assets[img.dataset.asset]); if (!img.classList.contains('hos-brand-mark')) img.loading = 'lazy'; });
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
    artists.forEach(artist=>{const selected=works.filter(work=>work.artistId===artist.id);if(selected.length)chapters.append(artistChapter(artist,selected,target==='#hos-home-chapters'));});
  }
  if('IntersectionObserver' in window){
    const lazyViewer=new window.IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){lazyViewer.disconnect();loadViewer().catch(()=>{});}},{rootMargin:'200px'});
    root.querySelectorAll('[data-model-stage]').forEach(host=>lazyViewer.observe(host));
  }
  if (previewMode) {
    document.body.classList.add('hos-preview');
    const banner = el('div','hos-preview-bar'); banner.append(el('span','','Draft preview · Inquiries and measurement are paused.'));
    const back = el('a','','Return to editor'); back.href = '/admin/content'; banner.append(back); document.body.prepend(banner);
    root.querySelectorAll('[data-inquiry]').forEach(button=>{ button.disabled=true; });
  }
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  rememberScroll();
  preferenceUI(); route(routePath(), false); root.dataset.ready = 'true';
}
start().catch(error => {
  const notice = el('p','hos-form-note',error.message || 'The collection could not load. Please refresh the page.'); notice.setAttribute('role','alert'); $('.hos-hero-copy').append(notice);
});


