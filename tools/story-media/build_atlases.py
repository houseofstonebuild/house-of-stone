"""Build bounded-decode story sheets from existing public source images.
No model, catalogue, original photograph or video is changed.
"""
from pathlib import Path
from PIL import Image,ImageOps
import json,hashlib,os
root=Path('public/assets');out=root/'story-sequence-v1'
for kind,count in [('form',144),('workshop',200)]:
 manifest={'version':1,'frames':count,'columns':2,'rows':2,'per_sheet':4,'profiles':{},'source': 'making-v7' if kind=='form' else 'making-cinema-frames-v4','entries':[]}
 for profile in ['mobile','desktop']:
  folder=out/kind/profile;folder.mkdir(parents=True,exist_ok=True)
  size=(720,1560) if kind=='form' and profile=='mobile' else (1280,720) if kind=='form' else (600,900) if profile=='mobile' else (1600,900)
  manifest['profiles'][profile]={'width':size[0],'height':size[1]}
  for first in range(0,count,4):
   sheet=Image.new('RGB',(size[0]*2,size[1]*2))
   for cell,index in enumerate(range(first,min(first+4,count))):
    source=root/('making-v7/'+profile if kind=='form' else 'making-cinema-frames-v4')/('frame_%03d.webp'%index)
    with Image.open(source) as original:
     image=original.convert('RGB')
     if kind=='workshop' and profile=='mobile':
      # Exact native-resolution crop matching the documented hand/chisel.
      width=600;left=round((image.width-width)*.25)
      image=image.crop((left,0,left+width,900))
     assert image.size==size,(source,image.size,size)
     sheet.paste(image,((cell%2)*size[0],(cell//2)*size[1]))
    if profile=='desktop':manifest['entries'].append({'frame':index,'sha256':hashlib.sha256(source.read_bytes()).hexdigest()})
   sheet.save(folder/('sheet_%03d.webp'%(first//4)),format='WEBP',quality=94,method=5)
  print(kind,profile,'sheets ready',flush=True)
 (out/kind/'manifest.json').write_text(json.dumps(manifest,separators=(',',':'))+'\n')
print('Story sheets built; all source files retained unchanged.',flush=True)
