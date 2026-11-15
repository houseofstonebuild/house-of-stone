// Publish generated media through the GitHub Git Data API.
// GitHub container checkouts can expose a read-only .git directory; this
// deliberately avoids local git and never puts the credential in a URL.
import {readFileSync} from 'node:fs';
import {basename} from 'node:path';

const token=process.env.GITHUB_TOKEN;
const repository=process.env.GITHUB_REPOSITORY;
if(!token||!repository||!repository.includes('/'))throw new Error('GitHub Actions repository token is required');
const base='https://api.github.com/repos/'+repository;
async function call(endpoint,{method='GET',body}={}){
 const response=await fetch(base+endpoint,{
  method,
  headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'mabwe-atlas-publisher',...(body?{'Content-Type':'application/json'}:{})},
  body:body?JSON.stringify(body):undefined
 });
 const detail=await response.text();
 let parsed;
 try{parsed=JSON.parse(detail)}catch{parsed={message:detail.slice(0,180)}}
 if(!response.ok){
  const error=new Error('GitHub API '+response.status+' '+(parsed.message||response.statusText));
  error.status=response.status;throw error;
 }
 return parsed;
}
const prefix='making-mobile-atlas-v3-';
const names=Array.from({length:32},(_,i)=>prefix+String(i).padStart(2,'0')+'.webp');
names.push(prefix+'manifest.json');
const items=[];
for(const name of names){
 const path='public/assets/'+name;
 const bytes=readFileSync(new URL('../'+path,import.meta.url));
 if(bytes.length<500)throw new Error('Refusing to publish empty asset '+name);
 const result=await call('/git/blobs',{method:'POST',body:{content:bytes.toString('base64'),encoding:'base64'}});
 items.push({path,mode:'100644',type:'blob',sha:result.sha});
}
for(let attempt=0;attempt<4;attempt++){
 const head=await call('/git/ref/heads/main');
 const parent=head.object.sha;
 const previous=await call('/git/commits/'+parent);
 const tree=await call('/git/trees',{method:'POST',body:{base_tree:previous.tree.sha,tree:items}});
 const commit=await call('/git/commits',{method:'POST',body:{message:'Publish redesigned mobile Coil carving atlas v3',tree:tree.sha,parents:[parent]}});
 try{
  await call('/git/refs/heads/main',{method:'PATCH',body:{sha:commit.sha,force:false}});
  console.log('Published',names.length,'mobile sculpture atlas files:',commit.sha);
  process.exit(0);
 }catch(error){
  if(attempt>=3||![409,422].includes(error.status))throw error;
  console.log('Main advanced during the atlas publish; retrying against the new tree.');
 }
}
