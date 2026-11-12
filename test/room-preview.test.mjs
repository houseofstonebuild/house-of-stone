import test from 'node:test';
import assert from 'node:assert/strict';
import {roomPreviewEligible} from '../public/room-preview.js';

test('room placement only opens for the three approved pilot models', () => {
  for (const id of ['hos-queen-mother','zsa-023','zsa-024']) {
    const work = {id};
    const model = {workId:id,uploaded:true,ownerApproved:true,file:`/models/${id}.glb`};
    assert.equal(roomPreviewEligible(work,model),true);
    assert.equal(roomPreviewEligible(work,{...model,ownerApproved:false}),false);
    assert.equal(roomPreviewEligible(work,{...model,workId:'another-work'}),false);
  }
  assert.equal(roomPreviewEligible({id:'zsa-031'},{workId:'zsa-031',uploaded:true,ownerApproved:true,file:'/models/other.glb'}),false);
});
