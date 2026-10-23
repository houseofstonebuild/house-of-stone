// Full-resolution inspection uses original photographs only on request.
export function initializeGallery({root,document,applyImage,motionPreference,onView}) {
  const dialog=root.querySelector('#hos-photo-dialog'),stage=dialog.querySelector('.hos-photo-stage'),large=dialog.querySelector('img'),title=dialog.querySelector('h2'),status=dialog.querySelector('[role="status"]');
  const main=root.querySelector('#hos-work-image'),opener=root.querySelector('#hos-work-photo-open'),thumbs=root.querySelector('#hos-work-additional-images');
  let photos=[],index=0,scale=1,lastTrigger;
  const labels={left:'Left',right:'Right',back:'Back',detail:'Detail',signature:'Signature',scale:'Scale'};
  function select(i){index=(i+photos.length)%photos.length;const photo=photos[index];applyImage(main,photo.source,'(max-width:700px) 90vw, 55vw');main.alt=photo.label+' of '+title.textContent;opener.setAttribute('aria-label','Inspect '+photo.label.toLowerCase()+' of '+title.textContent);thumbs.querySelectorAll('button').forEach((button,n)=>button.setAttribute('aria-pressed',String(n===index)));root.querySelector('#hos-work-photo-caption').textContent=photo.label+' · Select image to inspect';}
  function display(){scale=1;large.style.width='';large.style.maxHeight='';large.src=photos[index].source;large.alt=photos[index].label+' of '+title.textContent;status.textContent=photos[index].label+' · '+(index+1)+' / '+photos.length;stage.scrollTo({left:0,top:0,behavior:'instant'});for(const node of dialog.querySelectorAll('[data-photo-step]'))node.disabled=photos.length<2;}
  function close(){document.body.classList.remove('hos-photo-open');if(dialog.open){dialog.close();lastTrigger?.focus({preventScroll:true});}large.removeAttribute('src');}
  opener.addEventListener('click',()=>{if(!photos.length)return;lastTrigger=opener;display();dialog.showModal();document.body.classList.add('hos-photo-open');onView?.();});
  dialog.querySelector('[data-photo-close]').addEventListener('click',close);
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  dialog.addEventListener('click',event=>{if(event.target===dialog){const b=dialog.getBoundingClientRect();if(event.clientX<b.left||event.clientX>b.right||event.clientY<b.top||event.clientY>b.bottom)close();}});
  function step(direction){index=(index+direction+photos.length)%photos.length;select(index);display();}
  dialog.querySelectorAll('[data-photo-step]').forEach(button=>button.addEventListener('click',()=>step(Number(button.dataset.photoStep))));
  dialog.querySelectorAll('[data-photo-zoom]').forEach(button=>button.addEventListener('click',()=>{scale=Math.min(3,Math.max(1,scale+Number(button.dataset.photoZoom)));large.style.width=scale===1?'':(stage.clientWidth*scale)+'px';large.style.maxHeight=scale===1?'':'none';}));
  dialog.querySelector('[data-photo-reset]').addEventListener('click',()=>{large.style.maxHeight='';display();});
  dialog.addEventListener('keydown',event=>{if(event.target.tagName==='INPUT')return;if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();step(event.key==='ArrowRight'?1:-1);}});
  return {close,setWork(work,assets){
    close();index=0;photos=[{source:assets[work.image],label:'Front'}];
    for(const [key,label] of Object.entries(labels))if(assets[work.views?.[key]])photos.push({source:assets[work.views[key]],label});
    for(const [n,key] of (work.additionalImages||[]).entries())if(assets[key]&&!photos.some(photo=>photo.source===assets[key]))photos.push({source:assets[key],label:'Additional view '+(n+1)});
    photos=photos.filter(photo=>photo.source);title.textContent=work.title;thumbs.replaceChildren();
    photos.forEach((photo,i)=>{const button=document.createElement('button');button.type='button';button.className='hos-photo-thumbnail';button.setAttribute('aria-label','Show '+photo.label.toLowerCase());button.setAttribute('aria-pressed',String(i===0));const img=document.createElement('img');applyImage(img,photo.source,'120px');img.alt='';img.loading='lazy';const label=document.createElement('span');label.textContent=photo.label;button.append(img,label);button.addEventListener('click',()=>select(i));thumbs.append(button);});
    thumbs.hidden=photos.length<2;if(photos.length)select(0);
  }};
}
