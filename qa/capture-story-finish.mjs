// Bake the unchanged approved Coil renderer at the exact registered cameras.
import {chromium} from 'playwright';
import {mkdirSync,existsSync,readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server.mjs';
const dest=new URL('../public/assets/story-sequence-v1/approved/',import.meta.url);mkdirSync(dest,{recursive:true});
if(existsSync(new URL('desktop.png',dest))&&existsSync(new URL('mobile.png',dest)))process.exit(0);
const source=new URL('../public/models/coil-uploaded-v1.glb',import.meta.url),hash=()=>createHash('sha256').update(readFileSync(source)).digest('hex'),before=hash();
const dir=mkdtempSync(join(tmpdir(),'mabwe-finish-'));
const app=createApp({dataDir:dir,backgroundNotifications:false,env:{NODE_ENV:'production',SITE_URL:'https://review.example',ADMIN_PASSWORD:'capture-only-password-123456'}});
await new Promise(done=>app.server.listen(0,'127.0.0.1',done));const base='http://127.0.0.1:'+app.server.address().port;
const browser=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 for(const [profile,width,height] of [['desktop',1280,720],['mobile',720,1560]]){
  const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
  await page.goto(base+'/health?capture-approved-coil&capture-no-plinth');
  await page.evaluate(async({profile})=>{
   document.body.replaceChildren();document.body.style.margin='0';document.body.style.background='#161d19';
   const host=document.createElement('div');host.id='capture';host.dataset.atelierNoPlinth='true';
   Object.assign(host.style,{position:'absolute',inset:'0',overflow:'hidden'});document.body.append(host);
   const mod=await import('/prototypes/approved-coil-reveal.js');
   window.captureControl=mod.createApprovedCoilReveal(host);window.captureControl.update(.999);
  },{profile});
  await page.waitForFunction(()=>document.querySelector('#capture').dataset.approvedModelState==='ready',{timeout:40000});
  await page.evaluate(({profile})=>{
   const layer=document.querySelector('.approved-coil-reveal'),canvas=layer.querySelector('canvas');
   Object.assign(layer.style,{position:'absolute',inset:'0',transform:profile==='desktop'?'translateX(192px)':'none'});
   Object.assign(canvas.style,{position:'absolute',inset:'0',display:'block',width:'100%',height:'100%'});
   window.captureControl.update(.999);
  },{profile});
  await page.screenshot({path:new URL(profile+'.png',dest).pathname});
  await page.close();
 }
 if(hash()!==before)throw Error('Approved source model changed');
 writeFileSync(new URL('manifest.json',dest),JSON.stringify({version:1,source_model:'/models/coil-uploaded-v1.glb',sha256:before,materials:'unchanged original approved renderer',desktop:{width:1280,height:720,offset_x:192},mobile:{width:720,height:1560,offset_x:0}},null,2));
 console.log('Approved stills captured from unchanged GLB at registered cameras.');
}finally{await browser.close();await new Promise(done=>app.server.close(done));rmSync(dir,{recursive:true,force:true});}
