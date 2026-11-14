#!/usr/bin/env python3
"""Create House of Mabwe sales PDFs using the exact images displayed by the website.
No AI retouching, repainting, or background extraction."""
from pathlib import Path
from io import BytesIO
from PIL import Image
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase import pdfmetrics
import zipfile, re, os

ROOT=Path(__file__).resolve().parents[1]
ASSETS=ROOT/"public/assets"
OUT=ROOT/"sales-output"
OUT.mkdir(exist_ok=True)
PAPER=(960,610)
BG="#F5F3EF"
INK="#202923"
MUTED="#6F7871"
LINE="#D2D3CA"
DARK="#192B22"

fonts=[("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf","Sans"),("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf","SansBold"),("/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf","Serif")]
for f,n in fonts:
    pdfmetrics.registerFont(TTFont(n,f))
def color(c,h): c.setFillColor(h)
def rect(c,x,y,w,h,fill):
    color(c,fill);c.rect(x,y,w,h,stroke=0,fill=1)
def t(c,x,y,txt,size=11,font="Sans",fill=INK):
    color(c,fill);c.setFont(font,size);c.drawString(x,y,txt)
def line(c,x1,y1,x2,y2):
    c.setStrokeColor(LINE);c.setLineWidth(.6);c.line(x1,y1,x2,y2)
def image(c,filename,x,y,w,h,mode="contain"):
    path=ASSETS/filename
    if not path.exists():raise FileNotFoundError(path)
    with Image.open(path) as src:
        im=src.convert("RGB"); iw,ih=im.size
        # Exact site imagery. Only resize for page layout, never modify content.
        scale=min(w/iw,h/ih) if mode=="contain" else max(w/iw,h/ih)
        sw,sh=iw*scale,ih*scale
        c.saveState()
        if mode=="cover":
            p=c.beginPath();p.rect(x,y,w,h);c.clipPath(p,stroke=0)
        c.drawImage(ImageReader(im),x+(w-sw)/2,y+(h-sh)/2,sw,sh,mask='auto')
        c.restoreState()
def page(c,n,label):
    rect(c,0,0,*PAPER,BG)
    t(c,52,575,"HOUSE OF MABWE",12,"SansBold")
    t(c,906,575,label.upper(),8,"Sans",MUTED) if False else None
    line(c,52,558,908,558)
    line(c,52,48,908,48)
    t(c,52,28,"HOUSEOFMABWE.COM",8,"SansBold",MUTED)
    t(c,874,28,f"{n:02d}",9,"Sans",MUTED)
def label(c,x,y,heading,copy=None,number=None):
    if number:t(c,x,y+29,number,9,"SansBold",MUTED)
    t(c,x,y,heading,25,"Serif")
    if copy:
        for i,l in enumerate(copy): t(c,x,y-34-19*i,l,10,"Sans",MUTED)
def linkbox(c,x,y):
    t(c,x,y,"INQUIRE ABOUT A WORK",10,"SansBold")
    t(c,x,y-23,"houseofmabwe.com",11,"Sans")
def finish(c):c.showPage()

# Only current website asset files. Order: abstracts, then paired/reflection forms.
works=[
    ("Turning Line","zsa-025-studio-front-v2.webp","zsa-025-space-v3-1536.webp",
     ["An abstract sculpture formed by crossing","curves and open spaces."]),
    ("Open Curls","zsa-029-studio-front-v2.webp","zsa-029-space-v1-1536.webp",
     ["Two polished forms rise from a narrower","textured base."]),
    ("Red Interlace","zsa-028-studio-front-v2.webp","zsa-028-space-v3-1536.webp",
     ["Red stone with contrasting veins and","a pronounced folded silhouette."]),
    ("Orbit","zsa-009-studio-front-v2.webp","zsa-009-space-v1-1536.webp",
     ["A dark, open sculpture arranged around","a rounded central form."]),
    ("Paired Reflection","zsa-014-studio-front-v2.webp","zsa-014-space-v3-1536.webp",
     ["Two faces share a carved upper section."]),
    ("Held","zsa-020-studio-front-v2.webp","zsa-020-interior-1536.webp",
     ["Two figures lean together in a single","connected stone form."]),
]
for _,a,b,_ in works:
    for f in (a,b):
        if not (ASSETS/f).exists():
            raise FileNotFoundError(f)

