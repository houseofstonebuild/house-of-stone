from PIL import Image,ImageDraw
import pathlib,json
root=pathlib.Path('build/continuous-making');folder=root/'review'
for profile in ['desktop','mobile']:
 files=sorted(folder.glob(profile+'-*.png'));assert len(files)==len(json.loads((root/'scene.json').read_text())['entries']), 'Incomplete rendered study: '+profile;cw=320;ch=430 if profile=='mobile' else 220;sheet=Image.new('RGB',(cw*5,ch*((len(files)+4)//5)),'#eeece5');d=ImageDraw.Draw(sheet)
 for i,file in enumerate(files):
  im=Image.open(file).convert('RGB');im.thumbnail((cw-8,ch-30));x=i%5*cw;y=i//5*ch;sheet.paste(im,(x,y+22));d.text((x+5,y+4),file.stem,fill='#202820')
 sheet.save(folder/('contact-'+profile+'.jpg'),quality=92)
