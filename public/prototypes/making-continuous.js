import {createContinuousSequence} from './continuous-sequence.js';
const $=s=>document.querySelector(s),clamp=x=>Math.max(0,Math.min(1,x));
const reduced=matchMedia('(prefers-reduced-motion:reduce)'),mobile=()=>innerWidth<=700||(innerWidth<=1100&&innerHeight>innerWidth);
const definitions=[['mark',0,39,.8,500,.1,.12],['carve',40,247,3.3,2200,.03,.06],['sand',248,327,1.0,620,.05,.1],['heat',328,399,.6,380,.05,.1],['wax',400,463,1.4,900,.04,.1],['work',464,479,1,650,.05,.28]];
const articles=[...document.querySelectorAll('[data-step]')],sections=[...document.querySelectorAll('[data-scene]')];
let form,film,artist,profile='',stages=[],layout=[],dirty=true,raf=0,lastWidth=innerWidth,total=0,phase='',chapter='introduction';
function copy(frame){
 $('#exactFinish').style.opacity=String(clamp((frame-474)/5));
 const index=definitions.findIndex((s,i)=>frame<s[2]+.5||i===5),name=definitions[index][0];
 if(phase===name)return;phase=name;$('#processCanvas').parentElement.dataset.step=name;
 for(const a of articles){const yes=a.dataset.step===name;a.classList.toggle('is-current',yes);if(reduced.matches)a.removeAttribute('aria-hidden');else a.setAttribute('aria-hidden',String(!yes));}
 $('#finishCaption').textContent=$('#processCaption').textContent=['THE BLOCK','CARVING THE FORM','REFINING THE SURFACE','WARMING THE STONE','WAX AND POLISH','COIL · DOUGLAS MUSEKIWA'][index];
}
function players(){
 if(reduced.matches){form?.destroy();film?.destroy();artist?.destroy();form=film=artist=null;profile='';return;}
 const next=mobile()?'mobile':'desktop';if(next===profile)return;profile=next;form?.destroy();film?.destroy();artist?.destroy();
 form=createContinuousSequence({canvas:$('#processCanvas'),root:'/assets/continuous-making-v1/form',profile,focus:profile==='desktop'?.65:.5,onSample:copy});
 artist=createContinuousSequence({canvas:$('#artistCanvas'),root:'/assets/continuous-making-v1/artist',profile,focusY:profile==='mobile'?.18:.5});
 film=createContinuousSequence({canvas:$('#workshopCanvas'),root:'/assets/continuous-making-v1/workshop',profile,focusY:profile==='mobile'?.16:.5});
}
function frameMedia(){for(const art of document.querySelectorAll('.process-art')){if(profile!=='mobile'||reduced.matches){art.style.setProperty('--scene-scale','1');art.style.setProperty('--scene-y','0px');continue;}
 const width=art.clientWidth,height=art.clientHeight,sourceScale=Math.max(width/960,height/2080),offset=(height-2080*sourceScale)/2;
 const top=offset+.258*2080*sourceScale,bottom=offset+.690*2080*sourceScale,limitTop=$('.masthead').clientHeight-6,limitBottom=art.parentElement.querySelector('.process-copies').offsetTop-8;
 const fit=Math.min(1,Math.max(.2,(limitBottom-limitTop)/(bottom-top))),naturalCenter=(top+bottom)/2,desiredCenter=(limitTop+limitBottom)/2,translate=desiredCenter-(height/2+fit*(naturalCenter-height/2));
 art.style.setProperty('--scene-scale',String(fit));art.style.setProperty('--scene-y',translate.toFixed(2)+'px');
}}
function measure(){
 const view=$('.process-pin').clientHeight||document.documentElement.clientHeight;let start=0;
 stages=definitions.map(([name,first,last,views,min,lead,tail],i)=>{const length=Math.max(min,view*views),s={name,first,last,start,end:start+length,length,lead,tail,section:i<2?'process':'finishing'};start+=length;return s});total=start;
 const split=stages[2].start;
 $('#process').style.height=reduced.matches?'auto':Math.round(split+view)+'px';
 $('#finishing').style.height=reduced.matches?'auto':Math.round(total-split+view)+'px';
 layout=sections.map(el=>({el,name:el.dataset.scene,top:el.getBoundingClientRect().top+scrollY,height:el.offsetHeight,pin:el.querySelector(':scope>.pin')?.clientHeight||view}));
 const gap=layout.find(s=>s.name==='finishing').top-layout.find(s=>s.name==='process').top-split;
 for(const s of stages.slice(2)){s.start+=gap;s.end+=gap;}
 frameMedia();form?.resize();film?.resize();artist?.resize();dirty=false;
}
function frameAt(distance,group){const s=group.find(s=>distance<s.end)||group.at(-1),p=clamp((distance-s.start)/s.length),motion=clamp((p-s.lead)/(1-s.lead-s.tail));return s.first+(s.last-s.first)*motion;}
const route=$('#mapRoute'),routeLength=route.getTotalLength();route.style.strokeDasharray=String(routeLength);
function update(){
 raf=0;if(document.hidden)return;if(dirty)measure();const y=scrollY,view=innerHeight,headerOffset=mobile()?56:45;
 let next='introduction',header='introduction';
 for(const s of layout){
  if(y+view*.5>=s.top)next=s.name;if(y+headerOffset>=s.top)header=s.name;
  const visible=y+view>s.top&&y<s.top+s.height,near=y+view*1.6>s.top&&y<s.top+s.height+view;const p=clamp((y-s.top)/Math.max(1,s.height-s.pin));s.el.dataset.progress=String(p);
  if(['process','finishing'].includes(s.name)){
   const group=stages.filter(stage=>stage.section===s.name),distance=y-layout.find(s=>s.name==='process').top,value=frameAt(distance,group);
   const owns=visible&&(!reduced.matches),art=s.el.querySelector('.process-art');
   if(s.name==='finishing'){
    const finishStart=group[0].start,colourEnd=group.find(stage=>stage.name==='wax').end;
    const zoomProgress=clamp((distance-finishStart)/Math.max(1,colourEnd-finishStart));
    const zoom=reduced.matches?1:1+.14*zoomProgress;
    const baseScale=parseFloat(art.style.getPropertyValue('--scene-scale'))||1;
    art.style.setProperty('--finish-zoom',String(zoom.toFixed(4)));
    art.style.setProperty('--finish-scene-scale',String((baseScale*zoom).toFixed(4)));
   }
   if(owns){const canvas=$('#processCanvas');if(canvas.parentElement!==art){art.appendChild(canvas);form?.resize();}form?.request(value,true);}
   else if(near&&!reduced.matches&&!layout.some(other=>['process','finishing'].includes(other.name)&&y+view>other.top&&y<other.top+other.height)){form?.request(value,false);form?.warm(value);}
   s.el.querySelector('.process-rule i').style.transform='scaleX('+clamp((distance-group[0].start)/(group.at(-1).end-group[0].start))+')';
  }
  if(['material','carving'].includes(s.name)&&!reduced.matches){const player=s.name==='material'?artist:film,count=s.name==='material'?96:108,value=clamp((p-.08)/.84)*(count-1);player.request(value,visible);if(near&&!visible)player.warm(value);}
  if(s.name==='origin'&&near){const t=reduced.matches?1:clamp((p-.2)/.6),point=route.getPointAtLength(routeLength*t);route.style.strokeDashoffset=String(routeLength*(1-t));const zoom=reduced.matches?1:1+1.05*(t*t*(3-2*t));$('#routeStone').setAttribute('transform',`translate(${point.x} ${point.y}) scale(${.72/Math.sqrt(zoom)})`);$('#mapJourney').setAttribute('transform',`translate(790 215) scale(${zoom}) translate(-790 -215)`);}
 }
 if(!reduced.matches&&!layout.some(s=>['process','finishing'].includes(s.name)&&y+view*1.6>s.top&&y<s.top+s.height+view))form?.request(form.stats().target,false);
 chapter=next;document.body.dataset.currentScene=next;
 $('.masthead').dataset.tone=['origin','carving','interval','house'].includes(header)?'light':'dark';$('.masthead').dataset.photo=String(mobile()&&['carving','material'].includes(header));$('.masthead').dataset.headerScene=header;
 $('#readingProgress').style.transform='scaleX('+clamp(y/Math.max(1,document.documentElement.scrollHeight-view))+')';
 document.documentElement.dataset.storyLayout='ready';
}
function queue(){if(!raf&&!document.hidden)raf=requestAnimationFrame(update)}
function resize(){
 const changed=innerWidth!==lastWidth,old=layout.find(s=>s.name==='process'),distance=old?scrollY-old.top:-1,stage=stages.find(s=>distance>=s.start&&distance<s.end),local=stage?(distance-stage.start)/stage.length:0;
 lastWidth=innerWidth;dirty=true;if(changed)players();measure();
 if(changed&&stage&&!reduced.matches){const next=stages.find(s=>s.name===stage.name),section=layout.find(s=>s.name==='process');scrollTo(0,section.top+next.start+next.length*local);}
 form?.resize();film?.resize();artist?.resize();queue();
}
addEventListener('scroll',queue,{passive:true});addEventListener('resize',resize,{passive:true});addEventListener('load',()=>{dirty=true;queue()},{once:true});addEventListener('pageshow',()=>{dirty=true;queue()});document.fonts?.ready.then(()=>{dirty=true;queue()});
document.addEventListener('visibilitychange',()=>{if(document.hidden){form?.suspend();film?.suspend();artist?.suspend();}else{dirty=true;queue()}});
reduced.addEventListener('change',()=>{dirty=true;players();if(reduced.matches){form?.suspend();film?.suspend();artist?.suspend();for(const a of articles)a.removeAttribute('aria-hidden')}queue()});
players();copy(0);document.documentElement.classList.add('js');queue();
window.__mabweContinuous={stats:()=>({chapter,phase,form:form?.stats()||null,film:film?.stats()||null,artist:artist?.stats()||null}),stages:()=>stages};
