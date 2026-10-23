import {createHash} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {ContentError} from './catalog.mjs';
const fail=message=>{throw new ContentError(message);};
export function imageInfo(bytes){
  let width,height,type,extension,orientation=1;
  if(bytes.length>24&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))){width=bytes.readUInt32BE(16);height=bytes.readUInt32BE(20);type='image/png';extension='png';}
  else if(bytes.length>30&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'){
    type='image/webp';extension='webp';const format=bytes.toString('ascii',12,16);
    if(format==='VP8X'){width=1+bytes.readUIntLE(24,3);height=1+bytes.readUIntLE(27,3);}
    else if(format==='VP8 '&&bytes.toString('hex',23,26)==='9d012a'){width=bytes.readUInt16LE(26)&16383;height=bytes.readUInt16LE(28)&16383;}
    else if(format==='VP8L'&&bytes[20]===47){const bits=bytes.readUInt32LE(21);width=(bits&16383)+1;height=((bits>>>14)&16383)+1;}
  }else if(bytes.length>4&&bytes[0]===255&&bytes[1]===216){
    type='image/jpeg';extension='jpg';let offset=2;
    while(offset+4<bytes.length){
      if(bytes[offset]!==255)break;while(bytes[offset+1]===255)offset++;
      const marker=bytes[offset+1];if(marker===217||marker===218)break;
      const length=bytes.readUInt16BE(offset+2);if(length<2||offset+length+2>bytes.length)break;
      if(marker===225){const segment=bytes.subarray(offset+4,offset+2+length);if(segment.toString('ascii',0,6)==='Exif\0\0'){
        try{const tiff=segment.subarray(6),little=tiff.toString('ascii',0,2)==='II',u16=o=>little?tiff.readUInt16LE(o):tiff.readUInt16BE(o),u32=o=>little?tiff.readUInt32LE(o):tiff.readUInt32BE(o),start=u32(4),n=Math.min(u16(start),200);for(let i=0;i<n;i++){const at=start+2+i*12;if(u16(at)===274){orientation=u16(at+8);break;}}}catch{}
      }}
      if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)&&length>=7){height=bytes.readUInt16BE(offset+5);width=bytes.readUInt16BE(offset+7);}
      offset+=length+2;
    }
  }
  if([5,6,7,8].includes(orientation))[width,height]=[height,width];
  if(!width||!height||width>40000||height>40000||width*height>200000000)return null;
  return {width,height,type,extension};
}
function decode(input,max){
  if(typeof input?.data!=='string'||input.data.length>Math.ceil(max*4/3)+4||!/^[A-Za-z0-9+/]+={0,2}$/.test(input.data))fail('Choose a JPEG, PNG or WebP image.');
  const bytes=Buffer.from(input.data,'base64');if(bytes.length>max)fail('The image is too large.');
  const info=imageInfo(bytes);if(!info||info.type!==input.type)fail('The image could not be read. Choose a JPEG, PNG or WebP image.');
  return {bytes,...info,digest:createHash('sha256').update(bytes).digest('hex')};
}
export function storeMedia(input,mediaDir){
  const original=decode(input,32*1024*1024),variants=input.variants||[];
  if(!Array.isArray(variants)||variants.length>5)fail('Choose up to five responsive image sizes.');
  const sizes=variants.map(variant=>decode(variant,6*1024*1024));
  if(sizes.reduce((sum,image)=>sum+image.bytes.length,0)>20*1024*1024)fail('Responsive images are too large.');
  const seen=new Set();for(const image of sizes){
    if(image.type!=='image/webp'||image.width>original.width||Math.abs(image.width/image.height-original.width/original.height)>.015||seen.has(image.width))fail('Responsive image sizes do not match the original.');seen.add(image.width);
  }
  for(const image of [original,...sizes]){image.url='/media/'+image.digest+'.'+image.extension;const target=resolve(mediaDir,image.url.slice(7));if(!existsSync(target))writeFileSync(target,image.bytes,{mode:0o600,flag:'wx'});}
  const candidates=sizes.sort((a,b)=>a.width-b.width);const metadata={width:original.width,height:original.height,srcset:candidates.map(image=>image.url+' '+image.width+'w').join(', '),variants:candidates.map(image=>image.url)};
  // Content-derived names make re-uploading an image idempotent. Keep existing derivatives.
  const sidecar=resolve(mediaDir,original.digest+'.json');if(candidates.length||!existsSync(sidecar))writeFileSync(sidecar,JSON.stringify(metadata),{mode:0o600});
  return {key:'upload_'+original.digest,url:original.url,...metadata};
}
export function uploadedManifest(assets,mediaDir){
  const result={};for(const path of Object.values(assets)){
    const match=path.match(/^\/media\/([a-f0-9]{64})\.(jpg|png|webp)$/);if(!match)continue;
    const sidecar=resolve(mediaDir,match[1]+'.json');if(existsSync(sidecar)){try{result[path]=JSON.parse(readFileSync(sidecar,'utf8'));}catch{}}
  }return result;
}
