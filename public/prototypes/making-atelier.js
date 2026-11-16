/* House of Mabwe / The Making
 * Documentary footage stays source-true and paused; Coil's actual approved
 * volume drives the separate reversible carving study before the final GLB.
 */
import {createCoilFormation} from './coil-formation.js';
import {createFrameStream} from './scroll-frame-stream.js';
import {createFilmAtlas} from './story-film-atlas.js';
const $=s=>document.querySelector(s);
const clamp=x=>Math.max(0,Math.min(1,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x)};
const lerp=(a,b,t)=>a+(b-a)*t;
const mobile=()=>innerWidth<=700;
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const saveData=Boolean(navigator.connection?.saveData);
const sections=[...document.querySelectorAll('[data-scene]')];
const names={
 introduction:['01','INTRODUCTION'],origin:['02','ORIGIN'],
 material:['03','PREPARATION'],carving:['04','CARVING'],
 detail:['05','THE FORM'],finishing:['06','FINISHING'],reveal:['07','THE WORK'],house:['08','THE HOUSE']
};
const states=new Map();
const $film=$('#cinemaFilm');
const $filmMedia=$('.carving-media');
const $atlas=$('#atlasFilmFrame');
const $mobileFrame=$('#mobileFilmFrame');
const $poster=$('.carving-poster');
const $mapRoute=$('#mapRoute');
const $truck=$('#routeTruck');
const $routeReadout=$('#routeReadout');
const mapLength=$mapRoute.getTotalLength?.()||115;
// Pre-sample the fixed SVG path once. getPointAtLength() during scrolling can
// force a costly geometry query after moving the map on slower mobile devices.
const routeSamples=Array.from({length:257},(_,i)=>{
 const point=$mapRoute.getPointAtLength(mapLength*i/256);
 return {x:point.x,y:point.y};
});
function routePoint(t){
 const u=clamp(t)*256,index=Math.min(255,Math.floor(u));
 const f=u-index,a=routeSamples[index],b=routeSamples[index+1];
 return {x:lerp(a.x,b.x,f),y:lerp(a.y,b.y,f)};
}
$mapRoute.style.strokeDasharray=String(mapLength);
let frameCount=48;
let filmEdition='legacy';
const fallbackFrames=19; // First ~8 seconds only: the lion never comes into view.
const atlasCount=18;
let hdFramesReady=false;
let frameRoot='/assets/making-cinema-frames';
let activeFilmFrame=-1,desiredFilmFrame=-1,filmDuration=0,videoMetadata=false,filmActive=false;
let filmPan=18;
// Preserve the fluid source-atlas timeline during touch/trackpad movement.
// Decode full-resolution source photography only when the gesture settles.
let filmIdleTimer=0,filmMoving=false,lastFilmTarget=-1;
const filmStream=createFrameStream({
 stage:$filmMedia,image:$mobileFrame,mobile,
 src:index=>frameUrl(index),
 position:()=>({x:filmPan,y:47}),
 onDisplay:(index,img)=>{
  if(!$mobileFrame.hasAttribute('src'))$mobileFrame.src=img.src;
  activeFilmFrame=index;
  $filmMedia.dataset.mobileReady='true';
  $filmMedia.dataset.displayedFrame=String(index);
  if(filmAtlas.available){
   const showHD=index===desiredFilmFrame&&!filmMoving&&filmActive;
   filmStream.canvas.style.opacity=showHD?'1':'0';
   $filmMedia.dataset.displayQuality=showHD?'hd-source':'atlas-preview';
  }
 }
});
const filmAtlas=createFilmAtlas({
 stage:$filmMedia,anchor:$poster,mobile,
 onDisplay:frame=>{
  if(filmStream.displayed!==frame)filmStream.canvas.style.opacity='0';
 }
});
let storyFrame=0,layoutDirty=true,readings=[],currentScene='',approved=null,approvedPromise=null;
let approvedIdleHandle=null;
function scheduleApprovedInit(){
 if(approved||approvedPromise||approvedIdleHandle!==null)return;
 // WebGL shader compilation and GLB uploads must not interrupt a gesture.
 // The original still remains visible until the approved asset is ready.
 const load=()=>{approvedIdleHandle=null;if(!document.hidden)initializeApproved();};
 if('requestIdleCallback' in window)
  approvedIdleHandle=requestIdleCallback(load,{timeout:1400});
 else approvedIdleHandle=setTimeout(load,260);
}
const formation=createCoilFormation($('#formationStage'),$('#polishStage'),mobile,reduced);
const approvedOriginalSlot=$('#approvedHost').parentElement;
const filmState=()=>({paused:$film.paused,time:$film.currentTime,frame:desiredFilmFrame,active:filmActive,videoReady:videoMetadata,hdFrames:hdFramesReady,edition:filmEdition,frames:frameCount,maxSeconds:8.4,stream:filmStream.stats(),atlas:filmAtlas.stats(),coil:formation.stats()});
window.__mabweMaking={get film(){return filmState()},get chapter(){return currentScene},get approved(){return $('#approvedHost').dataset.approvedModelState||'not-started'}};

