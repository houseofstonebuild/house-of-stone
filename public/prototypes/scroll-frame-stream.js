// Predictive, bounded scroll-image player for an isolated editorial preview.
// Each image is decoded before display. A single canvas is repainted only when
// its source frame changes, so loading can never flash a blank <img>.
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
export function createFrameStream({stage,image,mobile,src,onDisplay,position=()=>({x:50,y:50})}){
 const canvas=document.createElement('canvas');
 canvas.className='scroll-frame-canvas';
 canvas.setAttribute('aria-hidden','true');
 image.after(canvas);
 const context=canvas.getContext('2d',{alpha:false,desynchronized:true});
 let count=144,target=-1,displayed=-1,profile=mobile()?'mobile':'desktop';
 let active=true,queued=new Map(),loading=0,lastFrame=null,rootVersion=0,frameErrors=0;
 let memory=new Map(),displayCount=0,requestCount=0,staleCount=0;
 const retries=new Map();
 let direction=1;
 const budget=()=>mobile()?7:13;
 const inflight=()=>mobile()?2:3;
 function url(index){return src(index,profile);}
 function draw(img,index){
  if(!context)return;
  const rect=stage.getBoundingClientRect(),w=Math.max(1,Math.round(rect.width)),h=Math.max(1,Math.round(rect.height));
  const ratio=Math.min(devicePixelRatio||1,mobile()?1:1.45);
  const ww=Math.max(1,Math.round(w*ratio)),hh=Math.max(1,Math.round(h*ratio));
  if(canvas.width!==ww||canvas.height!==hh){canvas.width=ww;canvas.height=hh;}
  const sx=ww/img.naturalWidth,sy=hh/img.naturalHeight,scale=Math.max(sx,sy);
  const dw=img.naturalWidth*scale,dh=img.naturalHeight*scale;
  const {x=50,y=50}=position();
  const dx=(ww-dw)*clamp(x/100,0,1),dy=(hh-dh)*clamp(y/100,0,1);
  context.imageSmoothingEnabled=true;
  context.imageSmoothingQuality=mobile()?'medium':'high';
  context.clearRect(0,0,ww,hh);
  context.drawImage(img,dx,dy,dw,dh);
  displayed=index;lastFrame=img;displayCount++;
  canvas.style.opacity='1';
  stage.dataset.displayedFrame=String(index);
  stage.dataset.frameStatus='ready';
  onDisplay?.(index,img);
 }
 function prioritize(index,priority){
  if(index<0||index>=count)return;
  const item=memory.get(index);
  if(item?.state==='ready')return;
  if(item?.state==='loading')return;
  const prev=queued.get(index);
  if(prev===undefined||priority<prev)queued.set(index,priority);
 }
 function clean(){
  const keep=new Set([target,displayed,target+direction,target-direction]);
  // Keep only the nearest decoded frames; each mobile frame is over 4 MB
  // when expanded to an RGBA texture even if its WebP is small on the wire.
  const entries=[...memory.entries()].filter(([,e])=>e.state==='ready');
  entries.sort((a,b)=>Math.abs(a[0]-target)-Math.abs(b[0]-target));
  for(const [n] of entries.slice(budget())){
   if(!keep.has(n))memory.delete(n);
  }
 }
 function choose(){
  if(target<0)return;
  const exact=memory.get(target);
  if(exact?.state==='ready'){if(displayed!==target)draw(exact.img,target);return;}
  // A nearby available frame may bridge a slow scroll. Do not leap to an
  // unrelated old frame or produce a jump when reversing direction.
  let near=-1,best=4;
  for(const [n,e] of memory){
   if(e.state!=='ready')continue;
   const distance=Math.abs(n-target);
   if(distance<best){near=n;best=distance;}
  }
  if(near>=0&&(displayed<0||Math.abs(displayed-target)>5)&&near!==displayed){
   draw(memory.get(near).img,near);
  }
 }
 function pump(){
  if(!active)return;
  while(loading<inflight()&&queued.size){
   let selected=-1,score=Infinity;
   for(const [frame,priority] of queued){
    const value=priority+Math.abs(frame-target)*.015;
    if(value<score){score=value;selected=frame;}
   }
   queued.delete(selected);
   if(selected<0||memory.has(selected))continue;
   const version=rootVersion;
   const img=new Image();
   img.decoding='async';
   memory.set(selected,{state:'loading',img,version});
   requestCount++;loading++;
   img.src=url(selected);
   img.decode().then(()=>{
    const record=memory.get(selected);
    if(version!==rootVersion||record?.img!==img){staleCount++;return;}
    record.state='ready';
    choose();
    clean();
   }).catch(()=>{
    const record=memory.get(selected);
    if(version!==rootVersion||record?.img!==img)return;
    record.state='error';frameErrors++;
    stage.dataset.frameErrors=String(frameErrors);
    // Recover from transient HTTP/decode failures, but cap retries so a
    // genuinely missing image never creates an endless network loop.
    const attempts=retries.get(selected)||0;
    if(attempts<2){
     retries.set(selected,attempts+1);
     memory.delete(selected);
     setTimeout(()=>{
      if(version!==rootVersion||!active||target!==selected)return;
      prioritize(selected,0);pump();
     },200*(attempts+1));
    }
   }).finally(()=>{loading--;if(active)pump();});
  }
 }
 function request(index,visible=true){
  index=clamp(Math.round(index),0,count-1);
  if(profile!==(mobile()?'mobile':'desktop'))resize(true);
  const wasActive=active;
  if(target===index&&wasActive===Boolean(visible)){
   choose();
   return;
  }
  active=Boolean(visible);
  if(target>=0&&index!==target)direction=index>target?1:-1;
  target=index;
  stage.dataset.requestedFrame=String(index);
  choose();
  // Discard not-yet-started requests from earlier scroll positions: the
  // exact current frame always wins over an obsolete prefetch.
  queued.clear();
  prioritize(index,0);
  if(active){
   prioritize(index+direction,1);
   prioritize(index-direction,2);
   if(!mobile()){
    prioritize(index+2*direction,3);
    prioritize(index-2*direction,4);
   }
   pump();
  }
 }
 function prime(index){
  if(target===-1)target=index;
  prioritize(index,0);
  if(active)pump();
 }
 function configure({frames=count}={}){
  count=frames;rootVersion++;
  memory.clear();queued.clear();retries.clear();
  target=displayed=-1;lastFrame=null;
  canvas.style.opacity='0';
  stage.dataset.frameStatus='loading';
  stage.dataset.frameEdition=String(rootVersion);
  active=true;
 }
 function resize(force=false){
  const next=mobile()?'mobile':'desktop';
  if(next!==profile){
   profile=next;rootVersion++;
   memory.clear();queued.clear();retries.clear();
   target=displayed=-1;lastFrame=null;
   canvas.style.opacity='0';stage.dataset.frameStatus='loading';
  }else if(lastFrame){
   draw(lastFrame,displayed);
  }
 }
 function suspend(){
  active=false;queued.clear();
  // Retain only the displayed/near frame when the chapter is offscreen.
  for(const [n,e] of memory)if(n!==displayed&&e.state==='ready')memory.delete(n);
 }
 function stats(){return {target,displayed,ready:[...memory.values()].filter(v=>v.state==='ready').length,
  queued:queued.size,inflight:loading,requests:requestCount,draws:displayCount,errors:frameErrors,stale:staleCount,profile};}
 return {request,prime,configure,resize,suspend,stats,canvas,get displayed(){return displayed;}};
}