def make_lookbook(path):
    c=canvas.Canvas(str(path),pagesize=PAPER,pageCompression=1)
    c.setTitle("House of Mabwe | Selected Sculpture")
    # Cover, selected works shown in original studio imagery
    rect(c,0,0,*PAPER,DARK)
    t(c,56,565,"HOUSE OF MABWE",12,"SansBold","#E7EAE4")
    line(c,56,543,904,543)
    t(c,56,455,"Selected",43,"Serif","#FFFFFF")
    t(c,56,403,"sculptures",43,"Serif","#FFFFFF")
    t(c,56,340,"Zimbabwean stone sculpture",13,"Sans","#E7EAE4")
    image(c,works[0][1],520,120,194,355)
    image(c,works[2][1],720,120,185,355)
    t(c,56,69,"HOUSEOFMABWE.COM",10,"SansBold","#E7EAE4")
    finish(c)
    # Intro: straight description
    page(c,2,"Overview")
    t(c,52,475,"The collection",38,"Serif")
    for i,s in enumerate([
        "House of Mabwe presents stone sculptures made by artists in Zimbabwe.",
        "The selection includes abstract forms, portraits and paired figures.",
        "We work with collectors, interior designers and clients sourcing art for",
        "homes, offices and other interior spaces.",
        "",
        "Photographs show individual sculptures and examples of interior placement.",
        "Work-specific pricing, availability and shipping are provided on inquiry."
    ]):
        t(c,52,410-i*26,s,12,"Sans",INK if i<4 else MUTED)
    image(c,"designers-coil-v2.webp",650,150,260,333,"cover")
    finish(c)
    # Abstract works: 2 pages, 2 works each, full site photo + setting photo.
    for pi, pair in enumerate([works[:2],works[2:4]],start=3):
        page(c,pi,"Abstract sculpture")
        t(c,52,510,"Abstract sculpture",34,"Serif")
        t(c,53,482,"Selected works",10,"Sans",MUTED)
        for j,(name,studio,setting,desc) in enumerate(pair):
            x=52+j*434
            rect(c,x,173,410,292,"#EBEBE5")
            image(c,studio,x,173,207,292)
            image(c,setting,x+211,173,199,292,"cover")
            t(c,x,139,name,20,"Serif")
            for k,d in enumerate(desc):t(c,x,113-k*15,d,9,"Sans",MUTED)
        finish(c)
    # Page 5: red stone feature & architectural setting
    page(c,5,"Stone and form")
    image(c,works[2][2],52,84,548,436,"cover")
    label(c,628,450,"Red Interlace",[
        "Red stone.",
        "Polished surfaces and natural markings.",
        "Shown in a residential setting."
    ],"ABSTRACT SCULPTURE")
    t(c,628,275,"Alternative views and",11,"Sans",INK)
    t(c,628,255,"dimensions available on inquiry.",11,"Sans",INK)
    finish(c)
    # Page 6: reflections and paired forms
    page(c,6,"Reflection and paired forms")
    t(c,52,510,"Reflection and paired forms",32,"Serif")
    t(c,53,478,"Selected works",10,"Sans",MUTED)
    for j,(name,studio,setting,desc) in enumerate(works[4:]):
        x=52+j*434
        rect(c,x,173,410,290,"#EBEBE5")
        image(c,studio,x,173,208,290)
        image(c,setting,x+212,173,198,290,"cover")
        t(c,x,138,name,20,"Serif")
        for k,d in enumerate(desc):t(c,x,112-k*15,d,9,"Sans",MUTED)
    finish(c)
    # Page 7: designers, practical details
    page(c,7,"For your project")
    image(c,"designers-coil-v2.webp",52,87,508,428,"cover")
    label(c,594,460,"For your project",[
        "We can share available works, photographs,",
        "dimensions, stone details and quotations",
        "for a particular project."
    ],"FOR DESIGNERS AND COLLECTORS")
    t(c,594,305,"Tell us the type of space and",11)
    t(c,594,284,"the scale of work you need.",11)
    linkbox(c,594,190)
    finish(c)
    c.save()
def make_intro(path):
    c=canvas.Canvas(str(path),pagesize=PAPER,pageCompression=1)
    c.setTitle("House of Mabwe | Introduction")
    rect(c,0,0,*PAPER,BG)
    t(c,50,567,"HOUSE OF MABWE",13,"SansBold")
    line(c,50,550,910,550)
    t(c,50,496,"Zimbabwean stone sculpture",32,"Serif")
    t(c,50,462,"Selected abstract and paired works for collectors and designed interiors.",11,"Sans",MUTED)
    for j,(name,studio,setting,desc) in enumerate([works[0],works[2],works[4]]):
        x=50+j*292
        rect(c,x,132,278,300,"#E9EAE4")
        image(c,studio,x,132,278,300)
        t(c,x,99,name,16,"Serif")
    line(c,50,72,910,72)
    t(c,50,51,"Explore the collection and request work details: houseofmabwe.com",10,"Sans")
    c.showPage();c.save()
a=OUT/"House_of_Mabwe_Selected_Sculptures.pdf"
b=OUT/"House_of_Mabwe_Introduction.pdf"
make_lookbook(a)
make_intro(b)
for path,minpages in [(a,7),(b,1)]:
    from pypdf import PdfReader
    r=PdfReader(str(path))
    assert len(r.pages)==minpages,(path,len(r.pages))
    text="\n".join(page.extract_text() for page in r.pages)
    assert not re.search(r"kissing\s+lovers|unparalleled|timeless|elevated|transformative",text,re.I)
with zipfile.ZipFile(OUT/"House_of_Mabwe_Sales_Materials.zip","w",zipfile.ZIP_DEFLATED) as z:
    z.write(a,a.name);z.write(b,b.name)
print("created",[(p.name,p.stat().st_size) for p in [a,b,OUT/"House_of_Mabwe_Sales_Materials.zip"]])
