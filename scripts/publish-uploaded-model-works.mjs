import assert from 'node:assert/strict';

export const releaseId='owner-uploaded-sculptures-v1';
const origins=['https://houseofmabwe.com','https://house-of-stone-production.up.railway.app'];
export const newWorks=[
  {id:'hos-tall-attention',slug:'tall-attention',title:'Tall Attention',description:'A tall standing figure bends toward a smaller figure held close to the body.',photos:['front','left','right','detail','detail2']},
  {id:'hos-kissing-lovers',slug:'kissing-lovers',title:'Kissing Lovers',description:'Two elongated faces meet in a kiss above an open centre, with carved lines flowing through their hair.',photos:['front','back','left','right']}
];

export function prepareUploadedWorks(current){
  const next=structuredClone(current);
  const artist=next.artists.find(artist=>artist.id==='artist-unconfirmed'&&!artist.archived);
  assert(artist,'The existing unconfirmed-artist record is required');
  const collection=next.collections.find(collection=>collection.id==='kinship'&&!collection.archived);
  assert(collection,'Kinship collection is missing');
  for(const item of newWorks){
    const existing=next.works.find(work=>work.id===item.id||work.slug===item.slug);
    if(existing){
      assert(existing.id===item.id&&existing.slug===item.slug,'A new sculpture conflicts with an existing record');
      // Preserve later owner edits, including archiving and membership.
      continue;
    }
    for(const side of item.photos){
      const key=item.id+'-'+side,source='/assets/'+item.id+'-'+side+'-v1.png';
      assert(!next.assets[key]||next.assets[key]===source,'A photograph key is already in use');
      next.assets[key]=source;
    }
    next.works.push({id:item.id,slug:item.slug,title:item.title,artistId:artist.id,image:item.id+'-front',
      description:item.description,visualDescription:item.description,dimensions:'On inquiry',material:'Details on inquiry',
      yearMade:'',acquisitionMethod:'',availability:'unknown',archived:false,objectPosition:'50% center',
      views:Object.fromEntries(item.photos.filter(side=>side!=='front').map(side=>[side,item.id+'-'+side])),
      additionalImages:[],modelStatus:'ready',verification:{title:true,model:true},
      internalNotes:'Owner-supplied GLB and photographs. Artist, stone, dimensions, date and availability have not been provided.'});
    collection.workIds.push(item.id);
  }
  return next;
}

export async function publishUploadedWorks({db,origin,password,publicOrigin,fetchImpl=fetch}){
  if(!origins.includes(publicOrigin))return {skipped:'different-service'};
  if(db.prepare('SELECT value FROM settings WHERE key=?').get(releaseId))return {skipped:'already-published'};
  const local=new URL(origin);assert(['127.0.0.1','localhost','[::1]'].includes(local.hostname));
  const headers={Authorization:'Basic '+Buffer.from('admin:'+password).toString('base64'),'Content-Type':'application/json',Origin:publicOrigin};
  const api=async(path,data)=>{
    const response=await fetchImpl(new URL('/api/admin/'+path,local),{headers,redirect:'error',signal:AbortSignal.timeout(30000),...(data?{method:'POST',body:JSON.stringify(data)}:{})});
    assert(response.ok,'Uploaded sculptures '+path+': HTTP '+response.status);return response.json();
  };
  let state=await api('content');
  if(state.unpublished)return {skipped:'unpublished-draft-present'};
  state=await api('content',{revision:state.revision,catalog:prepareUploadedWorks(state.draft)});
  state=await api('publish',{revision:state.revision});
  db.prepare('INSERT INTO settings(key,value) VALUES (?,?)').run(releaseId,JSON.stringify({revision:state.liveRevision,publishedAt:state.publishedAt}));
  return {published:true,revision:state.liveRevision,works:newWorks.map(work=>work.id)};
}
