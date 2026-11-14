import * as THREE from '/vendor/three.module.min.js';
import { GLTFLoader } from '/vendor/GLTFLoader.js';
import { MeshoptDecoder } from '/vendor/meshopt_decoder.js';

// An editorial study of the carving stages. The last frame is the approved,
// unchanged Coil GLB; earlier stone, cuts and tooling are illustrative.
const host = document.getElementById('render');
const journey = document.querySelector('.journey');
const stage = document.querySelector('.stage');
const fallback = document.getElementById('fallback');
const copy = {
  title: document.getElementById('stage-title'),
  description: document.getElementById('stage-description'),
  eyebrow: document.getElementById('phase'),
  counter: document.getElementById('counter'),
  bar: document.getElementById('progress-fill')
};
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
const phases = [
  ['THE STONE', 'Every work begins with stone.', 'A single block is examined for its grain, density and natural character.'],
  ['MARKING THE FORM', 'A direction is established.', 'The sculptor studies the stone and marks the intended contours.'],
  ['CARVING', 'The form emerges.', 'Hammer and chisel remove material in successive passes, revealing the openings and curves.'],
  ['FINISHING', 'Refining the surface.', 'Sanding removes tool marks. Polishing brings out the stone’s depth and natural color.'],
  ['THE FINISHED WORK', 'Coil.', 'The finished sculpture is the approved 3D model from our collection.']
];
const clamp = (n, a=0, b=1) => Math.max(a, Math.min(b, n));
const smooth = n => {n=clamp(n);return n*n*(3-2*n)};
const lerp = (a,b,t) => a+(b-a)*t;
const fract = n => n-Math.floor(n);
const hash = (x,y=0,z=0) => fract(Math.sin(x*127.1+y*311.7+z*74.7)*43758.5453123);
const mobile = () => window.innerWidth <= 700;
const progressAt = () => {
  const bounds=journey.getBoundingClientRect();
  return clamp(-bounds.top/Math.max(1,journey.offsetHeight-window.innerHeight));
};
const effect = {
  renderer:null,scene:null,camera:null,root:null,rock:null,rockCap:null,rockCut:{value:1.9},
  chalk:null,chisels:null,debris:[],dust:null,rough:null,polished:null,
  stage:0,frame:0,progress:0,started:false,modelReady:false,
  polishPlane:null,roughPlane:null,carveRevealPlane:null,shadow:null,frontPoints:[],plinth:null,
  halo:null,modelLoading:null,loss:false
};

