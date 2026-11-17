from PIL import Image
from pathlib import Path
import json,struct
root=Path('build/continuous-making');count=0
for mode,folder in [('beauty','review'),('matte','mattes')]:
 for index in (root/'grip-patches'/mode).glob('rects-*.json'):
  records=json.loads(index.read_text());assert records,index
  for name,rect in records.items():
   target=root/folder/name;assert target.exists(),target
   image=Image.open(target).convert('RGBA' if mode=='matte' else 'RGB');patch=Image.open(index.parent/name).convert(image.mode)
   assert patch.size==(rect['width'],rect['height'])
   if image.size==(rect['source_width'],rect['source_height']):base_x=base_y=0
   else:
    y=80 if name.startswith('desktop') else 200;sh=rect['source_height'];f32=lambda v:struct.unpack('f',struct.pack('f',v))[0];base_x=0;base_y=sh-int(sh*f32((sh-y)/sh))
   image.paste(patch,(rect['x']-base_x,rect['y']-base_y));image.save(target);count+=1
assert 800<=count<=1120,count
print('Applied',count,'small RGB/matte region corrections; source geometry and other image pixels preserved.')
