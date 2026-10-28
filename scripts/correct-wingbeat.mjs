import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const [,,input='public/models/wingbeat-v1.glb',fitFile='scripts/wingbeat-shape-fit.json',output=input]=process.argv;
const source=readFileSync(input),hash=createHash('sha256').update(source).digest('hex');
if(hash!=='e9bfd1aad83936170d945126df5c3ec966ff0bd7ca2cb3f94997e3fcfe12e03d')throw Error('Expected original polished Wingbeat');
const fit=JSON.parse(readFileSync(fitFile)),jsonLength=source.readUInt32LE(12),doc=JSON.parse(source.subarray(20,20+jsonLength)),bin=Buffer.from(source.subarray(28+jsonLength));
const node=doc.nodes[0],n=doc.accessors[0].count,oldScale=node.scale,oldTranslation=node.translation;
const pOffset=doc.bufferViews[0].byteOffset,normalOffset=doc.bufferViews[1].byteOffset,indexOffset=doc.bufferViews[3].byteOffset;
function basis(u,knots,count){
 let prev=Array.from({length:knots.length-1},(_,i)=>(u>=knots[i]&&u<knots[i+1])||(u===1&&i===count-1)?1:0);
 for(let degree=1;degree<=3;degree++)prev=Array.from({length:prev.length-1},(_,i)=>{
  const a=knots[i+degree]-knots[i],b=knots[i+degree+1]-knots[i+1];
  return (a?(u-knots[i])/a*prev[i]:0)+(b?(knots[i+degree+1]-u)/b*prev[i+1]:0);
 });return prev;
}
const points=new Float64Array(n*3),normals=new Float64Array(n*3),min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
for(let i=0;i<n;i++){
 const p=Array.from({length:3},(_,a)=>bin.readUInt16LE(pOffset+i*8+a*2)/65535*oldScale[a]+oldTranslation[a]);
 const original=p.slice();
 const bs=p.map((x,a)=>basis(Math.max(0,Math.min(1,(x-fit.lo[a])/(fit.hi[a]-fit.lo[a]))),fit.knots[a],fit.grid[a]));
 if(fit.shoulderCorrection){
  const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
  const shoulder=Math.exp(-(((original[1]-1.91)/.145)**2))*Math.max(0,Math.min(1,(.35-original[0])/.35));
  p[2]+=-.075*shoulder*smooth(original[2]/.12)+.045*shoulder*smooth(-original[2]/.12);
 }
 for(let x=0;x<fit.grid[0];x++)if(bs[0][x])for(let y=0;y<fit.grid[1];y++)if(bs[1][y])for(let z=0;z<fit.grid[2];z++)if(bs[2][z]){
  const w=bs[0][x]*bs[1][y]*bs[2][z],d=fit.coeff[(x*fit.grid[1]+y)*fit.grid[2]+z];for(let a=0;a<3;a++)p[a]+=w*d[a];
 }
 for(let a=0;a<3;a++){points[i*3+a]=p[a];min[a]=Math.min(min[a],p[a]);max[a]=Math.max(max[a],p[a]);}
}
const scaleToHeight=3.05/(max[1]-min[1]),translation=min.map((x,a)=>a===1?0:x*scaleToHeight),scale=max.map((x,a)=>(x-min[a])*scaleToHeight);
for(let i=0;i<n;i++)for(let a=0;a<3;a++){
 const quant=Math.round((points[i*3+a]-min[a])/(max[a]-min[a])*65535);bin.writeUInt16LE(quant,pOffset+i*8+a*2);
 points[i*3+a]=quant/65535*scale[a]+translation[a];
}
for(let i=0;i<doc.accessors[3].count;i+=3){
 const a=bin.readUInt32LE(indexOffset+i*4)*3,b=bin.readUInt32LE(indexOffset+(i+1)*4)*3,c=bin.readUInt32LE(indexOffset+(i+2)*4)*3;
 const u=[points[b]-points[a],points[b+1]-points[a+1],points[b+2]-points[a+2]],v=[points[c]-points[a],points[c+1]-points[a+1],points[c+2]-points[a+2]];
 const no=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
 for(const j of [a,b,c])for(let k=0;k<3;k++)normals[j+k]+=no[k];
}
for(let i=0;i<n;i++){
 const q=[0,1,2].map(a=>normals[i*3+a]*scale[a]),l=Math.hypot(...q);if(!l)throw Error('Degenerate vertex normal');
 for(let a=0;a<3;a++)bin.writeInt16LE(Math.round(q[a]/l*32767),normalOffset+i*8+a*2);
}
node.scale=scale;node.translation=translation;
doc.asset.generator='House of Stone four-view silhouette correction';
doc.asset.extras={geometryVersion:2,sourceSha256:hash,method:'Smooth multi-view B-spline deformation; original material, vertex colours and triangle connectivity retained',unseenSurfaces:'Inferred from four photographs'};
const json=Buffer.from(JSON.stringify(doc)),padded=Buffer.alloc(Math.ceil(json.length/4)*4,32);json.copy(padded);
const out=Buffer.alloc(28+padded.length+bin.length);out.writeUInt32LE(0x46546c67,0);out.writeUInt32LE(2,4);out.writeUInt32LE(out.length,8);out.writeUInt32LE(padded.length,12);out.writeUInt32LE(0x4e4f534a,16);padded.copy(out,20);out.writeUInt32LE(bin.length,20+padded.length);out.writeUInt32LE(0x004e4942,24+padded.length);bin.copy(out,28+padded.length);writeFileSync(output,out);
console.log(JSON.stringify({bytes:out.length,sha256:createHash('sha256').update(out).digest('hex'),triangles:doc.accessors[3].count/3,bounds:scale,originalVertexColours:true,originalMaterial:doc.materials[0]}));
