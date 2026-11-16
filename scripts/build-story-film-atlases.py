#!/usr/bin/env python3
"""Build preview-quality source-documentary atlases from 200 original HD frames.
Keep full-resolution source frames separately for the settled high-quality view.
"""
from PIL import Image
import os, json, hashlib
from pathlib import Path
source=Path('public/assets/making-cinema-frames-v4')
target=Path('public/assets/making-film-atlas-v1')
count=200
assert json.load(open(source/'manifest.json'))['frames']==count
for profile,width,height in [('desktop',480,270),('mobile',384,216)]:
 folder=target/profile
 folder.mkdir(parents=True,exist_ok=True)
 for block in range(8):
  sheet=Image.new('RGB',(width*5,height*5),(22,27,23))
  for cell in range(25):
   i=block*25+cell
   with Image.open(source/f'frame_{i:03d}.webp') as img:
    im=img.convert('RGB').resize((width,height),Image.Resampling.LANCZOS)
   sheet.paste(im,((cell%5)*width,(cell//5)*height))
  sheet.save(folder/f'sheet_{block:02d}.webp','WEBP',quality=85,method=5)
  assert (folder/f'sheet_{block:02d}.webp').stat().st_size>10000
sha=hashlib.sha256((source/'manifest.json').read_bytes()).hexdigest()
manifest={'version':1,'source':'making-cinema-frames-v4','source_manifest_sha256':sha,'frames':200,
 'frames_per_sheet':25,'columns':5,'rows':5,
 'profiles':{'desktop':{'tile_width':480,'tile_height':270},
             'mobile':{'tile_width':384,'tile_height':216}},
 'purpose':'responsive progressive scroll scrub; high-resolution originals always retained'}
(target/'manifest.json').write_text(json.dumps(manifest,indent=2))
print('Original 200-frame documentary built into eight 5x5 tiles per profile')
