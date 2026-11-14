import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareArchiveKissingLovers,excludedWorkId} from '../scripts/publish-owner-archive-kissing-lovers.mjs';

test('archiving Kissing Lovers removes it from collections without deleting its record',()=>{
  const current={
    works:[{id:'hos-kissing-lovers',slug:'kissing-lovers',archived:false},{id:'other',archived:false}],
    collections:[{id:'kinship',starWorkId:'other',workIds:['other','hos-kissing-lovers']}]
  };
  const next=prepareArchiveKissingLovers(current);
  assert.equal(next.works.find(work=>work.id===excludedWorkId).archived,true);
  assert.deepEqual(next.collections[0].workIds,['other']);
  assert.equal(current.works[0].archived,false);
  assert.deepEqual(prepareArchiveKissingLovers(next),next);
});

test('archiving refuses to remove a featured sculpture',()=>{
  assert.throws(()=>prepareArchiveKissingLovers({
    works:[{id:excludedWorkId,archived:false}],
    collections:[{id:'kinship',starWorkId:excludedWorkId,workIds:[excludedWorkId]}]
  }),/featured work/);
});