function recordLayout(){
 readings=sections.map(el=>{
  const rect=el.getBoundingClientRect();
  const top=rect.top+scrollY;
  return {el,name:el.dataset.scene,top,height:el.offsetHeight,distance:Math.max(1,el.offsetHeight-innerHeight)};
 });
 layoutDirty=false;
}

function frameUrl(index){
 // All versions contain ONLY the early 8.4 seconds of the actual documentary.
 // The new sequence has 144 independent source frames (~17 FPS of scroll)
 // rather than 48, with the original master preserved.
 const sourceFrame=filmEdition==='legacy'?
  Math.min(fallbackFrames-1,Math.round(index*(fallbackFrames-1)/(frameCount-1))):index;
 $filmMedia.dataset.sourceFrame=String(sourceFrame);
 const digits=filmEdition==='hd-v3'||filmEdition==='hd-v4'?3:2;
 return frameRoot+'/frame_'+String(sourceFrame).padStart(digits,'0')+'.webp';
}
async function checkHdFrames(){
 let selected=null;
 // V4 samples the documentary near its original 24 fps. The source frame
 // count is capped at 200 to balance motion fidelity with phone decoding.
 try{
  const response=await fetch('/assets/making-cinema-frames-v4/manifest.json',{cache:'no-store'});
  if(response.ok){
   const manifest=await response.json();
   if(manifest.version===4&&manifest.frames===200&&manifest.width>=1280&&manifest.end_seconds<=8.4){
    const checks=await Promise.all([0,100,199].map(i=>
     fetch('/assets/making-cinema-frames-v4/frame_'+String(i).padStart(3,'0')+'.webp',{method:'HEAD'})));
    if(checks.every(r=>r.ok))selected={root:'/assets/making-cinema-frames-v4',count:200,edition:'hd-v4'};
   }
  }
 }catch(_){/* v3 remains available */}
 if(!selected)try{
  const response=await fetch('/assets/making-cinema-frames-v3/manifest.json',{cache:'no-store'});
  if(response.ok){
   const manifest=await response.json();
   if(manifest.version===3&&manifest.frames===144&&manifest.width>=1280&&
      manifest.end_seconds<=8.4&&manifest.start_seconds===0){
    // An index/manifest-only deploy must not select a missing frame archive.
    const tested=await Promise.all([0,72,143].map(i=>
      fetch('/assets/making-cinema-frames-v3/frame_'+String(i).padStart(3,'0')+'.webp',{method:'HEAD'})));
    if(tested.every(r=>r.ok))selected={root:'/assets/making-cinema-frames-v3',count:144,edition:'hd-v3'};
   }
  }
 }catch(_){/* retain v2 or source-quality fallback */}
 if(!selected){
  try{
   const response=await fetch('/assets/making-cinema-frames-v2/manifest.json',{cache:'no-store'});
   if(response.ok){
    const manifest=await response.json();
    if(manifest.version===2&&manifest.frames===48&&manifest.width>=1280&&manifest.end_seconds<=8.5)
     selected={root:'/assets/making-cinema-frames-v2',count:48,edition:'hd-v2'};
   }
  }catch(_){/* fallback to source 19-frame excerpt */}
 }
 if(!selected){
  $filmMedia.dataset.mediaQuality='original-fallback';
  queueUpdate();
  return;
 }
 frameRoot=selected.root;
 filmEdition=selected.edition;
 frameCount=selected.count;
 hdFramesReady=true;
 activeFilmFrame=-1;
 $filmMedia.dataset.mobileReady='false';
 $filmMedia.dataset.mediaQuality=filmEdition;
 $filmMedia.dataset.totalFrames=String(frameCount);
 filmStream.configure({frames:frameCount});
 lastFilmTarget=-1;
 const currentProgress=Number($filmMedia.dataset.scrollPosition||0);
 rememberFrame(Math.max(0,Math.min(frameCount-1,Math.round(clamp(currentProgress)*(frameCount-1)))));
 queueUpdate();
}
function rememberFrame(index){
 if(index<0||index>=frameCount)return;
 filmStream.prime(index);
}
function settleFilm(){
 filmIdleTimer=0;
 if(!filmActive||document.hidden)return;
 filmMoving=false;
 // Reuse a previously decoded exact source frame when available, otherwise
 // fetch the single current target. No old frame may obscure active motion.
 filmStream.request(desiredFilmFrame,true);
}
function updateFilm(p,visible){
 const n=Math.max(0,Math.min(frameCount-1,Math.round(clamp(p)*(frameCount-1))));
 const sprite=Math.max(0,Math.min(atlasCount-1,Math.round(clamp(p)*(atlasCount-1))));
 desiredFilmFrame=n;
 $filmMedia.dataset.requestedFrame=String(n);
 $filmMedia.dataset.scrollPosition=p.toFixed(4);
 filmPan=lerp(18,40,p);
 $mobileFrame.style.objectPosition=filmPan.toFixed(2)+'% 47%';
 $poster.style.objectPosition=filmPan.toFixed(2)+'% 47%';
 $filmMedia.dataset.filmPan=filmPan.toFixed(2);
 const x=sprite%7,y=Math.floor(sprite/7);
 $atlas.style.backgroundPosition=(x/6*100).toFixed(3)+'% '+(y/5*100).toFixed(3)+'%';
 $atlas.dataset.spriteFrame=String(sprite);
 filmActive=Boolean(visible);
 if(filmIdleTimer){clearTimeout(filmIdleTimer);filmIdleTimer=0;}
 if(visible){
  if(n!==lastFilmTarget){
   lastFilmTarget=n;
   const atlasShown=filmAtlas.available&&filmAtlas.paint(n,filmPan,47);
   // When the atlas is not available, retain the existing HD fallback.
   if(atlasShown){
    filmMoving=true;
    filmStream.canvas.style.opacity='0';
    $filmMedia.dataset.displayQuality='atlas-preview';
   }else filmStream.request(n,true);
  }
  if(filmAtlas.available){
   // Never compete with canvas animation by decoding 1600-pixel WebPs.
   filmStream.suspend();
   filmIdleTimer=setTimeout(settleFilm,150);
  }
 }else{
  lastFilmTarget=-1;
  filmMoving=false;
  filmStream.suspend();
 }
}

