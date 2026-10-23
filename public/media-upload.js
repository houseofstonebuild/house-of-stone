const base64=blob=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=()=>reject(new Error('The photograph could not be read.'));reader.readAsDataURL(blob);});
export async function preparePhoto(file){
  if(file.size>32*1024*1024||!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Choose a JPEG, PNG or WebP image under 32 MB.');
  const bitmap=await createImageBitmap(file),variants=[];
  try{
    const widths=[480,960,1600,2400,3200].filter(width=>width<=bitmap.width);if(!widths.length)widths.push(bitmap.width);
    for(const width of widths){
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=Math.max(1,Math.round(bitmap.height*width/bitmap.width));
      const context=canvas.getContext('2d');context.imageSmoothingQuality='high';context.drawImage(bitmap,0,0,canvas.width,canvas.height);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.92));if(!blob||blob.type!=='image/webp')throw new Error('This browser could not prepare responsive photographs. Please use a current browser.');
      variants.push({type:blob.type,data:await base64(blob)});canvas.width=canvas.height=1;
    }
  }finally{bitmap.close();}
  return {type:file.type,data:await base64(file),variants};
}
