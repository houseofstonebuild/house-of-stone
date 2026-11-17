import {createStorySequence} from './story-film-atlas.js';
import {createStoryTimeline} from './coil-formation.js';
const $=s=>document.querySelector(s),clamp=x=>Math.max(0,Math.min(1,x));
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const phone=()=>innerWidth<=700||(innerWidth<=1100&&innerHeight>innerWidth);
const art=$('#processArt'),host=$('#approvedHost'),process=$('#process'),workshop=$('#workshopMedia');
const sections=[...document.querySelectorAll('[data-scene]')],articles=[...document.querySelectorAll('[data-step]')];
let readings=[],timeline=null,dirty=true,raf=0,scene='',step='',lastWidth=innerWidth,processDistance=0;
let exactReady=false,displayed=-1,active=false,filmActive=false,finish=0;
const form=createStorySequence({stage:art,image:$('#processFrame'),kind:'form',mobile:phone,onDisplay:i=>{displayed=i;}});
const film=createStorySequence({stage:workshop,image:$('#documentaryFrame'),kind:'workshop',mobile:phone});
const final=$('#approvedStill');
function prepareFinal(){
 const src='/assets/story-sequence-v1/approved/'+(phone()?'mobile':'desktop')+'.png';
 if(final.getAttribute('src')===src)return;
 exactReady=false;host.dataset.approvedModelState='loading';final.src=src;
 final.decode().then(()=>{if(final.getAttribute('src')!==src)return;exactReady=true;host.dataset.approvedModelState='ready';queue()}).catch(()=>{host.dataset.approvedModelState='fallback'});
}
function layout(){
 const stableView=$('.process-pin').clientHeight||document.documentElement.clientHeight;
 timeline=createStoryTimeline(stableView);
 process.style.height=reduced.matches?'auto':Math.round(timeline.distance+stableView)+'px';
 readings=sections.map(el=>{const pin=el.querySelector(':scope > .pin');return {el,name:el.dataset.scene,top:el.getBoundingClientRect().top+scrollY,height:el.offsetHeight,span:Math.max(1,el.offsetHeight-(pin?.clientHeight||stableView))}});
 dirty=false;
}
const route=$('#mapRoute'),length=route.getTotalLength();route.style.strokeDasharray=String(length);
const points=Array.from({length:201},(_,i)=>{const p=route.getPointAtLength(length*i/200);return {x:p.x,y:p.y}});
function renderProcess(distance,visible){
 processDistance=distance;active=visible;
 const state=timeline.at(distance);step=state.stage.name;
 art.dataset.step=step;art.dataset.phaseProgress=String(state.local);art.dataset.source='/models/coil-uploaded-v1.glb';
 for(let i=0;i<articles.length;i++){
  const yes=i===state.index,article=articles[i];article.classList.toggle('is-current',yes);
  if(reduced.matches)article.removeAttribute('aria-hidden');else article.setAttribute('aria-hidden',String(!yes));
  article.style.opacity=String(yes?state.copy:0);
 }
 if(!reduced.matches)form.request(state.frame,visible);
 finish=exactReady?state.finish:0;
 host.style.opacity=String(finish);host.setAttribute('aria-hidden',String(finish<.95));
 $('#processCaption').textContent=state.index===0?'THE BLOCK':state.index===1?(state.motion<.46?'ESTABLISHING THE OUTLINE':'OPENING THE FORM'):state.index===2?'REFINING THE SURFACE':state.index===3?'WARMING THE STONE':state.index===4?'WAX AND POLISH':'COIL · DOUGLAS MUSEKIWA';
 $('#processProgress').style.transform='scaleX('+clamp(distance/timeline.distance)+')';
}
function update(){
 raf=0;if(document.hidden)return;if(dirty)layout();const y=scrollY,view=innerHeight;let next='introduction',header='introduction';
 $('#readingProgress').style.transform='scaleX('+clamp(y/Math.max(1,document.documentElement.scrollHeight-view))+')';
 for(const r of readings){
  if(y+view*.5>=r.top)next=r.name;if(y+45>=r.top)header=r.name;
  const visible=y+view>r.top&&y<r.top+r.height,near=y+view*2>r.top&&y<r.top+r.height+view*.2;
  const p=clamp((y-r.top)/r.span);r.el.dataset.progress=String(p);
  if(r.name==='process'){
   if(near&&!reduced.matches)renderProcess(Math.max(0,y-r.top),visible||y<r.top);
   else if(active){active=false;form.suspend();}
   continue;
  }
  if(r.name==='carving'){
   filmActive=visible;
   // Readable still at entry and exit; the working passage occupies the middle.
   if(near&&!reduced.matches)film.request(Math.round(clamp((p-.16)/.62)*57),true);else film.suspend();
  }
  if(!near)continue;
  if(r.name==='origin'){
   const t=reduced.matches?1:clamp((p-.2)/.6),point=points[Math.round(t*200)];route.style.strokeDashoffset=String(length*(1-t));$('#routeStone').setAttribute('cx',point.x);$('#routeStone').setAttribute('cy',point.y);
  }
 }
 scene=next;document.body.dataset.currentScene=scene;
 const photo=phone()&&['carving','material'].includes(header);
 const tone=!photo&&['introduction','origin','carving','house'].includes(header)?'light':'dark';$('.masthead').dataset.tone=tone;$('.masthead').dataset.photo=String(photo);document.documentElement.dataset.storyLayout='ready';
}
function queue(){if(!raf&&!document.hidden)raf=requestAnimationFrame(update)}
function resize(){
 const preserve=active&&lastWidth!==innerWidth&&!reduced.matches,old=timeline?.at(processDistance),oldName=old?.stage.name,local=old?.local;lastWidth=innerWidth;
 dirty=true;layout();form.resize();film.resize();prepareFinal();
 if(preserve&&oldName){const stage=timeline.stages.find(s=>s.name===oldName);const r=readings.find(r=>r.name==='process');scrollTo(0,r.top+stage.start+stage.distance*local);}
 queue();
}
addEventListener('scroll',queue,{passive:true});addEventListener('resize',resize,{passive:true});
addEventListener('load',()=>{dirty=true;queue()},{once:true});addEventListener('pageshow',()=>{dirty=true;queue()});
document.fonts?.ready.then(()=>{dirty=true;queue()});
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(raf)cancelAnimationFrame(raf);raf=0;form.suspend();film.suspend();}else{dirty=true;queue();}});
reduced.addEventListener('change',()=>{for(const a of articles)a.removeAttribute('aria-hidden');if(reduced.matches){form.suspend();film.suspend();}resize();});
window.__mabweMaking={get chapter(){return scene},get step(){return step},get progress(){return timeline?processDistance/timeline.distance:0}};
window.__mabwePerformance=()=>({process:form.stats(),film:film.stats(),approved:host.dataset.approvedModelState||'idle',active,filmActive,chapter:scene,step,finish,timeline:timeline?.stages.map(s=>({name:s.name,start:s.start,end:s.end,lead:s.lead,tail:s.tail,first:s.first,last:s.last}))});
document.documentElement.classList.add('js');prepareFinal();queue();document.documentElement.dataset.makingAtelier='ready';
