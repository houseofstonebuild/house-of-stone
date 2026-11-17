"""Pack WebP frames without a giant decoded sprite sheet. Byte offsets allow
independent frame decode; compressed packs remain available for reverse scroll.
"""
from pathlib import Path
from PIL import Image
from io import BytesIO
import json,argparse,hashlib
p=argparse.ArgumentParser();p.add_argument('--workshop',action='store_true');p.add_argument('--form',action='store_true');a=p.parse_args()
base=Path('public/assets/continuous-making-v1')
def pack(kind,profiles,count,openframe,bg='#161d19'):
 root=base/kind;root.mkdir(parents=True,exist_ok=True);manifest={'version':1,'frames':count,'background':bg,'profiles':{}}
 for profile,w,h in profiles:
  folder=root/profile;folder.mkdir(exist_ok=True);packs=[]
  for start in range(0,count,24):
   payload=bytearray();entries=[]
   for index in range(start,min(count,start+24)):
    image=openframe(profile,index).convert('RGB');assert image.size==(w,h),(profile,index,image.size)
    buf=BytesIO();image.save(buf,'WEBP',quality=90,method=5);data=buf.getvalue();entries.append({'offset':len(payload),'length':len(data)});payload.extend(data)
   name='pack_%03d.bin'%(start//24);(folder/name).write_bytes(payload);packs.append({'url':name,'start':start,'entries':entries,'bytes':len(payload),'sha256':hashlib.sha256(payload).hexdigest()})
  manifest['profiles'][profile]={'width':w,'height':h,'source_width':w,'source_height':h,'crop':[0,0,w,h],'packs':packs}
 (root/'manifest.json').write_text(json.dumps(manifest,separators=(',',':')))
 print(kind,'compressed packs',sum(p['bytes'] for pr in manifest['profiles'].values() for p in pr['packs']))
if a.workshop:
 def film(profile,index):
  image=Image.open('public/assets/making-cinema-frames-v4/frame_%03d.webp'%(index+135))
  return image.crop((0,0,1000,900)) if profile=='mobile' else image
 pack('workshop',[('desktop',1600,900),('mobile',1000,900)],58,film)
if a.form:
 def form(profile,index):
  matches=list(Path('build/continuous-making/review').glob('%s-%04d-*.png'%(profile,index)));assert len(matches)==1,(profile,index)
  return Image.open(matches[0])
 pack('form',[('desktop',1280,720),('mobile',720,1560)],480,form)