$film.loop=false;
$film.pause();
$film.addEventListener('loadedmetadata',()=>{
 videoMetadata=true;
 filmDuration=$film.duration||0;
 $filmMedia.dataset.metadata='true';
 queueUpdate();
});
$film.addEventListener('seeked',()=>{
 $filmMedia.dataset.videoReady='true';
 if(!filmActive)return;
 const p=Number($filmMedia.dataset.scrollPosition||0);
 const expected=clamp(p)*Math.min(8.4,Math.max(.1,filmDuration-.09));
 if(Math.abs($film.currentTime-expected)>.12){
  lastSeekAt=0;
  updateFilm(p,true);
 }
});
$film.addEventListener('error',()=>{
 $filmMedia.dataset.videoReady='false';
 $filmMedia.dataset.fallback='photo';
 if(hdFramesReady){
  // Remain functional if the deployment contains frames before the HD MP4.
  hdFramesReady=false;
  frameRoot='/assets/making-cinema-frames';
  filmStream.configure({frames:frameCount});
  lastFilmTarget=-1;
  activeFilmFrame=-1;
  $filmMedia.dataset.mediaQuality='original-fallback';
  const source=$film.querySelector('source');
  source.src='/assets/making-chiseling-scrub-v1.mp4';
  queueUpdate();
 }
});
if($film.readyState>=1){videoMetadata=true;filmDuration=$film.duration||0;}
$film.preload='none';

