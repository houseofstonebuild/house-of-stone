// Decode before painting, retain the last good frame, and bound decoded memory.
// One renderer is shared by all stages of a sequence; no quality switch on scroll.
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function createFrameStream({stage,image,mobile,src,onDisplay,position=()=>({x:50,y:50})}){
 const canvas=document.createElement('canvas');canvas.className='scroll-frame-canvas';
 canvas.setAttribute('aria-hidden','true');image.after(canvas);
 const context=canvas.getContext('2d',{alpha:false,desynchronized:true});
 let count=144,target=-1,displayed=-1,profile=mobile()?'mobile':'desktop';
 let active=false,epoch=0,loading=0,draws=0,requests=0,errors=0,stale=0,direction=1;
 let width=0,height=0,lastFrame=null,lastPosition='';
 const cache=new Map(),queue=new Map(),attempts=new Map();
 const maxLoads=()=>mobile()?2:3;
 const maxBytes=()=>mobile()?24*1024*1024:56*1024*1024;
 function resize(){
  width=Math.max(1,stage.clientWidth);height=Math.max(1,stage.clientHeight);
  const next=mobile()?'mobile':'desktop';
  if(next!==profile){profile=next;epoch++;cache.clear();queue.clear();attempts.clear();}
  // Mobile source frames contain enough detail for a retina phone viewport.
  const ratio=Math.min(devicePixelRatio||1,2,Math.sqrt(3000000/(width*height)));
  const w=Math.round(width*ratio),h=Math.round(height*ratio);
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
  lastPosition='';if(lastFrame&&active)draw(lastFrame,displayed);
 }
 function draw(img,index){
  if(!context)return;
  if(!width||!height)resize();
  const {x=50,y=50}=position(),key=x+','+y;
  if(index===displayed&&img===lastFrame&&key===lastPosition)return;
  const scale=Math.max(canvas.width/img.naturalWidth,canvas.height/img.naturalHeight);
  const dw=img.naturalWidth*scale,dh=img.naturalHeight*scale;
  context.drawImage(img,(canvas.width-dw)*clamp(x/100,0,1),(canvas.height-dh)*clamp(y/100,0,1),dw,dh);
  lastFrame=img;displayed=index;lastPosition=key;draws++;
  canvas.style.opacity='1';stage.dataset.displayedFrame=String(index);stage.dataset.frameStatus='ready';
  onDisplay?.(index,img);
 }
 function trim(){
  let bytes=[...cache.values()].reduce((n,e)=>n+(e.bytes||0),0);
  const disposable=[...cache.entries()].filter(([n,e])=>e.state==='ready'&&n!==target&&n!==displayed)
   .sort((a,b)=>Math.abs(b[0]-target)-Math.abs(a[0]-target));
  for(const [n,e] of disposable){if(bytes<=maxBytes())break;cache.delete(n);bytes-=e.bytes;}
 }
 function choose(){
  if(!active)return;
  const exact=cache.get(target);
  if(exact?.state==='ready'){draw(exact.img,target);return;}
  // A completed obsolete request must never move the animation backwards.
  let best=null;
  for(const [n,e] of cache){
   if(e.state!=='ready'||Math.abs(n-target)>3)continue;
   if(displayed>=0&&Math.abs(n-target)>=Math.abs(displayed-target))continue;
   if(!best||Math.abs(n-target)<Math.abs(best[0]-target))best=[n,e];
  }
  if(best)draw(best[1].img,best[0]);
 }
 function prioritize(n,priority){
  if(n<0||n>=count||cache.has(n)||(attempts.get(n)||0)>=3)return;
  if(!queue.has(n)||queue.get(n)>priority)queue.set(n,priority);
 }
 function pump(){
  if(!active)return;
  while(loading<maxLoads()&&queue.size){
   const index=[...queue].sort((a,b)=>a[1]-b[1])[0][0];queue.delete(index);
   if(cache.has(index))continue;
   const version=epoch,img=new Image();img.decoding='async';
   const record={img,state:'loading',bytes:0};cache.set(index,record);
   loading++;requests++;attempts.set(index,(attempts.get(index)||0)+1);
   img.src=src(index,profile);
   img.decode().then(()=>{
    if(version!==epoch||cache.get(index)!==record){stale++;return;}
    record.state='ready';record.bytes=img.naturalWidth*img.naturalHeight*4;
    if(!active&&index!==displayed){cache.delete(index);return;}
    choose();trim();
   }).catch(()=>{
    if(version!==epoch||cache.get(index)!==record)return;
    cache.delete(index);errors++;stage.dataset.frameErrors=String(errors);
    if(index===target&&active&&(attempts.get(index)||0)<3){
     setTimeout(()=>{if(version===epoch&&active&&index===target){prioritize(index,0);pump();}},200);
    }
   }).finally(()=>{loading--;pump();});
  }
 }
 function request(index,visible=true){
  index=clamp(Math.round(index),0,count-1);
  if(profile!==(mobile()?'mobile':'desktop'))resize();
  if(index!==target){direction=target<0?1:Math.sign(index-target);target=index;}
  active=Boolean(visible);stage.dataset.requestedFrame=String(index);
  if(!active){suspend();return;}
  choose();queue.clear();prioritize(index,0);
  // Look ahead along the gesture, with a short reverse buffer.
  for(let i=1;i<=(mobile()?3:5);i++)prioritize(index+direction*i,i);
  prioritize(index-direction,2);pump();
 }
 function prime(index){request(index,true);}
 function configure({frames=count}={}){
  count=frames;epoch++;cache.clear();queue.clear();attempts.clear();target=-1;
  // Preserve the last displayed pixels until the replacement is decoded.
 }
 function suspend(){active=false;queue.clear();for(const [n,e] of cache)if(n!==displayed&&e.state==='ready')cache.delete(n);}
 function stats(){return {target,displayed,ready:[...cache.values()].filter(e=>e.state==='ready').length,
  bytes:[...cache.values()].reduce((n,e)=>n+e.bytes,0),queued:queue.size,inflight:loading,requests,draws,errors,stale,profile};}
 return {request,prime,configure,resize,suspend,stats,canvas,get displayed(){return displayed;}};
}
