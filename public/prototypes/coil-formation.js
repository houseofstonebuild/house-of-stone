/* Coil's approved geometry and color are never modified in-browser.
 * Every carving image is an offline physical volume derived from that model.
 * Predictive frame loading is strictly bounded on phone and desktop.
 */
import {createFrameStream} from './scroll-frame-stream.js';
const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x)};
const lerp=(a,b,t)=>a+(b-a)*t;
const CURRENT='../assets/making-v8';
const FALLBACK='../assets/making-v7';
const LEGACY='../assets/making-v6';
export function createCoilFormation(carveStage,polishStage,mobile,reduced){
 const stages={carve:carveStage,polish:polishStage};
 const images={carve:carveStage.querySelector('#formationFrame'),
   polish:polishStage.querySelector('#polishFrame')};
 const requirements={carve:54,polish:95};
 let root=FALLBACK,count=144,manifest=null,edition='v7';
 let frameRange={carve:[54,95],polish:[95,132]};
 const players={};
 const source=(index,profile)=>root+'/'+profile+'/frame_'+String(index).padStart(3,'0')+'.webp';
 for(const phase of ['carve','polish']){
  const stage=stages[phase],image=images[phase];
  players[phase]=createFrameStream({
   stage,image,mobile,src:source,
   onDisplay:(frame,item)=>{
    // Retain the image for existing tests and screen readers, but keep it
    // behind the canvas to avoid two different frame layers crossfading.
    // The hidden compatibility image only needs a first decoded frame.
    // Duplicating every frame in an <img> doubles Safari's decode workload.
    if(!image.hasAttribute('src'))image.src=item.src;
    stage.dataset.displayedFrame=String(frame);
    stage.dataset.frameStatus='ready';
   }
  });
 }
 carveStage.querySelector('#formationChips').style.display='none';
 const stageData=(stage,frame)=>{
  stage.dataset.requestedFrame=String(frame);
  stage.dataset.frameAssetVersion=edition;
  stage.dataset.modelSource='../models/coil-uploaded-v1.glb';
  if(manifest?.entries?.[frame])
   stage.dataset.remainingVoxels=String(manifest.entries[frame].remaining_voxels);
 };
 function update(phase,progress){
  const p=Math.max(0,Math.min(1,progress));
  const bounds=frameRange[phase];
  const normalized=phase==='carve'?smooth((p-.07)/.90):smooth(p);
  const frame=Math.round(lerp(bounds[0],bounds[1],normalized));
  const stage=stages[phase];
  stageData(stage,frame);
  stage.dataset.phaseProgress=p.toFixed(4);
  stage.dataset.stage=phase;
  players[phase].request(frame,true);
  if(phase==='polish')stage.style.setProperty('--polish',smooth(p).toFixed(4));
 }
 async function loadManifest(){
  try{
   const options=[
    {path:CURRENT,version:8,count:240,carve:[0,169],polish:[170,239],edition:'v8'},
    {path:FALLBACK,version:7,count:144,carve:[54,95],polish:[95,132],edition:'v7'},
    {path:LEGACY,version:6,count:144,carve:[54,95],polish:[95,132],edition:'v6-fallback'}
   ];
   for(const choice of options){
    try{
     const response=await fetch(choice.path+'/manifest.json',{cache:'no-store'});
     if(!response.ok)continue;
     const candidate=await response.json();
     if(candidate.version!==choice.version||candidate.frames!==choice.count||
        candidate.registered_to!=='approved-coil-v1'||!Array.isArray(candidate.entries)||
        candidate.entries.length!==choice.count)continue;
     if(choice.version===8 && candidate.camera_revision!==4)continue;
     const required=[choice.carve[0],choice.carve[1],choice.polish[1]];
     const ok=await Promise.all(required.map(async index=>{
      const r=await fetch(choice.path+'/'+(mobile()?'mobile':'desktop')+
       '/frame_'+String(index).padStart(3,'0')+'.webp',{method:'HEAD'});
      return r.ok;
     }));
     if(!ok.every(Boolean))continue;
     root=choice.path;edition=choice.edition;count=choice.count;
     frameRange={carve:choice.carve,polish:choice.polish};
     manifest=candidate;
     for(const phase of ['carve','polish']){
      stages[phase].dataset.modelDerived='true';
      stages[phase].dataset.mediaVerified=edition;
      players[phase].configure({frames:count});
      players[phase].prime(frameRange[phase][0]);
      const previous=Number(stages[phase].dataset.phaseProgress||0);
      update(phase,previous);
     }
     return;
    }catch(error){console.debug('Optional Coil asset unavailable',choice.edition,error)}
   }
   throw Error('No valid source-derived Coil media set available');
  }catch(error){
   for(const phase of ['carve','polish'])stages[phase].dataset.modelDerived='unavailable';
   console.warn('Carving source verification failed',error);
  }
 }
 players.carve.prime(requirements.carve);
 players.polish.prime(requirements.polish);
 loadManifest();
 function resize(){players.carve.resize();players.polish.resize()}
 function suspend(phase){players[phase]?.suspend()}
 function stats(){return {edition,root,carve:players.carve.stats(),polish:players.polish.stats()}}
 return {update,resize,suspend,stats,
  get registered(){return edition==='v8'||edition==='v7';}};
}
