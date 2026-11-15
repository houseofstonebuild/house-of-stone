// Build reproducible, seek-free phone frames from the exact approved Coil GLB.
// The private process page remains the canonical timeline; this script snapshots
// only its transparent WebGL canvas and never bakes the titles or workshop film.
import {createApp} from '../server.mjs';
import {chromium} from 'playwright';
import {writeFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';

const frameCount=192,perGroup=16,columns=4,rows=4,first=.305,last=1;
const tileWidth=240,tileHeight=520;
const output=new URL('../public/assets/',import.meta.url);
const qaDir=new URL('../test-results/mobile-sculpture-atlas/',import.meta.url);
mkdirSync(output,{recursive:true});
mkdirSync(qaDir,{recursive:true});
const dataDir=mkdtempSync(join(tmpdir(),'mabwe-mobile-bake-'));
const app=createApp({dataDir,env:{ADMIN_PASSWORD:'test-only-'+randomUUID()},backgroundNotifications:false});
let browser;
try{
 await new Promise(ok=>app.server.listen(0,'127.0.0.1',ok));
 const origin='http://127.0.0.1:'+app.server.address().port;
 browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1,hasTouch:true});
 const errors=[];
 page.on('pageerror',err=>errors.push(err.message));
 await page.goto(origin+'/prototypes/stone-to-sculpture.html?capture-mobile-atlas=1',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.getElementById('render')?.dataset.modelReady==='true'||document.getElementById('render')?.dataset.modelError==='true',{timeout:90000});
 if((await page.locator('#render').getAttribute('data-model-ready'))!=='true')throw new Error('Approved Coil mesh did not load for mobile bake');
 await page.waitForFunction(()=>typeof window.__hosCaptureFrame==='function');
 const generated=[];
 for(let group=0;group<frameCount/perGroup;group++){
  // A single 4x4 WebP sheet minimizes requests and decoding churn on iPhones.
  const atlasData=await page.evaluate(({group,first,last,frameCount,perGroup,columns,rows,tileWidth,tileHeight})=>{
   const sheet=document.createElement('canvas');
   sheet.width=columns*tileWidth;sheet.height=rows*tileHeight;
   const ctx=sheet.getContext('2d',{alpha:true});
   const canvas=document.querySelector('#render canvas');
   let alphaSum=0;
   for(let j=0;j<perGroup;j++){
    const frame=group*perGroup+j;
    const progress=first+(last-first)*frame/(frameCount-1);
    if(!window.__hosCaptureFrame(progress))throw new Error('No rendered Coil frame at '+progress);
    const col=j%columns,row=Math.floor(j/columns);
    ctx.clearRect(col*tileWidth,row*tileHeight,tileWidth,tileHeight);
    ctx.drawImage(canvas,0,0,canvas.width,canvas.height,col*tileWidth,row*tileHeight,tileWidth,tileHeight);
    if(frame>20&&j%4===0){
     const px=ctx.getImageData(col*tileWidth, row*tileHeight, tileWidth,tileHeight).data;
     for(let n=3;n<px.length;n+=173*4)alphaSum+=px[n];
    }
   }
   return {data:sheet.toDataURL('image/webp',.78),alphaSum};
  },{group,first,last,frameCount,perGroup,columns,rows,tileWidth,tileHeight});
  if(!atlasData.data.startsWith('data:image/webp;base64,'))throw new Error('Browser does not support WebP atlas export');
  if(group>1&&atlasData.alphaSum===0)throw new Error('WebGL framebuffer was transparent for atlas '+group);
  const bytes=Buffer.from(atlasData.data.slice('data:image/webp;base64,'.length),'base64');
  if(bytes.length<4000)throw new Error('Empty atlas '+group);
  const fileName='making-mobile-atlas-v1-'+String(group).padStart(2,'0')+'.webp';
  writeFileSync(new URL(fileName,output),bytes);
  generated.push({name:fileName,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
  process.stdout.write(fileName+' '+bytes.length+' bytes\n');
 }
 if(errors.length)throw new Error('Capture browser exceptions: '+errors.join('; '));
 const manifest={source:'/models/coil-uploaded-v1.glb',script:'/prototypes/stone-to-sculpture.js',frameCount,first,last,columns,rows,tileWidth,tileHeight,generated};
 writeFileSync(new URL('making-mobile-atlas-v1-manifest.json',output),JSON.stringify(manifest,null,2)+'\n');
 writeFileSync(new URL('manifest.json',qaDir),JSON.stringify(manifest,null,2)+'\n');
 console.log('Mobile Coil atlas complete:',generated.reduce((total,x)=>total+x.bytes,0),'bytes for',frameCount,'frames');
}finally{
 await browser?.close();
 await new Promise(ok=>app.server.close(ok));
 rmSync(dataDir,{recursive:true,force:true});
}
