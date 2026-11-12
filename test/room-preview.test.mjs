import test from 'node:test';
import assert from 'node:assert/strict';
import {roomPreviewEligible} from '../public/room-preview.js';

test('room placement opens for published models, including works without measurements', () => {
  for (const id of ['hos-queen-mother','zsa-023','zsa-024']) {
    const work = {id};
    const model = {workId:id,uploaded:true,ownerApproved:true,file:`/models/${id}.glb`};
    assert.equal(roomPreviewEligible(work,model),true);
    assert.equal(roomPreviewEligible(work,{...model,ownerApproved:false}),false);
    assert.equal(roomPreviewEligible(work,{...model,workId:'another-work'}),false);
  }
  assert.equal(roomPreviewEligible({id:'zsa-031',dimensions:'63 × 33 × 24 cm'},
    {workId:'zsa-031',uploaded:true,ownerApproved:true,file:'/models/other.glb'}),true);
  assert.equal(roomPreviewEligible({id:'zsa-031',dimensions:'63 × 33 × 24 cm'},
    {workId:'zsa-031',uploaded:true,ownerApproved:false,file:'/models/other.glb'}),false);
  assert.equal(roomPreviewEligible({id:'legacy',title:'Legacy',dimensions:'40 × 20 cm'},
    {title:'Legacy',file:'/models/legacy.glb'}),true);
  assert.equal(roomPreviewEligible({id:'unknown',dimensions:'On inquiry'},
    {workId:'unknown',file:'/models/unknown.glb'}),true);
});
