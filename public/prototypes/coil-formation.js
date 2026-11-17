// Scroll distances are editorial pacing, not equal subdivisions of a percentage.
const clamp=x=>Math.max(0,Math.min(1,x));
export const STORY_STAGES=[
 {name:'mark',first:45,last:45,views:.85,min:650,lead:.12,tail:.26},
 {name:'carve',first:54,last:94,views:2.8,min:2200,lead:.16,tail:.24},
 {name:'sand',first:108,last:108,views:1.6,min:1250,lead:.20,tail:.22},
 {name:'heat',first:108,last:108,views:1.4,min:1100,lead:.20,tail:.22},
 {name:'wax',first:108,last:108,views:2.1,min:1650,lead:.20,tail:.28},
 {name:'work',first:108,last:108,views:1.8,min:1350,lead:.18,tail:.25}
];
export function createStoryTimeline(view){
 let cursor=0;
 const stages=STORY_STAGES.map(s=>{const distance=Math.round(Math.max(s.min,s.views*view));const stage={...s,start:cursor,end:cursor+distance,distance};cursor+=distance;return stage});
 function at(distance){
  const d=Math.max(0,Math.min(cursor,distance));
  const index=stages.findIndex((s,i)=>d<s.end||i===stages.length-1),stage=stages[index];
  const local=clamp((d-stage.start)/stage.distance);
  const motion=clamp((local-stage.lead)/(1-stage.lead-stage.tail));
  // A short text dissolve occurs while the art is holding its key pose.
  const fadeIn=clamp(local/.09),fadeOut=index===stages.length-1?1:clamp((1-local)/.08);
  return {index,stage,local,motion,frame:Math.round(stage.first+(stage.last-stage.first)*motion),copy:Math.min(fadeIn,fadeOut),finish:index>=5?1:index===4?motion:0};
 }
 return {stages,distance:cursor,at};
}
