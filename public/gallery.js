// Original photographs are fetched for inspection; responsive images lead browsing.
export function initializeGallery({root,document,applyImage,rotationFor=()=>'',resolveSource=source=>source,motionPreference,onView}) {
  const dialog=root.querySelector('#hos-photo-dialog'),stage=dialog.querySelector('.hos-photo-stage'),large=dialog.querySelector('img'),title=dialog.querySelector('h2'),status=dialog.querySelector('[role="status"]');
  const main=root.querySelector('#hos-work-image'),opener=root.querySelector('#hos-work-photo-open'),track=root.querySelector('#hos-gallery-track'),dots=root.querySelector('#hos-gallery-dots'),thumbs=root.querySelector('#hos-work-additional-images'),story=root.querySelector('#hos-work-gallery-story'),count=root.querySelector('#hos-gallery-count');
  let photos=[],photoButtons=[],index=0,scale=1,lastTrigger,touchStart,suppressUntil=0,selectedWorkId='',pan,scrollFrame=0;
  const labels={left:'Left',right:'Right',back:'Back',detail:'Surface detail',detail2:'Carved detail',signature:'Signature',scale:'Scale',interior:'In a residence',gallery:'In a gallery',office:'In an office'};
  function updateSelection(i){
    index=Math.max(0,Math.min(photos.length-1,i));const photo=photos[index];if(!photo)return;
    photoButtons.forEach((button,n)=>button.setAttribute('aria-pressed',String(n===index)));
    [...dots.children].forEach((button,n)=>button.setAttribute('aria-current',String(n===index)));
    root.querySelector('#hos-work-photo-caption').textContent=photo.label;count.textContent=(index+1)+' / '+photos.length;
    opener.dataset.photoKind=photo.kind||'studio';opener.dataset.detailCrop=String(Boolean(photo.zoom));
    opener.querySelector('.hos-photo-zoom-invite').setAttribute('aria-label','Inspect '+photo.label.toLowerCase()+' of '+title.textContent);
    for(const img of [track.children[index-1]?.querySelector('img'),track.children[index]?.querySelector('img'),track.children[index+1]?.querySelector('img')])if(img)img.loading='eager';
    root.querySelectorAll('[data-gallery-step]').forEach(button=>button.disabled=Number(button.dataset.galleryStep)<0?index===0:index===photos.length-1);
  }
  function select(i,behavior='smooth'){
    if(!photos.length)return;
    const next=Math.max(0,Math.min(photos.length-1,i));updateSelection(next);
    track.scrollTo({left:next*track.clientWidth,behavior:motionPreference?.matches?'instant':behavior});
  }
  track.addEventListener('scroll',()=>{
    if(scrollFrame)return;
    scrollFrame=(document.defaultView||globalThis).requestAnimationFrame(()=>{
      scrollFrame=0;if(!photos.length||!track.clientWidth)return;
      const nearest=Math.round(track.scrollLeft/track.clientWidth);
      if(nearest!==index)updateSelection(nearest);
    });
  },{passive:true});
  root.querySelectorAll('[data-story-step]').forEach(button=>button.addEventListener('click',()=>story.scrollBy({left:Number(button.dataset.storyStep)*(story.children[0]?.offsetWidth+24||story.clientWidth*.85),behavior:motionPreference?.matches?'instant':'smooth'})));
  function zoom(value,center=true){
    const oldWidth=large.offsetWidth,oldHeight=large.offsetHeight,cx=(stage.scrollLeft+stage.clientWidth/2-Math.max(0,(stage.clientWidth-oldWidth)/2))/Math.max(oldWidth,1),cy=(stage.scrollTop+stage.clientHeight/2)/Math.max(oldHeight,1);
    scale=Math.min(5,Math.max(1,value));
    const fit=Math.min(stage.clientWidth/(large.naturalWidth||1),stage.clientHeight/(large.naturalHeight||1));
    large.style.width=Math.round(large.naturalWidth*fit*scale)+'px';large.style.height=Math.round(large.naturalHeight*fit*scale)+'px';large.style.maxHeight='none';
    stage.dataset.zoomed=String(scale>1);dialog.querySelector('.hos-zoom-status').textContent=Math.round(scale*100)+'%';
    dialog.querySelectorAll('[data-photo-zoom]').forEach(button=>button.disabled=Number(button.dataset.photoZoom)<0?scale<=1:scale>=5);
    if(center&&scale>1)stage.scrollTo({left:cx*large.offsetWidth-stage.clientWidth/2,top:cy*large.offsetHeight-stage.clientHeight/2,behavior:'instant'});
    else stage.scrollTo({left:Math.max(0,(large.offsetWidth-stage.clientWidth)/2),top:Math.max(0,(large.offsetHeight-stage.clientHeight)/2),behavior:'instant'});
  }
  function display(){
    stage.scrollTo({left:0,top:0,behavior:'instant'});
    scale=photos[index].zoom || 1;large.onload=()=>zoom(scale,false);large.src=photos[index].source;large.style.rotate=rotationFor(photos[index].source);large.alt=photos[index].label+' of '+title.textContent;
    if(large.complete&&large.naturalWidth)zoom(scale,false);
    status.textContent=photos[index].label+' · '+(index+1)+' / '+photos.length;for(const node of dialog.querySelectorAll('[data-photo-step]'))node.disabled=photos.length<2;
  }
  function close(){document.body.classList.remove('hos-photo-open');if(dialog.open){dialog.close();lastTrigger?.focus({preventScroll:true});}large.removeAttribute('src');}
  function inspect(trigger,i=index){if(!photos.length)return;select(i);lastTrigger=trigger;dialog.showModal();display();document.body.classList.add('hos-photo-open');onView?.();}
  opener.addEventListener('click',()=>{if(Date.now()>=suppressUntil)inspect(opener.querySelector('.hos-photo-zoom-invite'));});
  opener.addEventListener('touchstart',event=>{const point=event.touches?.[0];if(point)touchStart={x:point.clientX,y:point.clientY};},{passive:true});
  opener.addEventListener('touchend',event=>{const point=event.changedTouches?.[0];if(point&&touchStart&&Math.abs(point.clientX-touchStart.x)>12)suppressUntil=Date.now()+500;touchStart=null;},{passive:true});
  root.querySelectorAll('[data-gallery-step]').forEach(button=>button.addEventListener('click',()=>select(index+Number(button.dataset.galleryStep))));
  dialog.querySelector('[data-photo-close]').addEventListener('click',close);
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  dialog.addEventListener('click',event=>{if(event.target===dialog){const b=dialog.getBoundingClientRect();if(event.clientX<b.left||event.clientX>b.right||event.clientY<b.top||event.clientY>b.bottom)close();}});
  function step(direction){select(index+direction);display();}
  dialog.querySelectorAll('[data-photo-step]').forEach(button=>button.addEventListener('click',()=>step(Number(button.dataset.photoStep))));
  dialog.querySelectorAll('[data-photo-zoom]').forEach(button=>button.addEventListener('click',()=>zoom(scale+Number(button.dataset.photoZoom))));
  dialog.querySelector('[data-photo-reset]').addEventListener('click',()=>zoom(1,false));
  stage.addEventListener('dblclick',event=>{event.preventDefault();zoom(scale>1?1:2,false);});
  stage.addEventListener('pointerdown',event=>{if(scale<=1||event.button!==0)return;pan={id:event.pointerId,x:event.clientX,y:event.clientY,left:stage.scrollLeft,top:stage.scrollTop};stage.setPointerCapture(event.pointerId);stage.dataset.dragging='true';event.preventDefault();});
  stage.addEventListener('pointermove',event=>{if(!pan||event.pointerId!==pan.id)return;stage.scrollLeft=pan.left-(event.clientX-pan.x);stage.scrollTop=pan.top-(event.clientY-pan.y);});
  const endPan=()=>{pan=null;delete stage.dataset.dragging;};
  stage.addEventListener('pointerup',endPan);stage.addEventListener('pointercancel',endPan);stage.addEventListener('lostpointercapture',endPan);
  const resize=()=>{if(dialog.open&&large.naturalWidth)zoom(scale);};
  const view=document.defaultView || globalThis;
  if(typeof view.ResizeObserver==='function')new view.ResizeObserver(resize).observe(stage);
  else view.addEventListener?.('resize',resize,{passive:true});
  dialog.addEventListener('keydown',event=>{if(event.target.tagName==='INPUT')return;if(event.key==='+'||event.key==='='){event.preventDefault();zoom(scale+.5);}else if(event.key==='-'){event.preventDefault();zoom(scale-.5);}else if(event.key==='0'){event.preventDefault();zoom(1,false);}else if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();if(scale>1)stage.scrollBy({left:event.key==='ArrowRight'?100:-100});else step(event.key==='ArrowRight'?1:-1);}else if(scale>1&&(event.key==='ArrowUp'||event.key==='ArrowDown')){event.preventDefault();stage.scrollBy({top:event.key==='ArrowDown'?100:-100});}});
  return {close,setWork(work,assets,scenes=[],heroSource='',hasModel=false){
    close();index=0;selectedWorkId=work.id;photos=[{source:assets[work.image],label:'Front'}];
    for(const [key,label] of Object.entries(labels))if(!(key==='interior'&&scenes.length)&&assets[work.views?.[key]])photos.push({source:assets[work.views[key]],label,kind:['detail','detail2'].includes(key)?'detail':['interior','gallery','office'].includes(key)?'interior':'angle'});
    if(!work.views?.detail && assets[work.image])photos.push({source:assets[work.image],label:'Stone detail',kind:'detail',zoom:1.8});
    for(const [n,key] of (work.additionalImages||[]).entries())if(assets[key]&&!photos.some(photo=>photo.source===assets[key]))photos.push({source:assets[key],label:assets[key].includes('/hos-artist-')?'With the artist':'Additional view '+(n+1),kind:assets[key].includes('/hos-artist-')?'artist':'angle'});
    for(const scene of scenes)photos.push({...scene,label:scene.label||'In a space',kind:'interior'});
    photos=photos.filter(photo=>photo.source).filter((photo,i,all)=>photo.zoom||all.findIndex(other=>other.source===photo.source)===i).map(photo=>({...photo,source:resolveSource(photo.source)}));title.textContent=work.title;thumbs.replaceChildren();story.replaceChildren();track.replaceChildren();dots.replaceChildren();photoButtons=[];
    photos.forEach((photo,i)=>{
      const dot=document.createElement('button');dot.type='button';dot.setAttribute('aria-label','Show '+photo.label.toLowerCase());dot.setAttribute('aria-current',String(i===0));dot.addEventListener('click',()=>select(i));dots.append(dot);
      const slide=document.createElement('div');slide.className='hos-gallery-slide';slide.dataset.kind=photo.kind||'studio';
      const slideImage=i===0?main:document.createElement('img');slideImage.loading=i<2?'eager':'lazy';
      applyImage(slideImage,photo.mobileSource && (document.defaultView||globalThis).matchMedia?.('(max-width:700px)').matches?photo.mobileSource:photo.source,'(max-width:700px) 90vw, 65vw');
      slideImage.alt=photo.label+' of '+work.title;slideImage.style.transform=photo.zoom?'scale('+photo.zoom+')':'';
      slide.append(slideImage);track.append(slide);
      const button=document.createElement('button');button.type='button';button.className='hos-photo-thumbnail';button.setAttribute('aria-label','Show '+photo.label.toLowerCase());button.setAttribute('aria-pressed',String(i===0));
      const img=document.createElement('img');img.loading='lazy';applyImage(img,photo.source,'120px');img.alt='';const label=document.createElement('span');label.textContent=photo.label;button.append(img,label);button.addEventListener('click',()=>select(i));thumbs.append(button);photoButtons.push(button);
      if(i===photos.length-1&&hasModel){
        const model=document.createElement('button');model.type='button';model.className='hos-photo-thumbnail hos-model-thumbnail cursor-interaction';model.dataset.model=work.id;
        model.setAttribute('aria-label','View '+work.title+' in 3D');model.setAttribute('aria-haspopup','dialog');model.setAttribute('aria-controls','hos-model-dialog');
        const face=document.createElement('span');face.className='hos-model-tile-face';face.setAttribute('aria-hidden','true');
        const preview=document.createElement('img');preview.loading='lazy';applyImage(preview,assets[work.image],'120px');preview.alt='';
        const badge=document.createElement('span');badge.className='hos-model-badge';badge.textContent='360°';face.append(preview,badge);
        const label=document.createElement('span');label.textContent='View in 3D';model.append(face,label);thumbs.append(model);
      }
      if(i){const figure=document.createElement('figure');figure.className='hos-gallery-image hos-gallery-'+photo.kind;const inspectButton=document.createElement('button');inspectButton.type='button';inspectButton.setAttribute('aria-label','Inspect '+photo.label.toLowerCase());const image=document.createElement('img');image.loading='lazy';applyImage(image,photo.source,'(max-width:700px) 90vw, 60vw');image.alt=photo.label+' of '+work.title;if(photo.zoom)image.style.transform='scale('+photo.zoom+')';inspectButton.append(image);inspectButton.addEventListener('click',()=>inspect(inspectButton,i));const caption=document.createElement('figcaption');caption.textContent=photo.label;figure.append(inspectButton,caption);story.append(figure);}
    });
    thumbs.hidden=photos.length+(hasModel?1:0)<2;story.hidden=!story.childElementCount;story.scrollTo({left:0,behavior:'instant'});track.scrollTo({left:0,behavior:'instant'});if(photos.length)updateSelection(0);
  }};
}



