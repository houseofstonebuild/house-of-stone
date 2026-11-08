import assert from 'node:assert/strict';

export const releaseId='collection-round-two-2026-11-03';
export const releaseOrigin='https://house-of-stone-production.up.railway.app';
export const additions=[
  {id:'hos-queen-mother',slug:'queen-mother',title:'Queen Mother',artist:'Tinodashe Mangenda',material:'Butter Jade',collection:'presence',number:11,description:'A carved bust with a wrapped headdress, earrings and layered necklaces.'},
  {id:'hos-celebration',slug:'celebration',title:'Celebration',artist:'Batsirai Chikukwa',material:'Serpentine',collection:'presence',number:12,description:'A seated figure playing a drum, carved in warm-toned stone.'},
  {id:'hos-belonging',slug:'belonging',title:'Belonging',artist:'Artist to be confirmed',material:'Springstone',collection:'kinship',number:13,description:'Four rounded faces meet around an open centre in a framed stone form.'},
  {id:'hos-inner-beauty',slug:'inner-beauty',title:'Inner Beauty',artist:'Philip Mlimu',material:'Springstone',collection:'presence',number:16,description:'An elongated face in dark stone with a slender nose and contrasting patterned detail.'}
];
export const artistPhotos=[
  {name:'Chamu Rumano',slug:'chamu-rumano',workId:'zsa-005',pair:'birds'},
  {name:'Thomas Nyasoka',slug:'thomas-nyasoka',workId:'zsa-016',pair:'happy-times'},
  {name:'Douglas Musekiwa',slug:'douglas-musekiwa',workId:'zsa-006',pair:'coil'},
  {name:'Philip Mlimu',slug:'philip-mlimu',workId:'zsa-026',pair:'reflection'},
  {name:'Batsirai Chikukwa',slug:'batsirai-chikukwa',workId:'hos-celebration',pair:'celebration'},
  {name:'Tinodashe Mangenda',slug:'tinodashe-mangenda',workId:'hos-queen-mother',pair:'queen-mother',pairedPortrait:true}
];
const syntheticIds=new Set(['tariro','kuda','ruvimbo','farai','tendai']);
const slug=value=>value.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
export function prepareCollectionRoundTwo(current){
  const next=structuredClone(current);
  const ensureArtist=(name,portrait)=>{
    let artist=next.artists.find(artist=>artist.name===name&&!artist.archived);
    if(artist)return artist;
    const id=name==='Artist to be confirmed'?'artist-unconfirmed':'verified-'+slug(name);
    assert(!next.artists.some(artist=>artist.id===id||artist.slug===slug(name)),'Artist conflict: '+name);
    artist={id,slug:slug(name),name,portrait,studioImage:'',quote:'',practice:'',style:'',description:'',biography:'',story:'',archived:false};
    next.artists.push(artist);return artist;
  };
  const presence=next.collections.find(collection=>collection.id==='presence');
  assert(presence&&!presence.archived,'Presence collection missing');
  const old=next.works.find(work=>work.id==='zsa-002');
  assert(old,'Original Lovers record missing');
  const oldArtist=next.artists.find(artist=>artist.id===old.artistId);
  assert.equal(oldArtist?.name,'Philip Mlimu','Only Philip Mlimu’s Lovers may be replaced');
  assert(['Lovers','Two Surfaces'].includes(old.title),'A newer Lovers title needs review');
  old.archived=true;
  const originalPosition=presence.workIds.indexOf(old.id);
  presence.workIds=presence.workIds.filter(id=>id!==old.id);
  for(const item of additions){
    const front=item.id+'-front',views={};
    for(const side of ['front','left','right','back']){
      const key=item.id+'-'+side,source='/assets/hos-'+item.slug+'-'+side+'-v1.webp';
      assert(!next.assets[key]||next.assets[key]===source,'A newer addition asset needs review: '+key);
      next.assets[key]=source;
      if(side!=='front')views[side]=key;
    }
    let work=next.works.find(work=>work.id===item.id);
    if(work){
      assert.equal(work.title,item.title,'A newer addition title needs review: '+item.id);
      assert.equal(next.assets[work.image],next.assets[front],'A newer addition photo needs review: '+item.id);
      assert(!work.archived,'An archived addition needs review: '+item.id);
    }else{
      assert(!next.works.some(work=>work.slug===item.slug),'Work address conflict: '+item.slug);
      const artist=ensureArtist(item.artist,front);
      work={id:item.id,slug:item.slug,title:item.title,artistId:artist.id,image:front,views,additionalImages:[],dimensions:'On inquiry',material:item.material,yearMade:'',acquisitionMethod:'',description:item.description,visualDescription:item.description,objectPosition:'50% center',availability:'unknown',colour:'',size:'',verification:{title:!['hos-belonging','hos-inner-beauty'].includes(item.id),artist:!['hos-belonging','hos-inner-beauty'].includes(item.id),material:item.id!=='hos-belonging',description:true},details:{},modelStatus:'not-planned',internalNotes:'Owner addition from photoshoot sculpture '+item.number+'.'+(item.id==='hos-belonging'?' Working title selected by House of Stone; maker unconfirmed; Springstone is provisional.':item.id==='hos-inner-beauty'?' Owner-authorized working title and attribution to Philip Mlimu pending confirmation.':''),archived:false};
      next.works.push(work);
    }
    const collection=next.collections.find(collection=>collection.id===item.collection);
    assert(collection&&!collection.archived,'Target collection missing: '+item.collection);
    if(!collection.workIds.includes(item.id)){
      if(item.id==='hos-inner-beauty'&&originalPosition>=0)collection.workIds.splice(originalPosition,0,item.id);
      else collection.workIds.push(item.id);
    }
  }
  const unresolved=next.works.filter(work=>!work.archived&&syntheticIds.has(work.artistId));
  if(unresolved.length){
    const placeholder=ensureArtist('Artist to be confirmed',unresolved[0].image);
    for(const work of unresolved){work.artistId=placeholder.id;work.verification={...work.verification,artist:false};work.internalNotes=[work.internalNotes,'Fictional artist attribution removed; actual maker to be confirmed.'].filter(Boolean).join('\n');}
  }
  for(const artist of next.artists)if(syntheticIds.has(artist.id))artist.archived=true;
  const assigned=new Set(next.works.filter(work=>!work.archived).map(work=>work.artistId));
  for(const artist of next.artists.filter(artist=>!artist.archived&&assigned.has(artist.id))){
    artist.quote='';artist.practice='Hand-carved stone sculpture';artist.style='Stone sculpture · Zimbabwe';artist.story='';
    artist.description=artist.name==='Artist to be confirmed'?'Works whose individual maker is awaiting confirmation.':artist.name+' works in Zimbabwe, sourcing stone and carving each sculpture by hand.';
    artist.biography=artist.name==='Artist to be confirmed'?'These sculptures were made by hand in Zimbabwe. Individual artist details will be added when confirmed.':artist.name+' is a stone sculptor based in Zimbabwe. The artist sources their own stone and makes each sculpture by hand.';
    // Unphotographed artists use their own sculpture, never a synthetic face.
    const work=next.works.find(work=>!work.archived&&work.artistId===artist.id);
    artist.portrait=work.image;artist.studioImage='';
  }
  for(const photo of artistPhotos){
    const artist=next.artists.find(artist=>!artist.archived&&artist.name===photo.name),work=next.works.find(work=>work.id===photo.workId&&!work.archived);
    assert(artist&&work&&work.artistId===artist.id,'Artist/work photograph mismatch: '+photo.name);
    const pairKey='photo-'+photo.slug+'-with-'+photo.pair;
    next.assets[pairKey]='/assets/hos-artist-'+photo.slug+'-with-'+photo.pair+'-v1.webp';
    const portraitKey='photo-'+photo.slug;
    if(photo.pairedPortrait)artist.portrait=pairKey;
    else{next.assets[portraitKey]='/assets/hos-artist-'+photo.slug+'-v1.webp';artist.portrait=portraitKey;}
    artist.studioImage=pairKey;
    work.additionalImages=[...new Set([...(work.additionalImages||[]),pairKey])];
  }
  next.site.presentation ||= {};
  next.site.presentation.making={...next.site.presentation.making,gallery:artistPhotos.filter(photo=>['hos-queen-mother','zsa-006','hos-celebration'].includes(photo.workId)).map(photo=>({image:'photo-'+photo.slug+'-with-'+photo.pair,caption:photo.name+' with '+next.works.find(work=>work.id===photo.workId).title}))};
  return next;
}

