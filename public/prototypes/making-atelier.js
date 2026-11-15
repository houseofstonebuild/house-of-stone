/* House of Mabwe / The Making
 * A new chapter-local scroll engine, built independently from V3–V8.
 * Video is never autoplayed. Mobile uses real frames from that same film.
 * The sole 3D asset is the already-approved Coil GLB, lazy at the end.
 */
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
 detail:['05','REFINEMENT'],finishing:['06','FINISHING'],reveal:['07','COIL']
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
$mapRoute.style.strokeDasharray=String(mapLength);
const frameCount=48;
const fallbackFrames=19; // First ~8 seconds only: the lion never comes into view.
const atlasCount=18;
let hdFramesReady=false;
let frameRoot='/assets/making-cinema-frames';
const frameCache=new Map();
let activeFilmFrame=-1,desiredFilmFrame=-1,filmDuration=0,videoMetadata=false,lastSeek=-1,lastSeekAt=0,filmActive=false;
let storyFrame=0,layoutDirty=true,readings=[],currentScene='',approved=null,approvedPromise=null;
const filmState=()=>({paused:$film.paused,time:$film.currentTime,frame:desiredFilmFrame,active:filmActive,videoReady:videoMetadata,hdFrames:hdFramesReady,maxSeconds:8.4});
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
 // Until the HD derivative is published, use only the first 19 frames
 // of the original sequence; later frames show a recognizable lion.
 const sourceFrame=hdFramesReady?index:Math.min(fallbackFrames-1,Math.round(index*(fallbackFrames-1)/(frameCount-1)));
 $filmMedia.dataset.sourceFrame=String(sourceFrame);
 return frameRoot+'/frame_'+String(sourceFrame).padStart(2,'0')+'.webp';
}
async function checkHdFrames(){
 try{
  const response=await fetch('/assets/making-cinema-frames-v2/manifest.json',{cache:'no-store'});
  if(!response.ok)return;
  const manifest=await response.json();
  if(manifest.version!==2||manifest.frames!==48||manifest.end_seconds>8.5||manifest.width<1280)return;
  hdFramesReady=true;
  frameRoot='/assets/making-cinema-frames-v2';
  // Select HD source only once the matching media assets are published.
  const hdSource=$film.querySelector('source');
  hdSource.src='/assets/making-chiseling-atelier-hd-v2.mp4';
  $film.load();
  frameCache.clear();
  activeFilmFrame=-1;
  $filmMedia.dataset.mediaQuality='hd-master';
  if(mobile()||saveData)rememberFrame(desiredFilmFrame<0?0:desiredFilmFrame);
  queueUpdate();
 }catch(_){$filmMedia.dataset.mediaQuality='original-fallback'}
}
function rememberFrame(index){
 if(index<0||index>=frameCount)return;
 const cached=frameCache.get(index);
 if(cached)return;
 const img=new Image();
 frameCache.set(index,{img,ready:false,failed:false});
 img.decoding='async';
 img.onload=()=>{
  const entry=frameCache.get(index);
  if(!entry)return;
  entry.ready=true;
  if(index===desiredFilmFrame&&(mobile()||saveData)){
   $mobileFrame.src=img.src;
   $filmMedia.dataset.mobileReady='true';
   activeFilmFrame=index;
   $filmMedia.dataset.displayedFrame=String(index);
  }
 };
 img.onerror=()=>{
  const entry=frameCache.get(index);if(entry)entry.failed=true;
  $filmMedia.dataset.fallback='atlas';
 };
 img.src=frameUrl(index);
 // Limit JS Image instances without discarding HTTP cached responses.
 if(frameCache.size>20){
  for(const key of frameCache.keys()){
   if(Math.abs(key-index)>7){frameCache.delete(key);if(frameCache.size<=17)break;}
  }
 }
}

