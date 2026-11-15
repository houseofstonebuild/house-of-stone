// Read-only decode of the approved Coil GLB into a world-space OBJ.
// No existing sculpture asset is modified.
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {MeshoptDecoder} from 'meshoptimizer';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {dirname} from 'node:path';
import {createHash} from 'node:crypto';
const [, , input, output='build/coil-pilot/coil.obj']=process.argv;
if(!input)throw new Error('Supply approved Coil GLB path');
await MeshoptDecoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
const doc=await io.read(input);
const out=['# world-space decoded Coil; original GLB not altered'];let base=1,faces=0,meshes=0;
for(const node of doc.getRoot().listNodes()){
 const mesh=node.getMesh();if(!mesh)continue;const mat=node.getWorldMatrix();
 for(const prim of mesh.listPrimitives()){
  if(prim.getMode()!==4)continue;const acc=prim.getAttribute('POSITION');
  if(!acc)throw new Error('Missing POSITION in Coil mesh');
  const p=acc.getArray(),n=p.length/3;meshes++;
  for(let i=0;i<n;i++){const x=p[i*3],y=p[i*3+1],z=p[i*3+2];out.push('v '+[mat[0]*x+mat[4]*y+mat[8]*z+mat[12],mat[1]*x+mat[5]*y+mat[9]*z+mat[13],mat[2]*x+mat[6]*y+mat[10]*z+mat[14]].join(' '));}
  const ids=prim.getIndices()?.getArray()??Uint32Array.from({length:n},(_,i)=>i);
  if(ids.length%3)throw new Error('Nontriangular primitive');
  for(let i=0;i<ids.length;i+=3){out.push('f '+[base+ids[i],base+ids[i+1],base+ids[i+2]].join(' '));faces++;}
  base+=n;
 }
}
if(!faces)throw new Error('No triangles decoded');
mkdirSync(dirname(output),{recursive:true});writeFileSync(output,out.join('\n')+'\n');
const bytes=readFileSync(input);console.log(JSON.stringify({source:input,sha256:createHash('sha256').update(bytes).digest('hex'),vertices:base-1,faces,meshes}));
