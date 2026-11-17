// A visual contact sheet for editorial selection, not a source-media export.
import {chromium} from 'playwright';
import {mkdtempSync,mkdirSync,rmSync,writeFileSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createApp} from '../server.mjs';
const out=new URL('../test-results/browser/welcome-film/',import.meta.url);mkdirSync(out,{recursive:true});
const dir=mkdtempSync(join(tmpdir(),'mabwe-source-')),app=createApp({dataDir:dir,backgroundNotifications:false,env:{NODE_ENV:'production',SITE_URL:'https://review.example',ADMIN_PASSWORD:'source-review-password-12345'}});await new Promise(done=>app.server.listen(0,'127.0.0.1',done));
const browser=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1280,height:840}});await page.goto('http://127.0.0.1:'+app.server.address().port+'/health');
 const meta=await page.evaluate(async()=>{
  document.body.replaceChildren();document.body.style.margin='0';
  const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=840;document.body.append(canvas);const c=canvas.getContext('2d');c.fillStyle='white';c.fillRect(0,0,1280,840);
  const video=document.createElement('video');video.muted=true;video.preload='auto';video.src='/assets/house-of-mabwe-making-1080p-v2.mp4';
  await new Promise((resolve,reject)=>{video.onloadedmetadata=resolve;video.onerror=reject;});
  const times=Array.from({length:12},(_,i)=>Math.min(video.duration-.1,.05+i*(video.duration-.15)/11));
  for(let i=0;i<times.length;i++){
   await new Promise(resolve=>{video.onseeked=resolve;video.currentTime=times[i];});
   const x=i%4*320,y=Math.floor(i/4)*280;c.drawImage(video,x,y+25,320,180);c.fillStyle='#222';c.font='16px Arial';c.fillText(times[i].toFixed(2)+' seconds',x+10,y+20);
  }
  return {duration:video.duration,width:video.videoWidth,height:video.videoHeight,times};
 });
 await page.screenshot({path:new URL('documentary-source-contact.png',out).pathname});writeFileSync(new URL('source-contact.json',out),JSON.stringify(meta,null,2));console.log('SOURCE',JSON.stringify(meta));
}finally{await browser.close();await new Promise(done=>app.server.close(done));rmSync(dir,{recursive:true,force:true});}
