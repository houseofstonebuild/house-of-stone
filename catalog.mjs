import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

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
    works.push({ ...record, artistId, title: field(item.title, 'the sculpture title', 160, true), image: photo(item.image, 'the sculpture photo', required),
      dimensions: field(item.dimensions, 'the dimensions', 120, required), material: field(item.material, 'the stone type', 120, required),
      acquisitionMethod: field(item.acquisitionMethod, 'the stone source', 1000), description: field(item.description, 'the sculpture description', 3000, required), objectPosition });
  }
  if (previous) {
    for (const key of ['artists', 'works']) for (const item of previous[key]) {
      if (!({artists,works}[key]).some(next => next.id === item.id)) fail('Archive existing records instead of removing them, so their history is kept.');
    }
  }
  const site = { name: 'House of Stone', description: field(input.site.description, 'the website description', 400, true),
    location: field(input.site.location, 'the location', 120), featuredWorkId: field(input.site.featuredWorkId, 'the featured sculpture', 80),
    heroAlt: field(input.site.heroAlt, 'the hero image description', 300, true) };
  const available = works.filter(w => !w.archived && !artistMap.get(w.artistId).archived);
  if (publish && (!available.length || !available.some(w => w.id === site.featuredWorkId))) fail('Choose a visible sculpture to feature on the homepage before publishing.');
  return { site, assets, artists, works };
}
export function publicCatalog(catalog) {
  const artists = catalog.artists.filter(a => !a.archived), ids = new Set(artists.map(a => a.id));
  const works = catalog.works.filter(w => !w.archived && ids.has(w.artistId));
  const keys = new Set(['hero','logo','process','balancing-rocks',...artists.map(a => a.portrait),...works.map(w => w.image)]);
  return { site: catalog.site, assets: Object.fromEntries(Object.entries(catalog.assets).filter(([key]) => keys.has(key))), artists, works };
}
