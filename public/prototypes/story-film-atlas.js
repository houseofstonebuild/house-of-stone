// Responsive, source-derived documentary preview. This is a 5x5 tile atlas
// of original frames, not generated or interpolated footage. The HD frame
// renderer replaces the preview pixel-for-pixel after scrolling settles.
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export function createFilmAtlas({stage,anchor,mobile,onDisplay}){
 const canvas=document.createElement('canvas');
 canvas.className='film-motion-atlas';
 canvas.setAttribute('aria-hidden','true');
 anchor.after(canvas);
 const mode=new URLSearchParams(location.search).get('filmmode')==='css'?'css':'canvas';
 const compositor=document.createElement('div');
 compositor.className='film-motion-compositor';
 compositor.setAttribute('aria-hidden','true');
 canvas.after(compositor);
 const ctx=mode==='canvas'?canvas.getContext('2d',{alpha:false,desynchronized:true}):null;
 let mountedBlock=-1,mountedProfile='',lastSize='';
 const images=new Map();
 let profile=mobile()?'mobile':'desktop',meta=null,target=-1,ready=0,draws=0;
 let edition=0,loading=false,lastPainted=-1,lastPan=-1;
 function source(index){return '/assets/making-film-atlas-v1/'+profile+'/sheet_'+String(index).padStart(2,'0')+'.webp';}
 function paint(frame,positionX=30,positionY=47){
  if(!meta||frame<0||frame>=meta.frames)return false;
  if(mode==='canvas'&&!ctx)return false;
  target=frame;
  const block=Math.floor(frame/25);
  const bitmap=images.get(block);
  if(!bitmap?.complete||!bitmap.naturalWidth)return false;
  const {tile_width:tw,tile_height:th}=meta.profiles[profile];
  const tile=frame%25;
  if(frame===lastPainted&&Math.abs(positionX-lastPan)<.75)return true;
  const sx=(tile%5)*tw,sy=Math.floor(tile/5)*th;
  const w=Math.max(1,Math.round(stage.clientWidth)),h=Math.max(1,Math.round(stage.clientHeight));
  if(mode==='css'){
   const scale=Math.max(w/tw,h/th);
   const dw=tw*scale,dh=th*scale;
   const left=(w-dw)*clamp(positionX/100,0,1)-(tile%5)*dw;
   const top=(h-dh)*clamp(positionY/100,0,1)-Math.floor(tile/5)*dh;
   const dimensions=dw.toFixed(2)+':'+dh.toFixed(2);
   if(mountedBlock!==block||mountedProfile!==profile){
    compositor.replaceChildren(bitmap);
    mountedBlock=block;mountedProfile=profile;lastSize='';
   }
   if(lastSize!==dimensions){
    bitmap.style.width=(dw*5).toFixed(2)+'px';
    bitmap.style.height=(dh*5).toFixed(2)+'px';
    lastSize=dimensions;
   }
   bitmap.className='film-motion-sprite';
   bitmap.style.transform='translate3d('+left.toFixed(2)+'px,'+top.toFixed(2)+'px,0)';
   compositor.style.opacity='1';
  }else{
   // The original single-canvas compositor is retained as a baseline.
   const previewW=mobile()?Math.min(w,300):Math.min(w,480);
   const pw=Math.max(1,Math.round(previewW));
   const ph=Math.max(1,Math.round(h*(pw/w)));
   if(canvas.width!==pw||canvas.height!==ph){canvas.width=pw;canvas.height=ph;}
   const scale=Math.max(pw/tw,ph/th);
   const dw=tw*scale,dh=th*scale;
   const dx=(pw-dw)*clamp(positionX/100,0,1);
   const dy=(ph-dh)*clamp(positionY/100,0,1);
   ctx.imageSmoothingEnabled=true;
   ctx.imageSmoothingQuality='medium';
   ctx.drawImage(bitmap,sx,sy,tw,th,dx,dy,dw,dh);
   canvas.style.opacity='1';
  }
  draws++;
  lastPainted=frame;lastPan=positionX;
  stage.dataset.displayedFrame=String(frame);
  stage.dataset.displayQuality='atlas-preview';
  stage.dataset.mobileReady='true';
  onDisplay?.(frame);
  return true;
 }
 async function verifyAndLoad(){
  try{
   const response=await fetch('/assets/making-film-atlas-v1/manifest.json',{cache:'no-store'});
   if(!response.ok)return;
   const candidate=await response.json();
   if(candidate.version!==1||candidate.frames!==200||candidate.columns!==5||
     candidate.rows!==5||candidate.frames_per_sheet!==25)return;
   meta=candidate;loading=true;const current=++edition;
   // Allow the browser to stream a limited number of compressed atlases and
   // retain exactly eight decoded sheets (~60 MB for mobile).
   let next=0;
   async function worker(){
    while(next<8&&current===edition){
     const block=next++;
     const img=new Image();img.decoding='async';img.src=source(block);
     try{
      await img.decode();
      if(current!==edition)return;
      images.set(block,img);ready++;
      if(target>=0&&Math.floor(target/25)===block)paint(target,Number(stage.dataset.filmPan||30),47);
     }catch(_){/* the full source frame remains the fallback */}
    }
   }
   await Promise.all([worker(),worker()]);
   loading=false;
  }catch(_){/* conservative HD frame fallback */}
 }
 function resize(){
  const newProfile=mobile()?'mobile':'desktop';
  if(newProfile!==profile){
   profile=newProfile;images.clear();ready=0;meta=null;edition++;
   lastPainted=-1;lastPan=-1;
   mountedBlock=-1;mountedProfile='';lastSize='';
   compositor.replaceChildren();compositor.style.opacity='0';
   canvas.style.opacity='0';verifyAndLoad();
  }else if(target>=0){
   lastPainted=-1;lastSize='';
   paint(target,Number(stage.dataset.filmPan||30),47);
  }
 }
 function stats(){return {enabled:Boolean(meta),ready,frames:meta?.frames||0,draws,profile,loading,mode};}
 verifyAndLoad();
 return {paint,resize,stats,canvas,get available(){return Boolean(meta)},get ready(){return ready}};
}
