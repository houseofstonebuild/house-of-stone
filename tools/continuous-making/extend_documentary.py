"""Keep the original documentary's detail and colour; extend two distinct shots."""
from pathlib import Path
import subprocess,runpy,json,hashlib
from PIL import Image
root=Path('build/continuous-making/documentary');root.mkdir(parents=True,exist_ok=True)
master=root/'master.mp4'
with master.open('wb') as out:
 for source in sorted(Path('public/assets/film').glob('making-v2-??.part')):out.write(source.read_bytes())
assert hashlib.sha256(master.read_bytes()).hexdigest()=='be15b5477458143d2e9f4258a6f124f7828de1ee1bbbd3a126a344ac57aaa98e'
pack=runpy.run_path('tools/continuous-making/pack.py')['pack']
for kind,start,count in [('artist',.6,96),('workshop',5.7,116)]:
 folder=root/kind;folder.mkdir(exist_ok=True)
 subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-ss',str(start),'-i',str(master),'-an','-vf','fps=24,scale=1600:900:flags=lanczos','-frames:v',str(count),'-c:v','libwebp','-quality','94','-compression_level','4','-start_number','0',str(folder/'frame_%03d.webp')],check=True)
 def frame(profile,index):
  image=Image.open(folder/('frame_%03d.webp'%index))
  return image.crop((0,0,1000,900)) if profile=='mobile' else image
 pack(kind,[('desktop',1600,900),('mobile',1000,900)],count,frame)
 manifest=Path('public/assets/continuous-making-v1')/kind/'manifest.json';data=json.loads(manifest.read_text());data['documentary']={'start_seconds':start,'end_seconds':start+count/24,'fps':24,'master_sha256':hashlib.sha256(master.read_bytes()).hexdigest()};manifest.write_text(json.dumps(data,separators=(',',':')))
 contact=Image.new('RGB',(960,180))
 for n,index in enumerate([0,count//3,2*count//3,count-1]):contact.paste(frame('desktop',index).resize((240,135)),(n*240,20))
 contact.save(root/(kind+'-contact.jpg'))
