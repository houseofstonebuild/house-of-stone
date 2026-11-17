import {createContinuousSequence} from './continuous-sequence.js';
const $=s=>document.querySelector(s),clamp=x=>Math.max(0,Math.min(1,x));
const reduced=matchMedia('(prefers-reduced-motion:reduce)'),mobile=()=>innerWidth<=700||(innerWidth<=1100&&innerHeight>innerWidth);
const definitions=[['mark',0,39,1.1,650],['carve',40,247,4.3,2600],['sand',248,327,2.1,1400],['heat',328,399,1.8,1200],['wax',400,463,2.1,1400],['work',464,479,1.5,1000]];
const articles=[...document.querySelectorAll('[data-step]')],sections=[...document.querySelectorAll('[data-scene]')];
let form,film,profile='',stages=[],layout=[],dirty=true,raf=0,lastWidth=innerWidth,total=0,phase='',chapter='introduction';
function copy(frame){
 $('#exactFinish').style.opacity=String(clamp((frame-474)/5));
 const index=definitions.findIndex((s,i)=>frame<s[2]+.5||i===5),name=definitions[index][0];
 if(phase===name)return;phase=name;$('#processArt').dataset.step=name;
 for(const a of articles){const yes=a.dataset.step===name;a.classList.toggle('is-current',yes);if(reduced.matches)a.removeAttribute('aria-hidden');else a.setAttribute('aria-hidden',String(!yes));}
 $('#processCaption').textContent=['THE BLOCK','CARVING THE FORM','REFINING THE SURFACE','WARMING THE STONE','WAX AND POLISH','COIL · DOUGLAS MUSEKIWA'][index];
}
function players(){
 if(reduced.matches){form?.destroy();film?.destroy();form=film=null;profile='';return;}
 const next=mobile()?'mobile':'desktop';if(next===profile)return;profile=next;form?.destroy();film?.destroy();
 form=createContinuousSequence({canvas:$('#processCanvas'),root:'/assets/continuous-making-v1/form',profile,focus:profile==='desktop'?.65:.5,onSample:copy});
 film=createContinuousSequence({canvas:$('#workshopCanvas'),root:'/assets/continuous-making-v1/workshop',profile});
}
function frameMedia(){
 const art=$('#processArt');if(profile!=='mobile'||reduced.matches){art.style.setProperty('--scene-scale','1');art.style.setProperty('--scene-y','0px');return;}
 const width=art.clientWidth,height=art.clientHeight,sourceScale=Math.max(width/960,height/2080),offset=(height-2080*sourceScale)/2;
 const top=offset+.258*2080*sourceScale,bottom=offset+.690*2080*sourceScale,limitTop=$('.masthead').clientHeight-6,limitBottom=$('#processCopies').offsetTop-8;
 const fit=Math.min(1,Math.max(.2,(limitBottom-limitTop)/(bottom-top))),naturalCenter=(top+bottom)/2,desiredCenter=(limitTop+limitBottom)/2,translate=desiredCenter-(height/2+fit*(naturalCenter-height/2));
 art.style.setProperty('--scene-scale',String(fit));art.style.setProperty('--scene-y',translate.toFixed(2)+'px');
}
function measure(){
 const view=$('.process-pin').clientHeight||document.documentElement.clientHeight;let start=0;
 stages=definitions.map(([name,first,last,views,min])=>{const length=Math.max(min,view*views),s={name,first,last,start,end:start+length,length};start+=length;return s});total=start;
 $('#process').style.height=reduced.matches?'auto':Math.round(start+view)+'px';
 layout=sections.map(el=>({el,name:el.dataset.scene,top:el.getBoundingClientRect().top+scrollY,height:el.offsetHeight,pin:el.querySelector(':scope>.pin')?.clientHeight||view}));frameMedia();form?.resize();film?.resize();dirty=false;
}
function frameAt(distance){const s=stages.find(s=>distance<s.end)||stages.at(-1),p=clamp((distance-s.start)/s.length),motion=clamp((p-.10)/.76);return s.first+(s.last-s.first)*motion;}
const route=$('#mapRoute'),routeLength=route.getTotalLength();route.style.strokeDasharray=String(routeLength);
function update(){
 raf=0;if(document.hidden)return;if(dirty)measure();const y=scrollY,view=innerHeight;let next='introduction',header='introduction';
 for(const s of layout){
  if(y+view*.5>=s.top)next=s.name;if(y+45>=s.top)header=s.name;
  const visible=y+view>s.top&&y<s.top+s.height,near=y+view*3>s.top&&y<s.top+s.height+view;const p=clamp((y-s.top)/Math.max(1,s.height-s.pin));s.el.dataset.progress=String(p);
  if(s.name==='process'){
   const value=frameAt(Math.max(0,y-s.top));if(!reduced.matches){if(near)form.warm(value);form.request(value,visible);}
   $('#processProgress').style.transform='scaleX('+clamp((y-s.top)/total)+')';
  }
  if(s.name==='carving'&&!reduced.matches){const value=clamp((p-.12)/.76)*57;if(near)film.warm(value);film.request(value,visible);}
  if(s.name==='origin'&&near){const t=reduced.matches?1:clamp((p-.2)/.6),point=route.getPointAtLength(routeLength*t);route.style.strokeDashoffset=String(routeLength*(1-t));$('#routeStone').setAttribute('cx',point.x);$('#routeStone').setAttribute('cy',point.y);}
 }
 chapter=next;document.body.dataset.currentScene=next;
 $('.masthead').dataset.tone=['origin','carving','house'].includes(header)?'light':'dark';$('.masthead').dataset.photo=String(mobile()&&['carving','material'].includes(header));
 $('#readingProgress').style.transform='scaleX('+clamp(y/Math.max(1,document.documentElement.scrollHeight-view))+')';
 document.documentElement.dataset.storyLayout='ready';
}
function queue(){if(!raf&&!document.hidden)raf=requestAnimationFrame(update)}
function resize(){
 const changed=innerWidth!==lastWidth,old=layout.find(s=>s.name==='process'),distance=old?scrollY-old.top:-1,stage=stages.find(s=>distance>=s.start&&distance<s.end),local=stage?(distance-stage.start)/stage.length:0;
 lastWidth=innerWidth;dirty=true;if(changed)players();measure();
 if(changed&&stage&&!reduced.matches){const next=stages.find(s=>s.name===stage.name),section=layout.find(s=>s.name==='process');scrollTo(0,section.top+next.start+next.length*local);}
 form?.resize();film?.resize();queue();
}
addEventListener('scroll',queue,{passive:true});addEventListener('resize',resize,{passive:true});addEventListener('load',()=>{dirty=true;queue()},{once:true});addEventListener('pageshow',()=>{dirty=true;queue()});document.fonts?.ready.then(()=>{dirty=true;queue()});
document.addEventListener('visibilitychange',()=>{if(document.hidden){form?.suspend();film?.suspend();}else{dirty=true;queue()}});
reduced.addEventListener('change',()=>{dirty=true;players();if(reduced.matches){form?.suspend();film?.suspend();for(const a of articles)a.removeAttribute('aria-hidden')}queue()});
players();copy(0);document.documentElement.classList.add('js');queue();
window.__mabweContinuous={stats:()=>({chapter,phase,form:form?.stats()||null,film:film?.stats()||null}),stages:()=>stages};