function updateFilm(p,visible){
 const n=Math.max(0,Math.min(frameCount-1,Math.round(clamp(p)*(frameCount-1))));
 const sprite=Math.max(0,Math.min(atlasCount-1,Math.round(clamp(p)*(atlasCount-1))));
 desiredFilmFrame=n;
 $filmMedia.dataset.requestedFrame=String(n);
 $filmMedia.dataset.scrollPosition=p.toFixed(4);
 // Portrait footage reframes the actual chisel contact first, then travels
 // across the worked stone. No small inset and no synthetic hammer image.
 const pan=lerp(18,40,p);
 $mobileFrame.style.objectPosition=pan.toFixed(2)+'% 47%';
 $poster.style.objectPosition=pan.toFixed(2)+'% 47%';
 $filmMedia.dataset.filmPan=pan.toFixed(2);
 const x=sprite%7,y=Math.floor(sprite/7);
 $atlas.style.backgroundPosition=(x/6*100).toFixed(3)+'% '+(y/5*100).toFixed(3)+'%';
 $atlas.dataset.spriteFrame=String(sprite);
 $film.pause();
 filmActive=Boolean(visible);
 if(!visible)return;

 if(mobile()||saveData){
  rememberFrame(n);
  for(const neighbor of [n-1,n+1,n-2,n+2])rememberFrame(neighbor);
  const item=frameCache.get(n);
  if(item?.ready&&activeFilmFrame!==n){
   $mobileFrame.src=item.img.src;
   $filmMedia.dataset.mobileReady='true';
   activeFilmFrame=n;
  }else if(item?.failed){
   $filmMedia.dataset.mobileReady='false';
  }
  return;
 }
 if(!videoMetadata||!Number.isFinite(filmDuration)||filmDuration<=.1){
  $filmMedia.dataset.videoReady='false';
  return;
 }
 const target=clamp(p)*Math.min(8.4,Math.max(.1,filmDuration-.09));
 const now=performance.now();
 if($film.seeking||now-lastSeekAt<68||Math.abs(target-lastSeek)<.055)return;
 lastSeekAt=now;lastSeek=target;
 try{$film.currentTime=target}
 catch(e){$filmMedia.dataset.videoReady='false';$filmMedia.dataset.seekFailure='true'}
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
  frameCache.clear();
  activeFilmFrame=-1;
  $filmMedia.dataset.mediaQuality='original-fallback';
  const source=$film.querySelector('source');
  source.src='/assets/making-chiseling-scrub-v1.mp4';
  $film.load();
  queueUpdate();
 }
});
if($film.readyState>=1){videoMetadata=true;filmDuration=$film.duration||0;}
if(!mobile()&&!saveData)$film.load();

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
 const factor=lerp(1,mobile()?2.25:2.55,zoom);
 const shiftX=lerp(0,-innerWidth*(mobile()?.26:.16),zoom);
 const shiftY=lerp(0,innerHeight*(mobile()?.015:.11),zoom);
 $('.origin-map-wrap').style.transform='translate3d('+shiftX.toFixed(1)+'px,'+shiftY.toFixed(1)+'px,0) scale('+factor.toFixed(4)+')';
 const travel=reduced.matches?1:smooth((p-.41)/.43);
 $mapRoute.style.strokeDashoffset=String((mapLength*(1-travel)).toFixed(2));
 const point=$mapRoute.getPointAtLength(mapLength*travel);
 $truck.setAttribute('transform','translate('+point.x.toFixed(2)+' '+point.y.toFixed(2)+')');
 $truck.style.opacity=String(reduced.matches?1:smooth((p-.38)/.08)*(1-smooth((p-.95)/.05)));
 $('#hararePin').style.opacity=String(reduced.matches?1:smooth((p-.75)/.18));
 $routeReadout.style.opacity=String(reduced.matches?1:smooth((p-.32)/.18));
}
function renderMaterial(p){
 const mix=smooth((p-.36)/.28);
 $('.material-photo.first').style.opacity=String(1-mix);
 $('.material-photo.second').style.opacity=String(mix);
 $('#materialCount').textContent=mix>.5?'02':'01';
}
function renderDetail(p){
 const mix=smooth((p-.34)/.32);
 $('.detail-picture-first').style.opacity=String(1-mix);
 $('.detail-picture-second').style.opacity=String(mix);
 $('#detailIndex').textContent=mix>.5?'02':'01';
 $('.detail-index-bar').style.background='linear-gradient(90deg,#d3bb9c '+(mix*100).toFixed(1)+'%,rgba(240,231,216,.20) 0)';
}
function renderFinishing(p){
 const warmth=1-smooth((p-.12)/.66);
 const polish=smooth((p-.43)/.49);
 $('.finishing-model').style.filter='brightness('+(lerp(.69,1.05,polish)).toFixed(3)+') saturate('+(lerp(.45,1,polish)).toFixed(3)+')';
 $('#warmth').style.opacity=(warmth*.96).toFixed(4);
 $('#warmth').style.background='radial-gradient(ellipse 30% 34% at '+lerp(78,43,p).toFixed(2)+'% '+lerp(31,58,p).toFixed(2)+'%,rgba(241,155,67,.33),rgba(228,112,48,.12) 42%,transparent 77%)';
 $('#highlight').style.transform='translateX('+lerp(-78,88,polish).toFixed(1)+'%)';
 $('#highlight').style.opacity=(polish*.5).toFixed(3);
 $('#finishTrack').style.width=(polish*100).toFixed(1)+'%';
 $('#finishWord').textContent=p<.4?'WARMING':p<.68?'SMOOTHING':'WAX / BUFF';
}
function renderCarving(p,onscreen){
 updateFilm(p,onscreen&&!reduced.matches);
 const percent=String(Math.round(p*100)).padStart(2,'0');
 $('#carvingTime').textContent=percent+' / 100';
 const phrase=p<.31?'STRIKE / LIFT / REPEAT':p<.68?'THE SHAPE DEEPENS':'THE WORK CONTINUES';
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
 // Load the GLB only near the final chapter; the fallback remains visible
 // until the original model is ready, so iOS never shows a blank final frame.
 if(near)initializeApproved();
 if(approved)approved.update(.999);
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
 $('#readingProgress').style.width=(clamp(y/max)*100).toFixed(3)+'%';
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
  filmActive=false;$film.pause();
 }
 if(y>=($('.endmatter').offsetTop-view*.6))document.body.dataset.currentChapter='end';
 else setScene(scene);
}
function queueUpdate(){
 if(storyFrame)return;
 storyFrame=requestAnimationFrame(update);
}
addEventListener('scroll',queueUpdate,{passive:true});
addEventListener('resize',()=>{layoutDirty=true;approved?.resize();queueUpdate()},{passive:true});
addEventListener('orientationchange',()=>{layoutDirty=true;queueUpdate()},{passive:true});
document.addEventListener('visibilitychange',()=>{$film.pause();queueUpdate()});
reduced.addEventListener?.('change',queueUpdate);
$('#jump').addEventListener('click',e=>{
 e.preventDefault();
 if(layoutDirty)recordLayout();
 const section=readings.find(r=>r.name==='reveal');
 if(!section)return;
 history.replaceState(null,'','#finished');
 scrollTo({top:section.top+section.distance*.72,behavior:'instant'});
 initializeApproved();
 queueUpdate();
});
// Prime real mobile documentary frames, without decoding an entire video on load.
if(mobile()){rememberFrame(0);rememberFrame(1);}
checkHdFrames();
queueUpdate();
document.documentElement.dataset.makingAtelier='ready';
