"""Compare photographs, fronts and inferred turntable surfaces using the viewer shader."""
from pathlib import Path
from io import BytesIO
import json,sys
import numpy as np
from PIL import Image,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'scripts/model-review'))
from render import Renderer
from build import REFS,REVIEW,mask_for
OUT=ROOT/'docs/model-review';OUT.mkdir(parents=True,exist_ok=True)

def save(image,path,quality=93):
    data=BytesIO();image.save(data,format='JPEG',quality=quality);path.write_bytes(data.getvalue())

if __name__=='__main__':
    renderer=Renderer(480,640,reconstruction=True,background=(246/255,244/255,239/255));boards=[]
    font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',18)
    audit=json.loads((ROOT/'content/star-model-audit.json').read_text())
    for id,ref in REFS.items():
        data=dict(np.load(REVIEW/(id+'.npz')));renderer.load(data,ROOT/f'public/models/textures/{id}-surface.jpg',[1536,0,512,2048],ref['polish'])
        views=[renderer.render(angle) for angle in [0,35,90,180,270]]
        mask=mask_for(ref);yy,xx=np.where(mask);bbox=(xx.min(),yy.min(),xx.max()+1,yy.max()+1)
        height=round(640*3.05/3.56);width=round(height*(bbox[2]-bbox[0])/(bbox[3]-bbox[1]));size=(width,height)
        source=Image.open(ROOT/f"public/assets/zsa-page-{ref['page']:02}.jpg").crop(tuple(v*2 for v in bbox)).resize(size,Image.Resampling.LANCZOS)
        panel=Image.new('RGB',(480,640),(246,244,239));offset=((480-width)//2,(640-height)//2);panel.paste(source,offset)
        target=Image.new('L',(480,640));target.paste(Image.fromarray(mask.astype('u1')*255).crop(bbox).resize(size,Image.Resampling.NEAREST),offset)
        actual=np.max(np.abs(np.asarray(views[0],dtype=int)-np.array([246,244,239])),axis=2)>16;expected=np.asarray(target)>127
        iou=float(np.sum(actual&expected)/np.sum(actual|expected));audit[id]['tracedFrontSilhouetteIoU']=round(iou,5)
        assert iou>.955,(id,iou,'Compare the rendered contour with the source trace')
        board=Image.new('RGB',(2880,700),(246,244,239));draw=ImageDraw.Draw(board)
        labels=['SOURCE PHOTO','MODEL · FRONT','MODEL · 35°','SIDE · INFERRED','REVERSE · INFERRED','OTHER SIDE · INFERRED']
        for i,(image,label) in enumerate(zip([panel]+views,labels)):
            board.paste(image,(i*480,60));draw.text((i*480+16,22),label,font=font,fill=(55,53,48))
        save(board,OUT/f'{id}-comparison.jpg');boards.append(board)
        for angle,image in zip([0,35,90,180,270],views):save(image,REVIEW/f'{id}-{angle}.jpg')
        print(id,'front contour IoU',round(iou,5),flush=True)
    overview=Image.new('RGB',(2880,700*len(boards)),(246,244,239))
    for i,board in enumerate(boards):overview.paste(board,(0,700*i))
    save(overview,OUT/'five-star-comparison.jpg');(ROOT/'content/star-model-audit.json').write_text(json.dumps(audit,indent=2)+'\n')
