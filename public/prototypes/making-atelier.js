import {createFrameStream} from './scroll-frame-stream.js';
const $=selector=>document.querySelector(selector);
const clamp=x=>Math.max(0,Math.min(1,x));
const mix=(a,b,t)=>a+(b-a)*t;
const smooth=x=>{x=clamp(x);return x*x*(3-2*x)};
const phone=()=>innerWidth<=700||(innerWidth<=1100&&innerHeight>innerWidth);
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const scenes=[...document.querySelectorAll('[data-scene]')];
const articles=[...document.querySelectorAll('[data-step]')];
const buttons=[...document.querySelectorAll('[data-go]')];
// One camera and one frame stream from the untouched block to the last polish.
// The frame ranges follow the source generator's physical carving intervals.
const steps=[
 {name:'mark',start:45,end:53}, {name:'carve',start:54,end:94},
 {name:'sand',start:95,end:113}, {name:'heat',start:114,end:123},
 {name:'wax',start:124,end:138}, {name:'work',start:139,end:143}
];
let readings=[],dirty=true,raf=0,currentScene='',currentStep='',lastInput=0;
let processProgress=0,tools=null,toolsLoading=false,toolsError=false,approved=null,approvedLoading=false;
let approvedProfile=null,viewportWidth=innerWidth;
let approvedTimer=0,toolTimer=0,active=false,filmActive=false,toolFrame=0;
let frameImage=null,displayedFrame=-1;
const art=$('#processArt'),workshop=$('#workshopMedia'),host=$('#approvedHost');
const route=$('#mapRoute'),routeLength=route.getTotalLength();
route.style.strokeDasharray=String(routeLength);
const routeSamples=Array.from({length:101},(_,i)=>{const p=route.getPointAtLength(routeLength*i/100);return {x:p.x,y:p.y}});
const processStream=createFrameStream({stage:art,image:$('#processFrame'),mobile:phone,
 src:(i,profile)=>'/assets/making-v7/'+profile+'/frame_'+String(i).padStart(3,'0')+'.webp',
 onDisplay:(i,img)=>{displayedFrame=i;frameImage=img;paintTools();queue();}});
const filmStream=createFrameStream({stage:workshop,image:$('#documentaryFrame'),mobile:phone,
 src:i=>'/assets/making-cinema-frames-v4/frame_'+String(i).padStart(3,'0')+'.webp',
 position:()=>({x:25,y:46})});
