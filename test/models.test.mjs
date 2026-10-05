import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {GLTFLoader} from '../public/vendor/GLTFLoader.js';
import {Box3,Vector3,Raycaster,Texture} from '../public/vendor/three.module.min.js';
import {createApp} from '../server.mjs';
const definitions=JSON.parse(readFileSync(new URL('../public/models.json',import.meta.url),'utf8'));
test('all five textured GLB files load as finite volumes with reference openings and a dished recess',async()=>{
  const loaded=new Map();
  for(const [id,definition] of Object.entries(definitions)) {
    const bytes=readFileSync(new URL('../public'+definition.file,import.meta.url));
    const jsonLength=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+jsonLength).toString());
    assert.deepEqual(doc.extensionsRequired,['KHR_mesh_quantization']);
    assert.equal(new URL(doc.images[0].uri,'https://house.test'+definition.file).pathname,definition.source);assert(readFileSync(new URL('../public'+definition.source,import.meta.url)).length>400000);
    assert.equal(definition.referenceSurface,true);assert.equal(definition.stoneGrain,false);
    assert(definition.stoneSwatch.every(Number.isFinite));
    // Real image decoding and shader compilation are covered by browser QA.
    const loader=new GLTFLoader().register(()=>({name:'NODE_TEXTURE_FIXTURE',loadTexture(){return Promise.resolve(new Texture());}}));
    const gltf=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
    gltf.scene.updateMatrixWorld(true);const size=new Box3().setFromObject(gltf.scene).getSize(new Vector3());
    assert(size.x>.5&&size.y>2&&size.z>.25,`${id} should have real depth`);
    gltf.scene.traverse(node=>{if(node.isMesh){for(const attr of [node.geometry.attributes.position,node.geometry.attributes.normal])assert([...attr.array].every(Number.isFinite));}});
    loaded.set(id,gltf.scene);
  }
  for(const [id,x,y] of [['continuum',0,1.34],['together',.13,1.82],['together',-.06,.70]]) {
    const ray=new Raycaster(new Vector3(x,y,10),new Vector3(0,0,-1));
    assert.equal(ray.intersectObject(loaded.get(id),true).length,0,`${id} must retain its opening through the stone`);
  }
  const recess=new Raycaster(new Vector3(.13,1.53,10),new Vector3(0,0,-1));
  assert(recess.intersectObject(loaded.get('equilibrium'),true).length>0,'The bowl-shaped recess must retain a solid back');
});
test('model delivery negotiates compression, supports HEAD, and counts private 3D sessions',async t=>{
  const password=randomUUID(),dataDir=mkdtempSync(join(tmpdir(),'hos-models-')),app=createApp({dataDir,env:{ADMIN_PASSWORD:password},backgroundNotifications:false});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+app.server.address().port;
  t.after(async()=>{await new Promise(resolve=>app.server.close(resolve));rmSync(dataDir,{recursive:true,force:true});});
  const compressed=await fetch(base+'/models/folded-light.glb',{headers:{'Accept-Encoding':'gzip'}});
  assert.equal(compressed.headers.get('content-type'),'model/gltf-binary');assert.equal(compressed.headers.get('content-encoding'),'gzip');assert.equal(compressed.headers.get('vary'),'Accept-Encoding');
  const raw=readFileSync(new URL('../public/models/folded-light.glb',import.meta.url));assert.deepEqual(Buffer.from(await compressed.arrayBuffer()),raw);
  assert(Number(compressed.headers.get('content-length'))<raw.length);
  const head=await fetch(base+'/models/folded-light.glb',{method:'HEAD',headers:{'Accept-Encoding':'gzip'}});assert.equal((await head.arrayBuffer()).byteLength,0);assert.equal(head.headers.get('content-length'),compressed.headers.get('content-length'));
  const plain=await fetch(base+'/models/folded-light.glb',{headers:{'Accept-Encoding':'gzip;q=0'}});assert.equal(plain.headers.get('content-encoding'),null);assert.deepEqual(Buffer.from(await plain.arrayBuffer()),raw);
  const sessionId=randomUUID();
  for(const name of ['model_view','model_view','model_interaction']) {
    const response=await fetch(base+'/api/events',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({id:randomUUID(),sessionId,name,page:'work',workId:'folded-light',artistId:'tariro'})});assert.equal(response.status,202);
  }
  const summary=await (await fetch(base+'/api/admin/summary',{headers:{Authorization:'Basic '+Buffer.from('admin:'+password).toString('base64')}})).json();
  assert.deepEqual(summary.modelActivity,{model_view:1,model_interaction:1});assert.equal(summary.inquiries,0);
});
