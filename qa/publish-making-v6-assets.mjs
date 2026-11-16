// Publish the completed local v6 frame set in ONE git commit and ONE push.
// Avoid hundreds of GitHub API blob requests, which trigger secondary rate limits.
import {readFileSync,mkdirSync,copyFileSync,statSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
function git(...args){
 const r=spawnSync('git',args,{encoding:'utf8'});
 if(r.status!==0)throw Error('git '+args.join(' ')+': '+(r.stderr||r.stdout));
 return r.stdout.trim();
}
if(process.env.GITHUB_REF!=='refs/heads/main')throw Error('Main-branch publisher only');
const src='build/making-v6',dst='public/assets/making-v7';
const manifest=JSON.parse(readFileSync(join(src,'manifest.json'),'utf8'));
if(manifest.version!==7||manifest.frames!==144||manifest.registered_to!=='approved-coil-v1'||manifest.camera_revision!==3)
 throw Error('Refusing to publish incomplete or unregistered v7 media');
const files=['manifest.json',...['desktop','mobile'].flatMap(p=>Array.from({length:manifest.frames},(_,i)=>p+'/frame_'+String(i).padStart(3,'0')+'.webp'))];
for(const file of files){
 const from=join(src,file),to=join(dst,file);
 if(statSync(from).size<1000)throw Error('Empty frame '+file);
 mkdirSync(dirname(to),{recursive:true});copyFileSync(from,to);
}
git('config','user.name','github-actions[bot]');
git('config','user.email','41898282+github-actions[bot]@users.noreply.github.com');
git('add','--','public/assets/making-v7');
const diff=spawnSync('git',['diff','--cached','--quiet']);
if(diff.status===0){console.log('Already published: all',files.length,'files are unchanged');process.exit(0)}
if(diff.status!==1)throw Error('git diff failed '+diff.status);
git('commit','-m','Publish physically fractured Making v7 Coil animation frames');
// Never force-push. A full offline render takes time, and unrelated commits
// can land while rendering. Fetch/rebase and retry any non-fast-forward push.
let lastError='';
for(let attempt=0;attempt<7;attempt++){
 git('fetch','origin','main');
 const rebase=spawnSync('git',['rebase','origin/main'],{encoding:'utf8'});
 if(rebase.status!==0){
  spawnSync('git',['rebase','--abort'],{encoding:'utf8'});
  throw Error('Media rebase conflict: '+rebase.stderr);
 }
 const push=spawnSync('git',['push','origin','HEAD:main'],{encoding:'utf8'});
 if(push.status===0){
  console.log('Published',files.length,'versioned v7 assets:',git('rev-parse','HEAD'));
  process.exit(0);
 }
 lastError=push.stderr;
 console.log('Main branch updated while uploading; retry',attempt+1);
}
throw Error('Media not published after 7 safe retries: '+lastError);
