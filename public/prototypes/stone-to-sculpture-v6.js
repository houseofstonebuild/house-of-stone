import {createCarvingTools} from '/prototypes/carving-tools.js';
// The Making V6: source-preserving 3D solid carving rendered offline and scrubbed as images.
// The improved geographic introduction remains identical to the original approved study.
const host=document.getElementById('render'),stage=document.querySelector('.stage'),journey=document.querySelector('.journey');
const fallback=document.getElementById('fallback'),map=document.getElementById('map-scene');
const archiveCutaway=document.getElementById('archive-cutaway'),archiveFilm=document.getElementById('archive-film');
const svg=document.getElementById('origin-map'),route=document.getElementById('travel-route');
const truck=document.getElementById('transport-marker'),guruvePin=document.getElementById('guruve-node');
const hararePin=document.getElementById('harare-node'),coords=document.getElementById('map-coordinates');
const mapContext=document.getElementById('map-context'),e={mapDone:false};
const ui={phase:document.getElementById('phase'),title:document.getElementById('stage-title'),
 description:document.getElementById('stage-description'),counter:document.getElementById('counter'),
 progress:document.getElementById('progress-fill')};

const texts=[
 ['ZIMBABWE','It begins with stone.','Zimbabwe has a longstanding tradition of hand-carved stone sculpture.'],
 ['GURUVE DISTRICT','Where springstone is found.','Guruve is one of the regions in Zimbabwe known for dense springstone.'],
 ['TOWARD HARARE','From quarry region to city.','Follow an illustrative route toward Harare, an important center for Zimbabwean sculpture.'],
 ['HARARE','Into the workshop.','The raw stone becomes the starting point for a sculptor’s decisions.'],
 ['THE RAW STONE','Before the first cut.','A weathered block of springstone, before its outer material is removed.'],
 ['MARKING THE FORM','Marking the contours.','The sculptor maps the outer shape and identifies the stone that needs to be removed.'],
 ['CARVING','The form takes shape.','Every chisel blow removes stone. Real workshop footage is available below; the changing form is an illustration.'],
 ['FINER WORK','Refining the curves.','Rasps and wet abrasives smooth the tool marks while retaining the hand-carved form.'],
 ['HEATING','Preparing the surface.','Gentle, controlled heating is sometimes used before a clear-wax finish.'],
 ['WAX AND BUFFING','Bringing out the stone.','Clear wax and buffing deepen the colour and reveal the stone’s natural sheen.'],
 ['THE FINISHED SCULPTURE','Coil, by Douglas Musekiwa.','The finished work shown with its approved model from our collection.']
];
const stops=[0,.075,.17,.29,.37,.45,.565,.765,.835,.90,.96,1];

const clamp=(x,a=0,b=1)=>Math.min(b,Math.max(a,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x)};
const lerp=(a,b,t)=>a+(b-a)*t;
const mobile=()=>innerWidth<=800;
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const routeLength=route.getTotalLength();
let journeyTop=0,journeyDistance=1;
function measureScrollRange(){
 journeyTop=journey.getBoundingClientRect().top+scrollY;
 journeyDistance=Math.max(1,journey.offsetHeight-stage.offsetHeight);
}
const active=()=>clamp((scrollY-journeyTop)/journeyDistance);
const phaseFor=p=>{for(let i=0;i<stops.length-1;i++)if(p<stops[i+1])return i;return 10};

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


