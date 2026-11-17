// Decode the original detailed frame away from scrolling, layout and painting.
self.onmessage=async event=>{
 const {id,blob}=event.data;
 try{
  if(typeof createImageBitmap!=='function')throw Error('worker-bitmap-unavailable');
  const bitmap=await createImageBitmap(blob);
  self.postMessage({id,bitmap},[bitmap]);
 }catch(error){self.postMessage({id,error:String(error.message||error)})}
};
