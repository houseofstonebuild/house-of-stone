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
const archiveCutaway=document.getElementById('archive-cutaway');
const archiveFilm=document.getElementById('archive-film');
const archiveMobileFrames=document.getElementById('archive-mobile-frames');
const sculptureAtlas=document.getElementById('mobile-sculpture-frames');
const sculptureAtlasNext=document.getElementById('mobile-sculpture-next');
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
 ['ZIMBABWE','It begins with stone.','Zimbabwe has a longstanding tradition of hand-carved stone sculpture.'],
 ['GURUVE DISTRICT','Where springstone is found.','Guruve is one of the regions in Zimbabwe known for dense springstone.'],
 ['TOWARD HARARE','From quarry region to city.','Follow an illustrative route toward Harare, an important center for Zimbabwean sculpture.'],
 ['HARARE','Into the workshop.','The raw stone becomes the starting point for a sculptor’s decisions.'],
 ['THE RAW STONE','Before the first cut.','A weathered block of springstone, before its outer material is removed.'],
 ['MARKING THE FORM','Marking the contours.','The sculptor maps the outer shape and identifies the stone that needs to be removed.'],
 ['CARVING','The form takes shape.','Stone is worked away to reveal the sculptor’s design. The workshop footage shows real chiseling; the transformation is an illustration.'],
 ['FINER WORK','Refining the curves.','Rasps and wet abrasives smooth the tool marks while retaining the hand-carved form.'],
 ['HEATING','Preparing the surface.','Gentle, controlled heating is sometimes used before a clear-wax finish.'],
 ['WAX AND BUFFING','Bringing out the stone.','Clear wax and buffing deepen the colour and reveal the stone’s natural sheen.'],
 ['THE FINISHED SCULPTURE','Coil, by Douglas Musekiwa.','The finished work shown with its approved model from our collection.']
];
// Deliberately reserve nearly one quarter of the journey for detailed hand-carving.
const stops=[0,.075,.17,.29,.37,.45,.565,.765,.835,.90,.96,1];
const clamp=(x,a=0,b=1)=>Math.min(b,Math.max(a,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x)};
const lerp=(a,b,t)=>a+(b-a)*t;
const fract=n=>n-Math.floor(n);
const hash=(a,b=0,c=0)=>fract(Math.sin(a*127.1+b*311.7+c*74.7)*43758.5453);
const mobile=()=>innerWidth<=800;
const atlasCapture=mobile()&&new URLSearchParams(location.search).has('capture-mobile-atlas');
// V2: six near-native phone-resolution frames per sheet; decoded neighbors stay bounded.
// V3: rebuilt mobile frames without the artificial barrel and floating tools.
const atlasStart=.305,atlasFrames=192,atlasColumns=2,atlasRows=3,atlasGroupSize=6;
const atlasCache=new Map();
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
let journeyTop=0,journeyDistance=1;
function measureScrollRange(){
 journeyTop=journey.getBoundingClientRect().top+scrollY;
 journeyDistance=Math.max(1,journey.offsetHeight-stage.offsetHeight);
}
const active=()=>clamp((scrollY-journeyTop)/journeyDistance);
const phaseFor=p=>{for(let i=0;i<stops.length-1;i++)if(p<stops[i+1])return i;return 10;};
const phaseT=(p,i)=>clamp((p-stops[i])/Math.max(.001,stops[i+1]-stops[i]));
const impactVector=new THREE.Vector3();
let shownProgress=0,desiredProgress=0;
const e={renderer:null,scene:null,camera:null,root:null,canvas:null,renderWidth:0,renderHeight:0,renderMobile:null,lastRenderTime:0,
  rock:null,rockCap:null,intermediate:null,intermediateGeo:null,intermediateRings:[],blankCap:null,cut:{value:1.95},carveMargin:{value:2},carveProgress:{value:0},carveMask:{value:null},finishProgress:{value:0},rawMaterial:null,polished:null,rough:null,contourRows:[],finishingMaterials:[],finishLight:null,
  carvePlane:null,roughPlane:null,polishedPlane:null,blankHidePlane:null,carveRevealPlane:null,marks:null,hammerRig:null,
  chiselHead:null,chiselTop:null,chiselTip:null,hammerHead:null,hammerContact:null,hammerPivot:null,toolRig:null,chips:[],dust:null,
  rasp:null,sanding:null,torch:null,torchLight:null,wax:null,waxLight:null,surfaceSamples:[],roughMaterials:[],
  shadow:null,plinth:null,modelReady:false,contextLost:false,lastPhase:-1,frame:0,now:0,
  tempP:new THREE.Vector3(),tempQ:new THREE.Vector3()};

