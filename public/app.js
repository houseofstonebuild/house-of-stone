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
let catalog, artists, works, assets, media = {}, editorial = {};
let activePage = 'home', activeArtist, activeWork;
let inquiryContext = {}, submissionId = '', inquiryStarted = false, submitting = false, lastInquiryButton, inquiryScroll = 0;
const menu = $('#hos-menu'), menuToggle = $('.hos-menu-toggle'), main = $('#hos-main');
const inquiry = $('#hos-inquiry'), form = $('#hos-inquiry-form'), review = $('#hos-inquiry-review'), success = $('#hos-inquiry-success');
const status = $('#hos-form-status'), title = $('#hos-inquiry-title'), sendButton = $('#hos-inquiry-send');
function setMenu(open) {
  menu.hidden = !open;
  if (open && !menu.open) menu.showModal();
  if (!open && menu.open) menu.close();
  document.body.classList.toggle('hos-menu-open', open);
  menuToggle.setAttribute('aria-expanded', String(open));
}
function statusMessage(text, error = false) { status.textContent = text; status.setAttribute('role', error ? 'alert' : 'status'); }
function applyImage(img, source, sizes = '(max-width: 650px) 100vw, 55vw') {
  img.src = source; img.decoding = 'async';
  const info = media[source];
  img.removeAttribute('srcset'); img.removeAttribute('width'); img.removeAttribute('height');
  if (info) {
    img.width = info.width; img.height = info.height;
    img.srcset = info.srcset; img.sizes = sizes;
  }
}
function image(key, alt, lazy = true, sizes) {
  const img = el('img'); applyImage(img, assets[key], sizes); img.alt = alt;
  if (lazy) img.loading = 'lazy';
  return img;
}
function link(text, data) {
  const button = el('button', 'hos-text-link cursor-interaction', text);
  button.type = 'button'; Object.assign(button.dataset, data);
  const arrow = el('span', '', '↗'); arrow.setAttribute('aria-hidden', 'true'); button.append(arrow);
  return button;
}
function workCard(work) {
  const button = el('button', 'hos-work-card cursor-interaction'); button.type = 'button'; button.dataset.work = work.id;
  const img = image(work.image, `${work.title}, a stone sculpture by ${artists.find(a => a.id === work.artistId).name}`, true, '(max-width: 650px) 44vw, 29vw');
  button.append(img, el('h3', '', work.title), el('p', '', work.material));
  return button;
}
function renderArtist(artist) {
  activeArtist = artist;
  $('#hos-artist-title').textContent = artist.name;
  $('#hos-artist-description').textContent = artist.description;
  $('#hos-artist-practice').textContent = artist.practice;
  $('#hos-artist-story').textContent = artist.story;
  const biography = artist.biography || editorial.biographies?.[artist.id];
  $('#hos-artist-biography').textContent = typeof biography === 'object' ? (biography.name === artist.name ? biography.text : artist.description) : biography || artist.description;
  applyImage($('#hos-artist-image'), assets[artist.portrait]); $('#hos-artist-image').alt = `Portrait of ${artist.name}`;
  const selected = works.filter(w => w.artistId === artist.id);
  $('#hos-artist-work-link').hidden = selected.length === 0;
  if (selected.length) $('#hos-artist-work-link').dataset.work = selected[0].id;
  const more = $('#hos-artist-works'); more.replaceChildren();
  if (selected.length) {
    const grid = el('div', 'hos-work-grid'); selected.forEach(w => grid.append(workCard(w)));
    more.append(el('div', 'hos-eyebrow', 'WORKS BY THE ARTIST'), grid);
  }
}
function renderWork(work) {
  activeWork = work; activeArtist = artists.find(a => a.id === work.artistId);
  $('#hos-work-title').textContent = work.title;
  $('#hos-work-artist').textContent = activeArtist.name.toUpperCase();
  $('#hos-work-dimensions').textContent = work.dimensions;
  $('#hos-work-material').textContent = work.material;
  $('#hos-work-acquisition').textContent = work.acquisitionMethod || 'On enquiry';
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
  root.querySelectorAll('[data-page]').forEach(view => { view.hidden = view.dataset.page !== page; });
  main.hidden = false; inquiry.hidden = true; setMenu(false);
  const labels = {home:'Zimbabwean stone sculpture',collection:'The collection',artists:'The artists',making:'The making',designers:'For designers',collectors:'For collectors',house:'The house',privacy:'Privacy'};
  document.title = `${item?.title || item?.name || labels[page] || 'House of Stone'} | House of Stone`;
  const canonical = document.querySelector('link[rel="canonical"]'); if (canonical) canonical.href = location.origin + (previewMode ? '/admin/preview' : '') + path;
  const description = item?.description || catalog.site.description;
  const photo = location.origin + (assets[item?.image || item?.portrait || 'hero'] || assets.hero);
  for (const [selector, value] of [['meta[name="description"]',description],['meta[property="og:title"]',document.title],['meta[name="twitter:title"]',document.title],['meta[property="og:description"]',description],['meta[name="twitter:description"]',description],['meta[property="og:url"]',canonical?.href],['meta[property="og:image"]',photo],['meta[name="twitter:image"]',photo]]) document.querySelector(selector)?.setAttribute('content',value);
  menu.querySelectorAll('[data-view]').forEach(button => { if (button.dataset.view === page) button.setAttribute('aria-current','page'); else button.removeAttribute('aria-current'); });
  if (shouldFocus) {
    window.scrollTo({ top:0, behavior:'instant' });
    const heading = $(`[data-page="${page}"] h1`); heading?.setAttribute('tabindex','-1'); heading?.focus({preventScroll:true});
  }
  const details = page === 'work' ? { workId:activeWork.id, artistId:activeArtist.id } : page === 'artist' ? { artistId:activeArtist.id } : {};
  track('page_view', details);
  if (page === 'work') track('work_view', details);
  if (page === 'artist') track('artist_view', details);
}
function navigate(path) { history.pushState({}, '', (previewMode ? '/admin/preview' : '') + path); route(path); }
function openInquiry(topic, trigger) {
  if (previewMode) return;
  if (submitting) return;
  lastInquiryButton = trigger;
  inquiryScroll = window.scrollY || 0;
  inquiryContext = { topic, workId: trigger?.dataset.inquiryWork || '', artistId: trigger?.dataset.inquiryArtist || '' };
  submissionId = uuid(); inquiryStarted = false;
  form.reset(); form.hidden = false; review.hidden = true; success.hidden = true;
  title.textContent = 'Begin an enquiry.'; statusMessage(''); $('#hos-inquiry-context').textContent = topic;
  if (topic === 'Designer project') form.elements.interest.value = 'Sourcing for a project';
  main.hidden = true; inquiry.hidden = false; setMenu(false);
  window.scrollTo({top:0,behavior:'instant'}); form.elements.name.focus({preventScroll:true});
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
  form.hidden = true; review.hidden = false; title.textContent = 'Review your enquiry.'; statusMessage(''); sendButton.focus({preventScroll:true});
});
$('#hos-inquiry-edit').addEventListener('click', () => {
  if (submitting) return;
  submissionId = uuid(); form.hidden = false; review.hidden = true; title.textContent = 'Begin an enquiry.'; statusMessage(''); form.elements.name.focus({preventScroll:true});
});
sendButton.addEventListener('click', async () => {
  if (previewMode) return;
  if (submitting) return;
  submitting = true; sendButton.disabled = true; $('#hos-inquiry-edit').disabled = true; $('#hos-inquiry-close').disabled = true;
  statusMessage('Sending your enquiry…');
  const payload = { submissionId, ...inquiryContext, page:activePage, sessionId:session(), attribution };
  for (const field of ['name','email','interest','message','website']) payload[field] = form.elements[field].value.trim();
  try {
    const response = await fetch('/api/inquiries', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)});
    const data = await response.json();
    if (!response.ok || !data.ok || !data.reference) throw new Error(data.error || 'We could not send your enquiry. Please try again.');
    review.hidden = true; success.hidden = false; title.textContent = 'Enquiry received.';
    $('#hos-inquiry-reference').textContent = data.reference; statusMessage(''); form.reset();
    $('#hos-inquiry-continue').focus({preventScroll:true});
  } catch (error) {
    statusMessage(error.name === 'TimeoutError' || error.name === 'TypeError' ? 'We could not confirm receipt. Your details are still here. Please try again.' : error.message, true);
  } finally { submitting = false; sendButton.disabled = false; $('#hos-inquiry-edit').disabled = false; $('#hos-inquiry-close').disabled = false; }
});
window.addEventListener('popstate', () => { if (catalog) route(routePath()); });