const v6={manifest:null,profile:null,cache:new Map(),current:-1,requested:-1,raf:0,phase:-1,playing:false,error:false};
const currentImage=new Image(),oldImage=new Image();
const physicalTools=createCarvingTools(host);
// Restore the final presentation from the exact approved GLB, never an offline
// rendering with a replacement procedural material.
let approvedReveal=null,approvedRequest=null;
function updateApprovedReveal(p){
 if(p>=.815&&!approvedRequest){
  approvedRequest=import('/prototypes/approved-coil-reveal.js').then(module=>{
   approvedReveal=module.createApprovedCoilReveal(host);
   approvedReveal.update(active());
  }).catch(err=>{
   host.dataset.approvedModelState='error';
   console.warn('Approved Coil viewer unavailable',err);
  });
 }
 approvedReveal?.update(p);
}
const craftDetail=document.getElementById('craft-detail');
const heatStudy=document.getElementById('heating-study');
const heatLight=heatStudy.querySelector('.heating-light');
const heatTorch=heatStudy.querySelector('.heating-torch');
const archiveMobileFrames=document.getElementById('archive-mobile-frames');
function updateCraft(p){
 const refine=smooth((p-.765)/.016)*(1-smooth((p-.827)/.014));
 const heat=smooth((p-.835)/.014)*(1-smooth((p-.894)/.012));
 const work=smooth((p-.837)/.054);
 const reducedMotion=reduced.matches;
 craftDetail.style.opacity=reducedMotion?'0':refine.toFixed(4);
 craftDetail.setAttribute('aria-hidden',String(reducedMotion||refine<.01));
 heatStudy.style.opacity=reducedMotion?'0':heat.toFixed(4);
 heatStudy.style.visibility=(!reducedMotion&&heat>.002)?'visible':'hidden';
 heatStudy.setAttribute('aria-hidden',String(reducedMotion||heat<.01));
 heatLight.style.left=(63-15*work).toFixed(2)+'%';
 heatLight.style.top=(30+8*work).toFixed(2)+'%';
 heatLight.style.opacity=(heat*.85).toFixed(3);
 heatTorch.style.transform='translate3d('+(-14*work).toFixed(1)+'px,'+(-12*work).toFixed(1)+'px,0)';
 const cutFrame=Math.round(clamp((p-.565)/.2)*41);
 const column=cutFrame%7,row=Math.floor(cutFrame/7);
 archiveMobileFrames.style.backgroundPosition=(column/6*100).toFixed(3)+'% '+(row/5*100).toFixed(3)+'%';
 archiveMobileFrames.dataset.workFrame=String(cutFrame);
 stage.dataset.craftToolsVisible=String(!reducedMotion&&p>=.565&&p<.765);
 stage.dataset.heatingVisible=String(!reducedMotion&&heat>.12);
 stage.dataset.refiningVisible=String(!reducedMotion&&refine>.12);
}
currentImage.className='making-v6-image';oldImage.className='making-v6-image making-v6-previous';
currentImage.alt='';oldImage.alt='';currentImage.decoding='async';oldImage.decoding='async';
host.append(oldImage,currentImage);
function url(frame){return '/assets/making-v6/'+v6.profile+'/frame_'+String(frame).padStart(3,'0')+'.webp'}
function loadFrame(frame){
 const m=v6.manifest;
 if(!m||frame<0||frame>=m.frames||v6.cache.has(frame))return;
 const img=new Image(),entry={img,ready:false,error:false};
 v6.cache.set(frame,entry);img.decoding='async';
 const done=()=>{entry.ready=true;schedule()};
 img.onload=()=>{const decoded=img.decode?.();decoded?.then?decoded.then(done,done):done()};
 img.onerror=()=>{entry.error=true;host.dataset.frameError=String(frame)};
 img.src=url(frame);
}
function paint(frame){
 const entry=v6.cache.get(frame);
 if(!entry?.ready)return false;
 if(v6.current!==frame){
  if(currentImage.src)oldImage.src=currentImage.currentSrc||currentImage.src;
  oldImage.style.opacity='1';
  currentImage.src=entry.img.src;currentImage.style.opacity='1';
  oldImage.style.opacity='0';v6.current=frame;
 }
 host.dataset.frameIndex=String(frame);
 host.dataset.mobileAtlasFrame=String(frame);
 host.dataset.mobileAtlasPending='';
 if(v6.cache.size>18)for(const [key,asset] of v6.cache){
  if(Math.abs(key-frame)>8&&key!==v6.requested){
   asset.img.onload=null;asset.img.onerror=null;v6.cache.delete(key);
  }
 }
 return true;
}
function updateFrames(p){
 if(!v6.manifest||p<v6.manifest.first)return;
 const m=v6.manifest;
 const frame=Math.round(clamp((p-m.first)/(m.last-m.first))*(m.frames-1));
 v6.requested=frame;loadFrame(frame);
 for(const n of [1,-1,2,-2])loadFrame(frame+n);
 if(!paint(frame)){
  host.dataset.mobileAtlasPending=String(frame);
  // During a fast flick keep a fully decoded frame rather than flash black.
  if(v6.current<0){
   let nearest=null;
   for(const [idx,item] of v6.cache)if(item.ready&&(nearest===null||Math.abs(idx-frame)<Math.abs(nearest-frame)))nearest=idx;
   if(nearest!==null)paint(nearest);
  }
 }
}
function setDocumentary(visible){
 archiveCutaway.setAttribute('aria-hidden',String(!visible));
 if(visible&&!v6.playing&&!reduced.matches&&!mobile()){
  archiveFilm.muted=true;archiveFilm.loop=true;v6.playing=true;
  archiveFilm.play().catch(()=>{v6.playing=false;archiveCutaway.dataset.frameReady='false'});
 }else if(!visible&&v6.playing){archiveFilm.pause();v6.playing=false}
}
function render(p){
 const step=phaseFor(p);updateMap(p);
 if(step!==v6.phase){
  v6.phase=step;stage.dataset.phase=String(step);
  ui.phase.textContent=texts[step][0];ui.title.textContent=texts[step][1];
  ui.description.textContent=texts[step][2];
  ui.counter.textContent=String(step+1).padStart(2,'0')+' / 11';
 }
 ui.progress.style.width=(p*100).toFixed(2)+'%';
 updateFrames(p);
 const documentary=smooth((p-.565)/.020)*(1-smooth((p-.750)/.015));
 const show=!!v6.manifest&&!mobile()&&!reduced.matches&&document.visibilityState==='visible'&&documentary>.10;
 stage.style.setProperty('--archiveOpacity',show?documentary.toFixed(4):'0');
 setDocumentary(show);host.dataset.documentaryCutaway=documentary.toFixed(3);
 updateCraft(p);
 physicalTools.update(p,reduced.matches);
 updateApprovedReveal(p);
 host.dataset.renderMode='precomputed-v6';
 host.dataset.modelReady=String(Boolean(v6.manifest&&v6.current>=0));
}
function schedule(){
 if(!v6.raf)v6.raf=requestAnimationFrame(()=>{v6.raf=0;render(active())});
}
async function boot(){
 try{
  const r=await fetch('/assets/making-v6/manifest.json',{cache:'force-cache'});
  if(!r.ok)throw Error('Missing versioned Coil media manifest');
  const m=await r.json();
  if(m.version!==6||m.frames<100)throw Error('Incomplete Coil animation');
  v6.manifest=m;v6.profile=mobile()?'mobile':'desktop';
  loadFrame(0);loadFrame(m.frames-1);schedule();
 }catch(err){v6.error=true;fallback.hidden=false;host.dataset.modelError='true';console.warn(err)}
}
let oldWidth=innerWidth;
archiveFilm.addEventListener('loadeddata',()=>archiveCutaway.dataset.frameReady='true');
archiveFilm.addEventListener('error',()=>archiveCutaway.dataset.frameReady='false');
window.addEventListener('scroll',schedule,{passive:true});
window.addEventListener('resize',()=>{
 if(innerWidth!==oldWidth){
  oldWidth=innerWidth;measureScrollRange();
  const profile=mobile()?'mobile':'desktop';
  if(profile!==v6.profile){
   v6.profile=profile;v6.cache.clear();
   currentImage.removeAttribute('src');oldImage.removeAttribute('src');v6.current=-1;
   loadFrame(0);
  }
 }
 approvedReveal?.resize();
 schedule();
},{passive:true});
document.addEventListener('visibilitychange',schedule);
reduced.addEventListener?.('change',schedule);
document.getElementById('skip').addEventListener('click',()=>document.getElementById('finished').scrollIntoView({
 behavior:reduced.matches?'instant':'smooth'
}));
measureScrollRange();boot();schedule();
