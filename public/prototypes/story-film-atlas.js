// Native-detail, four-frame sheets: adjacent motion needs no network or decode.
// Only the active sheet and one neighboring sheet remain decoded.
export function createStorySequence({stage,image,kind,mobile,onDisplay}){
 const canvas=document.createElement('canvas');canvas.className='scroll-frame-canvas';canvas.setAttribute('aria-hidden','true');image.after(canvas);
 const ctx=canvas.getContext('2d',{alpha:false,desynchronized:true});
 let meta=null,profile=mobile()?'mobile':'desktop',epoch=0,target=0,displayed=-1,active=false,loading=0,direction=1;
 let w=0,h=0,lastSheet=null,draws=0,requests=0,errors=0,lastX=-1,lastY=-1;
 const cache=new Map(),queue=new Map();let pending=-1;
 const root='/assets/story-sequence-v1/'+kind;
 function dimensions(){w=Math.max(1,stage.clientWidth);h=Math.max(1,stage.clientHeight)}
 function paint(){
  if(!meta||!active)return;
  const sheet=Math.floor(target/4),entry=cache.get(sheet);if(entry?.state!=='ready')return;
  const {width:tw,height:th}=meta.profiles[profile];if(!w||!h)dimensions();
  const ratio=Math.min(devicePixelRatio||1,2,tw/w,th/h),cw=Math.max(1,Math.round(w*ratio)),ch=Math.max(1,Math.round(h*ratio));
  if(canvas.width!==cw||canvas.height!==ch){canvas.width=cw;canvas.height=ch;displayed=-1;}
  if(displayed===target&&lastX===w&&lastY===h)return;
  const cell=target%4,scale=Math.max(cw/tw,ch/th),dw=tw*scale,dh=th*scale;
  ctx.drawImage(entry.img,cell%2*tw,Math.floor(cell/2)*th,tw,th,(cw-dw)/2,(ch-dh)/2,dw,dh);
  displayed=target;lastSheet=sheet;lastX=w;lastY=h;draws++;
  canvas.style.opacity='1';stage.dataset.displayedFrame=String(displayed);stage.dataset.frameStatus='ready';onDisplay?.(displayed);
 }
 function trim(){
  const sheet=Math.floor(target/4),keep=[...cache.keys()].sort((a,b)=>Math.abs(a-sheet)-Math.abs(b-sheet));
  for(const n of keep.slice(2)){if(cache.get(n)?.state==='ready')cache.delete(n);}
 }
 function add(sheet,priority){
  if(!meta||sheet<0||sheet>=Math.ceil(meta.frames/4)||cache.has(sheet))return;
  queue.set(sheet,priority);
 }
 function pump(){
  if(!meta||!active)return;
  while(loading<1&&queue.size){
   const n=[...queue].sort((a,b)=>a[1]-b[1])[0][0];queue.delete(n);if(cache.has(n))continue;
   const img=new Image(),version=epoch,record={img,state:'loading'};img.decoding='async';cache.set(n,record);loading++;requests++;
   img.src=root+'/'+profile+'/sheet_'+String(n).padStart(3,'0')+'.webp';
   img.decode().then(()=>{
    if(epoch!==version||cache.get(n)!==record)return;
    record.state='ready';if(!active){cache.delete(n);return;}paint();trim();
   }).catch(()=>{if(epoch!==version)return;errors++;record.state='error';stage.dataset.frameStatus='unavailable';}).finally(()=>{loading--;pump()});
  }
 }
 function request(frame,visible=true){
  if(frame!==target)direction=frame>target?1:-1;target=Math.max(0,Math.round(frame));active=visible;
  stage.dataset.requestedFrame=String(target);pending=target;
  if(!visible){suspend();return;}
  if(!meta)return;
  const next=mobile()?'mobile':'desktop';if(next!==profile){profile=next;epoch++;cache.clear();queue.clear();displayed=-1;dimensions();}
  target=Math.min(meta.frames-1,target);paint();queue.clear();const sheet=Math.floor(target/4);
  add(sheet,0);add(sheet+direction,1);pump();trim();
 }
 function suspend(){active=false;queue.clear();for(const [n,e] of cache)if(e.state==='ready')cache.delete(n);lastSheet=null;}
 function resize(){dimensions();lastX=lastY=-1;if(active)request(target,true)}
 function stats(){const ready=[...cache.values()].filter(e=>e.state==='ready');return {target,displayed,ready:ready.length,inflight:loading,requests,draws,errors,profile,bytes:ready.reduce((n,e)=>n+e.img.naturalWidth*e.img.naturalHeight*4,0),mode:'native-detail-sheets',pixels:canvas.width*canvas.height};}
 const ready=fetch(root+'/manifest.json').then(r=>{if(!r.ok)throw Error('Story media missing: '+kind);return r.json()}).then(m=>{
  if(m.version!==1||m.per_sheet!==4||!m.profiles?.[profile])throw Error('Invalid source sheet manifest');meta=m;if(active)request(pending,true);
 }).catch(error=>{stage.dataset.frameStatus='unavailable';console.warn(error);});
 return {request,resize,suspend,stats,ready,canvas};
}
