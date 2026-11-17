"""Composite the rendered foreground and real contact shadows on the gallery
canvas. Uses a geometry-identical matte, retaining the beauty-pass object pixels.
"""
from PIL import Image
from pathlib import Path
import numpy as np,json,struct
root=Path('build/continuous-making');background=np.array([22,29,25],np.float32)/255
configs={'desktop':(1440,810,(0,80,1440,730)),'mobile':(960,2080,(0,200,960,1700))}
def linear(a):return np.where(a<=.04045,a/12.92,((a+.055)/1.055)**2.4)
def srgb(a):return np.where(a<=.0031308,a*12.92,1.055*np.maximum(a,0)**(1/2.4)-.055)
base=linear(background)
for profile,(sw,sh,crop) in configs.items():
 platefile=next((root/'plates').glob(profile+'-0000-*.png'));plate=Image.open(platefile).convert('RGB')
 assert plate.size==(sw,sh),(profile,plate.size)
 files=sorted((root/'review').glob(profile+'-*.png'));assert len(files)==480,(profile,len(files))
 for i,file in enumerate(files):
  image=Image.open(file).convert('RGB');maskfile=root/'mattes'/file.name;mask=Image.open(maskfile).convert('RGBA')
  if image.size==(sw,sh):old_bg=plate
  else:
   x,y,w,h=crop;f32=lambda v:struct.unpack('f',struct.pack('f',v))[0];actual_y=sh-int(sh*f32((sh-y)/sh));old_bg=plate.crop((x,actual_y,x+image.width,actual_y+image.height))
  if mask.size!=image.size:
   assert abs(mask.width-image.width)<=1 and abs(mask.height-image.height)<=2,(profile,file.name,image.size,mask.size)
   mask=mask.resize(image.size,Image.Resampling.BILINEAR)
  a=np.asarray(mask,np.float32)[:,:,3:4]/255;assert float(a.min())<.01 and float(a.max())>.98,(profile,file.name,'Invalid object matte');a=np.where(a>.99,1,a);rgb=linear(np.asarray(image,np.float32)/255);old=linear(np.asarray(old_bg,np.float32)/255)
  lum=lambda c:np.sum(c*np.array([.2126,.7152,.0722],np.float32),axis=2,keepdims=True)
  ratio=np.clip(lum(rgb)/np.maximum(.001,lum(old)),.03,1);ratio=np.where(ratio>.97,1,ratio)
  # The gallery canvas can scale within the viewport. Keep the real contact
  # shadow, but let its distant floor fade into the canvas before the crop edge.
  # The object matte is applied separately, so no sculpture/tool pixels fade.
  yy,xx=np.ogrid[:image.height,:image.width]
  edge=np.minimum(np.minimum(xx/(image.width*.12),(image.width-1-xx)/(image.width*.12)),np.minimum(yy/(image.height*.08),(image.height-1-yy)/(image.height*.12)))
  edge=np.clip(edge,0,1);edge=edge*edge*(3-2*edge)
  shadow=base[None,None,:]*(1-(1-ratio)*edge[:,:,None])
  foreground=(rgb-(1-a)*old)/np.maximum(a,.02)
  result=np.clip(a*foreground+(1-a)*shadow,0,1);out=np.round(np.clip(srgb(result),0,1)*255).astype('uint8')
  Image.fromarray(out,'RGB').save(file)
  if i%80==0:print('Composited',profile,i,flush=True)
(root/'compositing.json').write_text(json.dumps({'method':'geometry-identical foreground matte and captured empty lighting plate','background':'#161d19','object_geometry':'unchanged','contact_shadows':'derived from actual beauty/empty-plate radiance'},indent=2))