function setScene(name){
 if(name===currentScene)return;
 currentScene=name;
 const [number,title]=names[name]||['',''];
 $('#chapterNumber').textContent=number;
 $('#chapterName').textContent=title;
 document.body.dataset.currentChapter=name;
}
function renderIntroduction(p){
 $('.prologue-visual img').style.transform='scale('+(1+.055*p).toFixed(4)+')';
}
function renderOrigin(p){
 // Country first, then a legible close-up of the illustrative Guruve–Harare road.
 // The truck stays upright; its position is tied to scroll in both directions.
 const zoom=smooth((p-.045)/.34);
 const factor=lerp(1,mobile()?1.18:2.55,zoom);
 const shiftX=lerp(0,-innerWidth*(mobile()?.085:.16),zoom);
 const shiftY=lerp(0,innerHeight*(mobile()?0:.11),zoom);
 $('.origin-map-wrap').style.transform='translate3d('+shiftX.toFixed(1)+'px,'+shiftY.toFixed(1)+'px,0) scale('+factor.toFixed(4)+')';
 const travel=reduced.matches?1:smooth((p-.41)/.43);
 $mapRoute.style.strokeDashoffset=String((mapLength*(1-travel)).toFixed(2));
 const point=routePoint(travel);
 $truck.setAttribute('transform','translate('+point.x.toFixed(2)+' '+point.y.toFixed(2)+')');
 $truck.style.opacity=String(reduced.matches?1:smooth((p-.38)/.08)*(1-smooth((p-.95)/.05)));
 $('#hararePin').style.opacity=String(reduced.matches?1:smooth((p-.22)/.18));
 $routeReadout.style.opacity=String(reduced.matches?1:smooth((p-.32)/.18));
}
function renderMaterial(p){
 const mix=smooth((p-.36)/.28);
 $('.material-photo.first').style.opacity=String(1-mix);
 $('.material-photo.second').style.opacity=String(mix);
 $('#materialCount').textContent=mix>.5?'02':'01';
}
function renderDetail(p){
 formation.update('carve',p);
 $('#detailIndexBar').style.setProperty('--carve',(smooth((p-.06)/.91)*100).toFixed(2)+'%');
}
function renderFinishing(p){
 formation.update('polish',p);
 const polish=smooth((p-.13)/.75);
 $('#polishStage').style.setProperty('--polish',polish.toFixed(4));
 $('#warmth').style.opacity=(.14*(1-polish)).toFixed(4);
 $('#warmth').style.transform='translate3d('+lerp(9,-13,polish).toFixed(2)+'%,0,0)';
 $('#polishStage').style.setProperty('--finishOutro',smooth((p-.91)/.09).toFixed(4));
 // The authored v7 frames already contain real directional highlights.
 // Do not slide a rectangular light layer over the image while scrolling.
 $('#highlight').style.opacity='0';
 $('#finishTrack').style.transform='scaleX('+polish.toFixed(4)+')';
 $('#finishWord').textContent=p<.34?'SANDING':p<.73?'SMOOTHING':'POLISHING';
}
function syncApprovedPlacement(y){
 // One art object per chapter. Reparenting live WebGL while scrolling causes
 // a canvas resize, a GPU reallocation, and a visible sculpture jump.
 const finishing=readings.find(r=>r.name==='finishing');
 if(!finishing)return;
 const p=clamp((y-finishing.top)/finishing.distance);
 const stage=$('#polishStage'),host=$('#approvedHost');
 stage.dataset.handoffMode='single-source';
 stage.dataset.frameAlpha='1';
 stage.dataset.modelAlpha='0';
 if(host.parentElement!==approvedOriginalSlot)approvedOriginalSlot.append(host);
 host.dataset.inFinishing='false';
 if(p>.61&&y<finishing.top+finishing.height+innerHeight*.2)scheduleApprovedInit();
}

function renderCarving(p,onscreen){
 updateFilm(p,onscreen&&!reduced.matches);
 const percent=String(Math.round(p*100)).padStart(2,'0');
 $('#carvingTime').textContent=percent+' / 100';
 const phrase=p<.31?'CARVING BY HAND':p<.68?'THE FORM TAKES SHAPE':'WORK IN PROGRESS';
 if($('#filmPhrase').textContent!==phrase)$('#filmPhrase').textContent=phrase;
}

