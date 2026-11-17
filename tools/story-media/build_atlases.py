"""Build source-detail sheets. Original photographs, frames and GLB stay intact."""
from pathlib import Path
from PIL import Image
import json,hashlib
root=Path('public/assets');out=root/'story-sequence-v1'
for kind,count in [('form',144),('workshop',58)]:
 dest=out/kind;old=dest/'manifest.json'
 if old.exists():
  previous=json.loads(old.read_text())
  if kind=='form' or previous.get('editorial_revision')==2:
   print(kind,'already prepared',flush=True);continue
 manifest={'version':1,'frames':count,'columns':2,'rows':2,'per_sheet':4,'profiles':{},'source':'making-v7' if kind=='form' else 'making-cinema-frames-v4','entries':[]}
 if kind=='workshop':manifest.update({'editorial_revision':2,'source_first':135,'source_last':192,'selection':'continuous hammer/chisel close-up, approximately 5.7–8.1 seconds of original master'})
 for profile in ['mobile','desktop']:
  folder=dest/profile;folder.mkdir(parents=True,exist_ok=True)
  for stale in folder.glob('sheet_*.webp'):stale.unlink()
  size=(720,1560) if kind=='form' and profile=='mobile' else (1280,720) if kind=='form' else (1000,900) if profile=='mobile' else (1600,900)
  manifest['profiles'][profile]={'width':size[0],'height':size[1]}
  for first in range(0,count,4):
   sheet=Image.new('RGB',(size[0]*2,size[1]*2))
   for cell,index in enumerate(range(first,min(first+4,count))):
    source_index=index if kind=='form' else index+135
    source=root/('making-v7/'+profile if kind=='form' else 'making-cinema-frames-v4')/('frame_%03d.webp'%source_index)
    with Image.open(source) as original:
     image=original.convert('RGB')
     # Keep the whole span from the hammer hand to the planted chisel tip.
     if kind=='workshop' and profile=='mobile':image=image.crop((0,0,1000,900))
     assert image.size==size,(source,image.size,size)
     sheet.paste(image,((cell%2)*size[0],(cell//2)*size[1]))
    if profile=='desktop':manifest['entries'].append({'frame':index,'source_frame':source_index,'sha256':hashlib.sha256(source.read_bytes()).hexdigest()})
   sheet.save(folder/('sheet_%03d.webp'%(first//4)),format='WEBP',quality=94,method=5)
  print(kind,profile,'sheets ready',flush=True)
 old.write_text(json.dumps(manifest,separators=(',',':'))+'\n')
print('Story sheets ready; original sources unchanged.',flush=True)
