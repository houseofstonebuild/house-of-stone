import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {runInNewContext} from 'node:vm';

const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/round-three.css',import.meta.url),'utf8');

test('work photo/3D controls are accessible, gated, and only on work pages',()=>{
  assert.match(html,/id="hos-work-view-modes"[^>]*aria-label="Choose sculpture view"[^>]*hidden/);
  assert.match(html,/data-work-visual="photos" aria-pressed="true"/);
  assert.match(html,/data-work-visual="model" aria-pressed="false"/);
  assert.match(html,/id="hos-work-inline-model"[^>]*hidden/);
  assert.match(app,/modes\.hidden=!hasModel/);
  assert.match(app,/if\(modelDefinition\(work\)\)\{const badge=/);
  assert.match(css,/\.hos-work-inline-model \.hos-3d-stage/);
});

test('work view switch preserves photos, lazy-loads the existing viewer and tracks eligible 3D views',()=>{
  const start=app.indexOf('function setWorkVisual('),end=app.indexOf('\nfunction sculptureSettings(',start);
  assert(start>=0&&end>start,'work switch function must be present');
  const nodes={
    '#hos-work-view-modes':{hidden:false},
    '.hos-work-primary-photo':{hidden:false},
    '#hos-work-additional-images':{hidden:false,children:[{},{}]},
    '#hos-work-inline-model':{hidden:true,firstElementChild:{}}
  };
  const controls=[{dataset:{workVisual:'photos'},setAttribute(k,v){this[k]=v;}},{dataset:{workVisual:'model'},setAttribute(k,v){this[k]=v;}}];
  nodes['#hos-work-view-modes'].querySelectorAll=()=>controls;
  const events=[];
  const context={
    $:selector=>{assert(nodes[selector],selector);return nodes[selector];},
    watchModels:host=>events.push(['watch',host]),
    modelViewer:{refresh:()=>events.push(['refresh'])},
    activeWork:{id:'verified-work',artistId:'artist-1'},
    track:(name,data)=>events.push(['track',name,data])
  };
  const choose=runInNewContext(app.slice(start,end)+'\nsetWorkVisual',context);
  choose('model');
  assert.equal(nodes['.hos-work-primary-photo'].hidden,true);
  assert.equal(nodes['#hos-work-additional-images'].hidden,true);
  assert.equal(nodes['#hos-work-inline-model'].hidden,false);
  assert.equal(controls[1]['aria-pressed'],'true');
  assert.deepEqual(events.map(e=>e[0]),['watch','track']);
  assert.equal(events[1][2].workId,'verified-work');

  choose('photos');
  assert.equal(nodes['.hos-work-primary-photo'].hidden,false);
  assert.equal(nodes['#hos-work-additional-images'].hidden,false);
  assert.equal(nodes['#hos-work-inline-model'].hidden,true);
  assert.equal(controls[0]['aria-pressed'],'true');
  assert.equal(events.at(-1)[0],'refresh');

  nodes['#hos-work-view-modes'].hidden=true;
  nodes['#hos-work-inline-model'].firstElementChild=null;
  choose('model');
  assert.equal(nodes['.hos-work-primary-photo'].hidden,false,'unapproved and missing models stay photo-only');
  assert.equal(nodes['#hos-work-inline-model'].hidden,true);
  assert.equal(controls[0]['aria-pressed'],'true');
});
