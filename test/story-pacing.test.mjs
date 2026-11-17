import test from 'node:test';
import assert from 'node:assert/strict';
import {createStoryTimeline} from '../public/prototypes/coil-formation.js';
test('compact phones retain enough distance to read every process stage',()=>{
 const t=createStoryTimeline(667);assert(t.stages.every(s=>s.distance>=650));
 assert(t.stages.find(s=>s.name==='carve').distance>=2200);
 for(const name of ['sand','heat','wax','work'])assert(t.stages.find(s=>s.name===name).distance>=1100);
});
test('each carving phase holds its exact endpoints before and after movement',()=>{
 const t=createStoryTimeline(844),s=t.stages.find(s=>s.name==='carve');
 assert.equal(t.at(s.start+s.distance*.1).frame,54);
 assert.equal(t.at(s.end-s.distance*.1).frame,94);
 const forward=Array.from({length:301},(_,i)=>t.at(s.start+s.distance*i/301).frame);
 assert(forward.every((f,i)=>i===0||f>=forward[i-1]));assert(Math.max(...forward.slice(1).map((f,i)=>f-forward[i]))<=1);
});
test('wax and final reveal share one continuous, reversible finish',()=>{
 const t=createStoryTimeline(900),wax=t.stages.find(s=>s.name==='wax'),work=t.stages.find(s=>s.name==='work');
 assert.equal(t.at(wax.start).finish,0);assert.equal(t.at(wax.end-.1).finish,1);assert.equal(t.at(work.start+.1).finish,1);
 assert.equal(t.at(wax.start+wax.distance*.05).finish,0);assert.equal(t.at(0).finish,0);
});
test('browser viewport growth does not collapse minimum phase durations',()=>{
 for(const h of [390,667,844,1180]){const t=createStoryTimeline(h);for(let i=1;i<t.stages.length;i++)assert.equal(t.stages[i].start,t.stages[i-1].end);assert.equal(t.at(t.distance).stage.name,'work');}
});
