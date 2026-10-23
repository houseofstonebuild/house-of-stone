import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { normalizePresentation } from './presentation.mjs';

export class ContentError extends Error { constructor(message) { super(message); this.status = 400; } }
const fail = message => { throw new ContentError(message); };
const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
function field(value, label, max, required = false) {
  const clean = typeof value === 'string' ? value.trim().replace(/\u0000/g, '') : '';
  if (clean.length > max || (required && !clean)) fail(`Please complete ${label} (up to ${max} characters).`);
  return clean;
}
export function validateCatalog(input, { publicDir, mediaDir, publish = false, previous } = {}) {
  if (!input || !input.site || typeof input.site !== 'object' || !input.assets || typeof input.assets !== 'object' || Array.isArray(input.assets) || !Array.isArray(input.artists) || !Array.isArray(input.works)) fail('Invalid collection.');
  if (input.artists.length > 100 || input.works.length > 1000 || Object.keys(input.assets).length > 3000) fail('The collection is too large.');
  if (input.collections !== undefined && (!Array.isArray(input.collections) || input.collections.length > 100)) fail('Invalid collections.');
  const assets = {};
  for (const [key, value] of Object.entries(input.assets)) {
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(key) || typeof value !== 'string') fail('Invalid image reference.');
    if (/^\/assets\/[a-zA-Z0-9_.-]+\.(jpg|jpeg|png|webp)$/.test(value)) {
      if (!existsSync(resolve(publicDir, '.' + value))) fail('An image is missing. Please upload it again.');
    } else if (/^\/media\/[a-f0-9]{64}\.(jpg|png|webp)$/.test(value)) {
      if (!existsSync(resolve(mediaDir, value.slice(7)))) fail('An uploaded image is missing. Please upload it again.');
    } else fail('Use an uploaded image or a website image.');
    assets[key] = value;
  }
  for (const key of ['hero', 'logo', 'process', 'balancing-rocks']) if (!assets[key]) fail(`The ${key} image is required.`);
  function identity(item, collection) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) fail('Invalid artist or sculpture.');
    const id = field(item.id, 'the record ID', 80, true), address = field(item.slug, 'the address', 100, true);
    if (!slug.test(id) || !slug.test(address)) fail('Addresses must use lowercase letters, numbers and hyphens.');
    if (collection.some(existing => existing.id === id || existing.slug === address)) fail('Each record needs a unique ID and address.');
    return { id, slug: address, archived: item.archived === true };
  }
  function photo(value, label, required) {
    const key = field(value, label, 100, required);
    if (key && !assets[key]) fail(`Please choose an image for ${label}.`);
    return key;
  }
  const artists = [];
  for (const item of input.artists) {
    const record = identity(item, artists), required = publish && !record.archived;
    artists.push({ ...record, name: field(item.name, 'the artist name', 120, true), portrait: photo(item.portrait, 'the artist portrait', required),
      studioImage:photo(item.studioImage,'the artist studio image',false),quote:field(item.quote,'the artist quotation',1000),
      practice: field(item.practice, 'the practice', 200), style: field(item.style, 'the style', 120),
      description: field(item.description, 'the artist introduction', 2000, required), biography: field(item.biography, 'the artist biography', 5000), story: field(item.story, 'the artist story', 5000) });
  }
  const artistMap = new Map(artists.map(a => [a.id, a])), works = [];
  for (const item of input.works) {
    const record = identity(item, works), artistId = field(item.artistId, 'the artist', 80, true), artist = artistMap.get(artistId);
    if (!artist) fail('Every sculpture must belong to an artist.');
    const required = publish && !record.archived && !artist.archived;
    const objectPosition = field(item.objectPosition, 'the image position', 30) || '50% center';
    if (!/^(\d{1,2}|100)% (center|top|bottom)$/.test(objectPosition)) fail('Invalid image position.');
    works.push({ ...record, ...sculptureFields(item), views:Object.fromEntries(['left','right','back','detail','signature','scale'].map(key=>[key,photo(item.views?.[key],'the '+key+' photograph',false)])), artistId, title: field(item.title, 'the sculpture title', 160, true), image: photo(item.image, 'the sculpture photo', required),
      dimensions: field(item.dimensions, 'the dimensions', 120, required && !item.sourcePage), material: field(item.material, 'the stone type', 120, required && !item.sourcePage),
      yearMade: field(item.yearMade, 'the year made', 80), acquisitionMethod: field(item.acquisitionMethod, 'the stone source', 1000), description: field(item.description, 'the sculpture description', 3000, required && !item.sourcePage), objectPosition });
  }
  if (previous) {
    for (const key of ['artists', 'works']) for (const item of previous[key]) {
      if (!({artists,works}[key]).some(next => next.id === item.id)) fail('Archive existing records instead of removing them, so their history is kept.');
    }
  }
  const site = { name: 'House of Stone', description: field(input.site.description, 'the website description', 400, true),
    location: field(input.site.location, 'the location', 120), featuredWorkId: field(input.site.featuredWorkId, 'the featured sculpture', 80),
    catalogueEdition: field(input.site.catalogueEdition, 'the catalogue edition', 80), heroImage: photo(input.site.heroImage, 'the homepage hero', false), contactEmail:field(input.site.contactEmail,'the contact email',254),inquiryNote:field(input.site.inquiryNote,'the inquiry response note',400),
    presentation:normalizePresentation(input.site.presentation,{field,photo,fail}),heroAlt: field(input.site.heroAlt, 'the hero image description', 300, true) };
  if(site.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(site.contactEmail))fail('Enter a valid contact email.');
  const available = works.filter(w => !w.archived && !artistMap.get(w.artistId).archived);
  if (publish && !available.length) fail('Keep at least one visible sculpture in the collection before publishing.');
  if (!available.some(w => w.id === site.featuredWorkId)) site.featuredWorkId = available[0]?.id || '';
  const collections = [];
  const membership = new Set();
  for (const item of input.collections || []) {
    const record = identity(item, collections);
    if (!Array.isArray(item.workIds) || item.workIds.length > 1000 || new Set(item.workIds).size !== item.workIds.length) fail('Each collection needs an ordered list of unique sculptures.');
    const workIds = item.workIds.map(id => field(id, 'the collection sculpture', 80, true));
    if (workIds.some(id => !works.some(work => work.id === id))) fail('A collection contains an unknown sculpture.');
    const starWorkId = field(item.starWorkId, 'the star sculpture', 80, true);
    if (!workIds.includes(starWorkId) || workIds[0] !== starWorkId) fail('The star sculpture must be first in its collection.');
    if (publish && !record.archived && !available.some(work => work.id === starWorkId)) fail('Keep a visible star sculpture for each collection.');
    if (!record.archived) for (const id of workIds) { if (membership.has(id)) fail('A sculpture can have only one primary collection.'); membership.add(id); }
    collections.push({...record, name: field(item.name, 'the collection name', 120, true), description: field(item.description, 'the collection description', 400, true), introduction: field(item.introduction, 'the collection introduction', 2000), starWorkId, workIds});
  }
  if (works.some(work => work.sourcePage && !work.archived && !membership.has(work.id))) fail('Assign each sourced sculpture to one primary collection.');
  for (const work of works) {
    if (work.additionalImages?.some(key => !assets[key])) fail('An additional sculpture photograph is missing.');
    // The one confirmed sold record must never silently revert to available.
    if (work.sourcePage === 13 && work.availability !== 'sold') fail('Original page 13 is confirmed sold. Keep its Sold status.');
    if (work.sourcePage && work.availability === 'available' && !work.verification.availability) fail('Confirm availability before marking a sourced work available.');
  }
  return { site, assets, artists, works, collections };
}
const verifiedFields = ['title','artist','material','dimensions','yearMade','description','size','finish','signature','weight','base','location','delivery','shipping','installation','care','authenticity','provenance','acquisitionMethod','availability','model'];
const detailFields = ['finish','signature','weightKg','base','location','delivery','shipping','installation','care','authenticity','provenance'];
function sculptureFields(item) {
  const legacy=!item.sourcePage;
  if (!legacy && (!Number.isInteger(item.sourcePage) || item.sourcePage < 1 || item.sourcePage > 31)) fail('Invalid original source page.');
  if (!['unknown','available','sold','reserved'].includes(item.availability || 'unknown')) fail('Choose a valid availability.');
  const verification = Object.fromEntries(verifiedFields.map(key => [key,item.verification?.[key] === true]));
  if (!legacy && item.availability === 'reserved' && !verification.availability) fail('Confirm availability before marking a sourced work reserved.');
  const details = Object.fromEntries(detailFields.map(key => [key,field(item.details?.[key],key,2000)]));
  if (details.weightKg && (!Number.isFinite(Number(details.weightKg)) || Number(details.weightKg) <= 0)) fail('Weight must be a positive number of kilograms.');
  if (!Array.isArray(item.additionalImages || []) || (item.additionalImages || []).length > 30) fail('Choose up to 30 additional photographs.');
  const additionalImages = (item.additionalImages || []).map(key => field(key,'an additional photograph',100,true));
  return {...(legacy?{}:{sourcePage:item.sourcePage}),sourceDocument:field(item.sourceDocument,'the source document',200),sourceCrop:field(item.sourceCrop,'the source crop',30),visualDescription:field(item.visualDescription,'the photograph description',1000),
    availability:item.availability || 'unknown',colour:field(item.colour,'the colour',80),size:field(item.size,'the size',80),verification,details,additionalImages,
    modelStatus:['needed','ready','review','not-planned'].includes(item.modelStatus)?item.modelStatus:'needed',internalNotes:field(item.internalNotes,'the private notes',5000)};
}
export function publicCatalog(catalog, {preview = false} = {}) {
  const artists = catalog.artists.filter(a => !a.archived), ids = new Set(artists.map(a => a.id));
  const visible = catalog.works.filter(w => !w.archived && ids.has(w.artistId));
  const collections = (catalog.collections || []).filter(c => !c.archived).map(c => ({...c,workIds:c.workIds.filter(id => visible.some(w => w.id === id))})).filter(c => c.workIds.includes(c.starWorkId));
  const works = visible.map(work => {
    if (!work.sourcePage || preview) return work;
    const collection = collections.find(c => c.workIds.includes(work.id)), v = work.verification || {};
    const result = {id:work.id,slug:work.slug,image:work.image,objectPosition:work.objectPosition,
      modelVerified:v.model===true,title:v.title ? work.title : `${collection?.name || 'Sculpture'} ${String((collection?.workIds.indexOf(work.id) ?? 0)+1).padStart(2,'0')}`,
      artistId:v.artist ? work.artistId : '',availability:work.availability === 'sold' || v.availability ? work.availability : 'unknown',
      description:v.description ? work.description : work.visualDescription,colour:work.colour,size:v.size && v.dimensions ? work.size : '',additionalImages:work.additionalImages || [],views:work.views || {},details:{}};
    for (const key of ['material','dimensions','yearMade','acquisitionMethod']) result[key] = v[key] ? work[key] : '';
    for (const [key,value] of Object.entries(work.details || {})) if (v[key === 'weightKg' ? 'weight' : key]) result.details[key] = value;
    return result;
  });
  const pageImages=Object.values(catalog.site.presentation || {}).flatMap(page=>[page.image,...(page.gallery || []).map(photo=>photo.image)]);
  const keys = new Set([...pageImages,'hero','logo','process','balancing-rocks',catalog.site.heroImage,...artists.flatMap(a => [a.portrait,a.studioImage]),...works.flatMap(w => [w.image,...Object.values(w.views || {}),...(w.additionalImages || [])])]);
  return { site: catalog.site, assets: Object.fromEntries(Object.entries(catalog.assets).filter(([key]) => keys.has(key))), artists, works, collections };
}
export function homepageImage(catalog) { return catalog.assets[catalog.site.heroImage] || '/assets/designer-apartment.jpg'; }

