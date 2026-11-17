from PIL import Image
from pathlib import Path
import json,struct
root=Path('build/continuous-making');paired={};count=0
for mode,folder in [('beauty','review'),('matte','mattes')]:
 seen=set()
 for index in sorted((root/'rig-patches'/mode).glob('rects-*.json')):
  records=json.loads(index.read_text());assert records,index
  for name,rect in records.items():
   assert name not in seen,name;seen.add(name)
   target=root/folder/rect['target'];assert target.exists(),target
   image=Image.open(target).convert('RGBA' if mode=='matte' else 'RGB');patch=Image.open(index.parent/name).convert(image.mode)
   assert patch.size==(rect['width'],rect['height'])
   if image.size==(rect['source_width'],rect['source_height']):base_x=base_y=0
   else:
    y=80 if name.startswith('desktop') else 200;sh=rect['source_height'];f32=lambda v:struct.unpack('f',struct.pack('f',v))[0];base_x=0;base_y=sh-int(sh*f32((sh-y)/sh))
   image.paste(patch,(rect['x']-base_x,rect['y']-base_y));image.save(target);count+=1
 paired[mode]=seen
assert paired['beauty']==paired['matte'] and len(paired['beauty'])>=1000,(len(paired['beauty']),len(paired['matte']))
print('Applied',count,'paired RGB/matte hand-region corrections.')
