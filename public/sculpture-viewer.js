import * as THREE from './vendor/three.module.min.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {stoneSurfaceGLSL} from './stone-surface.js';

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const stoneNoise=`
varying vec3 vStonePosition;
float stoneHash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
float stoneNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(mix(stoneHash(i),stoneHash(i+vec3(1,0,0)),f.x),mix(stoneHash(i+vec3(0,1,0)),stoneHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(stoneHash(i+vec3(0,0,1)),stoneHash(i+vec3(1,0,1)),f.x),mix(stoneHash(i+vec3(0,1,1)),stoneHash(i+vec3(1,1,1)),f.x),f.y),f.z);}
`;
function grain(material) {
  if(!material.isMeshStandardMaterial)return;
  material.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vStonePosition;').replace('#include <begin_vertex>','#include <begin_vertex>\nvStonePosition=position;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\n'+stoneNoise).replace('#include <color_fragment>',`#include <color_fragment>
      float grainValue=stoneNoise(vStonePosition*26.0);
      float broad=stoneNoise(vStonePosition*3.4);
      float vein=pow(1.0-abs(sin((vStonePosition.x+vStonePosition.y*.53)*13.0+broad*7.0)),20.0);
      diffuseColor.rgb*=mix(.79,1.1,broad)*mix(.95,1.05,grainValue);
      diffuseColor.rgb+=vec3(.08,.069,.046)*vein;
    `);
  };
  material.customProgramCacheKey=()=> 'house-of-stone-grain-v1';
}

// Preserve the source stone colours with smooth, view-dependent reflections
// across the whole mesh, including its sides, openings and reverse surfaces.
function referenceSurface(material,extent,swatch,polish,reconstruction=false) {
  if(!material.isMeshBasicMaterial)return;
  material.toneMapped=false;
  material.onBeforeCompile=shader=>{
    shader.uniforms.referenceExtent={value:extent};shader.uniforms.stoneSwatch={value:new THREE.Vector4(...swatch)};shader.uniforms.stonePolish={value:polish};
    shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
      uniform vec3 referenceExtent;varying vec3 vReferenceNormal;varying vec3 vSourceNormal;varying vec3 vSourcePosition;varying vec3 vReferenceViewPosition;
    `).replace('#include <begin_vertex>',`#include <begin_vertex>
      vReferenceNormal=normalize(normalMatrix*normal);vSourceNormal=normalize(normal/referenceExtent);vSourcePosition=position*referenceExtent;
    `).replace('#include <project_vertex>',`#include <project_vertex>
      vReferenceViewPosition=mvPosition.xyz;
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
      uniform vec4 stoneSwatch;uniform float stonePolish;varying vec3 vReferenceNormal;varying vec3 vSourceNormal;varying vec3 vSourcePosition;varying vec3 vReferenceViewPosition;
    `).replace('#include <map_pars_fragment>',`#include <map_pars_fragment>
      ${stoneSurfaceGLSL}
    `).replace('#include <color_fragment>',`#include <color_fragment>
      diffuseColor.rgb=${reconstruction?'reconstructionStone':'polishedStone'}(diffuseColor.rgb,vSourcePosition,vSourceNormal,vReferenceNormal,vReferenceViewPosition,stonePolish);
    `);
  };
  material.customProgramCacheKey=()=> reconstruction?'house-of-stone-reconstruction-surface-v1':'house-of-stone-polished-surface-v3';
}