filmStream.configure({frames:200});
function layout(){
 readings=scenes.map(el=>({el,name:el.dataset.scene,top:el.getBoundingClientRect().top+scrollY,
  height:el.offsetHeight,span:Math.max(1,el.offsetHeight-innerHeight)}));
 dirty=false;
}
function stepAt(p){const t=clamp(p)*6,index=Math.min(5,Math.floor(t));return {index,local:Math.min(1,t-index),step:steps[index]};}
function setStep(index){
 const next=steps[index].name;if(currentStep===next)return;currentStep=next;
 for(const article of articles){const yes=article.dataset.step===next;article.classList.toggle('is-current',yes);if(!reduced.matches)article.setAttribute('aria-hidden',String(!yes));else article.removeAttribute('aria-hidden');}
 for(const button of buttons){if(button.dataset.go===next)button.setAttribute('aria-current','step');else button.removeAttribute('aria-current');}
 $('#stepCounter').textContent=String(index+1).padStart(2,'0')+' / 06';
 art.dataset.step=next;
}
function idleNearProcess(kind){
 const isTools=kind==='tools';
 if((isTools&&(tools||toolsLoading||toolsError||toolTimer))||(!isTools&&(approved||approvedLoading||approvedTimer)))return;
 const check=()=>{
  if(isTools)toolTimer=0;else approvedTimer=0;
  if(document.hidden||reduced.matches)return;
  const process=readings.find(r=>r.name==='process');
  if(!process||scrollY+innerHeight*2<process.top||scrollY>process.top+process.height)return;
  if(performance.now()-lastInput<180){if(isTools)toolTimer=setTimeout(check,200);else approvedTimer=setTimeout(check,240);return;}
  if(isTools){
   toolsLoading=true;
   createWorkshopTools($('#toolStage')).then(result=>{tools=result;toolsLoading=false;paintTools();}).catch(error=>{toolsError=true;toolsLoading=false;art.dataset.tools='unavailable';console.warn('Workshop tool study unavailable',error)});
  }else{
   approvedLoading=true;approvedProfile=phone()?'portrait':'landscape';
   if(phone()){
    host.dataset.approvedModelState='loading';
    host.querySelector('.approved-poster').decode().then(()=>{
     approved={resize(){},update(){}};host.dataset.approvedModelState='ready';
     host.dataset.approvedSource='/models/coil-uploaded-v1.glb';queue();
    }).catch(()=>{host.dataset.approvedModelState='fallback';});
    return;
   }
   import('./approved-coil-reveal.js').then(mod=>{
    approved=mod.createApprovedCoilReveal(host,state=>{host.dataset.approvedModelState=state;queue();});
    approved.update(.999);alignApproved();host.dataset.approvedSource='/models/coil-uploaded-v1.glb';
   }).catch(error=>{host.dataset.approvedModelState='fallback';console.warn('Approved Coil presentation unavailable',error)});
  }
 };
 if(isTools)toolTimer=setTimeout(check,200);else approvedTimer=setTimeout(check,260);
}
function paintTools(){
 if(!tools||!frameImage)return;
 const selected=stepAt(processProgress);
 // Do not animate a tool against a frame from another stage after a fast jump.
 const matches=displayedFrame>=selected.step.start&&displayedFrame<=selected.step.end;
 tools.update(matches&&active?selected.step.name:'none',selected.local,frameImage);
 art.dataset.tools=tools.state;
}
function renderProcess(p,visible){
 processProgress=p;active=visible;
 const {index,local,step}=stepAt(p);setStep(index);
 const frame=Math.round(mix(step.start,step.end,local));
 art.dataset.phaseProgress=p.toFixed(5);
 art.dataset.source='/models/coil-uploaded-v1.glb';
 if(!reduced.matches)processStream.request(frame,visible);
 if(visible){idleNearProcess('tools');if(p>.48)idleNearProcess('approved');}
 // The exact approved sculpture occupies the same stage. Reverse scrolling
 // always restores the source-derived frame, even while the GLB is loading.
 const finalAlpha=index===5?smooth((local-.03)/.32):0;
 const exactReady=host.dataset.approvedModelState==='ready';
 host.style.opacity=String(exactReady?finalAlpha:0);
 host.setAttribute('aria-hidden',String(!(exactReady&&finalAlpha>.5)));
 processStream.canvas.style.opacity=displayedFrame>=0?'1':'0';
 paintTools();
}
function renderOrigin(p){
 const t=reduced.matches?1:smooth((p-.14)/.75),sample=routeSamples[Math.round(t*100)];
 route.style.strokeDashoffset=String(routeLength*(1-t));
 $('#routeStone').setAttribute('cx',sample.x);$('#routeStone').setAttribute('cy',sample.y);
 $('.origin-map').style.transform='scale('+mix(1,phone()?1.12:1.28,smooth(p)).toFixed(4)+')';
}
function update(){
 raf=0;if(document.hidden)return;if(dirty)layout();
 const y=scrollY,view=innerHeight;let scene='introduction',processNear=false;
 $('#readingProgress').style.transform='scaleX('+clamp(y/Math.max(1,document.documentElement.scrollHeight-view)).toFixed(5)+')';
 for(const r of readings){
  if(y+view*.5>=r.top)scene=r.name;
  const visible=y+view>r.top&&y<r.top+r.height;
  const near=y+view*1.8>r.top&&y<r.top+r.height+view*.2;
  const p=clamp((y-r.top)/r.span);
  if(r.name==='process'){processNear=near;if(near)renderProcess(p,visible);else if(active){active=false;processStream.suspend();tools?.hide();}continue;}
  if(r.name==='carving'){
   filmActive=visible;
   if(near&&!reduced.matches)filmStream.request(Math.round(p*199),true);else filmStream.suspend();
   r.el.dataset.progress=p.toFixed(5);
  }
  if(!near)continue;
  if(r.name==='introduction'&&!reduced.matches)r.el.style.setProperty('--opening-scale',mix(1,1.035,p).toFixed(4));
  if(r.name==='origin')renderOrigin(p);
  if(r.name==='material')$('.material-second').style.opacity=String(!reduced.matches&&p>=.55?1:0);
 }
 if(processNear)idleNearProcess('tools');
 if(scene!==currentScene){currentScene=scene;document.body.dataset.currentScene=scene;}
}
function queue(){if(!raf&&!document.hidden)raf=requestAnimationFrame(update);}
function scrollInput(){lastInput=performance.now();queue();}
for(const button of buttons)button.addEventListener('click',()=>{
 if(dirty)layout();const r=readings.find(r=>r.name==='process');
 const index=steps.findIndex(s=>s.name===button.dataset.go);
 scrollTo({top:Math.round(r.top+r.span*(index+.48)/6),behavior:'instant'});
 queue();
});
function alignApproved(){
 const layer=host.querySelector('.approved-coil-reveal');
 if(layer&&!phone()){
  const scale=Math.max(art.clientWidth/1280,art.clientHeight/720);
  layer.style.transform='translateX('+Math.round(1280*scale*.15)+'px)';
 }
}
function resize(){
 const keepProgress=active&&!reduced.matches&&viewportWidth!==innerWidth;viewportWidth=innerWidth;
 const previousProgress=processProgress;
 dirty=true;processStream.resize();filmStream.resize();tools?.resize();
 if(keepProgress){layout();const r=readings.find(r=>r.name==='process');scrollTo({top:Math.round(r.top+r.span*previousProgress),behavior:'instant'});}
 const next=phone()?'portrait':'landscape';
 if(approvedProfile&&approvedProfile!==next){
  approved?.dispose?.();host.querySelector('.approved-coil-reveal')?.remove();
  approved=null;approvedLoading=false;approvedProfile=null;host.dataset.approvedModelState='idle';
 }
 approved?.resize();if(approved)approved.update(.999);alignApproved();queue();
}
addEventListener('scroll',scrollInput,{passive:true});
addEventListener('resize',resize,{passive:true});
addEventListener('orientationchange',resize,{passive:true});
addEventListener('pageshow',()=>{dirty=true;queue()});
addEventListener('load',()=>{dirty=true;queue()},{once:true});
document.fonts?.ready?.then(()=>{dirty=true;queue()});
document.addEventListener('visibilitychange',()=>{
 if(document.hidden){if(raf)cancelAnimationFrame(raf);raf=0;clearTimeout(toolTimer);clearTimeout(approvedTimer);toolTimer=approvedTimer=0;processStream.suspend();filmStream.suspend();tools?.hide();}
 else {dirty=true;queue();}
});
reduced.addEventListener('change',()=>{
 for(const article of articles)article.removeAttribute('aria-hidden');
 currentStep='';if(reduced.matches){processStream.suspend();filmStream.suspend();tools?.hide();}
 resize();
});
// Observe only while the story is in motion; no perpetual RAF polling on idle.
window.__mabweMaking={get chapter(){return currentScene},get step(){return currentStep},get progress(){return processProgress}};
window.__mabwePerformance=()=>({process:processStream.stats(),film:filmStream.stats(),
 tools:tools?.stats()||{state:toolsError?'unavailable':toolsLoading?'loading':'idle'},
 approved:host.dataset.approvedModelState||'idle',active,filmActive,chapter:currentScene,step:currentStep});