// Deterministic fBm controls the physical stone geometry and its mineral grain.
function noise(x,y,z){
  const X=Math.floor(x),Y=Math.floor(y),Z=Math.floor(z);
  x=x-X;y=y-Y;z=z-Z;
  const u=x*x*(3-2*x),v=y*y*(3-2*y),w=z*z*(3-2*z);
  const h=(i,j,k)=>hash(X+i,Y+j,Z+k);
  const a=lerp(h(0,0,0),h(1,0,0),u),b=lerp(h(0,1,0),h(1,1,0),u);
  const c=lerp(h(0,0,1),h(1,0,1),u),d=lerp(h(0,1,1),h(1,1,1),u);
  return lerp(lerp(a,b,v),lerp(c,d,v),w);
}
function fbm(x,y,z){return .57*noise(x,y,z)+.27*noise(x*2.1+17,y*2.1,z*2.1)+.16*noise(x*4.1,y*4.1+8,z*4.1)}
function stoneMaterial({color=0x72766d,carvable=false,roughness=.96}={}){
  const mat=new THREE.MeshStandardMaterial({color,roughness,metalness:0,vertexColors:false,side:THREE.DoubleSide});
  mat.onBeforeCompile=shader=>{
    if(carvable)shader.uniforms.uCutY=effect.rockCut;
    shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>\nvarying vec3 vStoneCoordinate;`)
      .replace('#include <begin_vertex>',`#include <begin_vertex>\nvStoneCoordinate=position;`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
      varying vec3 vStoneCoordinate;
      ${carvable?'uniform float uCutY;':''}
      float shash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
      float snoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
        float a=mix(shash(i),shash(i+vec3(1,0,0)),f.x);
        float b=mix(shash(i+vec3(0,1,0)),shash(i+vec3(1,1,0)),f.x);
        float c=mix(shash(i+vec3(0,0,1)),shash(i+vec3(1,0,1)),f.x);
        float d=mix(shash(i+vec3(0,1,1)),shash(i+vec3(1,1,1)),f.x);
        return mix(mix(a,b,f.y),mix(c,d,f.y),f.z);
      }`)
      .replace('#include <color_fragment>',`#include <color_fragment>
        float mineral=snoise(vStoneCoordinate*4.3)*.64+snoise(vStoneCoordinate*14.0)*.28+snoise(vStoneCoordinate*53.0)*.08;
        float striation=smoothstep(.78,.9,snoise(vStoneCoordinate*vec3(4.0,1.7,4.0)+vec3(13.0)));
        diffuseColor.rgb*=mix(.65,1.28,mineral)*(1.0-.18*striation);
        ${carvable?`float chipped=snoise(vStoneCoordinate*vec3(10.0,6.0,8.0));
          float wave=(chipped-.5)*.15+.055*sin(vStoneCoordinate.x*11.0+vStoneCoordinate.z*7.0);
          if(vStoneCoordinate.y>uCutY+wave)discard;`:''}`);
  };
  mat.customProgramCacheKey=()=>carvable?'hsm-stone-cut-v2':'hsm-stone-v2';
  return mat;
}
function createRoughBlock(){
  // A single coherent geological mass: no repeating tiles, stacked boxes or seam lines.
  const w=2.52,h=3.5,d=1.65;
  const geo=new THREE.BoxGeometry(w,h,d,30,44,20);
  const a=geo.attributes.position;
  for(let i=0;i<a.count;i++){
    const x=a.getX(i),y=a.getY(i),z=a.getZ(i);
    const broad=fbm(x*1.8+2,y*1.4+6,z*1.8+8)-.5;
    const mid=fbm(x*7+3,y*5+2,z*7+2)-.5;
    const ridges=Math.sin(y*5.3+x*2.9+noise(x*3,y*4,z*2))*0.019;
    const amount=broad*.17+mid*.084+ridges;
    const corner=1+.055*noise(x*6,y*8,z*3);
    const outward=new THREE.Vector3(x/w,y/h,z/d).normalize();
    a.setXYZ(i,(x+outward.x*amount)*corner,y+outward.y*amount*.7+.02*Math.sin(x*6+z*4),z+outward.z*amount);
  }
  a.needsUpdate=true;geo.computeVertexNormals();
  const mesh=new THREE.Mesh(geo,stoneMaterial({color:0x6b716b,carvable:true}));
  mesh.position.y=h/2;
  mesh.castShadow=false;mesh.receiveShadow=true;
  effect.root.add(mesh);effect.rock=mesh;
  // The exposed cut surface makes the block read as a solid mass during carving.
  const capGeometry=new THREE.PlaneGeometry(w*.98,d*.98,18,12);
  capGeometry.rotateX(-Math.PI/2);
  const p=capGeometry.attributes.position;
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),z=p.getZ(i);
    p.setY(i,.045*(fbm(x*8,3,z*8)-.5)+.022*Math.sin(8*x+3*z));
  }
  capGeometry.computeVertexNormals();
  effect.rockCap=new THREE.Mesh(capGeometry,stoneMaterial({color:0x595e58,roughness:1}));
  effect.rockCap.visible=false;
  effect.root.add(effect.rockCap);
}
function shadowTexture(){
  const c=document.createElement('canvas');c.width=c.height=256;
  const cx=c.getContext('2d');const g=cx.createRadialGradient(128,128,8,128,128,127);
  g.addColorStop(0,'rgba(0,0,0,.47)');g.addColorStop(.45,'rgba(0,0,0,.25)');g.addColorStop(1,'rgba(0,0,0,0)');
  cx.fillStyle=g;cx.fillRect(0,0,256,256);
  return new THREE.CanvasTexture(c);
}
function makeStudio(){
  const sh=new THREE.Mesh(new THREE.PlaneGeometry(5,3),new THREE.MeshBasicMaterial({map:shadowTexture(),transparent:true,depthWrite:false}));
  sh.rotation.x=-Math.PI/2;sh.position.set(.12,-.05,0);effect.scene.add(sh);effect.shadow=sh;
  // An understated stone plinth only appears in the last gallery frame.
  effect.plinth=new THREE.Group();
  const pedestal=new THREE.Mesh(new THREE.BoxGeometry(2.15,.64,1.7,8,2,8),stoneMaterial({color:0x8f8980,roughness:.92}));
  pedestal.position.y=-.36;
  effect.plinth.add(pedestal);
  const lip=new THREE.Mesh(new THREE.BoxGeometry(2.25,.09,1.8),new THREE.MeshStandardMaterial({color:0xa29a8d,roughness:.8}));
  lip.position.y=-.045;effect.plinth.add(lip);
  effect.plinth.visible=false;effect.scene.add(effect.plinth);
}
function makeTools(){
  const chisel=new THREE.Group();
  const metal=new THREE.MeshStandardMaterial({color:0x8a9496,metalness:.76,roughness:.4});
  const steel=new THREE.Mesh(new THREE.CylinderGeometry(.036,.07,.68,12),metal);
  steel.position.y=.42;chisel.add(steel);
  const edge=new THREE.Mesh(new THREE.ConeGeometry(.072,.19,8),metal);
  edge.rotation.x=Math.PI;edge.position.y=.07;chisel.add(edge);
  const handle=new THREE.Mesh(new THREE.CylinderGeometry(.08,.065,.40,12),new THREE.MeshStandardMaterial({color:0x69503a,roughness:.86}));
  handle.position.y=.92;chisel.add(handle);
  const collar=new THREE.Mesh(new THREE.CylinderGeometry(.077,.077,.05,12),metal);collar.position.y=.70;chisel.add(collar);
  const hammer=new THREE.Group();
  const wood=new THREE.MeshStandardMaterial({color:0x76553b,roughness:.89});
  const grip=new THREE.Mesh(new THREE.CylinderGeometry(.04,.045,.85,10),wood);
  grip.position.y=.32;hammer.add(grip);
  const head=new THREE.Mesh(new THREE.CylinderGeometry(.145,.145,.42,12),new THREE.MeshStandardMaterial({color:0x454a4c,metalness:.64,roughness:.52}));
  head.rotation.z=Math.PI/2;head.position.y=.76;hammer.add(head);
  const toolGroup=new THREE.Group();toolGroup.add(chisel,hammer);
  hammer.position.set(.24,1.12,.38);hammer.rotation.z=-.5;
  toolGroup.rotation.x=.85;toolGroup.rotation.z=-.26;
  effect.root.add(toolGroup);
  effect.chisels={group:toolGroup,hammer};
  const chips=[];
  const shared=new THREE.MeshStandardMaterial({color:0x687169,roughness:1,flatShading:true,transparent:true,opacity:.9});
  for(let i=0;i<42;i++){
    const g=new THREE.TetrahedronGeometry(.03+hash(i,4)*.065,0);
    const mesh=new THREE.Mesh(g,shared);
    mesh.userData={seed:hash(i,14),dir:hash(i,19)*Math.PI*2,rise:hash(i,36),speed:hash(i,99)};
    effect.root.add(mesh);chips.push(mesh);
  }
  effect.debris=chips;
  const particlePositions=new Float32Array(85*3);
  const particleGeo=new THREE.BufferGeometry();particleGeo.setAttribute('position',new THREE.BufferAttribute(particlePositions,3));
  const points=new THREE.Points(particleGeo,new THREE.PointsMaterial({color:0xe3e1d4,size:.015,transparent:true,opacity:.7,sizeAttenuation:true,depthWrite:false}));
  effect.root.add(points);effect.dust=points;
}
function makeChalkFromModel(model){
  // Rasterize actual Coil triangles to derive its front silhouette and through-hole,
  // rather than drawing an unrelated abstract outline on the raw stone.
  const W=190,H=270,xMin=-1.42,xMax=1.42,yMax=3.35;
  const canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;
  const context=canvas.getContext('2d',{willReadFrequently:true});
  context.fillStyle='#fff';model.updateMatrixWorld(true);
  const temp1=new THREE.Vector3(),temp2=new THREE.Vector3(),temp3=new THREE.Vector3();
  model.traverse(mesh=>{
    if(!mesh.isMesh || !mesh.geometry?.attributes?.position)return;
    const geom=mesh.geometry,pos=geom.attributes.position,index=geom.index;
    const count=index?index.count:pos.count;
    const matrix=mesh.matrixWorld;
    context.beginPath();
    const indexAt=i=>index?index.getX(i):i;
    for(let i=0;i<count-2;i+=3){
      temp1.fromBufferAttribute(pos,indexAt(i)).applyMatrix4(matrix);
      temp2.fromBufferAttribute(pos,indexAt(i+1)).applyMatrix4(matrix);
      temp3.fromBufferAttribute(pos,indexAt(i+2)).applyMatrix4(matrix);
      context.moveTo((temp1.x-xMin)/(xMax-xMin)*W,(yMax-temp1.y)/yMax*H);
      context.lineTo((temp2.x-xMin)/(xMax-xMin)*W,(yMax-temp2.y)/yMax*H);
      context.lineTo((temp3.x-xMin)/(xMax-xMin)*W,(yMax-temp3.y)/yMax*H);
      context.closePath();
      if(i%900===0){context.fill();context.beginPath();}
    }
    context.fill();
  });
  const data=context.getImageData(0,0,W,H).data;
  const inside=(x,y)=>x>=0&&y>=0&&x<W&&y<H&&data[4*(y*W+x)+3]>70;
  const verts=[];
  for(let y=2;y<H-2;y+=2)for(let x=2;x<W-2;x+=2){
    if(!inside(x,y))continue;
    const edge=!inside(x-2,y)||!inside(x+2,y)||!inside(x,y-2)||!inside(x,y+2);
    if(!edge || hash(x,y)<.38)continue;
    const cx=x/W*(xMax-xMin)+xMin,cy=yMax-y/H*yMax;
    const length=.014+.017*hash(x,y,1);
    verts.push(cx,cy,.965,cx+length*(hash(x,y,2)-.5),cy+length*.9,.965);
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));
  const ink=new THREE.LineBasicMaterial({color:0xd8d7c5,transparent:true,opacity:.72,depthTest:false});
  effect.chalk=new THREE.LineSegments(geometry,ink);
  effect.chalk.visible=false;effect.root.add(effect.chalk);
}
function loadCoil(){
  const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  loader.load('/models/coil-uploaded-v1.glb',gltf=>{
    const source=gltf.scene;
    const bbox=new THREE.Box3().setFromObject(source);
    const size=bbox.getSize(new THREE.Vector3()),center=bbox.getCenter(new THREE.Vector3());
    if(!Number.isFinite(size.y)||size.y<=0)throw new Error('Invalid Coil model');
    const scale=3.05/Math.max(size.y,size.x*.95,size.z*.95);
    source.scale.multiplyScalar(scale);source.position.set(-center.x*scale,-bbox.min.y*scale,-center.z*scale);
    source.updateMatrixWorld(true);
    effect.polished=source;source.visible=false;effect.root.add(source);
    effect.rough=source.clone(true);effect.rough.visible=false;
    effect.rough.traverse(node=>{if(node.isMesh){node.material=stoneMaterial({color:0x6b7068,roughness:1});}});
    effect.root.add(effect.rough);
    // The displayed original materials belong only to this prototype clone;
    // the published collection model is unchanged.
    const polishedPlane=new THREE.Plane(new THREE.Vector3(0,1,0),-4.5);
    const roughPlane=new THREE.Plane(new THREE.Vector3(0,-1,0),4.5);
    // Carving uncovers the real form from top to bottom. Polishing then advances
    // downward over it without ever altering the owner's Coil geometry.
    const carveRevealPlane=new THREE.Plane(new THREE.Vector3(0,1,0),-3.6);
    source.traverse(node=>{if(node.isMesh){
      node.material=(Array.isArray(node.material)?node.material:[node.material]).map(mat=>{
        const copy=mat.clone();copy.clippingPlanes=[polishedPlane];copy.clipShadows=true;return copy;
      });
      if(node.material.length===1)node.material=node.material[0];
    }});
    effect.rough.traverse(node=>{if(node.isMesh)node.material.clippingPlanes=[roughPlane,carveRevealPlane]});
    effect.polishPlane=polishedPlane;effect.roughPlane=roughPlane;effect.carveRevealPlane=carveRevealPlane;
    effect.modelReady=true;host.dataset.modelReady='true';
    try{makeChalkFromModel(source)}catch(err){console.warn('Could not draw model contours',err)}
    schedule();
  },undefined,err=>{console.warn('Coil 3D model unavailable',err);fallback.hidden=false;host.dataset.modelError='true';effect.renderer?.domElement?.setAttribute('hidden','');});
}
function setup(){
  const canvas=document.createElement('canvas');canvas.setAttribute('aria-hidden','true');host.prepend(canvas);
  const context=canvas.getContext('webgl2',{antialias:true,alpha:true,powerPreference:'low-power'});
  if(!context)throw new Error('WebGL2 unavailable');
  effect.renderer=new THREE.WebGLRenderer({canvas,context,alpha:true,antialias:true,powerPreference:'low-power'});
  effect.renderer.setClearColor(0x000000,0);effect.renderer.localClippingEnabled=true;
  effect.renderer.toneMapping=THREE.ACESFilmicToneMapping;effect.renderer.toneMappingExposure=1.13;
  effect.renderer.outputColorSpace=THREE.SRGBColorSpace;
  effect.renderer.setPixelRatio(Math.min(devicePixelRatio,mobile()?1.35:1.8));
  effect.scene=new THREE.Scene();
  effect.camera=new THREE.PerspectiveCamera(34,1,.1,100);
  effect.scene.add(new THREE.HemisphereLight(0xdbe2da,0x292822,2.25));
  for(const [color,intensity,x,y,z] of [[0xffe7c3,3.2,-4,6,5],[0xd1dfed,1.45,4,5,1],[0xf9f9e7,2.1,2,3,-6]]){
    const light=new THREE.DirectionalLight(color,intensity);light.position.set(x,y,z);effect.scene.add(light);
  }
  effect.root=new THREE.Group();effect.scene.add(effect.root);
  createRoughBlock();makeStudio();makeTools();loadCoil();
  const canvasEl=effect.renderer.domElement;
  canvasEl.addEventListener('webglcontextlost',event=>{event.preventDefault();effect.loss=true;fallback.hidden=false;},{passive:false});
  canvasEl.addEventListener('webglcontextrestored',()=>{effect.loss=false;schedule()});
  document.getElementById('skip').addEventListener('click',()=>document.getElementById('finished').scrollIntoView({behavior:reduced.matches?'instant':'smooth'}));
  window.addEventListener('scroll',schedule,{passive:true});window.addEventListener('resize',resize,{passive:true});
  reduced.addEventListener?.('change',schedule);
  effect.started=true;resize();schedule();
}
function resize(){if(!effect.renderer)return;
  const w=Math.max(1,host.clientWidth),h=Math.max(1,host.clientHeight);
  effect.renderer.setPixelRatio(Math.min(devicePixelRatio,mobile()?1.35:1.8));effect.renderer.setSize(w,h,false);
  effect.camera.aspect=w/h;effect.camera.fov=mobile()?38:32;effect.camera.updateProjectionMatrix();schedule();
}
function schedule(){if(effect.frame || effect.loss)return;
  effect.frame=requestAnimationFrame(()=>{effect.frame=0;render()});
}
function render(){
  const e=effect;if(!e.renderer||e.loss)return;
  let p=progressAt();
  if(reduced.matches){p=p<.2?0:1;}
  e.progress=p;
  const phase=Math.min(4,Math.floor(p*5));
  if(phase!==e.stage||!stage.dataset.phase){
    e.stage=phase;stage.dataset.phase=String(phase);
    copy.counter.textContent=String(phase+1).padStart(2,'0')+' / 05';
    copy.eyebrow.textContent=phases[phase][0];copy.title.textContent=phases[phase][1];copy.description.textContent=phases[phase][2];
  }
  copy.bar.style.width=(p*100).toFixed(1)+'%';
  const mark=smooth((p-.12)/.13)*(1-smooth((p-.32)/.06));
  const carve=smooth((p-.30)/.32),finishing=smooth((p-.61)/.22),gallery=smooth((p-.82)/.14);
  if(e.chalk){e.chalk.visible=mark>.03&&carve<.1;e.chalk.material.opacity=.7*mark;}
  e.rock.visible=carve<.995;
  // A continuous eroding edge; no individual tiling or floating cubes.
  e.rockCut.value=lerp(1.95,-1.95,carve);
  e.rockCap.visible=carve>.015&&carve<.985;
  e.rockCap.position.y=1.75+e.rockCut.value;
  e.rockCap.scale.setScalar(1-.20*carve);
  const tool=e.chisels;
  tool.group.visible=carve>.02&&carve<.99&&!reduced.matches;
  const stroke=carve*16,hit=fract(stroke);
  const contactY=clamp(1.75+e.rockCut.value,.27,3.35);
  const impactX=Math.sin(stroke*.74)*.8;
  if(tool.group.visible){
    tool.group.position.set(impactX,contactY,.92);
    tool.group.rotation.z=-.24+.065*Math.sin(stroke*3);
    tool.hammer.rotation.z=-.5+Math.sin(hit*Math.PI*2)*.43;
    tool.hammer.position.y=1.12+.20*Math.sin(hit*Math.PI*2);
  }
  for(let i=0;i<e.debris.length;i++){
    const chip=e.debris[i],d=chip.userData;
    const age=fract(stroke*.92+d.seed*7.3),grow=smooth(age/.15),fall=age*age;
    chip.visible=tool.group.visible&&age<.84;
    if(!chip.visible)continue;
    chip.position.set(impactX+Math.cos(d.dir)*(.03+grow*.39+d.speed*.12),contactY+(d.rise*.36+age*.23)-fall*.65,.95+Math.sin(d.dir)*(.08+grow*.32));
    chip.rotation.set(age*8*d.speed,age*5,age*11*d.seed);
    const size=lerp(1,.07,smooth((age-.38)/.5));chip.scale.setScalar(size);
  }
  if(e.dust){e.dust.visible=tool.group.visible;
    if(e.dust.visible){const points=e.dust.geometry.attributes.position;
      for(let i=0;i<points.count;i++){
        const seed=hash(i,11),angle=hash(i,25)*6.283,age=fract(stroke*1.3+seed*6),rad=.02+age*.44;
        points.setXYZ(i,impactX+Math.cos(angle)*rad,contactY+Math.sin(angle)*rad*.5+age*.24,.94+.12*Math.sin(angle)+age*.14);
      }points.needsUpdate=true;
    }
  }
  if(e.rough){
    e.rough.visible=carve>.05&&finishing<.99;
    e.roughPlane.constant=4.5;
    e.carveRevealPlane.constant=-lerp(3.6,-.35,carve);
  }
  if(e.polished){
    e.polished.visible=finishing>.01;
    e.polishPlane.constant=-(lerp(3.45,-.25,finishing));
    if(finishing>=.999)e.polishPlane.constant=.5;
  }
  if(e.rough&&finishing>.005){
    // A moving reveal follows the pad, from the high edge down through the body.
    e.roughPlane.constant=lerp(3.45,-.25,finishing);
  }
  // Polishing uses a traveling hand-sized pad and a moving specular sweep.
  if(e.polishTool){
    e.polishTool.visible=finishing>.02&&finishing<.98&&!reduced.matches;
    if(e.polishTool.visible){const y=lerp(3.25,.22,finishing);
      const x=.16+.45*Math.sin(finishing*9.2);
      e.polishTool.position.set(x,y,1.12);
      e.polishTool.rotation.z=Math.sin(finishing*70)*.075;
    }
  }
  if(e.polishLight){
    e.polishLight.intensity=finishing>.02&&finishing<.98?.55:0;
    e.polishLight.position.set(.18+.38*Math.sin(finishing*9.2),lerp(3.3,.2,finishing),2.2);
  }
  // The work ends in an intentionally quiet gallery placement, not an effects shot.
  if(e.plinth){e.plinth.visible=gallery>.6;}
  e.root.rotation.set(.008*Math.sin(p*8),lerp(-.19,.15,smooth(p)),0);
  const shift=mobile()?0:1.18;
  e.camera.position.set(shift,3.1,mobile()?9.1:8.3);
  e.camera.lookAt(mobile()?0:.24,1.7,0);
  if(e.shadow)e.shadow.material.opacity=1;
  e.renderer.render(e.scene,e.camera);
}
function makePolishing(){
  const group=new THREE.Group();
  const cloth=new THREE.MeshStandardMaterial({color:0xd0cbbf,roughness:1,side:THREE.DoubleSide});
  const pad=new THREE.Mesh(new THREE.BoxGeometry(.32,.14,.12,6,2,3),cloth);
  const pos=pad.geometry.attributes.position;
  for(let i=0;i<pos.count;i++){const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);pos.setXYZ(i,x,y+.015*Math.sin(x*38+z*23),z)}
  pad.geometry.computeVertexNormals();pad.rotation.z=-.24;group.add(pad);
  const strap=new THREE.Mesh(new THREE.BoxGeometry(.26,.055,.03),new THREE.MeshStandardMaterial({color:0x8a8071,roughness:.95}));
  strap.position.z=.085;group.add(strap);
  effect.root.add(group);effect.polishTool=group;
  const light=new THREE.PointLight(0xf3f4f3,0,3,.8);effect.scene.add(light);effect.polishLight=light;
}
try{setup();makePolishing();}catch(error){console.warn('Sculpture process unavailable',error);fallback.hidden=false;host.dataset.modelError='true';}