export function initializeViewer({root,models,works,onInteraction,reviewMode=false}) {
  const dialog=root.querySelector('#hos-model-dialog'),dialogHost=root.querySelector('#hos-model-stage');
  const dialogTitle=root.querySelector('#hos-model-title'),dialogStatus=root.querySelector('#hos-model-status');
  const reviewNote=document.createElement('p');reviewNote.className='hos-model-review-note';reviewNote.textContent='Reference-based reconstruction. Depth and unseen surfaces are inferred.';reviewNote.hidden=true;dialog.append(reviewNote);
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)'),hosts=[...root.querySelectorAll('[data-model-stage]')];
  const scenes=new Map(),manager=new THREE.LoadingManager();
  // Native image loading keeps local JPEGs reliable across Safari navigations.
  // GLTFLoader still configures the UV orientation, samplers and colour space.
  manager.addHandler(/(?:^|\/)(?:assets|models\/textures)\/[^/]+\.jpg$/i,new THREE.TextureLoader(manager));
  const loader=new GLTFLoader(manager);
  let renderer,scene,camera,sculpture,active,pending=0,unavailable=false,contextLost=false,trigger,dialogWork,interactionCounted=false;
  let yaw=-.3,pitch=0,zoom=1,lastView='',loadingHost,activationGeneration=0,dialogCleaned=true;
  const pointers=new Map();let pinchDistance=0;
  const controls=[...dialog.querySelectorAll('[data-model-control]')];
  const statusFor=host=>host===dialogHost?dialogStatus:host.parentElement.querySelector('.hos-3d-hint');
  function fallback(host,message) {
    host.dataset.modelState='unavailable';host.querySelector('.hos-3d-poster').hidden=false;
    const snapshot=host.querySelector('.hos-3d-snapshot');if(snapshot)snapshot.hidden=true;
    statusFor(host).textContent=message;
    if(host===dialogHost)controls.forEach(button=>button.disabled=true);
  }
  function makeRenderer() {
    if(renderer||unavailable)return renderer;
    try {
      const canvas=document.createElement('canvas');
      // Checking first avoids library errors in browsers that have no WebGL2.
      const context=canvas.getContext('webgl2',{alpha:true,antialias:true,powerPreference:'low-power'});
      if(!context)throw new Error('WebGL2 unavailable');
      renderer=new THREE.WebGLRenderer({canvas,context,alpha:true,antialias:true,powerPreference:'low-power'});
      renderer.setClearColor(0x000000,0);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.18;
      canvas.className='hos-3d-canvas';canvas.setAttribute('role','img');
      scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(34,1,.1,40);
      scene.add(new THREE.HemisphereLight(0xf6eddb,0x25251e,2.4));
      for(const [color,intensity,x,y,z] of [[0xffedd3,3.6,-3,5,4],[0xd9e5ff,1.8,4,3,2],[0xfffaf1,2.6,1,5,-4]]) {
        const light=new THREE.DirectionalLight(color,intensity);light.position.set(x,y,z);scene.add(light);
      }
      const shadowCanvas=document.createElement('canvas');shadowCanvas.width=shadowCanvas.height=128;
      const ctx=shadowCanvas.getContext('2d'),gradient=ctx.createRadialGradient(64,64,5,64,64,64);
      gradient.addColorStop(0,'rgba(0,0,0,.24)');gradient.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,128,128);
      const shadow=new THREE.Mesh(new THREE.PlaneGeometry(2.8,2.8),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(shadowCanvas),transparent:true,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.position.y=.001;scene.add(shadow);
      canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();contextLost=true;if(active)fallback(active,'3D is temporarily unavailable. The sculpture photos are still available.');});
      canvas.addEventListener('webglcontextrestored',()=>{contextLost=false;lastView='';if(active)active.dataset.modelState='waiting';active=null;loadingHost=null;renderer.domElement.remove();refresh();});
      canvas.addEventListener('pointerdown',pointerDown);canvas.addEventListener('pointermove',pointerMove);
      for(const name of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(name,pointerUp);
      canvas.addEventListener('wheel',event=>{
        if(active!==dialogHost)return;event.preventDefault();zoom=clamp(zoom*Math.exp(-event.deltaY*.001),.65,1.8);interacted();refresh();
      },{passive:false});
      canvas.addEventListener('keydown',event=>{
        if(active!==dialogHost)return;
        const keyMap={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up',ArrowDown:'down','+':'in','=':'in','-':'out',Home:'reset','0':'reset'};
        if(keyMap[event.key]){event.preventDefault();control(keyMap[event.key]);}
      });
    } catch {
      unavailable=true;
    }
    return renderer;
  }
  function model(id) {
    if(scenes.has(id))return scenes.get(id);
    const entry=models[id];
    const request=loader.loadAsync(new URL(entry.file,location.href).href).then(gltf=>{
      const group=gltf.scene,box=new THREE.Box3().setFromObject(group),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
      if(!Number.isFinite(size.length())||size.y<=0)throw new Error('Invalid model bounds');
      const scale=3.05/Math.max(size.y,size.x*.95,size.z*.95);group.scale.multiplyScalar(scale);
      group.position.set(-center.x*scale,-box.min.y*scale+.02,-center.z*scale);
      if(entry.stoneGrain)group.traverse(node=>{if(node.isMesh)for(const material of Array.isArray(node.material)?node.material:[node.material])grain(material);});
      if(entry.referenceSurface)group.traverse(node=>{if(node.isMesh)for(const material of Array.isArray(node.material)?node.material:[node.material])referenceSurface(material,(entry.reconstruction && node.parent?.scale?node.parent.scale:node.scale).clone(),entry.stoneSwatch,entry.stonePolish ?? 1,entry.reconstruction===true);});
      const pose=new THREE.Group();pose.rotation.y=entry.referenceYaw||0;pose.add(group);
      const turntable=new THREE.Group();turntable.add(pose);return turntable;
    }).catch(error=>{scenes.delete(id);throw error;});
    scenes.set(id,request);return request;
  }
  function saveFrame() {
    if(!active||!renderer||!sculpture||contextLost)return;
    const snapshot=active.querySelector('.hos-3d-snapshot');
    if(snapshot){
      renderer.render(scene,camera);snapshot.width=renderer.domElement.width;snapshot.height=renderer.domElement.height;
      snapshot.getContext('2d').drawImage(renderer.domElement,0,0);snapshot.hidden=false;
    }
  }
  function chooseHost() {
    if(dialog.open)return dialogHost;
    let best=null,distance=Infinity;
    for(const host of hosts) {
      if(!host.getClientRects().length)continue;
      const rect=host.getBoundingClientRect();if(rect.bottom<=0||rect.top>=innerHeight)continue;
      const value=Math.abs(rect.top+rect.height/2-innerHeight/2);if(value<distance){best=host;distance=value;}
    }
    return best;
  }
  async function activate(host) {
    if(host===active&&host.dataset.modelId===active.dataset.loadedModel)return;
    const generation=++activationGeneration,id=host.dataset.modelId;
    saveFrame();if(renderer?.domElement.parentElement)renderer.domElement.remove();
    active=null;lastView='';loadingHost=host;
    if(!makeRenderer()||contextLost){fallback(host,'3D is unavailable in this browser. You can still explore the sculpture photos.');loadingHost=null;return;}
    host.dataset.modelState='loading';statusFor(host).textContent='Loading 3D view…';
    try {
      const object=await model(id);
      if(generation!==activationGeneration||loadingHost!==host||host.dataset.modelId!==id||chooseHost()!==host)return;
      if(sculpture)scene.remove(sculpture);sculpture=object;scene.add(sculpture);active=host;loadingHost=null;
      host.dataset.loadedModel=id;host.append(renderer.domElement);
      renderer.domElement.tabIndex=host===dialogHost?0:-1;
      renderer.domElement.setAttribute('aria-label',host===dialogHost?`${dialogTitle.textContent}. Arrow keys rotate, plus and minus zoom, Home resets.`:`3D view of ${models[host.dataset.modelId].title}`);
      renderer.domElement.style.touchAction=host===dialogHost?'none':'auto';
      host.querySelector('.hos-3d-poster').hidden=true;const snapshot=host.querySelector('.hos-3d-snapshot');if(snapshot)snapshot.hidden=true;
      host.dataset.modelState='ready';
      statusFor(host).textContent=host===dialogHost?'Drag to rotate · Pinch or use the controls to zoom':reduced.matches?'Explore the form in 3D':'Scroll to rotate';
      if(host===dialogHost)controls.forEach(button=>button.disabled=false);
      refresh();
    } catch {
      if(generation===activationGeneration&&loadingHost===host){loadingHost=null;fallback(host,'The 3D view could not load. The sculpture photos are still available.');}
    }
  }
  function paint() {
    pending=0;if(document.hidden)return;
    const host=chooseHost();
    if(!host){saveFrame();renderer?.domElement.remove();active=null;loadingHost=null;return;}
    if(host!==active||host.dataset.loadedModel!==host.dataset.modelId){if(loadingHost!==host&&host.dataset.modelState!=='unavailable')void activate(host);return;}
    if(contextLost)return;
    const rect=host.getBoundingClientRect();if(!rect.width||!rect.height)return;
    const rotation=host===dialogHost?yaw:reduced.matches?-.3:((innerHeight-rect.top)/(innerHeight+rect.height)-.5)*Math.PI*2-.3;
    const view=[Math.round(rect.width),Math.round(rect.height),rotation,pitch,zoom,host===dialogHost].join(':');if(view===lastView)return;lastView=view;
    renderer.setPixelRatio(Math.min(devicePixelRatio||1,2,2048/Math.max(rect.width,rect.height)));renderer.setSize(rect.width,rect.height,false);
    camera.aspect=rect.width/rect.height;
    const distance=Math.max(6.8,3.8/camera.aspect)/(host===dialogHost?zoom:1),elevation=host===dialogHost?pitch:0;
    camera.position.set(0,1.62+Math.sin(elevation)*distance,Math.cos(elevation)*distance);camera.lookAt(0,1.62,0);camera.updateProjectionMatrix();
    sculpture.rotation.set(0,rotation,0);renderer.render(scene,camera);
    const textureWidths=[];sculpture.traverse(node=>{if(node.isMesh)for(const material of Array.isArray(node.material)?node.material:[node.material])if(material.map?.image)textureWidths.push(material.map.image.width);});
    host.dataset.modelTextureWidth=String(textureWidths.length?Math.min(...textureWidths):0);
    host.dataset.modelFrames=String(Number(host.dataset.modelFrames || 0)+1);
    host.dataset.modelRotation=String(rotation);host.dataset.modelPitch=String(host===dialogHost?pitch:0);host.dataset.modelZoom=String(host===dialogHost?zoom:1);host.dataset.modelTriangles=String(renderer.info.render.triangles);
  }
  function refresh(){if(!pending)pending=requestAnimationFrame(paint);}
  function interacted(){if(!interactionCounted){interactionCounted=true;onInteraction?.(dialogWork.id);}}
  function pointerDown(event) {
    if(active!==dialogHost||event.button!==0)return;
    renderer.domElement.setPointerCapture(event.pointerId);pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if(pointers.size===2){const [a,b]=[...pointers.values()];pinchDistance=Math.hypot(a.x-b.x,a.y-b.y);}interacted();
  }
  function pointerMove(event) {
    if(active!==dialogHost||!pointers.has(event.pointerId))return;
    const previous=pointers.get(event.pointerId);pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if(pointers.size===2){const [a,b]=[...pointers.values()],distance=Math.hypot(a.x-b.x,a.y-b.y);if(pinchDistance>0)zoom=clamp(zoom*distance/pinchDistance,.65,1.8);pinchDistance=distance;}
    else if(pointers.size===1){yaw+=(event.clientX-previous.x)*.009;pitch=clamp(pitch+(event.clientY-previous.y)*.006,-.18,.9);}
    refresh();
  }
  function pointerUp(event){pointers.delete(event.pointerId);pinchDistance=0;}
  function control(action) {
    if(active!==dialogHost||contextLost)return;
    if(action==='left')yaw-=.24;if(action==='right')yaw+=.24;if(action==='up')pitch=clamp(pitch+.14,-.18,.9);if(action==='down')pitch=clamp(pitch-.14,-.18,.9);
    if(action==='in')zoom=clamp(zoom*1.16,.65,1.8);if(action==='out')zoom=clamp(zoom/1.16,.65,1.8);if(action==='reset'){yaw=-.3;pitch=0;zoom=1;}
    interacted();refresh();
  }
  function finishClose() {
    if(dialog.open||dialogCleaned)return;
    dialogCleaned=true;activationGeneration++;document.body.classList.remove('hos-model-open');pointers.clear();loadingHost=null;active=null;renderer?.domElement.remove();trigger?.focus({preventScroll:true});refresh();
  }
  function close() {
    if(!dialog.open)return;saveFrame();dialog.close();finishClose();
  }
  dialog.addEventListener('close',finishClose);
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const b=dialog.getBoundingClientRect();if(event.clientX<b.left||event.clientX>b.right||event.clientY<b.top||event.clientY>b.bottom)close();});
  root.querySelector('#hos-model-close').addEventListener('click',close);
  controls.forEach(button=>button.addEventListener('click',()=>control(button.dataset.modelControl)));
  reduced.addEventListener('change',()=>{lastView='';if(active&&active!==dialogHost)statusFor(active).textContent=reduced.matches?'Explore the form in 3D':'Scroll to rotate';refresh();});
  addEventListener('scroll',refresh,{passive:true});addEventListener('resize',refresh,{passive:true});document.addEventListener('visibilitychange',refresh);
  new ResizeObserver(refresh).observe(dialogHost);
  const observer=new IntersectionObserver(entries=>{for(const entry of entries)if(!unavailable&&entry.isIntersecting&&models[entry.target.dataset.modelId]&&makeRenderer())void model(entry.target.dataset.modelId).catch(()=>{});refresh();},{rootMargin:'200px',threshold:[0,.1,.5,1]});hosts.forEach(host=>observer.observe(host));
  refresh();
  return {refresh,close,observe(elements){for(const host of elements)if(!hosts.includes(host)){hosts.push(host);observer.observe(host);}for(let i=hosts.length-1;i>=0;i--)if(!hosts[i].isConnected){observer.unobserve(hosts[i]);hosts.splice(i,1);}refresh();},open(work,button,poster){
    reviewNote.hidden=!(reviewMode && models[work.id]?.reconstruction);
    dialogWork=work;trigger=button;yaw=-.3;pitch=0;zoom=1;interactionCounted=false;pointers.clear();
    dialogTitle.textContent=work.title;dialogHost.dataset.modelId=work.id;dialogHost.dataset.modelState='waiting';
    dialogHost.querySelector('.hos-3d-poster').src=poster;dialogHost.querySelector('.hos-3d-poster').hidden=false;
    controls.forEach(button=>button.disabled=true);dialogStatus.textContent='Loading 3D view…';
    document.body.style.setProperty('--hos-scrollbar',`${Math.max(0,innerWidth-document.documentElement.clientWidth)}px`);document.body.classList.add('hos-model-open');
    dialogCleaned=false;dialog.showModal();root.querySelector('#hos-model-close').focus({preventScroll:true});refresh();
  }};
}

