import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {GLTFLoader} from '../public/vendor/GLTFLoader.js';
import {Box3,Vector3,Texture} from '../public/vendor/three.module.min.js';

test('Rabbit loads with embedded PBR textures and finite indexed geometry',async()=>{
  const entry=JSON.parse(readFileSync(new URL('../public/models.json',import.meta.url)))['zsa-018'];
  const bytes=readFileSync(new URL('../public'+entry.file,import.meta.url));
  const document=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
  assert(bytes.length<7_000_000,'Keep the mobile download below 7 MB');
  assert.equal(entry.title,'Rabbit');assert.equal(entry.referenceSurface,false);
  assert.equal(document.images.length,3);
  assert(document.images.every(image=>Number.isInteger(image.bufferView)&&!image.uri));
  assert(document.buffers.every(buffer=>!buffer.uri));
  const loader=new GLTFLoader().register(()=>({name:'NODE_TEXTURE_FIXTURE',loadTexture(){return Promise.resolve(new Texture());}}));
  const gltf=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  gltf.scene.updateMatrixWorld(true);
  const size=new Box3().setFromObject(gltf.scene).getSize(new Vector3());
  assert(size.y>1.9&&size.y<1.91&&size.x>.9&&size.z>.3);
  let triangles=0;
  gltf.scene.traverse(node=>{
    if(!node.isMesh)return;
    triangles+=node.geometry.index.count/3;
    for(const key of ['position','normal','uv'])assert([...node.geometry.attributes[key].array].every(Number.isFinite));
    assert(node.material.map&&node.material.normalMap&&node.material.roughnessMap&&node.material.metalnessMap);
  });
  assert.equal(triangles,120008);
});
