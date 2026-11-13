import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import {validateCatalog} from '../catalog.mjs';
import {prepareFoundingCollection} from '../founding-collection.mjs';
const root = process.cwd();
const catalog = JSON.parse(readFileSync(resolve(root,'content/catalog.json'),'utf8'));
const unique = (items,key) => assert.equal(new Set(items.map(item=>item[key])).size,items.length,`Duplicate ${key}`);
for (const items of [catalog.artists,catalog.works]) { unique(items,'id'); unique(items,'slug'); for(const item of items) assert.match(item.slug,/^[a-z0-9]+(?:-[a-z0-9]+)*$/); }
const artists = new Set(catalog.artists.map(a=>a.id));
for(const artist of catalog.artists) assert(catalog.assets[artist.portrait],`Missing portrait: ${artist.name}`);
for(const work of catalog.works) { assert(artists.has(work.artistId),`Unknown artist for ${work.title}`); assert(catalog.assets[work.image],`Missing photo for ${work.title}`); for(const key of ['title','dimensions','material','description']) assert.equal(typeof work[key],'string'); }
for(const asset of Object.values(catalog.assets)) { assert.match(asset,/^\/assets\/[a-zA-Z0-9_.-]+$/); assert(existsSync(resolve(root,'public','.'+asset)),`Missing asset ${asset}`); }
assert(catalog.works.some(w=>w.id===catalog.site.featuredWorkId),'Unknown featured work');
const html = readFileSync(resolve(root,'public/index.html'),'utf8');
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]); unique(ids.map(id=>({id})),'id');
const app = readFileSync(resolve(root,'public/app.js'),'utf8');
for(const match of app.matchAll(/\$\(['"]#([\w-]+)['"]\)/g)) assert(ids.includes(match[1]),`Missing element ${match[1]}`);
assert.equal([...html.matchAll(/data-asset="logo"/g)].length,1);
assert(!/design concept|AI generated|placeholder/i.test(html.replace(/<[^>]*>/g,'')),'Unexpected visitor-facing development copy');
assert(!/[\u2013\u2014]/.test(html),'Unexpected dash typography');
const media = JSON.parse(readFileSync(resolve(root,'public/media-manifest.json'),'utf8'));
const editorial = JSON.parse(readFileSync(resolve(root,'public/editorial.json'),'utf8'));
for (const [artistId, chapter] of Object.entries(editorial.chapters || {})) {
  const artist = catalog.artists.find(artist=>artist.id===artistId), work = catalog.works.find(work=>work.id===chapter.workId);
  assert(artist && work && work.artistId===artistId,`Unknown editorial artist or work ${artistId}`);
  assert.equal(chapter.artistName,artist.name);assert.equal(chapter.workTitle,work.title);
  assert.equal(chapter.portraitSource,catalog.assets[artist.portrait]);assert.equal(chapter.workSource,catalog.assets[work.image]);
  for (const source of [chapter.landscape,...['apartment','gallery','office'].map(setting=>chapter.settings[setting])]) {
    assert.match(source,/^\/assets\/[a-zA-Z0-9_.-]+$/);assert(media[source],`Missing responsive editorial photo ${source}`);
  }
}
for (const [source, info] of Object.entries(media)) {
  assert(existsSync(resolve(root,'public','.'+source)),`Missing master ${source}`);
  assert((source.startsWith('/assets/zsa-page-') ? info.width >= 810 : info.width > 1000) && info.height > (source === '/assets/designer-apartment.jpg' ? 700 : 900),`Small master ${source}`);
  for (const candidate of info.srcset.split(', ')) {
    const [path,width]=candidate.split(' ');assert.match(width,/^\d+w$/);
    assert(readFileSync(resolve(root,'public','.'+path)).length > 100,`Empty or missing image ${path}`);
  }
}
console.log(`Content checks passed: ${catalog.artists.length} artists, ${catalog.works.length} works, ${Object.keys(catalog.assets).length} images, and all referenced form elements.`);

const blueprint=JSON.parse(readFileSync(resolve(root,'content/founding-collection.json'),'utf8'));
const renovation=validateCatalog(prepareFoundingCollection(catalog,blueprint),{publicDir:resolve(root,'public'),mediaDir:resolve(root,'data/media'),publish:true});
assert.equal(renovation.collections.length,5);assert.equal(renovation.works.filter(work=>!work.archived).length,23);
console.log('Renovation checks passed: five collections, 23 unique source works, photographs and editable metadata.');
