// Higher-detail captures of the unchanged approved renderer. The model, lights,
// finish, camera and layout remain the approved ones; only capture density rises.
import {chromium} from 'playwright';
import {mkdirSync,readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server.mjs';
const dest='public/assets/continuous-making-v1/approved';mkdirSync(dest,{recursive:true});
const source='public/models/coil-uploaded-v1.glb',hash=()=>createHash('sha256').update(readFileSync(source)).digest('hex'),before=hash();
const dir=mkdtempSync(join(tmpdir(),'mabwe-detail-'));const app=createApp({dataDir:dir,backgroundNotifications:false,env:{NODE_ENV:'production',SITE_URL:'https://review.example',ADMIN_PASSWORD:'capture-only-password-123456'}});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;
const browser=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 for(const [profile,width,height,density] of [['desktop',1280,720,1.125],['mobile',720,1560,4/3]]){
  const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:density});
  const rendererSource=readFileSync('public/prototypes/approved-coil-reveal.js','utf8'),captureSource=rendererSource.replace('mobile()?1.15:1.5','2');if(captureSource===rendererSource)throw Error('Capture density patch did not match');
  await page.route('**/prototypes/approved-coil-reveal.js',route=>route.fulfill({status:200,contentType:'text/javascript',body:captureSource}));
  await page.goto(base+'/health?capture-approved-coil&capture-no-plinth');
  await page.evaluate(async({profile,density})=>{
   document.body.replaceChildren();Object.assign(document.body.style,{margin:'0',background:'#161d19'});const host=document.createElement('div');host.id='capture';host.dataset.atelierNoPlinth='true';Object.assign(host.style,{position:'absolute',inset:'0',overflow:'hidden'});document.body.append(host);
   const mod=await import('/prototypes/approved-coil-reveal.js');window.captureControl=mod.createApprovedCoilReveal(host);window.captureControl.update(.999);
  },{profile,density});
  await page.waitForFunction(()=>document.querySelector('#capture').dataset.approvedModelState==='ready',null,{timeout:40000});
  await page.evaluate(profile=>{const layer=document.querySelector('.approved-coil-reveal'),canvas=layer.querySelector('canvas');Object.assign(layer.style,{position:'absolute',inset:'0',transform:profile==='desktop'?'translateX(192px)':'none'});Object.assign(canvas.style,{position:'absolute',inset:'0',width:'100%',height:'100%',display:'block'});window.captureControl.update(.999)},profile);
  await page.screenshot({path:dest+'/'+profile+'.png'});await page.close();
 }
 if(hash()!==before)throw Error('Approved model changed');writeFileSync(dest+'/manifest.json',JSON.stringify({version:1,source_model:'/models/coil-uploaded-v1.glb',source_sha256:before,desktop:{width:1440,height:810},mobile:{width:960,height:2080},appearance:'unchanged approved model, materials, lighting and cameras'},null,2));
}finally{await browser.close();await new Promise(r=>app.server.close(r));rmSync(dir,{recursive:true,force:true})}
