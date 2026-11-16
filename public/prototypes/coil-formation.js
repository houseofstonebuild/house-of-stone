/* Model-derived, source-true Coil stone removal.
 * Each displayed frame is one volumetric state made from Coil's approved
 * geometry (see tools/carving-pilot/build_making_v6.py). The canvas shows
 * discrete chips only; it does not invent the main statue silhouette.
 * No timers, continuous playback, WebGL or video seeks on mobile.
 */
const clamp=x=>Math.max(0,Math.min(1,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x)};
const mix=(a,b,t)=>a+(b-a)*t;
const FRAME_ROOT='/assets/making-v6';
const FRAME_COUNT=144;
const random=(seed)=>{let x=Math.sin(seed*128.376+19.117)*43758.5453;return x-Math.floor(x)};
export function createCoilFormation(carveStage,polishStage,mobile,reduced){
 const elements={carve:carveStage.querySelector('#formationFrame'),polish:polishStage.querySelector('#polishFrame')};
 const chips=carveStage.querySelector('#formationChips');
 const ctx=chips.getContext('2d',{alpha:true});
 const cache=new Map();
 const want={carve:-1,polish:-1};
 const shown={carve:-1,polish:-1};
 let manifest=null;
 let currentProfile=mobile()?'mobile':'desktop';
 const url=(frame)=>FRAME_ROOT+'/'+currentProfile+'/frame_'+String(frame).padStart(3,'0')+'.webp';
 function load(frame){
  if(frame<0||frame>=FRAME_COUNT)return;
  const key=currentProfile+':'+frame;
  if(cache.has(key))return;
  const image=new Image();
  image.decoding='async';
  const item={image,ready:false,error:false,profile:currentProfile};
  cache.set(key,item);
  image.onload=()=>{
   item.ready=true;
   for(const phase of ['carve','polish']){
    if(want[phase]===frame&&currentProfile===item.profile)display(phase,frame);
   }
  };
  image.onerror=()=>{item.error=true;};
  image.src=url(frame);
  if(cache.size>26){
   for(const [name,entry] of cache){
    const n=Number(name.split(':')[1]);
    if(name!==currentProfile+':'+want.carve&&name!==currentProfile+':'+want.polish&&
       (entry.profile!==currentProfile||Math.abs(n-want.carve)>9&&Math.abs(n-want.polish)>9)){
      cache.delete(name);
      if(cache.size<=20)break;
    }
   }
  }
 }
 function display(phase,frame){
  const item=cache.get(currentProfile+':'+frame);
  if(!item?.ready||shown[phase]===frame)return;
  elements[phase].src=item.image.src;
  shown[phase]=frame;
  const stage=phase==='carve'?carveStage:polishStage;
  stage.dataset.displayedFrame=String(frame);
  stage.dataset.frameStatus='ready';
 }
 function updateFrame(phase,frame){
  frame=Math.max(0,Math.min(FRAME_COUNT-1,frame));
  const stage=phase==='carve'?carveStage:polishStage;
  stage.dataset.requestedFrame=String(frame);
  stage.dataset.modelSource='/models/coil-uploaded-v1.glb';
  if(manifest?.entries?.[frame])stage.dataset.remainingVoxels=String(manifest.entries[frame].remaining_voxels);
  if(want[phase]!==frame)want[phase]=frame;
  load(frame);load(frame-1);load(frame+1);
  if(cache.get(currentProfile+':'+frame)?.ready)display(phase,frame);
  // A nearby decoded frame is safer than a missing image on low-memory iOS.
  else if(shown[phase]===-1){
   for(let d=1;d<=4;d++){
    for(const n of [frame-d,frame+d]){
     if(cache.get(currentProfile+':'+n)?.ready){display(phase,n);break;}
    }
    if(shown[phase]!==-1)break;
   }
  }
 }
 // Deterministic fractures on the OUTSIDE of the diminishing stone volume.
 // A shard falls outward and down, then vanishes, when its carving phase passes.
 const shards=Array.from({length:32},(_,i)=>({
  at:.09+random(i+11)*.65,
  angle:(random(i+28)-.5)*2.8,
  side:random(i+35)>.5?1:-1,
  y:random(i+49)*2-1,
  size:8+random(i+97)*13,
  spin:random(i+79)*3-1.5,
  drift:random(i+88)*.7+.3
 }));
 function drawChips(progress){
  if(!ctx||reduced.matches){if(ctx)ctx.clearRect(0,0,chips.width,chips.height);return;}
  const w=carveStage.clientWidth,h=carveStage.clientHeight;
  const dpr=Math.min(devicePixelRatio||1,1.35);
  const width=Math.round(w*dpr),height=Math.round(h*dpr);
  if(chips.width!==width||chips.height!==height){chips.width=width;chips.height=height;chips.style.width=w+'px';chips.style.height=h+'px';}
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,w,h);
  const phone=mobile();
  // The VTK source render is centered at x=.66 desktop and .50 phone.
  const cx=w*(phone?.50:.66),cy=h*(phone?.42:.45);
  const rx=w*(phone?.20:.145),ry=h*(phone?.145:.29);
  for(let i=0;i<shards.length;i++){
   const s=shards[i],t=(progress-s.at)/.165;
   if(t<0||t>1||progress>.86)continue;
   const q=smooth(t),fade=(1-smooth((t-.52)/.45))*(1-smooth((progress-.69)/.17));
   // Chips detach at the OUTER perimeter of the stone and fall away from
   // the mass; never scatter imaginary marks across Coil's finished face.
   const shrinking=1-progress*.33;
   const ox=s.side*rx*shrinking,oy=s.y*ry*shrinking;
   const spread=s.side*(25+30*s.drift)*q;
   const fall=(45+Math.abs(s.y)*80)*q*q;
   const x=cx+ox+spread,y=cy+oy+fall;
   const radius=s.size*(phone?.62:1)*(1-.34*q);
   ctx.save();
   ctx.translate(x,y);ctx.rotate(s.angle+s.spin*q);
   ctx.globalAlpha=Math.min(1,fade*.77);
   ctx.shadowColor='rgba(0,0,0,.30)';ctx.shadowBlur=radius*.48;ctx.shadowOffsetY=radius*.25;
   ctx.beginPath();
   ctx.moveTo(-radius*.91,-radius*.36);
   ctx.lineTo(-radius*.13,-radius*.92);
   ctx.lineTo(radius*.68,-radius*.47);
   ctx.lineTo(radius*.94,radius*.20);
   ctx.lineTo(radius*.18,radius*.65);
   ctx.lineTo(-radius*.80,radius*.37);
   ctx.closePath();
   ctx.fillStyle='#62685a';ctx.fill();
   ctx.shadowColor='transparent';
   ctx.beginPath();
   ctx.moveTo(-radius*.91,-radius*.36);
   ctx.lineTo(-radius*.13,-radius*.92);
   ctx.lineTo(radius*.68,-radius*.47);
   ctx.lineTo(radius*.12,radius*.02);
   ctx.closePath();ctx.fillStyle='#9e9a84';ctx.fill();
   ctx.beginPath();ctx.moveTo(radius*.12,radius*.02);
   ctx.lineTo(radius*.94,radius*.20);ctx.lineTo(radius*.18,radius*.65);
   ctx.lineTo(-radius*.80,radius*.37);ctx.closePath();
   ctx.fillStyle='#303e34';ctx.fill();
   ctx.restore();
   if(i%3===0){
    ctx.fillStyle='rgba(207,192,163,'+(fade*.27).toFixed(3)+')';
    ctx.beginPath();ctx.arc(x+8*q,y+15*q,Math.max(.5,radius*.085),0,Math.PI*2);ctx.fill();
   }
  }
 }
 function update(phase,p){
  if(mobile()!==(currentProfile==='mobile')){
   currentProfile=mobile()?'mobile':'desktop';
   shown.carve=shown.polish=-1;
  }
  p=clamp(p);
  // Source frames 54–95 carve extra stone away; 95–132 sand and wax.
  // Zero transparency tricks: the form itself changes at each voxel state.
  const frame=phase==='carve'?
   Math.round(mix(54,95,smooth((p-.07)/.9))):
   Math.round(mix(95,132,smooth(p)));
  updateFrame(phase,frame);
  const stage=phase==='carve'?carveStage:polishStage;
  stage.dataset.phaseProgress=p.toFixed(4);
  stage.dataset.stage=phase;
  if(phase==='carve')drawChips(smooth((p-.035)/.94));
  if(phase==='polish')polishStage.style.setProperty('--polish',smooth(p).toFixed(4));
 }
 function resize(){
  // Image assets and canvas are selected per viewport; no WebGL memory on iOS.
  currentProfile=mobile()?'mobile':'desktop';
  shown.carve=shown.polish=-1;
  drawChips(Number(carveStage.dataset.phaseProgress||0));
 }
 fetch(FRAME_ROOT+'/manifest.json').then(r=>{if(!r.ok)throw Error('Missing Coil geometry manifest');return r.json()}).then(m=>{
  if(m.version!==6||m.frames!==FRAME_COUNT||!Array.isArray(m.entries)||m.entries.length!==FRAME_COUNT)throw Error('Invalid Coil carving source');
  manifest=m;
  carveStage.dataset.modelDerived='true';
  polishStage.dataset.modelDerived='true';
 }).catch(()=>{carveStage.dataset.modelDerived='unavailable';polishStage.dataset.modelDerived='unavailable';});
 return {update,resize,get registered(){return manifest?.registered_to==='approved-coil-v1'&&manifest?.camera_revision===2}};
}