async function start() {
  const [response,mediaResponse,editorialResponse] = await Promise.all([fetch(previewMode ? '/api/admin/preview-content' : '/content.json'),fetch('/media-manifest.json').catch(()=>({ok:false})),fetch('/editorial.json').catch(()=>({ok:false}))]); if (!response.ok) throw new Error('The collection could not load. Please refresh the page.');
  if (mediaResponse.ok) media = await mediaResponse.json();
  if (editorialResponse.ok) editorial = await editorialResponse.json();
  catalog = await response.json(); ({artists,works,assets} = catalog);
  $('#hos-location').textContent = catalog.site.location;
  root.querySelectorAll('[data-asset]').forEach(img => { applyImage(img,assets[img.dataset.asset],img.classList.contains('hos-hero-image') ? '100vw' : undefined); if (!img.classList.contains('hos-hero-image') && !img.classList.contains('hos-brand-mark')) img.loading = 'lazy'; });
  root.querySelectorAll('.hos-editorial-image img').forEach(img => applyImage(img,img.getAttribute('src'),'90vw'));
  $('.hos-hero-image').alt = catalog.site.heroAlt;
  root.querySelectorAll('[data-artist-grid]').forEach(grid => {
    const selected = grid.dataset.artistGrid === 'home' ? artists.slice(0,3) : artists;
    selected.forEach(artist => {
      const card = el('button','hos-portrait-card cursor-interaction'); card.type = 'button'; card.dataset.artist = artist.id;
      card.append(image(artist.portrait, 'Portrait of ' + artist.name,true,'(max-width: 900px) 44vw, 29vw'), el('h3','',artist.name), el('p','',artist.style)); grid.append(card);
    });
  });
  $('[data-page="artists"] .hos-page-heading p').textContent = `${artists.length === 5 ? 'Five' : artists.length} distinct practices, connected by stone and an instinct for form.`;
  const chapters = $('#hos-collection-chapters');
  artists.forEach(artist => {
    const selected = works.filter(w => w.artistId === artist.id); if (!selected.length) return;
    const work = selected[0], chapter = el('section','hos-collection-chapter'), copy = el('div','hos-chapter-copy');
    const portrait = el('div','hos-chapter-portrait'), identity = el('div');
    const name = el('button','hos-chapter-name cursor-interaction',artist.name); name.type = 'button'; name.dataset.artist = artist.id;
    identity.append(name, el('small','',artist.style)); portrait.append(image(artist.portrait,'Portrait of ' + artist.name,true,'60px'),identity);
    copy.append(portrait,el('h2','',work.title),el('p','',work.description),link('Explore this work',{work:work.id}));
    if (selected.length > 1) { const grid = el('div','hos-work-grid'); selected.slice(1).forEach(w => grid.append(workCard(w))); copy.append(grid); }
    const photo = el('button','hos-chapter-photo cursor-interaction'); photo.type = 'button'; photo.dataset.work = work.id;
    photo.setAttribute('aria-label', `Explore ${work.title} by ${artist.name}`);
    const img = image(work.image,`${work.title}, a stone sculpture by ${artist.name}`); photo.append(img);
    chapter.append(copy,photo); chapters.append(chapter);
  });
  const featured = works.find(w => w.id === catalog.site.featuredWorkId) || works[0];
  if (featured) {
    const artist = artists.find(a => a.id === featured.artistId);
    applyImage($('.hos-feature-image img'),assets[featured.image]); $('.hos-feature-image img').alt = `${featured.title}, a stone sculpture by ${artist.name}`;
    $('.hos-feature-copy .hos-eyebrow').textContent = 'SELECTED WORK / ' + artist.name.toUpperCase();
    $('.hos-feature-copy h2').textContent = featured.title + '.'; $('.hos-feature-copy p').textContent = featured.description;
    $('.hos-feature-copy [data-work]').dataset.work = featured.id;
  }
  if (previewMode) {
    document.body.classList.add('hos-preview');
    const banner = el('div','hos-preview-bar'); banner.append(el('span','','Draft preview · Enquiries and measurement are paused.'));
    const back = el('a','','Return to editor'); back.href = '/admin/content'; banner.append(back); document.body.prepend(banner);
    root.querySelectorAll('[data-inquiry]').forEach(button=>{ button.disabled=true; });
  }
  preferenceUI(); route(routePath(), false); root.dataset.ready = 'true';
}
start().catch(error => {
  const notice = el('p','hos-form-note',error.message || 'The collection could not load. Please refresh the page.'); notice.setAttribute('role','alert'); $('.hos-hero-copy').append(notice);
});
