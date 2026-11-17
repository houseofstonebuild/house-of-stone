// A continuous playhead over compressed frame packs. Fetching and decoding are
// independent; bounded decoded memory never discards the compressed sequence.
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function createContinuousSequence({canvas,root,profile,focus=.5,onSample=()=>{},onReady=()=>{}}){
 const ctx=canvas.getContext('2d',{alpha:false,desynchronized:true});
 let meta,config,plate=null,baseDirty=true,target=0,current=0,active=false,raf=0,previous=0,drawn=-1,drawnMix=-1,disposed=false,needed=0;
 let fetches=0,decodes=0,direction=1,epoch=0,width=1,height=1,pixelScale=0,bytes=0,peakBytes=0;
 const packs=new Map(),images=new Map(),fetchQueue=new Map(),decodeQueue=new Map();let workingFrames=new Set();
 const measures={requests:0,draws:0,stalls:0,decodeCount:0,workerDecodes:0,decodeMs:[],paintMs:[],fetchErrors:0,decodeErrors:0};
 const sourceBytes=()=>config.width*config.height*4;
 const plateBytes=()=>plate?config.source_width*config.source_height*4:0;
 const limit=()=>Math.max(6,Math.min(24,Math.floor(((profile==='mobile'?56:80)*1024*1024-plateBytes())/sourceBytes())));
 function trim(){
  if(!config)return;const keep=limit();
  const protectedFrames=new Set([Math.floor(current),Math.ceil(current),Math.floor(needed),Math.ceil(needed)]);
  const entries=[...images].sort((a,b)=>(protectedFrames.has(b[0])-protectedFrames.has(a[0]))||(workingFrames.has(b[0])-workingFrames.has(a[0]))||Math.abs(a[0]-needed)-Math.abs(b[0]-needed));
  for(const [index,img] of entries.slice(keep)){const size=img.width*img.height*4;img.close?.();images.delete(index);bytes-=size;}
 }
 function packFor(index){return config.packs.findIndex(p=>index>=p.start&&index<p.start+p.entries.length)}
 function needPack(index,priority){
  const n=packFor(index);if(n<0||packs.has(n))return;
  fetchQueue.set(n,Math.min(priority,fetchQueue.get(n)??Infinity));
 }
 function needImage(index,priority){
  if(index<0||index>=meta.frames||images.has(index))return;
  decodeQueue.set(index,Math.min(priority,decodeQueue.get(index)??Infinity));needPack(index,priority);
 }
 function plan(){
  if(!config||disposed)return;
  const base=Math.floor(current),wanted=Math.round(target),count=limit();
  decodeQueue.clear();const selected=new Set();
  function choose(index,priority){if(index<0||index>=meta.frames||(!selected.has(index)&&selected.size>=count))return;selected.add(index);needImage(index,priority);}
  choose(Math.floor(needed),-102);choose(Math.ceil(needed),-101);choose(base,-100);choose(base+1,-99);
  if(Math.abs(wanted-base)<count){choose(wanted,-90);choose(wanted+direction,-89);}
  for(let d=1;d<count;d++){choose(base+d*direction,d);if(d<count/3)choose(base-d*direction,d+2);}
  workingFrames=selected;trim();
  // Whole compressed packs are fetched early. Their blobs remain cheap to retain
  // after decoded pixels leave the working window, making reverse scroll warm.
  needPack(wanted,-80);needPack(base+direction*count,0);
  if(active){for(let d=1;d<config.packs.length;d++){const n=packFor(base);const next=n+d*direction;if(next>=0&&next<config.packs.length&&!packs.has(next))fetchQueue.set(next,30+d);}}
  pumpFetch();pumpDecode();
 }
 function pumpFetch(){
  if(disposed||!config)return;
  while(fetches<4&&fetchQueue.size){
   const [index]=[...fetchQueue].sort((a,b)=>a[1]-b[1])[0];fetchQueue.delete(index);if(packs.has(index))continue;
   const item=config.packs[index];const record={state:'loading',data:null};packs.set(index,record);fetches++;measures.requests++;
   fetch(root+'/'+profile+'/'+item.url,{cache:'force-cache'}).then(r=>{if(!r.ok)throw Error('Frame pack '+r.status);return r.arrayBuffer()}).then(data=>{if(disposed)return;record.data=data;record.state='ready';pumpDecode();wake();}).catch(()=>{packs.delete(index);measures.fetchErrors++;}).finally(()=>{fetches--;pumpFetch()});
  }
 }
 async function decode(index,pack,entry,version){
  const begin=performance.now();
  const blob=new Blob([new Uint8Array(pack.data,entry.offset,entry.length)],{type:'image/webp'});
  let image;
  if(typeof createImageBitmap==='function')image=await createImageBitmap(blob);
  else {const url=URL.createObjectURL(blob);try{image=new Image();image.src=url;await image.decode()}finally{URL.revokeObjectURL(url)}}
  if(disposed||version!==epoch||(active&&workingFrames.size&&!workingFrames.has(index))){image.close?.();return;}
  if(images.has(index))image.close?.();else{images.set(index,image);bytes+=image.width*image.height*4;peakBytes=Math.max(bytes+plateBytes(),peakBytes);trim();}
  measures.decodeCount++;measures.decodeMs.push(performance.now()-begin);if(measures.decodeMs.length>1000)measures.decodeMs.shift();
 }
 const decoding=new Set();
 function pumpDecode(){
  if(disposed||!config)return;
  const ordered=[...decodeQueue].sort((a,b)=>a[1]-b[1]);
  for(const [index] of ordered){
   if(decodes>=2)break;if(images.has(index)){decodeQueue.delete(index);continue;}if(decoding.has(index))continue;
   const n=packFor(index),pack=packs.get(n);if(pack?.state!=='ready')continue;
   const item=config.packs[n],entry=item.entries[index-item.start];decodeQueue.delete(index);decoding.add(index);decodes++;
   decode(index,pack,entry,epoch).catch(()=>{measures.decodeErrors++}).finally(()=>{decodes--;decoding.delete(index);pumpDecode();wake()});
  }
 }
 function dimensions(){
  const rect=canvas.getBoundingClientRect(),ratio=Math.min(devicePixelRatio||1,2,config?config.source_width/rect.width:2,config?config.source_height/rect.height:2);
  width=Math.max(1,Math.round(rect.width*ratio));height=Math.max(1,Math.round(rect.height*ratio));
  if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;drawn=-1;baseDirty=true;}
  if(config){
   const required=Math.min(1,Math.max(width/config.source_width,height/config.source_height));
   pixelScale=required;
  }
 }
 function paint(value){
  const low=Math.floor(value),high=Math.min(meta.frames-1,low+1),a=images.get(low),b=images.get(high);
  if(!a||(!b&&value-low>.02))return false;
  const mix=b?Math.round((value-low)*60)/60:0;
  if(drawn===low&&drawnMix===mix)return true;
  const begin=performance.now(),scale=Math.max(width/config.source_width,height/config.source_height);
  const x=(width-config.source_width*scale)*focus+config.crop[0]*scale,y=(height-config.source_height*scale)/2+config.crop[1]*scale;
  const w=config.width*scale,h=config.height*scale;
  ctx.globalAlpha=1;if(!plate||baseDirty){ctx.fillStyle=meta.background||'#161d19';ctx.fillRect(0,0,width,height);if(plate)ctx.drawImage(plate,(width-config.source_width*scale)*focus,(height-config.source_height*scale)/2,config.source_width*scale,config.source_height*scale);baseDirty=false;}ctx.drawImage(a,x,y,w,h);
  if(b&&mix){ctx.globalAlpha=mix;ctx.drawImage(b,x,y,w,h);ctx.globalAlpha=1;}
  drawn=low;drawnMix=mix;measures.draws++;measures.paintMs.push(performance.now()-begin);if(measures.paintMs.length>1000)measures.paintMs.shift();
  const displayed=low+mix;
  canvas.dataset.displayedFrame=String(displayed);canvas.dataset.frameStatus='ready';onSample(displayed);return true;
 }
 function tick(now){
  raf=0;if(!active||!config||disposed||document.hidden)return;
  const dt=previous?Math.min(50,now-previous):16.7;previous=now;
  const delta=target-current,settled=Math.abs(delta)<.015;
  // Time-based damping gives wheels, trackpads and touch the same response.
  const proposed=settled?target:current+delta*(1-Math.exp(-dt/95));
  // During a fast gesture, spend the decode budget on one sharp source frame.
  // Subframe blending resumes for slow motion and the final settle.
  const candidate=Math.abs(delta)>1.4&&Math.abs(proposed-current)>.3?Math.round(proposed):proposed;
  needed=candidate;
  if(paint(candidate)){current=candidate;plan();}
  else{measures.stalls++;plan();}
  if(!settled||!images.has(Math.floor(current)))wake();else previous=0;
 }
 function wake(){if(active&&!raf&&!disposed&&!document.hidden)raf=requestAnimationFrame(tick)}
 function request(value,visible=true){
  if(value!==target)direction=value>target?1:-1;target=clamp(value,0,(meta?.frames||480)-1);
  const entering=!active&&visible;active=visible;if(entering){current=target;needed=target;previous=0;}
  if(!visible){if(raf)cancelAnimationFrame(raf);raf=0;previous=0;return;}
  if(config){plan();wake();}
 }
 function warm(value=0){if(!config)return;if(!active)needed=value;needImage(Math.floor(value),-100);needImage(Math.floor(value)+1,-99);for(let d=0;d<3;d++)needPack(Math.floor(value)+d*24,d);pumpFetch();pumpDecode();}
 function resize(){dimensions();drawn=-1;wake()}
 function suspend(){active=false;if(raf)cancelAnimationFrame(raf);raf=0;previous=0;}
 const ready=fetch(root+'/manifest.json',{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error('Continuous sequence missing');return r.json()}).then(async m=>{
  if(m.version!==1||!m.profiles?.[profile])throw Error('Invalid continuous sequence');meta=m;config=m.profiles[profile];if(config.plate){plate=new Image();plate.src=root+'/'+profile+'/'+config.plate;await plate.decode()}dimensions();warm();if(active){plan();wake()}onReady(m);
 }).catch(error=>{canvas.dataset.frameStatus='unavailable';console.warn(error)});
 const stats=()=>({target,current,pixelScale,images:images.size,decodedBytes:bytes+plateBytes(),peakDecodedBytes:peakBytes,compressedBytes:[...packs.values()].reduce((n,p)=>n+(p.data?.byteLength||0),0),inflightFetches:fetches,inflightDecodes:decodes,...measures});
 return {request,warm,resize,suspend,ready,stats,destroy(){disposed=true;epoch++;suspend();for(const img of images.values())img.close?.();images.clear();packs.clear();plate=null;}};
}
