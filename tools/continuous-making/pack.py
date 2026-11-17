"""Pack WebP frames without a giant decoded sprite sheet. Byte offsets allow
independent frame decode; compressed packs remain available for reverse scroll.
"""
from pathlib import Path
from PIL import Image
from io import BytesIO
import json,argparse,hashlib
p=argparse.ArgumentParser();p.add_argument('--workshop',action='store_true');p.add_argument('--documentary',action='store_true');p.add_argument('--form',action='store_true');p.add_argument('--flat',action='store_true');a=p.parse_args()
base=Path('public/assets/continuous-making-v1')
def pack(kind,profiles,count,openframe,bg='#161d19',source_profiles=None):
 root=base/kind;root.mkdir(parents=True,exist_ok=True);manifest={'version':1,'frames':count,'background':bg,'profiles':{}}
 for profile,w,h in profiles:
  folder=root/profile;folder.mkdir(exist_ok=True);packs=[]
  for stale in folder.glob('pack_*.bin'):stale.unlink()
  if source_profiles and a.flat:
   for stale in folder.glob('plate*.webp'):stale.unlink()
  for start in range(0,count,24):
   payload=bytearray();entries=[];deduplicated={}
   for index in range(start,min(count,start+24)):
    image=openframe(profile,index).convert('RGB');assert image.size==(w,h),(profile,index,image.size)
    buf=BytesIO();image.save(buf,'WEBP',quality=90,method=5);data=buf.getvalue();key=hashlib.sha256(data).hexdigest()
    if key in deduplicated:entries.append(deduplicated[key].copy())
    else:
     entry={'offset':len(payload),'length':len(data)};entries.append(entry);deduplicated[key]=entry;payload.extend(data)
   name='pack_%03d_%s.bin'%(start//24,hashlib.sha256(payload).hexdigest()[:16]);(folder/name).write_bytes(payload);packs.append({'url':name,'start':start,'entries':entries,'bytes':len(payload),'sha256':hashlib.sha256(payload).hexdigest()})
  source=(source_profiles or {}).get(profile,{'width':w,'height':h,'crop':[0,0,w,h]});manifest['profiles'][profile]={'width':w,'height':h,'source_width':source['width'],'source_height':source['height'],'crop':source['crop'],'packs':packs}
  if source_profiles and not a.flat:
   plate=folder/'plate.webp';name='plate_'+hashlib.sha256(plate.read_bytes()).hexdigest()[:16]+'.webp';plate.rename(folder/name);manifest['profiles'][profile]['plate']=name
 if kind=='form':
  manifest['source_model']='/models/coil-uploaded-v1.glb';manifest['source_sha256']=hashlib.sha256(Path('public/models/coil-uploaded-v1.glb').read_bytes()).hexdigest()
 (root/'manifest.json').write_text(json.dumps(manifest,separators=(',',':')))
 print(kind,'compressed packs',sum(p['bytes'] for pr in manifest['profiles'].values() for p in pr['packs']))
if a.workshop:
 def film(profile,index):
  image=Image.open('public/assets/making-cinema-frames-v4/frame_%03d.webp'%(index+135))
  return image.crop((0,0,1000,900)) if profile=='mobile' else image
 pack('workshop',[('desktop',1600,900),('mobile',1000,900)],58,film)
# The supplied master contains 200 verified early-carving source frames.
# Split them into consecutive passages, never repeat or interpolate the frames.
# The listening chapter holds 0-59; the handwork chapter continues at 60-199.
if a.documentary:
 for kind,first,end in [('material',0,60),('workshop',60,200)]:
  def passage(profile,index,first=first):
   image=Image.open('public/assets/making-cinema-frames-v4/frame_%03d.webp'%(index+first))
   return image.crop((0,0,1000,900)) if profile=='mobile' else image
  pack(kind,[('desktop',1600,900),('mobile',1000,900)],end-first,passage)
if a.form:
 dimensions={'desktop':{'width':1440,'height':810,'crop':[0,80,1440,730]},'mobile':{'width':960,'height':2080,'crop':[0,200,960,1700]}}
 plates={};approved={}
 for profile,config in dimensions.items():
  initial=list(Path('build/continuous-making/review').glob(profile+'-0000-*.png'));assert len(initial)==1
  plates[profile]=Image.open(initial[0]).convert('RGB');assert plates[profile].size==(config['width'],config['height'])
  approved[profile]=Image.open(base/'approved'/(profile+'.png')).convert('RGB');assert approved[profile].size==plates[profile].size
  folder=base/'form'/profile;folder.mkdir(parents=True,exist_ok=True);
  if not a.flat:plates[profile].save(folder/'plate.webp','WEBP',quality=94,method=5)
 def form(profile,index):
  config=dimensions[profile];x,y,w,h=config['crop'];box=(x,y,x+w,y+h)
  matches=list(Path('build/continuous-making/review').glob('%s-%04d-*.png'%(profile,index)));assert len(matches)==1,(profile,index)
  image=Image.open(matches[0]).convert('RGB')
  if image.size==plates[profile].size:image=image.crop(box)
  if image.size!=(w,h):
   assert abs(image.width-w)<=1 and abs(image.height-h)<=2,(profile,index,image.size,(w,h))
   import struct,math
   f32=lambda v:struct.unpack('f',struct.pack('f',v))[0]
   actual_top=config['height']-int(config['height']*f32((config['height']-y)/config['height']))
   aligned=plates[profile].copy();aligned.paste(image,(x,actual_top));image=aligned.crop(box)
  assert image.size==(w,h)
  final=approved[profile].crop(box)
  if index>=464:image=final
  elif index>=440:
   t=(index-440)/23;t=t*t*(3-2*t);image=Image.blend(image,final,t)
  if index in [0,144,280,360,430,479]:
   folder=base/'form'/'stills'/profile;folder.mkdir(parents=True,exist_ok=True);full=Image.new('RGB',plates[profile].size,'#161d19') if a.flat else plates[profile].copy();full.paste(image,(x,y));full.save(folder/('frame_%03d.webp'%index),'WEBP',quality=94,method=5)
  return image
 pack('form',[('desktop',1440,730),('mobile',960,1700)],480,form,source_profiles=dimensions)
