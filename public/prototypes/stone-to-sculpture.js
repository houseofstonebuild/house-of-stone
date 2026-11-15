import * as THREE from '/vendor/three.module.min.js';
import {GLTFLoader} from '/vendor/GLTFLoader.js';
import {MeshoptDecoder} from '/vendor/meshopt_decoder.js';

// An illustrated journey, NOT provenance documentation for Coil.
// Final sculpture geometry and its studio finish are loaded from the unchanged approved GLB.
const host=document.getElementById('render');
const stage=document.querySelector('.stage');
const journey=document.querySelector('.journey');
const fallback=document.getElementById('fallback');
const map=document.getElementById('map-scene');
const svg=document.getElementById('origin-map');
const route=document.getElementById('travel-route');
const truck=document.getElementById('transport-marker');
const guruvePin=document.getElementById('guruve-node');
const hararePin=document.getElementById('harare-node');
const coords=document.getElementById('map-coordinates');
const mapContext=document.getElementById('map-context');
const ui={
  phase:document.getElementById('phase'),title:document.getElementById('stage-title'),
  description:document.getElementById('stage-description'),counter:document.getElementById('counter'),
  progress:document.getElementById('progress-fill')
};
const texts=[
 ['ZIMBABWE','The story begins in Zimbabwe.','The material and the people who shape it are inseparable from the place.'],
 ['GURUVE DISTRICT','Stone from the earth.','Guruve is among the northern Zimbabwean regions known for dense springstone.'],
 ['TOWARD HARARE','A journey south.','Trace an illustrative journey from the stone-producing region to the capital.'],
 ['HARARE','From landscape to workshop.','Our view follows the stone into Harare, where generations of sculptors have developed their craft.'],
 ['THE RAW STONE','One block. Many possibilities.','An irregular mass of springstone, with its weathered rind and dark mineral interior.'],
 ['MARKING THE FORM','The artist decides where to begin.','Contour lines indicate where stone will be removed; the form must be found inside.'],
 ['CARVING','Each strike changes the form.','Hammer meets chisel. Material is removed progressively, uncovering contours and the central opening.'],
 ['FINER WORK','The marks are refined.','Rasping and wet sanding soften the tooling marks and expose the smoother grain.'],
 ['HEATING','Preparing the stone.','A controlled heat source can prepare stone for a traditional clear wax finish.'],
 ['WAX AND BUFFING','The surface comes to life.','Clear wax and patient buffing bring out the stone’s natural dark sheen.'],
 ['THE FINISHED SCULPTURE','Coil.','An original work by Douglas Musekiwa, presented with its approved 3D model.']
];
// Deliberately reserve nearly one quarter of the journey for detailed hand-carving.
const stops=[0,.075,.17,.29,.37,.45,.53,.765,.835,.90,.96,1];
const clamp=(x,a=0,b=1)=>Math.min(b,Math.max(a,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x)};
const lerp=(a,b,t)=>a+(b-a)*t;
const fract=n=>n-Math.floor(n);
const hash=(a,b=0,c=0)=>fract(Math.sin(a*127.1+b*311.7+c*74.7)*43758.5453);
const mobile=()=>innerWidth<=800;
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const active=()=>{const r=journey.getBoundingClientRect();return clamp(-r.top/Math.max(1,journey.offsetHeight-innerHeight));};
const phaseFor=p=>{for(let i=0;i<stops.length-1;i++)if(p<stops[i+1])return i;return 10;};
const phaseT=(p,i)=>clamp((p-stops[i])/Math.max(.001,stops[i+1]-stops[i]));
const impactVector=new THREE.Vector3();
let shownProgress=0,desiredProgress=0;
const e={renderer:null,scene:null,camera:null,root:null,canvas:null,
  rock:null,rockCap:null,cut:{value:1.95},carveMargin:{value:2},carveMask:{value:null},rawMaterial:null,polished:null,rough:null,contourRows:[],
  carvePlane:null,roughPlane:null,polishedPlane:null,marks:null,hammerRig:null,
  chiselHead:null,chiselTop:null,hammerHead:null,hammerContact:null,hammerPivot:null,toolRig:null,chips:[],dust:null,
  rasp:null,sanding:null,torch:null,torchLight:null,wax:null,waxLight:null,
  shadow:null,plinth:null,modelReady:false,contextLost:false,lastPhase:-1,frame:0,now:0,
  tempP:new THREE.Vector3(),tempQ:new THREE.Vector3()};

