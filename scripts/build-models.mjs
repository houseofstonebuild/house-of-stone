import {mkdirSync,writeFileSync} from 'node:fs';
import {createSculpture,definitions} from './sculpture-geometries.mjs';
import {Vector3,Matrix3} from '../public/vendor/three.module.min.js';

// Write self-contained, uncompressed glTF 2.0 models without build dependencies.
// Mesh positions and normals are baked to world space and stored as typed data.
function exportGLB(group) {
  const chunks=[],views=[],accessors=[],meshes=[],nodes=[],materials=[];let offset=0;
  function attribute(array,itemSize,type,target) {
    const bytes=Buffer.from(array.buffer,array.byteOffset,array.byteLength),padding=(4-bytes.length%4)%4;
    views.push({buffer:0,byteOffset:offset,byteLength:bytes.length,target});chunks.push(bytes,Buffer.alloc(padding));offset+=bytes.length+padding;
    const min=Array(itemSize).fill(Infinity),max=Array(itemSize).fill(-Infinity);
    for(let i=0;i<array.length;i++) {min[i%itemSize]=Math.min(min[i%itemSize],array[i]);max[i%itemSize]=Math.max(max[i%itemSize],array[i]);}
    accessors.push({bufferView:views.length-1,componentType:type,count:array.length/itemSize,type:itemSize===3?'VEC3':'SCALAR',min,max});return accessors.length-1;
  }
  group.traverse(mesh=>{
    if(!mesh.isMesh)return;const geometry=mesh.geometry,p=geometry.attributes.position,n=geometry.attributes.normal;
    const positions=new Float32Array(p.count*3),normals=new Float32Array(p.count*3),v=new Vector3(),normalMatrix=new Matrix3().getNormalMatrix(mesh.matrixWorld);
    for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld).toArray(positions,i*3);v.fromBufferAttribute(n,i).applyMatrix3(normalMatrix).normalize().toArray(normals,i*3);}
    const primitive={attributes:{POSITION:attribute(positions,3,5126,34962),NORMAL:attribute(normals,3,5126,34962)},material:materials.length,mode:4};
    if(geometry.index)primitive.indices=attribute(new Uint32Array(geometry.index.array),1,5125,34963);
    const color=mesh.material.color;materials.push({pbrMetallicRoughness:{baseColorFactor:[color.r,color.g,color.b,1],metallicFactor:mesh.material.metalness,roughnessFactor:mesh.material.roughness}});
    meshes.push({primitives:[primitive]});nodes.push({mesh:meshes.length-1});
  });
  const data={asset:{version:'2.0',generator:'House of Stone sculpture studies'},scene:0,scenes:[{nodes:nodes.map((_,i)=>i)}],nodes,meshes,materials,buffers:[{byteLength:offset}],bufferViews:views,accessors};
  const json=Buffer.from(JSON.stringify(data)),jsonPadded=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]),binary=Buffer.concat(chunks);
  const header=Buffer.alloc(12);header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(12+8+jsonPadded.length+8+binary.length,8);
  const jsonHeader=Buffer.alloc(8);jsonHeader.writeUInt32LE(jsonPadded.length);jsonHeader.writeUInt32LE(0x4e4f534a,4);
  const binHeader=Buffer.alloc(8);binHeader.writeUInt32LE(binary.length);binHeader.writeUInt32LE(0x004e4942,4);
  return Buffer.concat([header,jsonHeader,jsonPadded,binHeader,binary]);
}
const folder=new URL('../public/models/',import.meta.url);mkdirSync(folder,{recursive:true});const entries={};
for(const [id,definition] of Object.entries(definitions)) {
  const bytes=exportGLB(createSculpture(id));writeFileSync(new URL(id+'.glb',folder),bytes);
  entries[id]={title:definition.title,source:definition.source,file:`/models/${id}.glb`,stoneGrain:true};console.log(id,bytes.length+' bytes');
}
writeFileSync(new URL('../public/models.json',import.meta.url),JSON.stringify(entries,null,2)+'\n');
