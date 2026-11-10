import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {GLTFLoader} from '../public/vendor/GLTFLoader.js';
import {Box3,Vector3,Texture} from '../public/vendor/three.module.min.js';
const read=path=>readFileSync(new URL('../'+path,import.meta.url));
const models=JSON.parse(read('public/models.json'));
const audit=JSON.parse(read('content/uploaded-model-audit.json'));

test('uploaded sculptures retain finite geometry, embedded PBR textures and recorded triangle counts',async()=>{
  assert.equal(audit.length,12);
  for(const record of audit){
    const entry=models[record.workId],bytes=read('public'+entry.file);
    assert(entry.uploaded&&entry.ownerApproved&&!entry.referenceSurface&&!entry.stoneGrain);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),record.webSha256);
    assert(bytes.length<10_000_000&&bytes.length<record.originalBytes);
    const document=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
    assert(document.buffers.every(buffer=>!buffer.uri));
    assert.equal(document.images.length,3);
    assert(document.images.every(image=>Number.isInteger(image.bufferView)&&!image.uri));
    const loader=new GLTFLoader().register(()=>({name:'NODE_TEXTURE_FIXTURE',loadTexture(){return Promise.resolve(new Texture());}}));
    const gltf=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
    gltf.scene.updateMatrixWorld(true);
    const size=new Box3().setFromObject(gltf.scene).getSize(new Vector3());
    assert([size.x,size.y,size.z].every(value=>Number.isFinite(value)&&value>0),record.title);
    let triangles=0;
    gltf.scene.traverse(node=>{
      if(!node.isMesh)return;
      triangles+=node.geometry.index.count/3;
      for(const key of ['position','normal','uv'])assert([...node.geometry.attributes[key].array].every(Number.isFinite));
      assert(node.material.map&&node.material.normalMap&&node.material.roughnessMap&&node.material.metalnessMap);
      node.geometry.dispose();node.material.dispose();
    });
    assert.equal(triangles,record.triangles,record.title);
  }
});

test('uploaded model eligibility requires the approved work ID and current photograph',()=>{
  const source=read('public/app.js').toString();
  const definition=source.slice(source.indexOf('function modelDefinition(work)'),source.indexOf('function loadViewer()'));
  const entry=structuredClone(models['zsa-020']);
  const context=vm.createContext({models:{'zsa-020':entry},assets:{photo:entry.source,other:'/different.jpg'},previewMode:false});
  vm.runInContext(definition,context);
  assert(context.modelDefinition({id:'zsa-020',image:'photo',title:'Updated owner title'}));
  assert.equal(context.modelDefinition({id:'zsa-020',image:'other'}),null);
  entry.workId='different-work';assert.equal(context.modelDefinition({id:'zsa-020',image:'photo'}),null);
  entry.workId='zsa-020';entry.ownerApproved=false;assert.equal(context.modelDefinition({id:'zsa-020',image:'photo'}),null);
});