// A faithful vector country outline (Natural Earth simplified data), not a road map.
const routeLength=route.getTotalLength();
function updateMap(p){
 const approach=smooth((p-.052)/.105);
 const travel=smooth((p-.17)/.135);
 const arrival=smooth((p-.29)/.085);
 const materialize=smooth((p-.31)/.09);
 // Follow the moving shipment rather than changing views at a fixed waypoint.
 const waypoint=route.getPointAtLength(routeLength*travel);
 const countryX=550,countryY=340,guruveX=773.3,guruveY=169.4;
 const centerX=lerp(lerp(countryX,guruveX,approach),waypoint.x,travel);
 const centerY=lerp(lerp(countryY,guruveY,approach),waypoint.y,travel);
 const w0=lerp(1100,310,approach),h0=lerp(680,205,approach);
 const w1=lerp(w0,190,travel),h1=lerp(h0,135,travel);
 const w=lerp(w1,72,arrival),h=lerp(h1,51,arrival);
 const cx=lerp(centerX,790.8,arrival),cy=lerp(centerY,258.7,arrival);
 svg.setAttribute('viewBox',`${(cx-w/2).toFixed(2)} ${(cy-h/2).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)}`);
 route.setAttribute('stroke-dasharray',`${(routeLength*travel).toFixed(2)} ${routeLength.toFixed(2)}`);
 truck.setAttribute('opacity',String(approach>.84&&travel<.995?1:0));
 truck.setAttribute('transform',`translate(${waypoint.x.toFixed(2)} ${waypoint.y.toFixed(2)}) rotate(${(Math.atan2(waypoint.y-guruveY,waypoint.x-guruveX)*180/Math.PI-45).toFixed(2)})`);
 guruvePin.style.opacity=String(1-smooth((p-.22)/.07));
 hararePin.style.opacity=String(smooth((p-.17)/.08)*(1-smooth((p-.285)/.052)));
 const labelOpacity=(1-smooth((p-.24)/.085)).toFixed(3);
 svg.querySelectorAll('.neighbour,.country-label,.topography,.geo-grid').forEach(node=>{node.style.opacity=labelOpacity;});
 const portal=document.getElementById('harare-arrival');
 if(portal){portal.style.opacity=String(smooth((p-.296)/.037)*(1-materialize));portal.setAttribute('transform',`translate(802.4 258.7) scale(${(lerp(.7,1.7,arrival)).toFixed(3)})`);}
 const mapOpacity=1-smooth((p-.292)/.092);
 const sceneOpacity=smooth((p-.31)/.085);
 stage.style.setProperty('--mapOpacity',mapOpacity.toFixed(4));
 stage.style.setProperty('--sceneOpacity',sceneOpacity.toFixed(4));
 stage.style.setProperty('--handoff',materialize.toFixed(4));
 map.setAttribute('aria-hidden',String(mapOpacity<.01));
 coords.textContent=p<.18?'19° S / 30° E':p<.30?'GURUVE — HARARE':'17° 49′ S / 31° 03′ E';
 mapContext.textContent=p<.18?'A region known for springstone.':p<.30?'Illustrative transport — not Coil’s documented shipment.':
   'The journey reaches Harare. The camera follows the stone into the workshop.';
}
function noise(x,y,z){
  const X=Math.floor(x),Y=Math.floor(y),Z=Math.floor(z);x-=X;y-=Y;z-=Z;
  const t=x*x*(3-2*x),u=y*y*(3-2*y),v=z*z*(3-2*z);
  const h=(i,j,k)=>hash(X+i,Y+j,Z+k);
  return lerp(lerp(lerp(h(0,0,0),h(1,0,0),t),lerp(h(0,1,0),h(1,1,0),t),u),
    lerp(lerp(h(0,0,1),h(1,0,1),t),lerp(h(0,1,1),h(1,1,1),t),u),v);
}
function fbm(x,y,z){return .57*noise(x,y,z)+.27*noise(x*2.11+17,y*2.11,z*2.11)+.16*noise(x*4.12,y*4.12+8,z*4.12)}
function stoneMaterial({raw=false,color=0x656b62,roughness=.95,flat=false}={}){
 const mat=new THREE.MeshStandardMaterial({color,metalness:0,roughness,flatShading:flat,side:THREE.DoubleSide});
 mat.onBeforeCompile=shader=>{
   if(raw){shader.uniforms.uCut=e.cut;shader.uniforms.uCarveMargin=e.carveMargin;shader.uniforms.uCarveMask=e.carveMask;}
   shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>\nvarying vec3 vLocalStone;`)
     .replace('#include <begin_vertex>',`#include <begin_vertex>\nvLocalStone=position;`);
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
     varying vec3 vLocalStone;
     ${raw?'uniform float uCut;uniform float uCarveMargin;uniform sampler2D uCarveMask;':''}
     float msh(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
     float mno(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
       float a=mix(msh(i),msh(i+vec3(1,0,0)),f.x),b=mix(msh(i+vec3(0,1,0)),msh(i+vec3(1,1,0)),f.x);
       float c=mix(msh(i+vec3(0,0,1)),msh(i+vec3(1,0,1)),f.x),d=mix(msh(i+vec3(0,1,1)),msh(i+vec3(1,1,1)),f.x);
       return mix(mix(a,b,f.y),mix(c,d,f.y),f.z);
     }`)
     .replace('#include <color_fragment>',`#include <color_fragment>
       float g=mno(vLocalStone*12.0)*.48+mno(vLocalStone*42.0)*.35+mno(vLocalStone*121.0)*.17;
       float vein=pow(1.0-abs(sin(vLocalStone.y*13.3+vLocalStone.x*4.9+mno(vLocalStone*2.7)*5.0)),35.0);
       diffuseColor.rgb*=mix(.85,1.12,g)*(1.0-.08*vein);
       ${raw?`float oxide=mno(vLocalStone*7.2+vec3(11.0,-4.0,6.0));
         float rind=smoothstep(.49,.79,oxide)*.22;
         diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.22,.185,.145),rind);
         float chip=mno(vLocalStone*vec3(10.0,7.0,8.0));
          // Distance to Coil's actual projected mesh (including its central opening).
          vec2 silhouetteUV=clamp(vec2((vLocalStone.x+1.70)/3.40,(vLocalStone.y+1.74)/3.48),vec2(.001),vec2(.999));
          float outside=texture2D(uCarveMask,silhouetteUV).r*1.5;
          float fracturedEdge=(chip-.5)*.045+.014*sin(vLocalStone.y*24.0+vLocalStone.x*17.0);
          if(outside>uCarveMargin+fracturedEdge)discard;`:''}`);
 };
 mat.customProgramCacheKey=()=>raw?'hos-springstone-rind-cut-v3':'hos-springstone-detail-v3';
 return mat;
}
function rockGeometry(){
  // A continuous, irregular, slab-like springstone boulder. There are no box seams or floating tiles.
  const geo=new THREE.IcosahedronGeometry(1,5),pos=geo.attributes.position;
  for(let i=0;i<pos.count;i++){
    const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);
    const superX=Math.sign(x)*Math.pow(Math.abs(x),.47);
    const superY=Math.sign(y)*Math.pow(Math.abs(y),.50);
    const superZ=Math.sign(z)*Math.pow(Math.abs(z),.40);
    const broad=fbm(x*3.5+2.2,y*3.3+3.5,z*3.8+5.2)-.5;
    const grain=fbm(x*13+6,y*11+7,z*13+4)-.5;
    const chip=0.12*broad+0.055*grain;
    const edge=1+.03*Math.sin(y*19+x*8)+.045*broad;
    pos.setXYZ(i,(superX*1.08+x*.15+chip*x)*edge,
      superY*1.67+chip*y+.036*Math.sin(x*20+z*14),
      (superZ*.75+chip*z)*edge);
  }
  pos.needsUpdate=true;geo.computeVertexNormals();return geo;
}
function makeRock(){
 const rock=new THREE.Mesh(rockGeometry(),stoneMaterial({raw:true,color:0x323c35}));
 rock.position.y=1.69;e.root.add(rock);e.rock=rock;
 const surface=new THREE.PlaneGeometry(2.1,1.47,26,18);surface.rotateX(-Math.PI/2);
 const pos=surface.attributes.position;
 for(let i=0;i<pos.count;i++){
  const x=pos.getX(i),z=pos.getZ(i);pos.setY(i,.08*(fbm(x*7,4,z*7)-.5));
 }
 surface.computeVertexNormals();
 const cap=new THREE.Mesh(surface,stoneMaterial({color:0x454e49,roughness:1}));
 cap.visible=false;e.root.add(cap);e.rockCap=cap;
}
function shadowTexture(){
 const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d');
 const g=ctx.createRadialGradient(64,64,8,64,64,64);
 g.addColorStop(0,'rgba(0,0,0,.42)');g.addColorStop(.5,'rgba(0,0,0,.18)');g.addColorStop(1,'rgba(0,0,0,0)');
 ctx.fillStyle=g;ctx.fillRect(0,0,128,128);return new THREE.CanvasTexture(c);
}
function makeStudio(){
 const shadow=new THREE.Mesh(new THREE.PlaneGeometry(5.4,4.4),new THREE.MeshBasicMaterial({map:shadowTexture(),transparent:true,depthWrite:false}));
 shadow.rotation.x=-Math.PI/2;shadow.position.y=-.055;e.scene.add(shadow);e.shadow=shadow;
 const base=new THREE.Group();
 const podium=new THREE.Mesh(new THREE.BoxGeometry(2,.52,1.5,8,2,8),new THREE.MeshStandardMaterial({color:0x575a53,roughness:.86}));
 podium.position.y=-.27;base.add(podium);base.visible=false;e.scene.add(base);e.plinth=base;
}
function makeChiselAndHammer(){
  const metal=new THREE.MeshStandardMaterial({color:0x8d9898,metalness:.68,roughness:.39});
  const darkMetal=new THREE.MeshStandardMaterial({color:0x4d5353,metalness:.48,roughness:.53});
  const wood=new THREE.MeshStandardMaterial({color:0x765d43,roughness:.83});
  const toolRig=new THREE.Group();e.root.add(toolRig);
  const chisel=new THREE.Group();toolRig.add(chisel);
  const point=new THREE.Mesh(new THREE.ConeGeometry(.042,.19,9),metal);
  point.rotation.x=Math.PI;point.position.y=.095;chisel.add(point);
  const shaft=new THREE.Mesh(new THREE.CylinderGeometry(.044,.057,.73,12),metal);
  shaft.position.y=.51;chisel.add(shaft);
  const handle=new THREE.Mesh(new THREE.CylinderGeometry(.071,.064,.38,13),wood);
  handle.position.y=.98;chisel.add(handle);
  const cap=new THREE.Mesh(new THREE.CylinderGeometry(.077,.077,.07,14),darkMetal);
  cap.position.y=1.195;chisel.add(cap);e.chiselHead=cap;
  const chiselTop=new THREE.Object3D();chiselTop.position.y=1.23;chisel.add(chiselTop);e.chiselTop=chiselTop;
  const pivot=new THREE.Group();pivot.position.set(.70,1.49,.02);toolRig.add(pivot);
  const hammer=new THREE.Group();pivot.add(hammer);
  const beam=new THREE.Mesh(new THREE.CylinderGeometry(.045,.052,.67,11),wood);
  beam.position.set(-.29,-.14,0);beam.rotation.z=-1.18;hammer.add(beam);
  const hammerHead=new THREE.Mesh(new THREE.CylinderGeometry(.115,.115,.38,12),darkMetal);
  hammerHead.rotation.z=Math.PI/2;
  // At impact, the lower face of the hammer head meets the chisel's top,
  // not its center. Both are located in world-space in the browser QA.
  hammerHead.position.set(-.70,-.145,-.02);hammer.add(hammerHead);
  const contact=new THREE.Object3D();contact.position.set(-.70,-.26,-.02);hammer.add(contact);
  e.hammerHead=hammerHead;e.hammerContact=contact;e.hammerPivot=pivot;e.toolRig=toolRig;
  const chips=[];
  const mat=stoneMaterial({color:0x575e55,flat:true});
  const geometry=new THREE.TetrahedronGeometry(.044,0);
  for(let i=0;i<34;i++){
    const chip=new THREE.Mesh(geometry,mat);
    chip.userData={seed:hash(i,2),dir:hash(i,7)*Math.PI*2,energy:hash(i,11)};
    e.root.add(chip);chips.push(chip);
  }
  e.chips=chips;
  const n=80;const cloud=new THREE.BufferGeometry();cloud.setAttribute('position',new THREE.BufferAttribute(new Float32Array(n*3),3));
  e.dust=new THREE.Points(cloud,new THREE.PointsMaterial({color:0xb1b5a8,size:.012,transparent:true,opacity:.65,depthWrite:false}));
  e.root.add(e.dust);
}
function makeFinishingTools(){
 const steel=new THREE.MeshStandardMaterial({color:0x7c8785,metalness:.38,roughness:.69});
 const file=new THREE.Group();
 const rasp=new THREE.Mesh(new THREE.BoxGeometry(.085,.92,.06,3,24,2),steel);rasp.position.y=.25;rasp.rotation.z=-.25;file.add(rasp);
 const handle=new THREE.Mesh(new THREE.CylinderGeometry(.066,.059,.38,10),new THREE.MeshStandardMaterial({color:0x594c3a,roughness:.9}));
 handle.position.y=.81;file.add(handle);e.root.add(file);e.rasp=file;
 const paper=new THREE.Mesh(new THREE.PlaneGeometry(.43,.23,8,4),new THREE.MeshStandardMaterial({color:0xc7bba6,roughness:1,side:THREE.DoubleSide}));
 paper.rotation.x=-.17;e.root.add(paper);e.sanding=paper;
 const torch=new THREE.Group();
 const nozzle=new THREE.Mesh(new THREE.CylinderGeometry(.069,.062,.38,12),new THREE.MeshStandardMaterial({color:0x676c6b,metalness:.56,roughness:.37}));
 nozzle.position.y=-.17;torch.add(nozzle);
 const stem=new THREE.Mesh(new THREE.CylinderGeometry(.046,.056,.22,10),new THREE.MeshStandardMaterial({color:0x444744,roughness:.7}));
 stem.position.y=-.43;torch.add(stem);
 const flame=new THREE.Mesh(new THREE.ConeGeometry(.092,.34,20,1,true),new THREE.MeshBasicMaterial({color:0xffc06f,transparent:true,opacity:.68,depthWrite:false,side:THREE.DoubleSide}));
 flame.position.y=.20;torch.add(flame);
 const blue=new THREE.Mesh(new THREE.ConeGeometry(.039,.23,14,1,true),new THREE.MeshBasicMaterial({color:0x8ab9d6,transparent:true,opacity:.78,depthWrite:false,side:THREE.DoubleSide}));
 blue.position.y=.17;torch.add(blue);
 e.root.add(torch);e.torch=torch;
 const light=new THREE.PointLight(0xffa460,0,2.4,1.5);e.scene.add(light);e.torchLight=light;
 const cloth=new THREE.Group();
 const pad=new THREE.Mesh(new THREE.BoxGeometry(.35,.19,.12,6,3,4),new THREE.MeshStandardMaterial({color:0xe0d5c2,roughness:1}));
 const pos=pad.geometry.attributes.position;
 for(let i=0;i<pos.count;i++)pos.setY(i,pos.getY(i)+.02*Math.sin(pos.getX(i)*26+pos.getZ(i)*17));
 pad.geometry.computeVertexNormals();pad.rotation.z=-.15;cloth.add(pad);
 const elastic=new THREE.Mesh(new THREE.BoxGeometry(.27,.045,.025),new THREE.MeshStandardMaterial({color:0x8d7d65,roughness:1}));elastic.position.z=.083;cloth.add(elastic);
 e.root.add(cloth);e.wax=cloth;
 const specular=new THREE.PointLight(0xe6e8e0,0,3,1.5);e.scene.add(specular);e.waxLight=specular;
}
function makeChalkFromModel(model){
 // Extract real front-facing geometry of Coil, including its negative space.
 const W=256,H=320,minX=-1.70,maxX=1.70,maxY=3.48;
 const c=document.createElement('canvas');c.width=W;c.height=H;
 const ctx=c.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#fff';
 model.updateMatrixWorld(true);
 const a=new THREE.Vector3(),b=new THREE.Vector3(),d=new THREE.Vector3();
 model.traverse(mesh=>{
  if(!mesh.isMesh||!mesh.geometry?.attributes?.position)return;
  const geo=mesh.geometry,pos=geo.attributes.position,ids=geo.index;
  const idx=i=>ids?ids.getX(i):i;
  const count=ids?ids.count:pos.count;
  ctx.beginPath();
  for(let i=0;i<count-2;i+=3){
    a.fromBufferAttribute(pos,idx(i)).applyMatrix4(mesh.matrixWorld);
    b.fromBufferAttribute(pos,idx(i+1)).applyMatrix4(mesh.matrixWorld);
    d.fromBufferAttribute(pos,idx(i+2)).applyMatrix4(mesh.matrixWorld);
    ctx.moveTo((a.x-minX)/(maxX-minX)*W,(maxY-a.y)/maxY*H);
    ctx.lineTo((b.x-minX)/(maxX-minX)*W,(maxY-b.y)/maxY*H);
    ctx.lineTo((d.x-minX)/(maxX-minX)*W,(maxY-d.y)/maxY*H);
    ctx.closePath();
    if(i%1200===0){ctx.fill();ctx.beginPath();}
  }ctx.fill();
 });
 const pixels=ctx.getImageData(0,0,W,H).data;
 const inside=(x,y)=>x>=0&&y>=0&&x<W&&y<H&&pixels[(y*W+x)*4+3]>60;
 // A world-space distance field, generated from the original mesh's front projection.
 // It allows the raw stone's actual silhouette and through-hole to emerge at each strike.
 const distances=new Float32Array(W*H);
 const rows=[];
 for(let y=0;y<H;y++){
   let min=Infinity,max=-Infinity;
   for(let x=0;x<W;x++){
     const hit=inside(x,y);distances[y*W+x]=hit?0:10000;
     if(hit){min=Math.min(min,x);max=Math.max(max,x);}
   }
   rows[y]={left:min===Infinity?-.7:min/W*3.4-1.7,right:max<0?.7:max/W*3.4-1.7};
 }
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
   const i=y*W+x;
   if(x)distances[i]=Math.min(distances[i],distances[i-1]+1);
   if(y){distances[i]=Math.min(distances[i],distances[i-W]+1);
     if(x)distances[i]=Math.min(distances[i],distances[i-W-1]+1.4142);
     if(x+1<W)distances[i]=Math.min(distances[i],distances[i-W+1]+1.4142);}
 }
 for(let y=H-1;y>=0;y--)for(let x=W-1;x>=0;x--){
   const i=y*W+x;
   if(x+1<W)distances[i]=Math.min(distances[i],distances[i+1]+1);
   if(y+1<H){distances[i]=Math.min(distances[i],distances[i+W]+1);
     if(x)distances[i]=Math.min(distances[i],distances[i+W-1]+1.4142);
     if(x+1<W)distances[i]=Math.min(distances[i],distances[i+W+1]+1.4142);}
 }
 // Texture row zero represents stone bottom, hence the canvas row inversion.
 const bytes=new Uint8Array(W*H);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
   bytes[(H-1-y)*W+x]=Math.min(255,Math.round(distances[y*W+x]*3.4/W/1.5*255));
 }
 const field=new THREE.DataTexture(bytes,W,H,THREE.RedFormat);
 field.magFilter=THREE.LinearFilter;field.minFilter=THREE.LinearFilter;field.wrapS=field.wrapT=THREE.ClampToEdgeWrapping;
 field.needsUpdate=true;e.carveMask.value=field;e.contourRows=rows;
 host.dataset.carveMaskReady='true';
 const segments=[];
 for(let y=2;y<H-2;y+=2)for(let x=2;x<W-2;x+=2){
   if(!inside(x,y))continue;
   if(inside(x-2,y)&&inside(x+2,y)&&inside(x,y-2)&&inside(x,y+2))continue;
   if(hash(x,y)<.29)continue;
   const px=x/W*(maxX-minX)+minX,py=maxY-y/H*maxY;
   segments.push(px,py,.82,px+(.008+hash(x,y,1)*.012),py+.006,.82);
 }
 if(segments.length<20)return;
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(segments,3));
 const m=new THREE.LineBasicMaterial({color:0xd4d5bc,transparent:true,opacity:.88,depthTest:false});
 e.marks=new THREE.LineSegments(g,m);e.root.add(e.marks);e.marks.visible=false;
}
function loadCoil(){
 const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
 loader.load('/models/coil-uploaded-v1.glb',gltf=>{
  const original=gltf.scene,box=new THREE.Box3().setFromObject(original),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
  if(!Number.isFinite(size.y)||size.y<=0)throw new Error('Invalid Coil geometry');
  const factor=3.05/Math.max(size.y,size.x*.95,size.z*.95);
  original.scale.multiplyScalar(factor);original.position.set(-center.x*factor,-box.min.y*factor,-center.z*factor);
  original.updateMatrixWorld(true);
  const rough=original.clone(true);
  const polishedPlane=new THREE.Plane(new THREE.Vector3(0,1,0),-3.35);
  const roughPlane=new THREE.Plane(new THREE.Vector3(0,-1,0),4.5);
  const carvePlane=new THREE.Plane(new THREE.Vector3(0,1,0),.28);
  original.traverse(n=>{if(n.isMesh){
    const originalMaterials=Array.isArray(n.material)?n.material:[n.material];
    const materials=originalMaterials.map(m=>{const c=m.clone();c.clippingPlanes=[polishedPlane];c.clipShadows=true;return c;});
    n.material=materials.length===1?materials[0]:materials;
  }});
  rough.traverse(n=>{if(n.isMesh){
    // A coarse, granular interim surface that retains Coil's true silhouette.
    const materials=Array.isArray(n.material)?n.material:[n.material];
    n.material=materials.map(()=>{const m=stoneMaterial({color:0x555a52,roughness:.99,flat:true});m.clippingPlanes=[roughPlane,carvePlane];return m;});
    if(n.material.length===1)n.material=n.material[0];
  }});
  e.polished=original;e.rough=rough;e.polishedPlane=polishedPlane;e.roughPlane=roughPlane;e.carvePlane=carvePlane;
  original.visible=false;rough.visible=false;
  e.root.add(rough);e.root.add(original);e.modelReady=true;
  host.dataset.modelReady='true';
  try{makeChalkFromModel(original)}catch(err){console.warn('Contour extraction unavailable',err)}
  schedule();
 },undefined,err=>{host.dataset.modelError='true';fallback.hidden=false;console.warn('Coil model unavailable',err)});
}
function setup(){
 e.carveMask.value=new THREE.DataTexture(new Uint8Array([0]),1,1,THREE.RedFormat);e.carveMask.value.needsUpdate=true;
 const canvas=document.createElement('canvas');host.prepend(canvas);e.canvas=canvas;
 const ctx=canvas.getContext('webgl2',{antialias:true,alpha:true,powerPreference:'low-power'});
 if(!ctx)throw new Error('WebGL2 unavailable');
 e.renderer=new THREE.WebGLRenderer({canvas,context:ctx,alpha:true,antialias:true,powerPreference:'low-power'});
 e.renderer.setClearColor(0x000000,0);e.renderer.localClippingEnabled=true;
 e.renderer.outputColorSpace=THREE.SRGBColorSpace;e.renderer.toneMapping=THREE.ACESFilmicToneMapping;
 e.renderer.toneMappingExposure=1.07;e.renderer.setPixelRatio(Math.min(devicePixelRatio,mobile()?1.25:1.75));
 e.scene=new THREE.Scene();e.camera=new THREE.PerspectiveCamera(34,1,.1,100);
 e.scene.add(new THREE.HemisphereLight(0xe6e8dd,0x33362e,2.6));
 for(const [color,intensity,x,y,z] of [[0xf6e6cf,3.2,-4,7,6],[0xdde6f0,1.5,4,5,2],[0xf6f1e7,2,1,6,-5]]){
   const light=new THREE.DirectionalLight(color,intensity);light.position.set(x,y,z);e.scene.add(light);
 }
 e.root=new THREE.Group();e.scene.add(e.root);
 makeRock();makeStudio();makeChiselAndHammer();makeFinishingTools();loadCoil();
 canvas.addEventListener('webglcontextlost',ev=>{ev.preventDefault();e.contextLost=true;fallback.hidden=false},{passive:false});
 canvas.addEventListener('webglcontextrestored',()=>{e.contextLost=false;schedule()});
 window.addEventListener('scroll',schedule,{passive:true});window.addEventListener('resize',resize,{passive:true});
 reduced.addEventListener?.('change',schedule);
 document.getElementById('skip').addEventListener('click',()=>document.getElementById('finished').scrollIntoView({behavior:reduced.matches?'instant':'smooth'}));
 resize();schedule();
}
function resize(){
 if(!e.renderer)return;
 const w=Math.max(1,host.clientWidth),h=Math.max(1,host.clientHeight);
 e.renderer.setPixelRatio(Math.min(devicePixelRatio,mobile()?1.25:1.75));e.renderer.setSize(w,h,false);
 e.camera.aspect=w/h;e.camera.fov=mobile()?38:33;e.camera.updateProjectionMatrix();schedule();
}
function schedule(){
 desiredProgress=active();
 if(e.frame)return;
 e.frame=requestAnimationFrame(tick);
}
function tick(now){
 e.frame=0;
 const next=active();desiredProgress=next;
 const delta=e.lastTick?Math.min(300,Math.max(1,now-e.lastTick)):16;
 e.lastTick=now;
 const blend=1-Math.exp(-delta/48);
 if(reduced.matches)shownProgress=next;
 else shownProgress+=(next-shownProgress)*blend;
 if(Math.abs(next-shownProgress)<.0004)shownProgress=next;
 render(shownProgress);
 if(Math.abs(next-shownProgress)>.0004&&document.visibilityState!=='hidden')e.frame=requestAnimationFrame(tick);
}
function render(p){
 const step=phaseFor(p);updateMap(p);
 if(step!==e.lastPhase){
  e.lastPhase=step;stage.dataset.phase=String(step);
  ui.phase.textContent=texts[step][0];ui.title.textContent=texts[step][1];ui.description.textContent=texts[step][2];
  ui.counter.textContent=String(step+1).padStart(2,'0')+' / 11';
 }
 ui.progress.style.width=(p*100).toFixed(2)+'%';
 if(!e.renderer||e.contextLost)return;
 const handoff=smooth((p-.31)/.085);
 // Continuous camera handoff: the Harare marker grows into the same physical block.
 e.root.scale.setScalar(lerp(.24,1,handoff));
 e.root.position.set(lerp(.85,0,handoff),lerp(-.66,0,handoff),0);
 const mark=smooth((p-.455)/.055)*(1-smooth((p-.536)/.022));
 const carve=smooth((p-.53)/.235);
 const file=smooth((p-.765)/.07),heating=smooth((p-.835)/.065);
 const wax=smooth((p-.90)/.06),gallery=smooth((p-.96)/.04);
 // Each impact removes a discrete band of unwanted material, then holds.
 const strokeCount=28,strokes=carve*strokeCount;
 const phase=fract(strokes);
 const open=smooth((phase-.06)/.30)*(1-smooth((phase-.56)/.19));
 const impact=smooth((phase-.75)/.18);
 const removed=(Math.floor(strokes)+impact)/strokeCount;
 // Increase the constraint in world units: the central opening is physically cut out.
 e.carveMargin.value=lerp(1.72,-.04,removed);
 e.rock.visible=p<.765&&handoff>.02;
 e.rockCap.visible=false;
 if(e.marks){e.marks.visible=mark>.025;e.marks.material.opacity=.82*mark;}
 if(e.rough){
  e.rough.visible=carve>.012&&wax<.997;
  e.carvePlane.constant=-lerp(3.38,-.20,removed);
  e.roughPlane.constant=lerp(4.5,-.26,wax);
 }
 if(e.polished){
  e.polished.visible=wax>.004;
  e.polishedPlane.constant=-(lerp(3.35,-.25,wax));
  if(wax>.996)e.polishedPlane.constant=.4;
 }
 // Tool tip tracks the current silhouette layer; the hammer's true contact point
 // is rigged to touch the cap when the strike closes (rather than passing beside it).
 const index=Math.max(0,Math.min(e.contourRows.length-1,Math.round((.12+.79*carve)*e.contourRows.length)));
 const edge=e.contourRows[index]||{left:-.65,right:.65};
 const side=Math.floor(strokes)%2===0?-1:1;
 const boundary=side<0?edge.left:edge.right;
 const impactX=clamp(boundary+side*(e.carveMargin.value*.45+.025),-1.24,1.24);
 const impactY=lerp(3.16,.36,carve);
 const impactZ=.77;
 if(e.toolRig){
  e.toolRig.visible=carve>.008&&carve<.985&&!reduced.matches;
  if(e.toolRig.visible){
   e.toolRig.position.set(impactX,impactY,impactZ);
   e.toolRig.rotation.set(.10,-.12,side*.025);
   e.hammerPivot.rotation.z=-.53*open;
   e.toolRig.updateMatrixWorld(true);
   e.chiselTop.getWorldPosition(e.tempP);e.hammerContact.getWorldPosition(e.tempQ);
   const contact=e.tempP.distanceTo(e.tempQ);
   host.dataset.contactError=contact.toFixed(4);
   host.dataset.hammerClosed=String(open<.035);
   host.dataset.hitPhase=phase.toFixed(4);
   host.dataset.strike=Math.floor(strokes).toString();
  }
 }
 const burst=smooth((phase-.71)/.10)*(1-smooth((phase-.92)/.08));
 for(let i=0;i<e.chips.length;i++){
  const c=e.chips[i],d=c.userData,age=clamp((phase-.73)/.26);c.visible=e.toolRig.visible&&burst>.025;
  if(!c.visible)continue;
  const radius=(.08+.42*age)*(.35+d.energy*.7);
  c.position.set(impactX+Math.cos(d.dir)*radius,impactY+age*.23-age*age*.42,.82+Math.sin(d.dir)*radius);
  c.rotation.set(age*13,age*8,age*9);c.scale.setScalar((1-age)*(.6+d.energy*.7));
 }
 if(e.dust){
  e.dust.visible=e.toolRig.visible&&burst>.025;
  if(e.dust.visible){const a=e.dust.geometry.attributes.position;
   for(let i=0;i<a.count;i++){
    const ang=hash(i,7)*6.283,rad=(.08+hash(i,19)*.48)*burst;
    a.setXYZ(i,impactX+Math.cos(ang)*rad,impactY+Math.sin(ang)*rad*.5,.87+Math.sin(ang)*rad);
   }a.needsUpdate=true;
  }
 }
 if(e.rasp){e.rasp.visible=p>.77&&p<.813&&!reduced.matches;
  e.rasp.position.set(.5*Math.sin(file*9),lerp(2.8,.74,file),.86);
  e.rasp.rotation.z=-.46+Math.sin(file*67)*.11;
 }
 if(e.sanding){e.sanding.visible=p>.812&&p<.832&&!reduced.matches;
  e.sanding.position.set(.39*Math.sin(file*13),lerp(2.7,.56,file),.90);
  e.sanding.rotation.z=Math.sin(file*60)*.12;
 }
 if(e.torch){e.torch.visible=p>.839&&p<.897&&!reduced.matches;
  e.torch.position.set(.52,lerp(2.75,.67,heating),.98);e.torch.rotation.z=-.84;
  e.torchLight.intensity=e.torch.visible?1.10:0;
  e.torchLight.position.set(.30,lerp(2.7,.65,heating),1.85);
 }
 if(e.wax){e.wax.visible=p>.904&&p<.958&&!reduced.matches;
  e.wax.position.set(.46*Math.sin(wax*11),lerp(2.95,.37,wax),.97);
  e.wax.rotation.z=Math.sin(wax*56)*.08;
  e.waxLight.intensity=e.wax.visible?.5:0;
  e.waxLight.position.set(e.wax.position.x,e.wax.position.y,1.8);
 }
 if(e.plinth)e.plinth.visible=gallery>.55;
 e.root.rotation.set(.007*Math.sin(p*5),lerp(-.18,.14,smooth((p-.43)/.56)),0);
 const focus=smooth((p-.53)/.20),dist=mobile()?8.7:8.0;
 e.camera.position.set(mobile()?.04:1.38,3.12,dist-.3*focus);
 e.camera.lookAt(mobile()?0:.28,1.68,0);
 e.renderer.render(e.scene,e.camera);
 host.dataset.carveProgress=removed.toFixed(4);
 host.dataset.materialMargin=e.carveMargin.value.toFixed(4);
}
try{setup()}catch(err){fallback.hidden=false;host.dataset.modelError='true';console.warn('3D process unavailable',err)}