// A faithful vector country outline (Natural Earth simplified data), not a road map.
const routeLength=route.getTotalLength();
function updateMap(p){
 if(p>.40){
  if(!e.mapDone){
   e.mapDone=true;
   stage.style.setProperty('--mapOpacity','0');
   stage.style.setProperty('--sceneOpacity','1');
   map.setAttribute('aria-hidden','true');
  }
  return;
 }
 e.mapDone=false;
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
 // Keep the map marker upright, regardless of which way the route bends.
 truck.setAttribute('transform',`translate(${waypoint.x.toFixed(2)} ${waypoint.y.toFixed(2)})`);
 guruvePin.style.opacity=String(1-smooth((p-.22)/.07));
 hararePin.style.opacity=String(smooth((p-.17)/.08)*(1-smooth((p-.285)/.052)));
 const labelOpacity=(1-smooth((p-.24)/.085)).toFixed(3);
 svg.querySelectorAll('.neighbour,.country-label,.topography,.geo-grid').forEach(node=>{node.style.opacity=labelOpacity;});
 const portal=document.getElementById('harare-arrival');
 if(portal){portal.style.opacity=String(smooth((p-.296)/.037)*(1-materialize));portal.setAttribute('transform',`translate(802.4 258.7) scale(${(lerp(.7,1.7,arrival)).toFixed(3)})`);}
 const mapOpacity=1-smooth((p-.315)/.065);
 const sceneOpacity=smooth((p-.305)/.052);
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
function stoneMaterial({raw=false,blank=false,color=0x656b62,roughness=.95,flat=false}={}){
 const mat=new THREE.MeshStandardMaterial({color,metalness:0,roughness,flatShading:flat,side:THREE.DoubleSide});
 mat.onBeforeCompile=shader=>{
   if(raw){shader.uniforms.uCut=e.cut;shader.uniforms.uCarveMargin=e.carveMargin;shader.uniforms.uCarveMask=e.carveMask;shader.uniforms.uCarveProgress=e.carveProgress;}
   if(blank){shader.uniforms.uCarveProgress=e.carveProgress;shader.uniforms.uCarveMask=e.carveMask;}
   shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>\nvarying vec3 vLocalStone;`)
     .replace('#include <begin_vertex>',`#include <begin_vertex>\nvLocalStone=position;`);
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
     varying vec3 vLocalStone;
     ${raw?'uniform float uCut;uniform float uCarveMargin;uniform float uCarveProgress;uniform sampler2D uCarveMask;':blank?'uniform float uCarveProgress;uniform sampler2D uCarveMask;':''}
     float msh(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
     float mno(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
       float a=mix(msh(i),msh(i+vec3(1,0,0)),f.x),b=mix(msh(i+vec3(0,1,0)),msh(i+vec3(1,1,0)),f.x);
       float c=mix(msh(i+vec3(0,0,1)),msh(i+vec3(1,0,1)),f.x),d=mix(msh(i+vec3(0,1,1)),msh(i+vec3(1,1,1)),f.x);
       return mix(mix(a,b,f.y),mix(c,d,f.y),f.z);
     }`)
     .replace('#include <color_fragment>',`#include <color_fragment>
       float g=mno(vLocalStone*8.0)*.40+mno(vLocalStone*36.0)*.34+mno(vLocalStone*107.0)*.26;
       float vein=pow(1.0-abs(sin(vLocalStone.y*13.3+vLocalStone.x*4.9+mno(vLocalStone*2.7)*5.0)),35.0);
       diffuseColor.rgb*=mix(.84,1.11,g)*(1.0-.075*vein);
       ${raw?`float oxide=mno(vLocalStone*9.5+vec3(11.0,-4.0,6.0));
          float rind=smoothstep(.67,.89,oxide)*.075;
          diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.30,.27,.23),rind);
         // Projected silhouette data remains available for chalk mapping.
          vec2 silhouetteUV=clamp(vec2((vLocalStone.x+1.70)/3.40,(vLocalStone.y+1.74)/3.48),vec2(.001),vec2(.999));
          float outside=texture2D(uCarveMask,silhouetteUV).r*1.5;
           // A physical-looking sculpting front works down the SINGLE parent mass.
           // Uncarved lower sections remain solid; the tool reveals no floating islands.
           // One connected top-down working face. No arbitrary holes, tile-like
           // shards, or unsupported fragments detached from the parent stone.
           float chip=mno(vLocalStone*vec3(10.0,7.0,8.0));
           float cutY=3.46-3.65*smoothstep(.015,.985,uCarveProgress);
           float ridge=.10*(chip-.5)+.037*sin(vLocalStone.x*15.0+vLocalStone.z*7.0);
           if(uCarveProgress>.002 && vLocalStone.y+1.69>cutY+ridge)discard;`:blank?`
          // Do not punch holes in the parent shell. The approved three-dimensional
          // Coil mesh supplies the true openings as material is taken away.
          float localHeight=clamp(vLocalStone.y/3.35,0.0,1.0);
          float layerStart=(1.0-localHeight)*.84;
          float layerProgress=smoothstep(layerStart,layerStart+.13,clamp(uCarveProgress,0.0,1.0));
          float chiselScars=mno(vLocalStone*34.0);
          diffuseColor.rgb*=1.0-.045*layerProgress*(.4+.6*chiselScars);`:''}`);
 };
 mat.customProgramCacheKey=()=>raw?'hos-topdown-carving-v9':blank?'hos-solid-carving-parent-v6':'hos-springstone-detail-v3';
 return mat;
}
function rockGeometry(){
  // A continuous, irregular, slab-like springstone boulder. There are no box seams or floating tiles.
  const geo=new THREE.IcosahedronGeometry(1,5),pos=geo.attributes.position;
  for(let i=0;i<pos.count;i++){
    const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);
    const superX=Math.sign(x)*Math.pow(Math.abs(x),.65);
    const superY=Math.sign(y)*Math.pow(Math.abs(y),.66);
    const superZ=Math.sign(z)*Math.pow(Math.abs(z),.61);
    const broad=fbm(x*3.5+2.2,y*3.3+3.5,z*3.8+5.2)-.5;
    const grain=fbm(x*13+6,y*11+7,z*13+4)-.5;
    const chip=.155*broad+.061*grain;
    const edge=1+.045*Math.sin(y*19+x*8)+.065*broad;
    pos.setXYZ(i,(superX*1.08+x*.15+chip*x)*edge,
      superY*1.67+chip*y+.036*Math.sin(x*20+z*14),
      (superZ*.75+chip*z)*edge);
  }
  pos.needsUpdate=true;
 // IcosahedronGeometry duplicates face vertices. Smooth shared-vertex
 // normals without eliminating genuinely irregular rock geometry.
 geo.computeVertexNormals();
 const normals=geo.attributes.normal,groups=new Map();
 for(let i=0;i<pos.count;i++){
  const key=[pos.getX(i),pos.getY(i),pos.getZ(i)].map(v=>Math.round(v*10000)).join(',');
  if(!groups.has(key))groups.set(key,{indices:[],sum:new THREE.Vector3()});
  const v=groups.get(key);v.indices.push(i);
  v.sum.add(new THREE.Vector3(normals.getX(i),normals.getY(i),normals.getZ(i)));
 }
 for(const v of groups.values()){
  v.sum.normalize();
  for(const i of v.indices)normals.setXYZ(i,v.sum.x,v.sum.y,v.sum.z);
 }
 normals.needsUpdate=true;return geo;
}
function makeRock(){
 const rock=new THREE.Mesh(rockGeometry(),stoneMaterial({raw:true,color:0x2c352d}));
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

// An actual connected three-dimensional blank, not floating fragments or a
// horizontal clipping plane. Its cross sections are calculated from Coil's
// approved silhouette; every chisel strike reduces excess stone toward them.
function makeCarvingBlank(rows){
 const rings=84,radial=32,positions=[],indices=[],data=[];
 for(let j=0;j<=rings;j++){
   const y=.025+3.31*j/rings;
   const rowIndex=Math.min(rows.length-1,Math.max(0,Math.round((1-y/3.48)*(rows.length-1))));
   const range=rows[rowIndex]||{left:-.6,right:.6};
   let left=range.left,right=range.right;
   if(!Number.isFinite(left)||!Number.isFinite(right)||right<left){left=-.35;right=.35;}
   const targetCenter=(left+right)/2;
   const targetWidth=Math.max(.14,(right-left)/2+.08);
   const taper=Math.max(.24,Math.pow(Math.max(0,1-Math.pow(Math.abs((y-1.69)/1.77),3.2)),.19));
   for(let i=0;i<=radial;i++){
     const a=2*Math.PI*i/radial;
     data.push({y,a,center:targetCenter,width:targetWidth,taper,seed:hash(j,i)});
     positions.push(0,y,0);
   }
 }
 for(let j=0;j<rings;j++)for(let i=0;i<radial;i++){
   const a=j*(radial+1)+i,b=a+radial+1;
   indices.push(a,b,a+1,b,b+1,a+1);
 }
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setIndex(indices);
 const material=stoneMaterial({color:0x454b45,roughness:1,blank:true});material.transparent=true;material.opacity=0;material.depthWrite=true;
 material.clippingPlanes=[e.blankHidePlane];
 const blank=new THREE.Mesh(geo,material);blank.frustumCulled=false;blank.visible=false;e.root.add(blank);
 e.intermediate=blank;e.intermediateGeo=geo;e.intermediateRings=data;
 makeBlankCap();
 updateCarvingBlank(0);
}
function updateCarvingBlank(t){
 if(!e.intermediate)return;
 if(Number.isFinite(e.lastBlankT)&&Math.abs(e.lastBlankT-t)<(mobile()?.007:.002))return;
 e.lastBlankT=t;
 const data=e.intermediateRings,pos=e.intermediateGeo.attributes.position;
 for(let i=0;i<data.length;i++){
   const v=data[i],c=Math.cos(v.a),sn=Math.sin(v.a);
   // Work down the original parent stone instead of shrinking all rows at once.
   const localHeight=clamp(v.y/3.35);
   const eased=smooth((t-(1-localHeight)*.84)/.16);
   const startWidth=1.18*v.taper,finishWidth=v.width;
   const center=lerp(0,v.center,eased);
   // No jump between the geological block and the gradually hand-shaped form.
   const width=lerp(startWidth,finishWidth,eased);
   const depth=lerp(.76*v.taper,.40+Math.min(.12,finishWidth*.15),eased);
   const texture=(.011*Math.sin(v.a*5+v.y*4.3)+.004*Math.sin(v.a*9-v.y*10))*lerp(1,.38,eased);
   pos.setXYZ(i,center+c*(width+texture),v.y+texture*.5,sn*(depth+texture));
 }
 pos.needsUpdate=true;e.intermediateGeo.computeVertexNormals();
}
// The exposed cut is solid stone. A dynamic disk follows the deformed blank's
// contour at the tool's working height instead of leaving a hollow-cylinder rim.
function makeBlankCap(){
 const radial=32,capGeo=new THREE.BufferGeometry();
 capGeo.setAttribute('position',new THREE.BufferAttribute(new Float32Array((radial+2)*3),3));
 const indices=[];for(let i=0;i<radial;i++)indices.push(0,i+1,i+2);
 capGeo.setIndex(indices);
 const material=stoneMaterial({color:0x454b45,roughness:1});
 material.transparent=true;material.opacity=0;material.depthWrite=true;
 const cap=new THREE.Mesh(capGeo,material);cap.frustumCulled=false;cap.visible=false;
 e.root.add(cap);e.blankCap=cap;
}
function updateBlankCap(y){
 if(!e.blankCap||!e.intermediateGeo)return;
 const sample=clamp((y-.025)/3.31)*84,lo=Math.floor(sample),hi=Math.min(84,lo+1),t=sample-lo;
 const shell=e.intermediateGeo.attributes.position,cap=e.blankCap.geometry.attributes.position;
 let cx=0,cz=0;
 for(let i=0;i<=32;i++){
   const a=lo*33+i,b=hi*33+i;
   const x=lerp(shell.getX(a),shell.getX(b),t),z=lerp(shell.getZ(a),shell.getZ(b),t);
   cap.setXYZ(i+1,x,y+.004,z);
   if(i<32){cx+=x;cz+=z;}
 }
 cap.setXYZ(0,cx/32,y+.004,cz/32);
 cap.needsUpdate=true;e.blankCap.geometry.computeVertexNormals();
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
 // Gallery limestone pedestal, geometrically centered on the approved sculpture.
 const base=new THREE.Group();
 const limestone=new THREE.MeshStandardMaterial({color:0x938f85,roughness:.91});
 const column=new THREE.Mesh(new THREE.CylinderGeometry(.90,.93,.49,64),limestone);
 column.position.y=-.255;base.add(column);
 const lip=new THREE.Mesh(new THREE.CylinderGeometry(.915,.915,.027,64),new THREE.MeshStandardMaterial({color:0xa39b8d,roughness:.72}));
 lip.position.y=-.024;base.add(lip);
 const foot=new THREE.Mesh(new THREE.CylinderGeometry(.945,.945,.036,64),new THREE.MeshStandardMaterial({color:0x6e6b63,roughness:.84}));
 foot.position.y=-.51;base.add(foot);
 base.visible=false;e.root.add(base);e.plinth=base;
}
function makeChiselAndHammer(){
  const metal=new THREE.MeshStandardMaterial({color:0x8d9898,metalness:.68,roughness:.39});
  const darkMetal=new THREE.MeshStandardMaterial({color:0x4d5353,metalness:.48,roughness:.53});
  const wood=new THREE.MeshStandardMaterial({color:0x765d43,roughness:.83});
  const toolRig=new THREE.Group();toolRig.scale.setScalar(.58);e.root.add(toolRig);
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
  const tip=new THREE.Object3D();chisel.add(tip);e.chiselTip=tip;
  const pivot=new THREE.Group();pivot.position.set(.70,1.49,.02);toolRig.add(pivot);
  const hammer=new THREE.Group();pivot.add(hammer);
  // Short-handled sculptor's mallet: grip runs diagonally from head to palm.
  const beam=new THREE.Mesh(new THREE.CylinderGeometry(.049,.057,.92,14),wood);
  beam.position.set(-.40,.22,-.02);beam.rotation.z=-.66;hammer.add(beam);
  const hammerHead=new THREE.Mesh(new THREE.CylinderGeometry(.115,.115,.36,18),metal);
  hammerHead.rotation.z=Math.PI/2;
  // At impact, the lower face of the hammer head meets the chisel's top,
  // not its center. Both are located in world-space in the browser QA.
  hammerHead.position.set(-.70,-.145,-.02);hammer.add(hammerHead);
  const contact=new THREE.Object3D();contact.position.set(-.70,-.26,-.02);hammer.add(contact);
  e.hammerHead=hammerHead;e.hammerContact=contact;e.hammerPivot=pivot;e.toolRig=toolRig;
  const chips=[];
  const mat=stoneMaterial({color:0x575e55,flat:true});
  const geometry=new THREE.TetrahedronGeometry(.044,0);
  for(let i=0;i<(mobile()?12:34);i++){
    const chip=new THREE.Mesh(geometry,mat);
    chip.userData={seed:hash(i,2),dir:hash(i,7)*Math.PI*2,energy:hash(i,11)};
    e.root.add(chip);chips.push(chip);
  }
  e.chips=chips;
  const n=mobile()?28:80;const cloud=new THREE.BufferGeometry();cloud.setAttribute('position',new THREE.BufferAttribute(new Float32Array(n*3),3));
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
 const torch=new THREE.Group();torch.scale.setScalar(.76);
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
 const pad=new THREE.Mesh(new THREE.BoxGeometry(.27,.12,.08,6,3,4),new THREE.MeshStandardMaterial({color:0xd5ccbd,roughness:1}));
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
  makeCarvingBlank(rows);
 host.dataset.carveMaskReady='true';
 // Trace continuous projected guide strokes and drape them onto the raw stone.
 // This prevents disconnected chalk dots from floating in front of the block.
 const segments=[],previous=[null,null,null,null];
 const ray=new THREE.Raycaster(),towardStone=new THREE.Vector3(0,0,-1);
 e.rock.updateMatrixWorld(true);
 for(let y=3;y<H-3;y+=3){
  const runs=[];let start=-1;
  for(let x=2;x<W-2;x++){
   const hit=inside(x,y);
   if(hit&&start<0)start=x;
   if(start>=0&&(!hit||x===W-3)){runs.push([start,hit?x:x-1]);start=-1;}
  }
  const limits=runs.length?[runs[0][0],runs[runs.length-1][1],runs.length>1?runs[0][1]:null,runs.length>1?runs[1][0]:null]:[];
  for(let k=0;k<4;k++){
   const x=limits[k];
   if(x==null){previous[k]=null;continue;}
   const px=x/W*(maxX-minX)+minX,py=maxY-y/H*maxY;
   ray.set(new THREE.Vector3(px,py,4),towardStone);
   const hit=ray.intersectObject(e.rock,false)[0];
   if(!hit){previous[k]=null;continue;}
   const p=hit.point;
   const point=new THREE.Vector3(p.x,p.y,p.z+.009);
   if(previous[k]&&previous[k].distanceTo(point)<.18){
    segments.push(previous[k].x,previous[k].y,previous[k].z,point.x,point.y,point.z);
   }
   previous[k]=point;
  }
 }
 host.dataset.chalkSegmentCount=String(segments.length/6);
 if(segments.length<24)return;
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(segments,3));
 const m=new THREE.LineBasicMaterial({color:0xd2d1bc,transparent:true,opacity:.80,depthTest:true,depthWrite:false});
 e.marks=new THREE.LineSegments(g,m);e.marks.renderOrder=4;
 e.root.add(e.marks);e.marks.visible=false;
}
// Match both rough and approved materials to the same feathered, irregular
// finishing frontier. This retains Coil's original material and its geometry.
function applyFinishMask(material,polished){
 const prior=material.onBeforeCompile;
 const previousKey=material.customProgramCacheKey?.bind(material);
 material.onBeforeCompile=shader=>{
  prior?.(shader);
  shader.uniforms.uFinishProgress=e.finishProgress;
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vFinishWorld;')
    .replace('#include <begin_vertex>','#include <begin_vertex>\nvFinishWorld=(modelMatrix*vec4(transformed,1.0)).xyz;');
  const rule=polished?'if(vFinishWorld.y<edge)discard;':'if(vFinishWorld.y>=edge)discard;';
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vFinishWorld;\nuniform float uFinishProgress;')
    .replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\nfloat edge=mix(3.30,-.28,clamp(uFinishProgress,0.0,1.0))+.10*sin(vFinishWorld.x*4.4+vFinishWorld.z*1.7)+.045*sin(vFinishWorld.x*10.0-vFinishWorld.y*6.1);\n'+rule);
 };
 material.customProgramCacheKey=()=>String(previousKey?.()||'stone')+'-hos-finish-'+(polished?'polished':'rough')+'-v1';
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
    const materials=originalMaterials.map(m=>{
      const c=m.clone();c.clippingPlanes=[];c.clipShadows=true;
      c.userData.approvedColor=c.color?.clone();
      c.userData.approvedRoughness=Number.isFinite(c.roughness)?c.roughness:.4;
      e.finishingMaterials.push(c);return c;
    });
    n.material=materials.length===1?materials[0]:materials;
  }});
  rough.traverse(n=>{if(n.isMesh){
    // A coarse, granular interim surface that retains Coil's true silhouette.
    const materials=Array.isArray(n.material)?n.material:[n.material];
    n.material=materials.map(()=>{const m=stoneMaterial({color:0x30362f,roughness:.99,flat:true});m.transparent=true;m.opacity=0;m.depthWrite=true;m.clippingPlanes=[e.carveRevealPlane];return m;});
    if(n.material.length===1)n.material=n.material[0];
  }});
  e.polished=original;e.rough=rough;e.polishedPlane=polishedPlane;e.roughPlane=roughPlane;e.carvePlane=carvePlane;
  original.visible=false;rough.visible=false;
  e.root.add(rough);e.root.add(original);e.modelReady=true;
  host.dataset.modelReady='true';
  // Project the actual Coil triangles before applying any cinematic map camera transform.
  const sourcePosition=e.root.position.clone(),sourceRotation=e.root.rotation.clone(),sourceScale=e.root.scale.clone();
  e.root.position.set(0,0,0);e.root.rotation.set(0,0,0);e.root.scale.setScalar(1);
  e.root.updateMatrixWorld(true);
  try{
   try{makeChalkFromModel(original)}catch(err){console.warn('Contour extraction unavailable',err)}
   cacheFinishingSurface();
  }finally{
    e.root.position.copy(sourcePosition);e.root.rotation.copy(sourceRotation);e.root.scale.copy(sourceScale);
    e.root.updateMatrixWorld(true);
  }
  schedule();
 },undefined,err=>{host.dataset.modelError='true';fallback.hidden=false;console.warn('Coil model unavailable',err)});
}
// Paused video is driven by scroll position. Coalesce asynchronous decoder seeks.
let archiveDesiredTime=0;
function flushArchiveSeek(){
 if(!Number.isFinite(archiveFilm.duration)||archiveFilm.duration<=0||archiveFilm.seeking)return;
 if(Math.abs(archiveFilm.currentTime-archiveDesiredTime)<.045)return;
 archiveFilm.currentTime=archiveDesiredTime;
}
function seekArchiveVideo(p){
 if(!Number.isFinite(archiveFilm.duration)||archiveFilm.duration<=0)return;
 // The source contains no lion reveal. Dense keyframes permit bounded reverse seeks.
 const limit=Math.max(0,Math.min(archiveFilm.duration-.08,21.2));
 const step=mobile()?.20:.065;
 archiveDesiredTime=clamp(Math.round(clamp((p-.590)/.141)*limit/step)*step,0,limit);
 flushArchiveSeek();
 host.dataset.archiveTarget=archiveDesiredTime.toFixed(3);
}
archiveFilm.addEventListener('seeked',()=>{
  // Never display an undecoded/black video surface over the still fallback.
  if(archiveFilm.readyState>=2)archiveCutaway.dataset.frameReady='true';
  flushArchiveSeek();
});
archiveFilm.addEventListener('error',()=>{archiveCutaway.dataset.frameReady='false';});
archiveFilm.addEventListener('loadedmetadata',schedule);
archiveFilm.addEventListener('play',()=>archiveFilm.pause());
// Raycast the original mesh at load time only. Finishing tools stay on the stone,
// including its changing front depth, without per-frame raycast cost.
function cacheFinishingSurface(){
 const ray=new THREE.Raycaster(),direction=new THREE.Vector3(0,0,-1);
 // Sample in normalized sculpture-local space, not the scaled map handoff pose.
 const savedPosition=e.root.position.clone(),savedRotation=e.root.rotation.clone(),savedScale=e.root.scale.clone();
 e.root.position.set(0,0,0);e.root.rotation.set(0,0,0);e.root.scale.setScalar(1);
 e.root.updateMatrixWorld(true);
 const points=[];
 for(let i=0;i<18;i++){
  const y=lerp(2.92,.34,i/17);
  const row=e.contourRows[Math.min(e.contourRows.length-1,Math.max(0,Math.round((1-y/3.48)*(e.contourRows.length-1))))];
  const nominal=row&&Number.isFinite(row.right)?row.right-Math.min(.17,Math.max(.04,(row.right-row.left)*.18)):.42;
  // Follow the actual outside edge; avoid reaching through Coil's hollow center.
  for(const dx of [0,-.10,-.20,-.33,-.46,-.60,-.75,.08]){
   ray.set(new THREE.Vector3(nominal+dx,y,5),direction);
   const hits=ray.intersectObject(e.rough,true);
   if(hits.length){points.push(hits[0].point.clone());break;}
  }
 }
 e.root.position.copy(savedPosition);e.root.rotation.copy(savedRotation);e.root.scale.copy(savedScale);
 e.root.updateMatrixWorld(true);
 e.surfaceSamples=points;
 e.rough.traverse(node=>{
  if(node.isMesh)for(const mat of Array.isArray(node.material)?node.material:[node.material])e.roughMaterials.push(mat);
 });
}
function finishingPoint(t){
 const points=e.surfaceSamples;
 if(!points.length)return new THREE.Vector3(.1,lerp(2.7,.6,t),.75);
 const pos=clamp(t)*(points.length-1),i=Math.floor(pos),j=Math.min(points.length-1,i+1);
 return points[i].clone().lerp(points[j],smooth(pos-i));
}
// A pre-rendered scroll atlas replaces WebGL entirely on phones. Each frame
// comes from this same approved Coil scene, baked at a fixed mobile viewport.
// Keep just the active/neighbor atlases decoded; do not seek video or shade
// a deforming mesh during touch momentum.
function mobileAtlasUrl(group){
 return '/assets/making-mobile-atlas-v4-'+String(group).padStart(2,'0')+'.webp';
}
function requestMobileAtlas(group){
 if(group<0||group>=atlasFrames/atlasGroupSize||atlasCache.has(group))return;
 const img=new Image();img.decoding='async';
 const entry={img,ready:false,failed:false};
 atlasCache.set(group,entry);
 img.onload=()=>{const done=()=>{entry.ready=true;schedule();};const decoded=img.decode?.();if(decoded?.then)decoded.then(done,done);else done();};
 img.onerror=()=>{entry.failed=true;host.dataset.mobileAtlasError=String(group);schedule();};
 img.src=mobileAtlasUrl(group);
}
function paintAtlasTile(layer,frame,suffix){
 const group=Math.floor(frame/atlasGroupSize),within=frame%atlasGroupSize;
 const entry=atlasCache.get(group);
 if(!entry?.ready)return false;
 const groupKey='paintGroup'+suffix,frameKey='paintFrame'+suffix;
 if(e[groupKey]!==group){
  e[groupKey]=group;
  layer.style.backgroundImage='url("'+mobileAtlasUrl(group)+'")';
 }
 if(e[frameKey]!==frame){
  e[frameKey]=frame;
  const col=within%atlasColumns,row=Math.floor(within/atlasColumns);
  layer.style.backgroundPosition=(col/(atlasColumns-1)*100).toFixed(4)+'% '+(row/(atlasRows-1)*100).toFixed(4)+'%';
 }
 layer.style.visibility='visible';
 return true;
}
function paintMobileSculpture(p){
 if(!sculptureAtlas||!sculptureAtlasNext)return;
 if(p<atlasStart){
  sculptureAtlas.style.visibility='hidden';
  sculptureAtlasNext.style.visibility='hidden';
  return;
 }
 // Crossfade the two neighboring baked poses. Unlike snapping the sprite, this
 // preserves continuously reversible motion even while the user scrolls slowly.
 const position=clamp((p-atlasStart)/(1-atlasStart)*(atlasFrames-1),0,atlasFrames-1);
 const first=Math.floor(position),second=Math.min(atlasFrames-1,first+1),blend=position-first;
 const group=Math.floor(first/atlasGroupSize),nextGroup=Math.floor(second/atlasGroupSize);
 requestMobileAtlas(group);
 requestMobileAtlas(group-1);
 requestMobileAtlas(group+1);
 requestMobileAtlas(nextGroup);
 if(!paintAtlasTile(sculptureAtlas,first,'Base')){
  host.dataset.mobileAtlasPending=String(group);return;
 }
 const secondReady=second!==first&&paintAtlasTile(sculptureAtlasNext,second,'Next');
 sculptureAtlasNext.style.visibility=secondReady?'visible':'hidden';
 sculptureAtlasNext.style.opacity=secondReady?blend.toFixed(4):'0';
 host.dataset.mobileAtlasFrame=String(Math.round(position));
 host.dataset.mobileAtlasBlend=blend.toFixed(4);
 host.dataset.mobileAtlasPending='';
 // Retain the adjacent sheets for smooth reverse scrubbing; release distant
 // decoded atlases so Safari does not accumulate many large backing textures.
 for(const [idx,item] of atlasCache){
  if(Math.abs(idx-group)>2){
   item.img.onload=null;item.img.onerror=null;item.img.src='';
   atlasCache.delete(idx);
  }
 }
}
function setupMobileAtlas(){
 e.mobileAtlasMode=true;
 stage.classList.add('mobile-atlas-mode');
 host.dataset.renderMode='precomputed-mobile';
 host.dataset.modelReady='true';
 // Keep the approved sculpture, not an unrelated photo, in each baked frame.
 requestMobileAtlas(0);
 requestMobileAtlas(1);
 measureScrollRange();
 window.addEventListener('scroll',schedule,{passive:true});
 window.addEventListener('resize',()=>{measureScrollRange();schedule();},{passive:true});
 reduced.addEventListener?.('change',schedule);
 document.addEventListener('visibilitychange',schedule);
 document.getElementById('skip').addEventListener('click',()=>{
  document.getElementById('finished').scrollIntoView({behavior:reduced.matches?'instant':'smooth'});
 });
 schedule();
}
function setup(){
 // Two facing cut planes let the real rough GLB grow out of the single working blank.
 // No replacement artwork is generated; the approved Coil geometry is never edited.
 e.blankHidePlane=new THREE.Plane(new THREE.Vector3(0,-1,0),3.6);
 e.carveRevealPlane=new THREE.Plane(new THREE.Vector3(0,1,0),-3.6);
 e.carveMask.value=new THREE.DataTexture(new Uint8Array([0]),1,1,THREE.RedFormat);e.carveMask.value.needsUpdate=true;
 const canvas=document.createElement('canvas');host.prepend(canvas);e.canvas=canvas;
 const ctx=canvas.getContext('webgl2',{antialias:!mobile(),alpha:true,preserveDrawingBuffer:atlasCapture,powerPreference:'low-power'});
 if(!ctx)throw new Error('WebGL2 unavailable');
 e.renderer=new THREE.WebGLRenderer({canvas,context:ctx,alpha:true,antialias:!mobile(),preserveDrawingBuffer:atlasCapture,powerPreference:'low-power'});
 e.renderer.setClearColor(0x000000,0);e.renderer.localClippingEnabled=true;
 e.renderer.outputColorSpace=THREE.SRGBColorSpace;e.renderer.toneMapping=THREE.ACESFilmicToneMapping;
 e.renderer.toneMappingExposure=1.07;e.renderer.setPixelRatio((atlasCapture?1.5:Math.min(devicePixelRatio,mobile()?.85:1.5)));
 e.scene=new THREE.Scene();e.camera=new THREE.PerspectiveCamera(34,1,.1,100);
 e.scene.add(new THREE.HemisphereLight(0xe6e8dd,0x33362e,2.6));
 for(const [color,intensity,x,y,z] of [[0xf6e6cf,3.2,-4,7,6],[0xdde6f0,1.5,4,5,2],[0xf6f1e7,2,1,6,-5]]){
   const light=new THREE.DirectionalLight(color,intensity);light.position.set(x,y,z);e.scene.add(light);
 }
 e.root=new THREE.Group();e.scene.add(e.root);
 // The documentary inset supplies the real physical handwork.
 // The animation changes stone and light, not imaginary tools floating over it.
 makeRock();makeStudio();loadCoil();
 e.finishLight=new THREE.PointLight(0xffc38d,0,5.4,1.4);
 e.finishLight.position.set(-1.4,2.5,2.5);e.scene.add(e.finishLight);
 canvas.addEventListener('webglcontextlost',ev=>{ev.preventDefault();e.contextLost=true;fallback.hidden=false},{passive:false});
 canvas.addEventListener('webglcontextrestored',()=>{e.contextLost=false;schedule()});
 measureScrollRange();
 window.addEventListener('scroll',schedule,{passive:true});window.addEventListener('resize',resize,{passive:true});
 reduced.addEventListener?.('change',schedule);
 document.addEventListener('visibilitychange',schedule);
 document.getElementById('skip').addEventListener('click',()=>document.getElementById('finished').scrollIntoView({behavior:reduced.matches?'instant':'smooth'}));
 resize();schedule();
}
function resize(){
 measureScrollRange();
 if(!e.renderer)return;
 const w=Math.max(1,host.clientWidth),h=Math.max(1,host.clientHeight);
 if(e.renderWidth!==w||e.renderHeight!==h||e.renderMobile!==mobile()){
  e.renderer.setPixelRatio((atlasCapture?1.5:Math.min(devicePixelRatio,mobile()?.85:1.5)));e.renderer.setSize(w,h,false);
  e.renderWidth=w;e.renderHeight=h;e.renderMobile=mobile();
 }
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
 if(mobile()&&!e.mobileAtlasMode&&!reduced.matches&&e.lastRenderTime&&now-e.lastRenderTime<31){e.frame=requestAnimationFrame(tick);return;}
 e.lastRenderTime=now;
 const delta=e.lastTick?Math.min(300,Math.max(1,now-e.lastTick)):16;
 e.lastTick=now;
 const blend=1-Math.exp(-delta/48);
 // Mobile browser momentum is already interpolated; never add scroll lag.
 if(reduced.matches||mobile())shownProgress=next;
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
 // This film is context for typical working methods, not a recording of Coil's making.
 // Use real workshop imagery during the least documentary-looking interim geometry.
 const documentary=smooth((p-.590)/.025)*(1-smooth((p-.731)/.028));
 const showFilm=!reduced.matches&&document.visibilityState==='visible'&&documentary>.05;
 stage.style.setProperty('--archiveOpacity',showFilm?documentary.toFixed(4):'0');
 const hidden=String(!showFilm);
 if(archiveCutaway.getAttribute('aria-hidden')!==hidden)archiveCutaway.setAttribute('aria-hidden',hidden);
 if(!archiveFilm.paused)archiveFilm.pause();
 if(mobile()){
  // A single WebP atlas turns touch scrolling into deterministic, zero-video-decoder
  // playback. The background position only changes when the frame index changes.
  const frame=Math.min(41,Math.max(0,Math.round(clamp((p-.590)/.141)*41)));
  if(e.lastMobileFilmFrame!==frame){
   e.lastMobileFilmFrame=frame;
   const column=frame%7,row=Math.floor(frame/7);
   archiveMobileFrames.style.backgroundPosition=`${(column/6*100).toFixed(3)}% ${(row/5*100).toFixed(3)}%`;
  }
  host.dataset.archiveTarget=(frame*.5).toFixed(3);
  host.dataset.mobileFilmFrame=String(frame);
 }else if(showFilm){
  if(archiveFilm.networkState===HTMLMediaElement.NETWORK_EMPTY)archiveFilm.load();
  seekArchiveVideo(p);
 }
 host.dataset.documentaryCutaway=documentary.toFixed(3);
 if(e.mobileAtlasMode){paintMobileSculpture(p);return;}
 if(!e.renderer||e.contextLost)return;
 const handoff=smooth((p-.31)/.088);
 // Continuous camera handoff: the Harare marker grows into the same physical block.
 e.root.scale.setScalar(lerp(.28,1,handoff));
 e.root.position.set(lerp(.85,0,handoff),lerp(-.60,0,handoff),0);
 // Hold the chalk drawing long enough to inspect before stone removal begins.
 const mark=smooth((p-.445)/.034)*(1-smooth((p-.572)/.031));
 const carve=smooth((p-.565)/.20);
 const file=smooth((p-.765)/.07),heating=smooth((p-.835)/.065);
 const wax=smooth((p-.90)/.06),gallery=smooth((p-.96)/.04);
 e.finishProgress.value=wax;
 // Each impact removes a discrete band of unwanted material, then holds.
 const strokeCount=28,strokes=carve*strokeCount;
 const phase=fract(strokes);
 const open=smooth((phase-.06)/.30)*(1-smooth((phase-.56)/.19));
 const impact=smooth((phase-.75)/.18);
 const removed=(Math.floor(strokes)+impact)/strokeCount;
 // Increase the constraint in world units: the central opening is physically cut out.
 // Preserve the continuous parent mass while upper contours emerge, then
 // cut the negative spaces progressively during the final third of the strikes.
 // A continuous irregular stone blank stays whole as the form is carved out.
 // The boundary follows the actual approved model's silhouette at every height.
 // Retain the original geological stone until the erosion shader removes it.
 e.carveMargin.value=2.25;
 e.carveProgress.value=removed;
 // Reveal Coil's real thickness and inner walls as the cut travels down the stone.
 // The upper finished portion and the unworked lower mass share one moving frontier.
 const frontier=lerp(3.45,-.18,smooth((removed-.014)/.96));
 // Retain an uncarved bridge around the new shape until the last chisel cuts.
 // Without this overlap, disconnected upper lobes appear to float above the mass.
 const supportOverlap=.38*(1-smooth((carve-.72)/.26));
 const workingHeight=clamp(frontier+supportOverlap,.025,3.34);
 e.blankHidePlane.constant=workingHeight;
 // Only expose portions that have cleared the still-solid working surface.
 // The approved rough form emerges only as the parent stone is worked down.
 const revealHeight=lerp(3.45,-.18,smooth((removed-.01)/.98));
 e.carveRevealPlane.constant=-revealHeight+.09;
 host.dataset.supportOverlap=supportOverlap.toFixed(4);
 const rockFade=smooth((carve-.94)/.06),roughFade=smooth((carve-.025)/.16);
 host.dataset.carveFrontier=frontier.toFixed(4);
 host.dataset.realShapeReveal=clamp((3.05-frontier)/3.23).toFixed(4);
 host.dataset.blankCapReady=String(Boolean(e.blankCap));
 host.dataset.blankCapHeight=workingHeight.toFixed(4);
 e.rock.visible=handoff>.02&&carve<.995;
 e.rock.material.transparent=true;
 e.rock.material.opacity=1-rockFade;
 e.rock.material.depthWrite=carve<.95;
 host.dataset.rockVisible=String(e.rock.visible);
 host.dataset.rockOpacity=e.rock.material.opacity.toFixed(3);
 // Retire the unsupported cylindrical intermediate and its flat disk cap.
 if(e.intermediate)e.intermediate.visible=false;
 if(e.blankCap)e.blankCap.visible=false;
 host.dataset.intermediateVisible='false';
 e.rockCap.visible=false;
 if(e.marks){e.marks.visible=mark>.025;e.marks.material.opacity=.94*mark;}
 host.dataset.markingVisibility=mark.toFixed(4);
 if(e.rough){
   e.rough.visible=carve>.012&&p<.90;
   const roughOpacity=roughFade;
   host.dataset.roughOpacity=roughOpacity.toFixed(3);
   host.dataset.roughVisible=String(e.rough.visible);
   if(Math.abs((e.lastRoughOpacity??-1)-roughOpacity)>.004){
    e.lastRoughOpacity=roughOpacity;
    for(const mat of e.roughMaterials){mat.opacity=roughOpacity;mat.depthWrite=roughOpacity>.45;}
   }
   // Dry tooling gives way to the slightly darker, smoother wet-sanded stone.
   // The final approved material remains untouched and is revealed by buffing.
   const wet=smooth((p-.776)/.056);
   if(Math.abs((e.lastWet??-1)-wet)>.012){
    e.lastWet=wet;
    for(const mat of e.roughMaterials){
      mat.roughness=lerp(.99,.76,wet);
      // Three.js setRGB uses linear values. .14 made the stone look pale grey.
      mat.color.setRGB(lerp(.032,.019,wet),lerp(.040,.024,wet),lerp(.033,.019,wet));
    }
   }
   e.roughPlane.constant=lerp(4.5,-.26,wax);
 }

 if(e.polished){
  e.polished.visible=p>=.90;
  // Hand-working is illustrated by the surface itself: rough to deep polish.
  // No straight black-and-ivory dividing line or hovering wax pad.
  for(const mat of e.finishingMaterials){
   const base=mat.userData.approvedColor;
   if(base&&mat.color)mat.color.copy(base).multiplyScalar(lerp(.72,1,wax));
   if(Number.isFinite(mat.roughness))mat.roughness=lerp(.94,mat.userData.approvedRoughness,wax);
  }
 }
 // Documentary footage supplies physical toolwork; no floating simulated hammers.
 host.dataset.toolsHidden='true';
 if(e.toolRig)e.toolRig.visible=false;
 for(const chip of e.chips)chip.visible=false;
 if(e.dust)e.dust.visible=false;
 if(false&&e.rasp){e.rasp.visible=p>.77&&p<.813&&!reduced.matches;
  const point=finishingPoint(clamp((p-.77)/.043));
  e.rasp.position.set(point.x,point.y-.25,point.z+.035);
  e.rasp.rotation.z=-.46+Math.sin(file*67)*.11;
 }
 if(false&&e.sanding){e.sanding.visible=p>.812&&p<.832&&!reduced.matches;
  const point=finishingPoint(clamp((p-.812)/.02));
  e.sanding.position.set(point.x+.036*Math.sin(file*95),point.y+.018*Math.sin(file*41),point.z+.035);
  e.sanding.rotation.z=Math.sin(file*60)*.12;
 }
 if(false&&e.torch){e.torch.visible=p>.839&&p<.897&&!reduced.matches;
  const point=finishingPoint(heating);
  e.torch.position.set(point.x+.65,point.y+.10,point.z+.42);e.torch.rotation.z=.88;
  e.torchLight.intensity=e.torch.visible?1.10:0;
  e.torchLight.position.set(point.x,point.y,point.z+.34);
 }
 if(false&&e.wax){e.wax.visible=p>.904&&p<.958&&!reduced.matches;
  const point=finishingPoint(wax);
  e.wax.position.set(point.x+.04*Math.sin(wax*130),point.y+.018*Math.cos(wax*91),point.z+.065);
  e.wax.rotation.z=Math.sin(wax*56)*.08;
  e.waxLight.intensity=e.wax.visible?1.0:0;
  e.waxLight.position.set(e.wax.position.x,e.wax.position.y,e.wax.position.z+.60);
 }
 if(e.finishLight){
  const warming=smooth((p-.837)/.024)*(1-smooth((p-.892)/.012));
  e.finishLight.intensity=warming*.75;
  e.finishLight.position.set(lerp(-1.5,1.3,warming),lerp(2.7,.9,warming),2.7);
 }
 if(e.plinth){
  e.plinth.visible=gallery>.55;
  // Ground shadow follows the limestone foot instead of bisecting the pedestal.
  if(e.shadow)e.shadow.position.y=lerp(-.055,-.55,gallery);
 }
 host.dataset.plinthAligned=String(e.plinth?.parent===e.root);
 e.root.rotation.set(.007*Math.sin(p*5),lerp(-.18,.14,smooth((p-.43)/.56)),0);
 const focus=smooth((p-.53)/.20)*(1-smooth((p-.77)/.08));
 const mobileFinal=mobile()?smooth((p-.928)/.05):0;
 const mobileFrame=mobile()?smooth((p-.545)/.065):0;
 const dist=mobile()?lerp(8.7,lerp(10.75,11.0,mobileFinal),mobileFrame):8.55;
 e.camera.position.set(mobile()?.04:1.38,3.12,dist-.12*focus);
 // Leave a calm, uninterrupted lower area for the title on small screens.
 e.camera.lookAt(mobile()?0:.28,lerp(1.68,lerp(.80,.70,mobileFinal),mobileFrame),0);
 e.renderer.render(e.scene,e.camera);
 host.dataset.surfaceSampleCount=String(e.surfaceSamples.length);
 host.dataset.carveProgress=removed.toFixed(4);
 host.dataset.blankReady=String(Boolean(e.intermediate));
 host.dataset.blankOpacity=e.intermediate?e.intermediate.material.opacity.toFixed(3):'0';
 host.dataset.materialMargin=e.carveMargin.value.toFixed(4);
 host.dataset.apertureProgress=e.carveProgress.value.toFixed(4);
}
try{
 if(mobile()&&!atlasCapture)setupMobileAtlas();
 else {setup();if(atlasCapture)window.__hosCaptureFrame=p=>{if(!e.modelReady)return false;render(clamp(p));return true;};}
}catch(err){fallback.hidden=false;host.dataset.modelError='true';console.warn('3D process unavailable',err)}