export async function publishCollectionRoundTwo({db,origin,password,publicOrigin,fetchImpl=fetch}){
  if(![releaseOrigin,'https://houseofmabwe.com'].includes(publicOrigin))return {skipped:'different-service'};
  if(db.prepare('SELECT value FROM settings WHERE key=?').get(releaseId))return {skipped:'already-published'};
  const local=new URL(origin);assert(['127.0.0.1','localhost','[::1]'].includes(local.hostname));
  const headers={Authorization:'Basic '+Buffer.from('admin:'+password).toString('base64'),'Content-Type':'application/json',Origin:publicOrigin};
  const api=async(path,data,admin=true)=>{
    const response=await fetchImpl(new URL((admin?'/api/admin/':'/')+path,local),{headers,redirect:'error',signal:AbortSignal.timeout(30000),...(data?{method:'POST',body:JSON.stringify(data)}:{})});
    assert(response.ok,'Collection round two '+path+': HTTP '+response.status);return response.json();
  };
  let state=await api('content');
  if(state.unpublished)return {skipped:'unpublished-draft-present'};
  state=await api('content',{revision:state.revision,catalog:prepareCollectionRoundTwo(state.draft)});
  state=await api('publish',{revision:state.revision});
  const live=await api('content.json',undefined,false);
  assert(!live.works.some(work=>work.id==='zsa-002'),'Replaced Lovers must be archived');
  assert(!live.artists.some(artist=>syntheticIds.has(artist.id)),'Fictional artists must be absent');
  for(const item of additions){const work=live.works.find(work=>work.id===item.id);assert.equal(work?.title,item.title);assert(live.collections.find(collection=>collection.id===item.collection)?.workIds.includes(item.id));}
  db.prepare('INSERT INTO settings(key,value) VALUES (?,?)').run(releaseId,JSON.stringify({revision:state.liveRevision,publishedAt:state.publishedAt,added:4,replaced:'zsa-002'}));
  return {published:true,revision:state.liveRevision,added:4,replaced:1};
}
