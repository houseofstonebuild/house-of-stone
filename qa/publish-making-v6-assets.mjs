// Publish only a validated, versioned private-process media build.
// GITHUB_TOKEN must have contents:write; no database or public page is changed.
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
const token=process.env.GITHUB_TOKEN,repository=process.env.GITHUB_REPOSITORY;
if(!token||!repository||process.env.GITHUB_REF!=='refs/heads/main')throw new Error('Main-branch publisher only');
const root='https://api.github.com/repos/'+repository;
async function call(path,method='GET',body,tries=3){
 for(let attempt=0;attempt<tries;attempt++){
  const response=await fetch(root+path,{method,headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'house-mabwe-carving-publisher',...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
  const raw=await response.text();let data;
  try{data=JSON.parse(raw)}catch{data={message:raw.slice(0,150)}}
  if(response.ok)return data;
  if(attempt<tries-1&&[429,502,503,504].includes(response.status)){await new Promise(r=>setTimeout(r,1200*(attempt+1)));continue}
  throw new Error(method+' '+path+': HTTP '+response.status+' '+data.message);
 }
}
const directory='build/making-v6';
const manifest=JSON.parse(readFileSync(join(directory,'manifest.json'),'utf8'));
if(manifest.version!==6||manifest.frames<100)throw new Error('Invalid v6 media manifest');
const filenames=['manifest.json',...['desktop','mobile'].flatMap(p=>Array.from({length:manifest.frames},(_,i)=>p+'/frame_'+String(i).padStart(3,'0')+'.webp'))];
const entries=Array(filenames.length);
let next=0,failed=null;
async function worker(){
 while(next<filenames.length&&!failed){
  const i=next++,filename=filenames[i],bytes=readFileSync(join(directory,filename));
  if(bytes.length<1000)throw new Error('Missing or empty render '+filename);
  const blob=await call('/git/blobs','POST',{content:bytes.toString('base64'),encoding:'base64'});
  entries[i]={path:'public/assets/making-v6/'+filename,mode:'100644',type:'blob',sha:blob.sha};
  if(i%35===0)console.log('Prepared',i+1,'/',filenames.length);
 }
}
try{await Promise.all(Array.from({length:4},()=>worker()))}catch(err){failed=err}
if(failed)throw failed;
for(let attempt=0;attempt<3;attempt++){
 const head=(await call('/git/ref/heads/main')).object.sha;
 const parent=await call('/git/commits/'+head);
 const tree=await call('/git/trees','POST',{base_tree:parent.tree.sha,tree:entries});
 const commit=await call('/git/commits','POST',{message:'Publish verified Coil making v6 offline frame assets',tree:tree.sha,parents:[head]});
 try{
  await call('/git/refs/heads/main','PATCH',{sha:commit.sha,force:false});
  console.log('Published',filenames.length,'versioned frames to main:',commit.sha);
  process.exit(0);
 }catch(err){if(attempt===2)throw err}
}
