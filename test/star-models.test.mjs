import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {GLTFLoader} from '../public/vendor/GLTFLoader.js';
import {Box3,Vector3,Raycaster,Texture,DoubleSide} from '../public/vendor/three.module.min.js';
import {validateCatalog,publicCatalog} from '../catalog.mjs';
import {prepareFoundingCollection} from '../founding-collection.mjs';
const root=new URL('../',import.meta.url),read=path=>readFileSync(new URL(path,root));
const json=path=>JSON.parse(read(path));
const ids=['zsa-013','zsa-028','zsa-001','zsa-020','zsa-005'];
// Preserve checks for the original reconstructions after owner uploads replace
// their public viewer assignments.
const manifest=json('content/legacy-models.json'),audit=json('content/star-model-audit.json'),refs=json('scripts/star-models/references.json');
test('five source-specific GLBs retain closed connected volumes, source openings, texture and compact delivery',async()=>{
 assert.deepEqual(Object.keys(manifest).filter(id=>manifest[id].reconstruction && manifest[id].reviewOnly),ids);
 for(const id of ids){
  const entry=manifest[id],record=audit[id],ref=refs[id];assert.equal(entry.workId,id);assert.equal(entry.sourcePage,ref.page);assert(entry.reviewOnly);
  assert.equal(createHash('sha256').update(read('public'+entry.source)).digest('hex'),entry.sourceSha256);assert.equal(record.sourceSha256,entry.sourceSha256);
  assert(record.closed);assert.equal(record.components,1);assert(record.inferred.includes('reverse'));assert(record.tracedFrontSilhouetteIoU>.955);
  const bytes=read('public'+entry.file),doc=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
  assert.equal(doc.asset.extras.sourcePage,ref.page);assert.match(doc.asset.extras.geometryStatus,/inferred/);
  assert(gzipSync(bytes).length<2000000);for(const primitive of doc.meshes[0].primitives)assert.equal(doc.accessors[primitive.indices].componentType,5123);
  assert(read('public/models/'+doc.images[0].uri).length>10000);
  const loader=new GLTFLoader().register(()=>({name:'NODE_TEXTURE_FIXTURE',loadTexture(){return Promise.resolve(new Texture());}}));
  const gltf=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');gltf.scene.updateMatrixWorld(true);
  const size=new Box3().setFromObject(gltf.scene).getSize(new Vector3());assert(size.y>3&&size.y<3.1);assert(size.z>.45);
  let triangles=0;gltf.scene.traverse(node=>{if(node.isMesh){node.material.side=DoubleSide;triangles+=node.geometry.index.count/3;for(const key of ['position','normal','uv'])assert([...node.geometry.attributes[key].array].every(Number.isFinite));}});assert.equal(triangles,record.triangles);
  const [left,top,right,bottom]=record.sourceBounds,scale=3.05/(bottom-top);
  const hits=([x,y])=>new Raycaster(new Vector3((x-(left+right)/2)*scale,(bottom-y)*scale,10),new Vector3(0,0,-1)).intersectObject(gltf.scene,true);
  for(const point of ref.probes.openings || [])assert.equal(hits(point).length,0,id+' source opening');
  for(const point of ref.probes.solid || [])assert(hits(point).length>0,id+' solid surface');
  for(const point of ref.probes.roundedSections || []){const h=hits(point);assert(h.length>=2);assert(h[0].point.z-h.at(-1).point.z>.25,id+' rounded cross-section');}
 }
});
test('reconstructions are private until individually confirmed and reimport preserves model approval and Sold',()=>{
 const blueprint=json('content/founding-collection.json');
 const catalog=validateCatalog(prepareFoundingCollection(json('content/catalog.json'),blueprint),{publicDir:new URL('public/',root).pathname,mediaDir:'/tmp/hos-model-test-no-media'});
 assert(publicCatalog(catalog).works.every(w=>w.modelVerified===false));
 assert.equal(publicCatalog(catalog,{preview:true}).works.filter(w=>w.modelStatus==='review').length,5);
 catalog.works.find(w=>w.id==='zsa-013').verification.model=true;
 const reimport=prepareFoundingCollection(catalog,blueprint),sold=publicCatalog(reimport).works.find(w=>w.id==='zsa-013');assert.equal(sold.modelVerified,true);assert.equal(sold.availability,'sold');
});
