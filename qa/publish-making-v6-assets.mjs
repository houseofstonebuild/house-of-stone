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
const src='build/making-v6',dst='public/assets/making-v6';
const manifest=JSON.parse(readFileSync(join(src,'manifest.json'),'utf8'));
if(manifest.version!==6||manifest.frames!==144)throw Error('Refusing to publish incomplete v6 media');
const files=['manifest.json',...['desktop','mobile'].flatMap(p=>Array.from({length:manifest.frames},(_,i)=>p+'/frame_'+String(i).padStart(3,'0')+'.webp'))];
for(const file of files){
 const from=join(src,file),to=join(dst,file);
 if(statSync(from).size<1000)throw Error('Empty frame '+file);
 mkdirSync(dirname(to),{recursive:true});copyFileSync(from,to);
}
git('config','user.name','github-actions[bot]');
git('config','user.email','41898282+github-actions[bot]@users.noreply.github.com');
git('add','--','public/assets/making-v6');
const diff=spawnSync('git',['diff','--cached','--quiet']);
if(diff.status===0){console.log('Already published: all',files.length,'files are unchanged');process.exit(0)}
if(diff.status!==1)throw Error('git diff failed '+diff.status);
git('commit','-m','Publish verified Making v6 Coil animation frames');
const first=spawnSync('git',['push','origin','HEAD:main'],{encoding:'utf8'});
if(first.status!==0)throw Error('Atomic media push failed: '+first.stderr);
console.log('Published',files.length,'media files to main in one Git push:',git('rev-parse','HEAD'));
