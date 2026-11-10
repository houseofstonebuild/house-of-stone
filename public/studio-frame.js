// Extend only the photographed backdrop into object-fit letterboxing.
// The source bitmap and sculpture pixels are never rewritten or cropped.
const frames=new WeakMap();
// Reuse one observer per page, not one per image. Unrelated photographs do not
// need image processing, and studio backgrounds can wait until near the screen.
let resizeObserver,visibilityObserver;
function observeStudio(img,state){
 if(typeof window.ResizeObserver==='function'){
  if(!resizeObserver)resizeObserver=new window.ResizeObserver(entries=>{
   for(const entry of entries){const current=frames.get(entry.target);if(current?.source&&current.visible)paint(entry.target,current);}
  });
  resizeObserver.observe(img);
 }
 if(typeof window.IntersectionObserver==='function'){
  if(!visibilityObserver)visibilityObserver=new window.IntersectionObserver(entries=>{
   for(const entry of entries){
    const current=frames.get(entry.target);if(!current?.source)continue;
    current.visible=entry.isIntersecting;
    if(current.visible&&entry.target.complete&&entry.target.naturalWidth)paint(entry.target,current);
   }
  },{rootMargin:'400px 0px'});
  state.visible=false;
  visibilityObserver.observe(img);
 }
}
export function frameStudioImage(img,source){
 if(typeof img.decode!=='function')return;
 let state=frames.get(img);
 if(!source&&!state)return;
 if(!state){
  state={source:'',signature:'',visible:typeof window.IntersectionObserver!=='function'};
  frames.set(img,state);
 }
 const previous=state.source;
 state.source=source;state.signature='';delete img.dataset.studioFramed;img.style.backgroundImage='';
 if(!source){
  resizeObserver?.unobserve(img);visibilityObserver?.unobserve(img);
  return;
 }
 if(!previous)observeStudio(img,state);
 if(img.complete&&img.naturalWidth&&state.visible)paint(img,state);
 else if(!img.complete||!img.naturalWidth)img.addEventListener('load',()=>{if(state.source===source&&state.visible)paint(img,state);},{once:true});
}
function paint(img,state){
 if(!state.source||!img.naturalWidth||!img.clientWidth||!img.clientHeight)return;
 const signature=img.currentSrc+'|'+img.clientWidth+'x'+img.clientHeight;if(state.signature===signature)return;
 try{
  const sample=document.createElement('canvas'),scale=Math.min(1,256/Math.max(img.naturalWidth,img.naturalHeight));sample.width=Math.max(2,Math.round(img.naturalWidth*scale));sample.height=Math.max(2,Math.round(img.naturalHeight*scale));const context=sample.getContext('2d',{willReadFrequently:true});context.fillStyle='#fff';context.fillRect(0,0,sample.width,sample.height);context.drawImage(img,0,0,sample.width,sample.height);const pixels=context.getImageData(0,0,sample.width,sample.height).data;
  const matte=document.createElement('canvas');matte.width=128;matte.height=Math.max(2,Math.round(128*img.clientHeight/img.clientWidth));const output=matte.getContext('2d'),data=output.createImageData(matte.width,matte.height),fit=Math.min(matte.width/sample.width,matte.height/sample.height),ox=(matte.width-sample.width*fit)/2,oy=(matte.height-sample.height*fit)/2;
  for(let y=0;y<matte.height;y++)for(let x=0;x<matte.width;x++){
   let sx=Math.max(0,Math.min(sample.width-1,Math.floor((x-ox)/fit))),sy=Math.max(0,Math.min(sample.height-1,Math.floor((y-oy)/fit)));
   // Interior is covered by the original photo. Sample its edge, never its subject.
   if(x>=ox&&x<matte.width-ox&&y>=oy&&y<matte.height-oy)sx=0;
   const from=(sy*sample.width+sx)*4,to=(y*matte.width+x)*4;const color=[pixels[from],pixels[from+1],pixels[from+2]],neutral=Math.min(...color)>=230&&Math.max(...color)-Math.min(...color)<=20;data.data[to]=neutral?color[0]:250;data.data[to+1]=neutral?color[1]:250;data.data[to+2]=neutral?color[2]:250;data.data[to+3]=255;
  }
  output.putImageData(data,0,0);img.style.backgroundImage='url("'+matte.toDataURL('image/png')+'")';img.style.backgroundSize='100% 100%';img.dataset.studioFramed='true';state.signature=signature;
 }catch{delete img.dataset.studioFramed;}
}
