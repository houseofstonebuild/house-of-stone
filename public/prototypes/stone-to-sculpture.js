import * as THREE from '/vendor/three.module.min.js';
import {GLTFLoader} from '/vendor/GLTFLoader.js';
import {MeshoptDecoder} from '/vendor/meshopt_decoder.js';

const host=document.getElementById('render'),stage=document.querySelector('.stage'),journey=document.querySelector('.journey');
const fallback=document.getElementById('fallback'),title=document.getElementById('stage-title'),description=document.getElementById('stage-description');
const phase=document.getElementById('phase'),counter=document.getElementById('counter'),progressFill=document.getElementById('progress-fill');
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const phases=[
 ['THE MATERIAL','It begins with stone.','A rough block holds the possibility of a form not yet visible.'],
 ['THE FIRST MARKS','The form is considered.','The artist studies the stone and establishes a direction before removing material.'],
 ['CARVING','Material is removed.','Hammer, chisel and repeated decisions bring the silhouette into view.'],
 ['REFINEMENT','The surface is worked.','Edges, openings and curves are refined before the stone receives its finish.'],
 ['THE FINISHED WORK','Coil.','An original sculpture from the House of Mabwe collection, shown using its existing 3D model.']
];
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x)};
const mix=(a,b,t)=>a+(b-a)*t;
let scene,camera,renderer,root,polished,rough,block,marks,fragments=[],shadow,progress=0,lastStage=-1,frame=0;
const mobile=()=>innerWidth<750;
const active=()=>{const rect=journey.getBoundingClientRect();return clamp(-rect.top/Math.max(1,journey.offsetHeight-innerHeight))};
function setup(){
 const canvas=document.createElement('canvas');canvas.setAttribute('aria-hidden','true');host.append(canvas);
 const context=canvas.getContext('webgl2',{alpha:true,antialias:true,powerPreference:'low-power'});
 if(!context)throw Error('3D unavailable');
 renderer=new THREE.WebGLRenderer({canvas,context,alpha:true,antialias:true,powerPreference:'low-power'});
 renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;
 renderer.setPixelRatio(Math.min(devicePixelRatio,mobile()?1.5:2));
 scene=new THREE.Scene();scene.fog=new THREE.FogExp2(0x343532,.028);
 camera=new THREE.PerspectiveCamera(mobile()?36:31,1,.1,100);
 scene.add(new THREE.HemisphereLight(0xf6eddb,0x292b2a,2.7));
 for(const [c,i,x,y,z] of [[0xffe8ca,3.5,-4,7,6],[0xd9e7ff,1.8,5,4,3],[0xffffff,2.1,1,6,-5]]){
  const light=new THREE.DirectionalLight(c,i);light.position.set(x,y,z);scene.add(light);
 }
 root=new THREE.Group();scene.add(root);
 const floor=new THREE.Mesh(new THREE.PlaneGeometry(50,50),new THREE.MeshStandardMaterial({color:0x44433e,roughness:1}));
 floor.rotation.x=-Math.PI/2;floor.position.y=-.05;scene.add(floor);
 const blockMaterial=new THREE.MeshStandardMaterial({color:0x89887f,roughness:1,flatShading:true,transparent:true,opacity:1,depthWrite:true});
 block=new THREE.Group();root.add(block);
 const pieceGeo=new THREE.BoxGeometry(1,1,1,3,4,3);
 const position=pieceGeo.attributes.position;
 for(let i=0;i<position.count;i++){
   const x=position.getX(i),y=position.getY(i),z=position.getZ(i);
   const n=Math.sin(x*13.7+y*8.3+z*17.1)*.035+Math.sin(x*26.3-z*11.2)*.018;
   position.setXYZ(i,x+n,y+n*.8,z+n);
 }
 pieceGeo.computeVertexNormals();
 const rows=5,cols=3,depth=2;
 for(let y=0;y<rows;y++)for(let x=0;x<cols;x++)for(let z=0;z<depth;z++){
   const part=new THREE.Mesh(pieceGeo,blockMaterial.clone());
   part.scale.set(1.28/cols*1.035,3.2/rows*1.035,1.18/depth*1.04);
   part.position.set((x-(cols-1)/2)*1.28/cols,(y+.5)*3.2/rows,(z-(depth-1)/2)*1.18/depth);
   part.userData={origin:part.position.clone(),offset:new THREE.Vector3(Math.sin(x*4+y*7+z)*1.5,(y/rows-.5)*1.6+.5,Math.cos(z*5+y*3+x)*1.2)};
   block.add(part);fragments.push(part);
 }
 marks=new THREE.Group();root.add(marks);
 const chalk=new THREE.LineBasicMaterial({color:0xdad5c8,transparent:true,opacity:0,depthTest:false});
 for(let j=0;j<3;j++){
   const points=[];for(let i=0;i<=90;i++){
     const a=i/90*Math.PI*2;
     points.push(new THREE.Vector3(.66*Math.sin(a)*(.7+.15*j),1.1+j*.55+.18*Math.cos(a*2),.64));
   }
   marks.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),chalk));
 }
 const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
 loader.load('/models/coil-uploaded-v1.glb',gltf=>{
   polished=gltf.scene;
   const bounds=new THREE.Box3().setFromObject(polished),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
   if(!Number.isFinite(size.y)||size.y<=0)throw Error('Invalid sculpture bounds');
   const scale=3.05/Math.max(size.y,size.x*.95,size.z*.95);
   polished.scale.multiplyScalar(scale);polished.position.set(-center.x*scale,-bounds.min.y*scale,-center.z*scale);
   polished.visible=false;root.add(polished);
   rough=polished.clone(true);
   rough.traverse(o=>{if(o.isMesh){
     const material=new THREE.MeshStandardMaterial({color:0x666861,roughness:1,metalness:0,flatShading:true,transparent:true,opacity:1});
     o.material=material;
   }});
   rough.visible=false;root.add(rough);
   render();
 },undefined,()=>{fallback.hidden=false;canvas.style.display='none';});
 resize();addEventListener('resize',resize,{passive:true});addEventListener('scroll',schedule,{passive:true});
 document.getElementById('skip').addEventListener('click',()=>document.getElementById('finished').scrollIntoView({behavior:reduced.matches?'instant':'smooth'}));
 schedule();
}
function resize(){if(!renderer)return;const w=host.clientWidth,h=host.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.fov=mobile()?37:31;camera.updateProjectionMatrix();schedule()}
function schedule(){if(frame)return;frame=requestAnimationFrame(()=>{frame=0;render()})}
function render(){
 if(!renderer)return;
 progress=active();
 const step=Math.min(4,Math.floor(progress*5));
 if(step!==lastStage){lastStage=step;phase.textContent=phases[step][0];title.textContent=phases[step][1];description.textContent=phases[step][2];counter.textContent=String(step+1).padStart(2,'0')+' / 05';stage.dataset.phase=String(step)}
 progressFill.style.width=(progress*100).toFixed(1)+'%';
 const carve=smooth((progress-.26)/.35),refine=smooth((progress-.55)/.18),finish=smooth((progress-.73)/.18);
 for(const part of fragments){
   const t=carve;
   part.position.copy(part.userData.origin).addScaledVector(part.userData.offset,t*1.8);
   part.rotation.set(t*.18*Math.sin(part.userData.origin.x*5),t*.25*Math.cos(part.userData.origin.y*3),t*.28);
   part.scale.set(1.28/3*1.035,3.2/5*1.035,1.18/2*1.04).multiplyScalar(Math.max(.001,1-smooth((t-.3)/.7)*.95));
   part.material.opacity=1-smooth((t-.3)/.6);
   part.visible=part.material.opacity>.02;
 }
 marks.visible=progress>.12&&progress<.43;
 marks.children.forEach(line=>line.material.opacity=Math.min(smooth((progress-.13)/.1),1-smooth((progress-.34)/.09))*.85);
 if(rough){rough.visible=carve>.05&&finish<.98;rough.traverse(o=>{if(o.isMesh)o.material.opacity=clamp(carve*1.4)*(1-finish)});}
 if(polished){polished.visible=finish>.01;polished.traverse(o=>{if(o.isMesh){for(const m of Array.isArray(o.material)?o.material:[o.material]){if(m){m.transparent=finish<.99;m.opacity=finish;m.depthWrite=finish>.85;}}}});}
 const yaw=mix(-.28,.26,smooth(progress)),pitch=.03+.05*Math.sin(progress*6);
 root.rotation.set(pitch,yaw,0);
 const dist=mobile()?8.6:7.8;
 camera.position.set(mobile()?0:1.6,3.15,dist);
 camera.lookAt(mobile()?0:.45,1.65,0);
 renderer.render(scene,camera);
}
try{setup()}catch(error){fallback.hidden=false;console.warn('3D study unavailable',error)}
