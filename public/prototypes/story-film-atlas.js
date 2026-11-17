/* Source-traceable documentary scrubber.
 * Scroll synchronizes a low-resolution presentation canvas to the selected
 * original source frame, in BOTH directions. It never plays the video.
 * Decode only the current sprite sheet and one adjacent sheet; avoid
 * permanently uploading eight 5x5 sprites to Safari GPU memory. */
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export function createFilmAtlas({stage,anchor,mobile,onDisplay}){
 const canvas=document.createElement('canvas');
 canvas.className='film-motion-atlas';
 canvas.setAttribute('aria-hidden','true');
 anchor.after(canvas);
 const ctx=canvas.getContext('2d',{alpha:false,desynchronized:true});
 const compositor=document.createElement('div');
 compositor.className='film-motion-compositor';
 compositor.setAttribute('aria-hidden','true');
 compositor.hidden=true;
 canvas.after(compositor);
 const images=new Map();
 let profile=mobile()?'mobile':'desktop';
 let meta=null,epoch=0,target=-1,draws=0,ready=0,loading=0;
 let sourceSprite=null,spriteLoading=false;
 let painted=-1,pan=30,lastHeight=-1,lastWidth=-1;
 const maxSheets=()=>mobile()?2:3;
 function source(index){return '/assets/making-film-atlas-v1/'+profile+'/sheet_'+String(index).padStart(2,'0')+'.webp';}
 function trim(){
  if(target<0)return;
  const active=Math.floor(target/25);
  const keep=[...images.keys()].sort((a,b)=>Math.abs(a-active)-Math.abs(b-active));
  for(const key of keep.slice(maxSheets()))images.delete(key);
 }
 function queue(index,version=epoch){
  if(index<0||index>7||images.has(index))return;
  const img=new Image();
  img.decoding='async';
  images.set(index,{img,state:'loading'});
  loading++;
  img.onload=()=>{
   loading=Math.max(0,loading-1);
   if(version!==epoch)return;
   const entry=images.get(index);
   if(!entry||entry.img!==img)return;
   entry.state='ready';
   ready++;
   if(target>=0&&Math.floor(target/25)===index)paint(target,pan,47);
   trim();
  };
  img.onerror=()=>{
   loading=Math.max(0,loading-1);
   if(version!==epoch)return;
   if(images.get(index)?.img===img)images.delete(index);
  };
  img.src=source(index);
 }
 function paint(frame,positionX=30,positionY=47){
  if(!meta||!ctx||frame<0||frame>=meta.frames)return false;
  target=frame;pan=positionX;
  const sheet=Math.floor(frame/25);
  // No frame-by-frame network access: source frames are grouped into tiles.
  // The matching 1600-pixel source is displayed by the separate HD renderer
  // after the scroll gesture settles.
  const entry=images.get(sheet);
  if(!sourceSprite&&(!entry||entry.state!=='ready')){
   queue(sheet);
   return false;
  }
  const width=Math.max(1,Math.round(stage.clientWidth));
  const height=Math.max(1,Math.round(stage.clientHeight));
  const renderW=Math.max(1,Math.min(width,mobile()?360:640));
  const renderH=Math.max(1,Math.round(height*(renderW/width)));
  if(renderW!==lastWidth||renderH!==lastHeight){
   canvas.width=lastWidth=renderW;
   canvas.height=lastHeight=renderH;
  }
  if(frame!==painted){
   const source=sourceSprite||entry.img;
   const tile=sourceSprite?Math.round(frame*17/199):frame%25;
   const tw=sourceSprite?source.naturalWidth/7:meta.profiles[profile].tile_width;
   const th=sourceSprite?source.naturalHeight/6:meta.profiles[profile].tile_height;
   const sx=sourceSprite?tile%7*tw:tile%5*tw;
   const sy=sourceSprite?Math.floor(tile/7)*th:Math.floor(tile/5)*th;
   const scale=Math.max(renderW/tw,renderH/th);
   const dw=tw*scale,dh=th*scale;
   const dx=(renderW-dw)*clamp(positionX/100,0,1);
   const dy=(renderH-dh)*clamp(positionY/100,0,1);
   ctx.imageSmoothingEnabled=true;
   ctx.imageSmoothingQuality='medium';
   ctx.drawImage(source,sx,sy,tw,th,dx,dy,dw,dh);
   painted=frame;draws++;
  }
  canvas.style.opacity='1';
  stage.dataset.displayedFrame=String(sourceSprite?Number(stage.dataset.requestedFrame||frame):frame);
  stage.dataset.displayQuality='atlas-preview';
  stage.dataset.mobileReady='true';
  onDisplay?.(frame);
  // Only one speculative sheet: do not decode all eight at first paint.
  // Queue it only when the active sheet is almost exhausted.
  const nearEnd=(frame%25)>19;
  const nearStart=(frame%25)<5;
  if(!sourceSprite){
   if(nearEnd)queue(sheet+1);
   else if(nearStart)queue(sheet-1);
  }
  trim();
  return true;
 }
 async function verifyAndLoad(){
  const version=++epoch;
  try{
   const response=await fetch('/assets/making-film-atlas-v1/manifest.json',{cache:'no-store'});
   if(!response.ok){loadLegacySprite(version);return;}
   const candidate=await response.json();
   if(version!==epoch||candidate.version!==1||candidate.frames!==200||
     candidate.columns!==5||candidate.rows!==5||
     candidate.frames_per_sheet!==25||!candidate.profiles?.[profile])return;
   meta=candidate;
   // First paint costs a single source image instead of all 8 atlas sheets.
   queue(Math.max(0,Math.floor(Math.max(0,target)/25)),version);
  }catch(_){loadLegacySprite(version);}
 }
 function loadLegacySprite(version){
  if(version!==epoch||sourceSprite||spriteLoading)return;
  spriteLoading=true;
  const img=new Image();
  img.decoding='async';
  img.onload=()=>{
   spriteLoading=false;
   if(version!==epoch)return;
   sourceSprite=img;
   meta={frames:200};
   canvas.style.opacity='0';
   if(target>=0)paint(target,pan,47);
  };
  img.onerror=()=>{spriteLoading=false;};
  img.src='/assets/making-chiseling-scroll-frames-v1.webp';
 }
 function resize(){
  const newProfile=mobile()?'mobile':'desktop';
  if(newProfile!==profile){
   profile=newProfile;epoch++;images.clear();ready=0;loading=0;meta=null;
   sourceSprite=null;spriteLoading=false;
   canvas.style.opacity='0';painted=-1;lastWidth=lastHeight=-1;
   verifyAndLoad();
  }else{
   lastWidth=lastHeight=-1;painted=-1;
   if(target>=0)paint(target,pan,47);
  }
 }
 function stats(){
  return {enabled:Boolean(meta),ready:sourceSprite?1:[...images.values()].filter(v=>v.state==='ready').length,
    frames:meta?.frames||0,draws,profile,loading,mode:'single-canvas',
    cachedSheets:images.size,legacySprite:Boolean(sourceSprite)};
 }
 verifyAndLoad();
 return {paint,resize,stats,canvas,get available(){return Boolean(meta)},get ready(){return stats().ready}};
}
