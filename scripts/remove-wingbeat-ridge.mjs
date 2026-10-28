import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const [,,input='public/models/wingbeat-v2.glb',output='public/models/wingbeat-v3.glb',amount='1']=process.argv;
const strength=Number(amount);if(!Number.isFinite(strength)||strength<0||strength>1.5)throw Error('Invalid correction strength');
const source=readFileSync(input),hash=createHash('sha256').update(source).digest('hex');
if(hash!=='97e82842792a93b1abc159578b15aae3399264be4ea4445b0fd46f9896ff6fac')throw Error('Expected published Wingbeat v2');
const jl=source.readUInt32LE(12),doc=JSON.parse(source.subarray(20,20+jl)),bin=Buffer.from(source.subarray(28+jl)),node=doc.nodes[0];
const count=doc.accessors[0].count,positions=doc.bufferViews[0].byteOffset,normals=doc.bufferViews[1].byteOffset,indices=doc.bufferViews[3].byteOffset;
const oldScale=node.scale,oldTranslation=node.translation,points=new Float64Array(count*3),sums=new Float64Array(count*3);
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
let changed=0,maxDisplacement=0;
for(let i=0;i<count;i++){
 const p=[0,1,2].map(a=>bin.readUInt16LE(positions+i*8+a*2)/65535*oldScale[a]+oldTranslation[a]);
 const [x,y,z]=p;
 // Compress the broad face onto a continuous shallow plane. The mapping
 // retains 5% of depth variation, so the mesh remains volumetric and ordered.
 const weight=smooth(1.46,1.60,y)*(1-smooth(2.0,2.12,y))*(1-smooth(.2,.55,x))*smooth(.015,.075,z);
 const grooveFade=smooth(-.72,-.64,x)*(1-smooth(-.02,.08,x));
 const grooveCenter=1.95+.012*(x+.3);
 const groove=.014*Math.exp(-(((y-grooveCenter)/.009)**2))*grooveFade;
 const plane=.09+.16*(y-1.55)-groove;
 const dz=(plane-z)*weight*Math.min(.95,.95*strength);
 p[2]+=dz;if(Math.abs(dz)>1e-7)changed++;maxDisplacement=Math.max(maxDisplacement,Math.abs(dz));
 for(let a=0;a<3;a++)points[i*3+a]=p[a];
}
// Preserve world bounds, silhouette, vertex colours, material and connectivity.
const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
for(let i=0;i<count;i++)for(let a=0;a<3;a++){min[a]=Math.min(min[a],points[i*3+a]);max[a]=Math.max(max[a],points[i*3+a]);}
const scale=max.map((v,a)=>v-min[a]);
for(let i=0;i<count;i++)for(let a=0;a<3;a++){
 const q=Math.round((points[i*3+a]-min[a])/scale[a]*65535);bin.writeUInt16LE(q,positions+i*8+a*2);points[i*3+a]=q/65535*scale[a]+min[a];
}
for(let i=0;i<doc.accessors[3].count;i+=3){
 const a=bin.readUInt32LE(indices+i*4)*3,b=bin.readUInt32LE(indices+(i+1)*4)*3,c=bin.readUInt32LE(indices+(i+2)*4)*3;
 const u=[points[b]-points[a],points[b+1]-points[a+1],points[b+2]-points[a+2]],v=[points[c]-points[a],points[c+1]-points[a+1],points[c+2]-points[a+2]];
 const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
 for(const j of [a,b,c])for(let k=0;k<3;k++)sums[j+k]+=n[k];
}
for(let i=0;i<count;i++){
 const n=[0,1,2].map(a=>sums[i*3+a]*scale[a]),l=Math.hypot(...n);if(!l)throw Error('Degenerate normal');
 for(let a=0;a<3;a++)bin.writeInt16LE(Math.round(n[a]/l*32767),normals+i*8+a*2);
}
node.scale=scale;node.translation=min;
doc.asset.generator='House of Stone continuous shoulder correction';
doc.asset.extras={...doc.asset.extras,geometryVersion:3,sourceSha256:hash,correction:'Remove artificial horizontal shoulder shelf; retain carved groove, original colours, material and silhouette',correctionStrength:strength};
const json=Buffer.from(JSON.stringify(doc)),padded=Buffer.alloc(Math.ceil(json.length/4)*4,32);json.copy(padded);
const out=Buffer.alloc(28+padded.length+bin.length);out.writeUInt32LE(0x46546c67,0);out.writeUInt32LE(2,4);out.writeUInt32LE(out.length,8);out.writeUInt32LE(padded.length,12);out.writeUInt32LE(0x4e4f534a,16);padded.copy(out,20);out.writeUInt32LE(bin.length,20+padded.length);out.writeUInt32LE(0x004e4942,24+padded.length);bin.copy(out,28+padded.length);writeFileSync(output,out);
console.log(JSON.stringify({file:output,strength,changedVertices:changed,maxDisplacement,sha256:createHash('sha256').update(out).digest('hex')}));