async function initializeApproved(){
 if(approved||approvedPromise)return;
 const host=$('#approvedHost');
 host.dataset.approvedModelState='loading';
 approvedPromise=import('/prototypes/approved-coil-reveal.js').then(mod=>{
  approved=mod.createApprovedCoilReveal(host,st=>host.dataset.approvedModelState=st);
  // Its original render is driven with a constant final-state parameter.
  // We are not importing any of the old scroll controller or animation.
  approved.update(.999);
  host.dataset.approvedSource='/models/coil-uploaded-v1.glb';
 }).catch(error=>{
  host.dataset.approvedModelState='fallback';
  console.warn('Approved Coil model presentation unavailable',error);
 });
}
function renderReveal(p,near){
 const art=$('#approvedHost');
 // Fade the gallery in from the dark finish. There is never a translucent
 // overlay of two separately rendered versions of Coil.
 art.style.opacity=smooth((p-.005)/.18).toFixed(4);
 // Load the GLB only near the final chapter; the fallback remains visible
 // until the original model is ready, so iOS never shows a blank final frame.
 if(near)scheduleApprovedInit();
 // The approved artwork is a still presentation. Do not re-render the
 // exact same WebGL frame on every scroll tick.
 $('.reveal-poster').style.opacity=art.dataset.approvedModelState==='ready'?'0':'1';
}
function sceneInView(reading,y){
 const y1=reading.top-reading.distance*.12;
 const y2=reading.top+reading.height+innerHeight*.12;
 return y>=y1&&y<=y2;
}
function update(){
 storyFrame=0;
 if(layoutDirty)recordLayout();
 const y=scrollY,view=innerHeight;
 const max=Math.max(1,document.documentElement.scrollHeight-view);
 $('#readingProgress').style.transform='scaleX('+clamp(y/max).toFixed(5)+')';
 let scene='introduction';
 for(const r of readings){
  const p=clamp((y-r.top)/r.distance);
  const near=sceneInView(r,y);
  if(y+view*.48>=r.top&&y<r.top+r.height)scene=r.name;
  if(!near)continue;
  r.el.dataset.progress=p.toFixed(4);
  if(r.name==='introduction'){
   renderIntroduction(clamp((y-r.top)/Math.max(1,r.height-view)));
  }else if(r.name==='origin')renderOrigin(p);
  else if(r.name==='material')renderMaterial(p);
  else if(r.name==='carving')renderCarving(p,y+view>=r.top&&y<r.top+r.height);
  else if(r.name==='detail')renderDetail(p);
  else if(r.name==='finishing')renderFinishing(p);
  else if(r.name==='reveal')renderReveal(p,near);
 }
 if(!readings.find(r=>r.name==='carving'&&sceneInView(r,y))) {
  filmActive=false;
  if(filmIdleTimer){clearTimeout(filmIdleTimer);filmIdleTimer=0;}
  filmStream.suspend();
 }
 const nextFilm=readings.find(r=>r.name==='carving');
 if(nextFilm&&y+view*1.4>=nextFilm.top&&y<nextFilm.top)rememberFrame(0);
 syncApprovedPlacement(y);
 if(y>=($('.endmatter').offsetTop-view*.6))document.body.dataset.currentChapter='end';
 else setScene(scene);
}
function queueUpdate(){
 if(storyFrame)return;
 storyFrame=requestAnimationFrame(update);
}
addEventListener('scroll',queueUpdate,{passive:true});
addEventListener('resize',()=>{layoutDirty=true;formation.resize();filmStream.resize();filmAtlas.resize();approved?.resize();if(approved)approved.update(.999);queueUpdate()},{passive:true});
addEventListener('orientationchange',()=>{layoutDirty=true;queueUpdate()},{passive:true});
document.addEventListener('visibilitychange',()=>{
 if(document.hidden){
  clearTimeout(filmIdleTimer);filmIdleTimer=0;filmStream.suspend();
  if(approvedIdleHandle!==null){
   if('cancelIdleCallback' in window)cancelIdleCallback(approvedIdleHandle);
   else clearTimeout(approvedIdleHandle);
   approvedIdleHandle=null;
  }
 }
 queueUpdate();
});
reduced.addEventListener?.('change',queueUpdate);
// The story's skip action now leads to the collection rather than to Coil.
// Do not trap or intercept the native navigation.
// Prime real mobile documentary frames, without decoding an entire video on load.
if(mobile()){rememberFrame(0);rememberFrame(1);}
checkHdFrames();
queueUpdate();
document.documentElement.dataset.makingAtelier='ready';
window.__mabwePerformance=()=>({film:filmStream.stats(),filmAtlas:filmAtlas.stats(),coil:formation.stats(),filmMoving,chapter:currentScene,scroll:scrollY});
if(new URLSearchParams(location.search).get('embed')==='1')document.documentElement.dataset.embed='true';