document.documentElement.classList.add('js');
setStep(0);queue();document.documentElement.dataset.makingAtelier='ready';

// Low-complexity, physically lit tools. They use the same fixed camera space as
// the source photograph; their contact point is sampled from the displayed stone.
// No timer drives them: scroll position determines every tool pose and flame.
async function createWorkshopTools(stage){
 const T=await import('/vendor/three.module.min.js');
 const canvas=document.createElement('canvas');canvas.setAttribute('aria-hidden','true');stage.append(canvas);
 const surface=document.createElement('canvas');
 const paint=canvas.getContext('2d',{alpha:true,desynchronized:true});
 const renderer=new T.WebGLRenderer({canvas:surface,alpha:true,antialias:false,preserveDrawingBuffer:true,powerPreference:'low-power'});
 renderer.setClearColor(0,0);renderer.outputColorSpace=T.SRGBColorSpace;
 renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.2;
 const scene=new T.Scene(),camera=new T.OrthographicCamera(0,1,1,0,-1000,1000);
 camera.position.z=600;
 scene.add(new T.HemisphereLight(0xe7e7dc,0x303a2d,2.1));
 for(const [color,intensity,x,y,z] of [[0xffedcf,3,-400,500,500],[0xd7e2ed,1.4,400,250,300]]){const light=new T.DirectionalLight(color,intensity);light.position.set(x,y,z);scene.add(light);}
 const metal=new T.MeshStandardMaterial({color:0x777d78,metalness:.78,roughness:.38});
 const edge=new T.MeshStandardMaterial({color:0xaeb2a9,metalness:.88,roughness:.29});
 const dark=new T.MeshStandardMaterial({color:0x252a27,metalness:.28,roughness:.76});
 const brass=new T.MeshStandardMaterial({color:0x93743c,metalness:.76,roughness:.36});
 const woodCanvas=document.createElement('canvas');woodCanvas.width=64;woodCanvas.height=256;
 const wc=woodCanvas.getContext('2d');wc.fillStyle='#83603c';wc.fillRect(0,0,64,256);
 let seed=29;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
 for(let n=0;n<180;n++){wc.strokeStyle='rgba('+(rand()>.5?'40,25,13':'202,160,100')+','+(rand()*.25)+')';wc.lineWidth=.3+rand();wc.beginPath();const x=rand()*64;wc.moveTo(x,0);wc.bezierCurveTo(x+rand()*6,80,x-4,190,x+2,256);wc.stroke();}
 const woodTex=new T.CanvasTexture(woodCanvas);woodTex.colorSpace=T.SRGBColorSpace;
 const wood=new T.MeshStandardMaterial({map:woodTex,roughness:.86});
 const grit=new T.MeshStandardMaterial({color:0x7d6950,roughness:1});
 const clothMat=new T.MeshStandardMaterial({color:0xb9b3a1,roughness:1,side:T.DoubleSide});
 const groups={};
 const mesh=(geometry,material,parent,x=0,y=0,z=0)=>{const m=new T.Mesh(geometry,material);m.position.set(x,y,z);parent.add(m);return m};
 const cyl=(r1,r2,h,material,parent,x=0,y=0,z=0,sides=12)=>mesh(new T.CylinderGeometry(r1,r2,h,sides),material,parent,x,y,z);
 const group=()=>{const g=new T.Group();scene.add(g);return g};
 // Stone-carving chisel: solid forged steel, a hexagonal shaft and worn butt.
 const chisel=group();cyl(4.4,3.2,112,metal,chisel,0,65,0,6);
 mesh(new T.BoxGeometry(11,12,3.2),edge,chisel,0,7,1);
 cyl(6.5,5.5,9,dark,chisel,0,125,0);cyl(6.8,6.8,2.8,edge,chisel,0,130,0);
 for(let j=0;j<3;j++)mesh(new T.BoxGeometry(.65,70,.5),edge,chisel,-2+j*2,68,3.1);
 const hammer=group();
 const handle=cyl(7,5.7,145,wood,hammer,36,-64,0,14);handle.rotation.z=.51;
 cyl(8.1,8.1,13,dark,hammer,3,-7,0);
 const head=cyl(13.5,13.5,59,metal,hammer,0,5,0,12);head.rotation.z=Math.PI/2;
 for(const x of [-29,29]){const cap=cyl(13,13,3.8,edge,hammer,x,5,0,16);cap.rotation.z=Math.PI/2;}
 mesh(new T.BoxGeometry(2,13,6),dark,hammer,0,8,12);
 groups.carve=[chisel,hammer];
 // A folded abrasive strip. Fine surface grain is fixed to the tool.
 const sanding=group();const pad=mesh(new T.BoxGeometry(49,34,8,6,4,1),grit,sanding);pad.rotation.set(.12,-.3,.15);
 for(let j=0;j<60;j++)mesh(new T.BoxGeometry(.7,.8,.4),dark,sanding,(rand()-.5)*43,(rand()-.5)*28,5+rand());
 groups.sand=[sanding];
 const torch=group();
 const tube=cyl(5.4,5.4,97,brass,torch,58,0,0);tube.rotation.z=Math.PI/2;
 const nozzle=cyl(8.7,6.5,24,metal,torch,1,0,0,16);nozzle.rotation.z=Math.PI/2;
 for(const x of [11,16,21]){const ring=cyl(7,7,2,brass,torch,x,0,0,16);ring.rotation.z=Math.PI/2;}
 const grip=cyl(12,10,100,dark,torch,125,-37,0);grip.rotation.z=.35;
 const dial=cyl(13,13,7,dark,torch,100,18,0,12);dial.rotation.x=Math.PI/2;
 const flameMat=new T.ShaderMaterial({transparent:true,depthWrite:false,blending:T.AdditiveBlending,
  uniforms:{u:{value:0}},vertexShader:'varying vec2 v; void main(){v=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader:'varying vec2 v; uniform float u; void main(){float x=v.x;float w=.08+.30*x;float d=abs(v.y-.5+sin(x*20.+u*40.)*.018);float a=(1.-smoothstep(w*.25,w,d))*smoothstep(0.,.2,x)*(1.-smoothstep(.92,1.,x));vec3 c=mix(vec3(.06,.24,.95),vec3(.52,.81,1.),pow(x,3.));gl_FragColor=vec4(c,a*.8);}' });
 const flame=mesh(new T.PlaneGeometry(55,33),flameMat,torch,-37,0,5);
 groups.heat=[torch];
 const cloth=group();
 const clothGeo=new T.PlaneGeometry(56,46,14,12),pos=clothGeo.attributes.position;
 for(let i=0;i<pos.count;i++){const x=pos.getX(i),y=pos.getY(i);pos.setZ(i,Math.sin(x*.19)*2.7+Math.cos(y*.29)*2+Math.cos(x*.1+y*.11)*4);}
 clothGeo.computeVertexNormals();mesh(clothGeo,clothMat,cloth);cloth.rotation.set(.2,-.45,-.25);groups.wax=[cloth];
 let w=0,h=0,drawCount=0,state='ready',lastKey='';
 const sample=document.createElement('canvas');sample.width=128;sample.height=128;
 const sc=sample.getContext('2d',{willReadFrequently:true});
 let sourceImage=null,pixels=null,finishPixels=null,maskProfile='';
 async function loadFinishMask(){
  const profile=phone()?'mobile':'desktop',reference=new Image();reference.decoding='async';
  reference.src='/assets/making-v7/'+profile+'/frame_108.webp';await reference.decode();
  sc.drawImage(reference,0,0,128,128);finishPixels=sc.getImageData(0,0,128,128).data;
  maskProfile=profile;sourceImage=null;lastKey='';queue();
 }
 function contact(img,row,phase){
  if(sourceImage!==img){sc.drawImage(img,0,0,128,128);pixels=sc.getImageData(0,0,128,128).data;sourceImage=img;}
  const data=phase!=='carve'&&maskProfile===(phone()?'mobile':'desktop')?finishPixels:pixels;
  const sy=Math.max(0,Math.min(127,Math.round(row*127)));let x=84;
  for(let sx=124;sx>=12;sx--){const i=(sy*128+sx)*4;if(Math.abs(data[i]-23)+Math.abs(data[i+1]-31)+Math.abs(data[i+2]-25)>65){x=sx;break;}}
  const scale=Math.max(w/img.naturalWidth,h/img.naturalHeight),dw=img.naturalWidth*scale,dh=img.naturalHeight*scale;
  return {x:(w-dw)*.5+x/128*dw,y:h-((h-dh)*.5+row*dh)};
 }
 function resize(){
  w=Math.max(1,stage.clientWidth);h=Math.max(1,stage.clientHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.25));renderer.setSize(w,h,false);
  canvas.width=surface.width;canvas.height=surface.height;
  camera.left=0;camera.right=w;camera.top=h;camera.bottom=0;camera.updateProjectionMatrix();lastKey='';
  if(maskProfile&&maskProfile!==(phone()?'mobile':'desktop'))loadFinishMask().catch(()=>{});
 }
 function hide(){for(const list of Object.values(groups))for(const g of list)g.visible=false;if(lastKey!=='hidden'){renderer.clear();paint.clearRect(0,0,canvas.width,canvas.height);lastKey='hidden';}}
 function update(phase,p,img){
  if(!w||!h)resize();
  if(!groups[phase]){hide();return;}
  const key=phase+':'+Math.round(p*200)+':'+img.src+':'+w+':'+h;if(key===lastKey)return;lastKey=key;
  for(const [name,list] of Object.entries(groups))for(const g of list)g.visible=name===phase;
  const row=phase==='carve'?mix(.40,.62,p):phase==='heat'?mix(.43,.59,p):mix(.44,.6,p);
  const point=contact(img,row,phase),s=phone()?Math.min(1,w/390)*.68:Math.min(1.4,w/1440)*1.1;
  if(phase==='carve')point.x-=s*15;
  const toolScale=phase==='carve'?s*1.35:s;
  for(const g of groups[phase])g.scale.setScalar(toolScale);
  if(phase==='carve'){
   const a=.62,stroke=p*14,part=stroke-Math.floor(stroke);
   const lift=1-smooth((part-.33)/.24)*(1-smooth((part-.6)/.34));
   chisel.position.set(point.x-3,point.y,3);chisel.rotation.z=a;
   const bx=point.x+Math.sin(-a)*130*toolScale,by=point.y+Math.cos(a)*130*toolScale;
   hammer.position.set(bx-lift*12*toolScale,by+lift*35*toolScale,12);hammer.rotation.z=-.10-lift*.29;
  }else if(phase==='heat'){
   torch.position.set(point.x+51*s,point.y,6);torch.rotation.z=.08*Math.sin(p*7);
   flameMat.uniforms.u.value=p;
  }else{
   const g=groups[phase][0];g.position.set(point.x-13*s,point.y+Math.sin(p*32)*5*s,8);g.rotation.z=-.2+Math.sin(p*27)*.13;
  }
  renderer.render(scene,camera);
  // A persistent 2D presentation avoids WebKit losing an idle transparent
  // WebGL layer. Copy only a changed tool pose; no hidden animation loop.
  paint.clearRect(0,0,canvas.width,canvas.height);paint.drawImage(surface,0,0);drawCount++;
 }
 await loadFinishMask();resize();hide();
 surface.addEventListener('webglcontextlost',event=>{event.preventDefault();state='context-lost';canvas.style.visibility='hidden';});
 surface.addEventListener('webglcontextrestored',()=>{state='ready';canvas.style.visibility='visible';lastKey='';queue();});
 return {update,resize,hide,get state(){return state},stats:()=>({state,draws:drawCount,triangles:renderer.info.render.triangles,visible:!['hidden',''].includes(lastKey)})};
}
