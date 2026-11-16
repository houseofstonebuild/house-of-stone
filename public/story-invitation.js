// A single, opt-in first-visit invitation. The immersive story is loaded only
// after an explicit action, so the main collection still loads uninterrupted.
const KEY='hos-story-invitation-seen-v1';
export function initializeStoryInvitation({root,previewMode,routePath}){
 const invite=document.getElementById('hos-story-invite');
 const dialog=document.getElementById('hos-story-dialog');
 const frame=document.getElementById('hos-story-frame');
 if(!invite||!dialog||!frame)return;
 let shown=false,previousFocus=null,opened=false;
 const seen=()=>{try{return localStorage.getItem(KEY)==='1'}catch{return shown}};
 const remember=()=>{shown=true;try{localStorage.setItem(KEY,'1')}catch{}};
 function dismiss(){invite.hidden=true;remember()}
 function open(trigger){
  if(opened)return;
  dismiss();
  // Close the site's menu before opening the immersive story.
  const menu=root.querySelector('#hos-menu');
  const menuClose=root.querySelector('#hos-menu-close');
  if(menu?.open)menuClose?.click();
  previousFocus=trigger instanceof HTMLElement?trigger:document.activeElement;
  if(!frame.hasAttribute('src'))frame.src='/prototypes/making-atelier.html?embed=1';
  dialog.showModal();
  document.body.classList.add('hos-story-open');
  opened=true;
  document.getElementById('hos-story-dialog-close').focus({preventScroll:true});
 }
 function close(){
  if(!opened)return;
  dialog.close();
  document.body.classList.remove('hos-story-open');
  opened=false;
  previousFocus?.focus?.({preventScroll:true});
 }
 document.getElementById('hos-story-invite-dismiss').addEventListener('click',dismiss);
 document.getElementById('hos-story-invite-continue').addEventListener('click',dismiss);
 document.getElementById('hos-story-invite-open').addEventListener('click',e=>open(e.currentTarget));
 document.getElementById('hos-story-dialog-close').addEventListener('click',close);
 dialog.addEventListener('close',()=>{document.body.classList.remove('hos-story-open');opened=false});
 dialog.addEventListener('cancel',e=>{e.preventDefault();close()});
 root.addEventListener('click',e=>{
  const trigger=e.target.closest('[data-open-story]');
  if(!trigger)return;
  e.preventDefault();
  open(trigger);
 });
 // No forced full-screen takeover and no prompt on admin, deep links, or
 // return visits. Offer the invitation only after the homepage is ready.
 if(!previewMode&&routePath()==='/'&&!seen()&&!document.querySelector('.hos-menu[open]')){
  // Delay by one paint to avoid blocking hero rendering or autofocus.
  requestAnimationFrame(()=>{
   if(routePath()!=='/'||seen()||document.hidden)return;
   invite.hidden=false;
   remember();
  });
 }
 window.__hosStory={
  get invitationVisible(){return !invite.hidden},
  get open(){return opened},
  launch:()=>open(document.activeElement),
  close
 };
}
