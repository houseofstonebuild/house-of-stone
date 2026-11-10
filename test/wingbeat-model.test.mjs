import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {GLTFLoader} from '../public/vendor/GLTFLoader.js';
import {Box3,Vector3} from '../public/vendor/three.module.min.js';

test('legacy Wingbeat preserves its vertex colours, polished material and model bounds',async()=>{
 const entry=JSON.parse(readFileSync(new URL('../content/legacy-models.json',import.meta.url)))['zsa-016'];
 assert.equal(entry.ownerApproved,true);assert.equal(entry.referenceSurface,false);
 assert.equal(entry.source,'/assets/wingbeat-shoot-front-v1.webp');
 const bytes=readFileSync(new URL('../public'+entry.file,import.meta.url));
 const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 gltf.scene.updateMatrixWorld(true);const size=new Box3().setFromObject(gltf.scene).getSize(new Vector3());
 assert(Math.abs(size.y-3.05)<.001);let triangles=0;
 gltf.scene.traverse(node=>{if(!node.isMesh)return;triangles+=node.geometry.index.count/3;
  for(const key of ['position','normal','color'])assert([...node.geometry.attributes[key].array].every(Number.isFinite));
  assert(node.material.vertexColors);assert.equal(node.material.roughness,.26);assert.equal(node.material.metalness,0);
 });
 assert.equal(triangles,465302);
});
