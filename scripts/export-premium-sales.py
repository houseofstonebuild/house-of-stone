#!/usr/bin/env python3
"""House of Mabwe: curated sales materials built from existing website photo files.

All sculpture photography is loaded directly from public/assets. Images are
resized or cropped for placement only; no retouching or synthetic content.
Catalogue data that is not verified is identified as working information.
"""
from __future__ import annotations

from pathlib import Path
from PIL import Image, ImageOps
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from pypdf import PdfReader
import json, re, zipfile

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "public" / "assets"
OUT = ROOT / "sales-output"
OUT.mkdir(parents=True, exist_ok=True)
W, H = 1000, 670
IVORY = "#F6F4EF"
PAPER = "#FBFAF7"
DARK = "#20352B"
DARKER = "#172920"
INK = "#1E2B24"
SAGE = "#657269"
STONE = "#DDDCD6"
RULE = "#D4D6D0"
BROWN = "#A8977F"
WHITE = "#FFFFFF"

def font(name, candidates):
    for path in candidates:
        if Path(path).exists():
            pdfmetrics.registerFont(TTFont(name, path))
            return
    raise RuntimeError("Required font missing: " + name)

font("Sans", ["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
              "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf"])
font("SansB", ["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
               "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf"])
font("Serif", ["/usr/share/fonts/truetype/liberation2/LiberationSerif-Regular.ttf",
               "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"])
font("SerifI", ["/usr/share/fonts/truetype/liberation2/LiberationSerif-Italic.ttf",
                "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Italic.ttf"])

with open(ROOT / "content" / "founding-collection.json", encoding="utf-8") as f:
    roster = json.load(f)
CAT = {w["id"]: w for w in roster["works"]}
DETAILS = [
    dict(id="zsa-025", group="ABSTRACT", studio="zsa-025-studio-front-v2.webp",
         setting="zsa-025-space-v3-1536.webp",
         copy="A double loop with intersecting curves and pale mineral veining."),
    dict(id="zsa-029", group="ABSTRACT", studio="zsa-029-studio-front-v2.webp",
         setting="zsa-029-space-v1-1536.webp",
         copy="A tall, open ribbon form, narrowing through the middle."),
    dict(id="zsa-028", group="ABSTRACT", studio="zsa-028-studio-front-v2.webp",
         setting="zsa-028-space-v3-1536.webp",
         copy="Interwoven red stone above a darker base."),
    dict(id="zsa-009", group="ABSTRACT", studio="zsa-009-studio-front-v2.webp",
         setting="zsa-009-space-v1-1536.webp",
         copy="Curved stone sections arranged around a central sphere."),
    dict(id="zsa-014", group="REFLECTION", studio="zsa-014-studio-front-v2.webp",
         setting="zsa-014-space-v3-1536.webp",
         copy="Two profiles emerge beneath a broad, grooved upper surface."),
    dict(id="zsa-020", group="REFLECTION", studio="zsa-020-studio-front-v2.webp",
         setting="zsa-020-interior-1536.webp",
         copy="Two figures joined in a single carved stone form."),
]
for work in DETAILS:
    w = CAT[work["id"]]
    if w.get("archived"):
        raise ValueError("Archived artwork selected: " + work["id"])
    work["title"] = w["title"]
    work["material"] = w.get("material") or "Not recorded"
    work["dimensions"] = w.get("dimensions") or "Not recorded"
    work["status"] = w.get("availability", "unknown")
    for key in ["studio", "setting"]:
        if not (ASSETS / work[key]).is_file():
            raise FileNotFoundError("Website photo not found: " + work[key])
    assert "kissing" not in work["title"].lower()

def fill(c, col): c.setFillColor(col)
def r(c, x, y, w, h, col):
    fill(c, col)
    c.rect(x, y, w, h, fill=1, stroke=0)
def stroke(c, x1, y1, x2, y2, col=RULE, width=0.65):
    c.setStrokeColor(col)
    c.setLineWidth(width)
    c.line(x1, y1, x2, y2)
def t(c, x, y, string, size=12, face="Sans", col=INK):
    fill(c, col)
    c.setFont(face, size)
    c.drawString(x, y, str(string))
def right(c, x, y, string, size=12, face="Sans", col=INK):
    fill(c, col)
    c.setFont(face, size)
    c.drawRightString(x, y, str(string))
def kicker(c, x, y, string, col=SAGE, size=9.2, tracking=1.3):
    ob = c.beginText(x, y)
    ob.setFont("SansB", size)
    ob.setFillColor(col)
    ob.setCharSpace(tracking)
    ob.textLine(string.upper())
    c.drawText(ob)
def wrap(text, width, face, size):
    out = []
    for paragraph in str(text).split("\n"):
        if not paragraph:
            out.append("")
            continue
        row = ""
        for word in paragraph.split():
            test = word if not row else row + " " + word
            if pdfmetrics.stringWidth(test, face, size) <= width:
                row = test
            else:
                if row: out.append(row)
                row = word
        if row: out.append(row)
    return out
def para(c, x, y, text, width, size=12, leading=19, face="Sans", col=INK):
    for line in wrap(text, width, face, size):
        if line:
            t(c, x, y, line, size, face, col)
        y -= leading
    return y
def img(c, filename, x, y, w, h, mode="contain"):
    path = ASSETS / filename
    with Image.open(path) as src:
        im = ImageOps.exif_transpose(src).convert("RGB")
        iw, ih = im.size
        scale = min(w / iw, h / ih) if mode == "contain" else max(w / iw, h / ih)
        sw, sh = iw * scale, ih * scale
        c.saveState()
        if mode == "cover":
            p = c.beginPath()
            p.rect(x, y, w, h)
            c.clipPath(p, stroke=0)
        c.drawImage(ImageReader(im), x + (w - sw) / 2, y + (h - sh) / 2, sw, sh)
        c.restoreState()
def page(c, no, section="SELECTED WORKS", dark=False):
    r(c, 0, 0, W, H, DARK if dark else PAPER)
    text = WHITE if dark else INK
    line = "#52655B" if dark else RULE
    kicker(c, 55, 629, "HOUSE OF MABWE", text, 9.1, 1.7)
    right(c, 945, 629, section.upper(), 8.2, "Sans", "#CBD3CA" if dark else SAGE)
    stroke(c, 55, 610, 945, 610, line)
    stroke(c, 55, 51, 945, 51, line)
    t(c, 55, 31, "HOUSEOFMABWE.COM", 8.0, "SansB", "#CBD3CA" if dark else SAGE)
    right(c, 944, 31, f"{no:02d}", 8.0, "Sans", "#CBD3CA" if dark else SAGE)
def finish(c): c.showPage()
def link(c, x, y, w, h, uri="https://houseofmabwe.com"):
    c.linkURL(uri, (x,y,x+w,y+h), relative=0)

def cover(c):
    r(c, 0, 0, W, H, IVORY)
    r(c, 0, 0, 457, H, DARKER)
    img(c, DETAILS[0]["studio"], 476, 65, 505, 540)
    kicker(c, 57, 615, "HOUSE OF MABWE", WHITE, 10.2, 2.0)
    stroke(c, 57, 594, 406, 594, "#54675C")
    kicker(c, 57, 500, "THE FOUNDING COLLECTION", "#C0CBBF", 9, 1.7)
    t(c, 55, 410, "Selected", 53, "Serif", WHITE)
    t(c, 55, 351, "sculpture", 53, "Serif", WHITE)
    t(c, 58, 286, "Stone sculpture from Zimbabwe.", 14, "Sans", "#E2E7E0")
    t(c, 58, 256, "Abstract forms and paired figures.", 13, "Sans", "#BECABD")
    stroke(c, 57, 111, 406, 111, "#54675C")
    t(c, 58, 84, "2026  /  SELECTED WORKS", 9.5, "Sans", "#CFD5CD")
    t(c, 58, 48, "HOUSEOFMABWE.COM", 9.5, "SansB", WHITE)
    link(c, 55, 20, 360, 70)
    finish(c)

def overview(c):
    page(c, 2, "THE COLLECTION")
    kicker(c, 56, 551, "THE HOUSE", SAGE)
    t(c, 54, 494, "Stone, considered individually.", 33, "Serif")
    y = para(c, 56, 440, "House of Mabwe presents stone sculptures by artists in Zimbabwe. The selected works range from open abstract forms to paired figures and portraiture.", 410, 12.2, 23)
    y -= 30
    y = para(c, 56, y, "Each artwork is considered by its shape, surface, material and relationship to the room in which it may be placed.", 408, 12.2, 23)
    y -= 30
    y = para(c, 56, y, "Artwork photographs are documentary images. Interior images illustrate possible placement; they are not evidence of scale.", 407, 10.5, 19, "Sans", SAGE)
    r(c, 522, 105, 421, 440, IVORY)
    img(c, DETAILS[0]["setting"], 522, 128, 421, 417, "cover")
    t(c, 522, 105, "ILLUSTRATIVE INTERIOR PLACEMENT", 8.2, "Sans", SAGE)
    finish(c)

def work_page(c, n, work, reverse=False):
    page(c, n, "ABSTRACT SCULPTURE" if work["group"]=="ABSTRACT" else "REFLECTION & PAIRED FORMS")
    left = 57 if not reverse else 416
    right_x = 656 if not reverse else 56
    r(c, left, 95, 530, 476, IVORY)
    img(c, work["studio"], left + 6, 98, 518, 466, "contain")
    kicker(c, right_x, 537, work["group"] + " / " + work["id"].upper(), SAGE, 8.9, 1.1)
    y = 482
    for line in wrap(work["title"], 284, "Serif", 35):
        t(c, right_x, y, line, 35, "Serif")
        y -= 43
    y -= 10
    y = para(c, right_x, y, work["copy"], 278, 11.3, 20, "Sans", INK)
    stroke(c, right_x, y-24, right_x+275, y-24, RULE)
    kicker(c, right_x, y-55, "PHOTOGRAPH OF THE ACTUAL SCULPTURE", SAGE, 7.3, .5)
    r(c, right_x, 99, 275, 184, IVORY)
    img(c, work["setting"], right_x, 99, 275, 184, "cover")
    t(c, right_x, 84, "ILLUSTRATIVE PLACEMENT", 7.2, "Sans", SAGE)
    finish(c)

def collection_transition(c):
    pass

def acquisition(c):
    page(c, 9, "INQUIRIES & ACQUISITION")
    kicker(c, 56, 547, "COLLECTING AND SOURCING", SAGE)
    t(c, 54, 483, "From interest to acquisition", 36, "Serif")
    items=[
        ("01", "Select a work", "Tell us which sculpture interests you, or describe the scale and setting you are considering."),
        ("02", "Review the details", "Request additional photographs, recorded dimensions, material information and an individual quotation."),
        ("03", "Confirm arrangements", "Availability, payment, packing, freight, insurance and installation requirements are agreed before an order is confirmed."),
    ]
    for i,(num,title,body) in enumerate(items):
        yy=383-i*124
        stroke(c, 55, yy+24, 585, yy+24, RULE)
        t(c, 55, yy-2, num, 12, "SansB", SAGE)
        t(c, 105, yy-2, title, 20, "Serif", INK)
        para(c, 106, yy-30, body, 450, 10.3, 17, "Sans", SAGE)
    r(c, 634, 95, 314, 385, DARK)
    kicker(c, 668, 425, "CONTACT THE HOUSE", "#D7E0D6", 8.8)
    t(c, 667, 359, "Discuss a", 30, "Serif", WHITE)
    t(c, 667, 324, "sculpture.", 30, "Serif", WHITE)
    para(c, 667, 264, "We can share the information available for each selected work and prepare a quotation.", 225, 11.3, 21, "Sans", "#E1E7DE")
    stroke(c, 668, 154, 914, 154, "#72877A")
    t(c, 668, 121, "HOUSEOFMABWE.COM", 10.6, "SansB", WHITE)
    link(c, 644, 104, 296, 100)
    finish(c)

def make_flagship(path):
    c=canvas.Canvas(str(path),pagesize=(W,H),pageCompression=1)
    c.setTitle("House of Mabwe | Selected Sculpture")
    c.setAuthor("House of Mabwe")
    cover(c)
    overview(c)
    work_page(c,3,DETAILS[0],False)
    work_page(c,4,DETAILS[1],True)
    work_page(c,5,DETAILS[2],False)
    work_page(c,6,DETAILS[3],True)
    work_page(c,7,DETAILS[4],False)
    work_page(c,8,DETAILS[5],True)
    acquisition(c)
    c.save()

def make_referral(path):
    w,h=612,792
    c=canvas.Canvas(str(path),pagesize=(w,h),pageCompression=1)
    c.setTitle("House of Mabwe | Introduction")
    r(c,0,0,w,h,PAPER)
    r(c,0,565,w,227,DARKER)
    kicker(c,36,749,"HOUSE OF MABWE",WHITE,9.5,1.8)
    stroke(c,36,735,576,735,"#607064")
    t(c,36,673,"Stone sculpture",34,"Serif",WHITE)
    t(c,36,632,"from Zimbabwe.",34,"Serif",WHITE)
    t(c,36,592,"A selected collection for collectors and interior projects.",10.5,"Sans","#E1E7DF")
    sites=[DETAILS[0],DETAILS[2],DETAILS[4]]
    for i,work in enumerate(sites):
        x=36+i*183
        r(c,x,300,173,244,IVORY)
        img(c,work["studio"],x+4,311,165,223,"contain")
        t(c,x,279,work["title"],14,"Serif",INK)
        t(c,x,260,work["id"].upper(),8,"Sans",SAGE)
    stroke(c,36,236,576,236,RULE)
    para(c,36,210,"House of Mabwe presents original stone sculpture made by artists in Zimbabwe. We share detailed photographs and information with collectors, designers and art advisors.",540,10.4,17,"Sans",INK)
    para(c,36,150,"Artwork specifications, availability and acquisition quotations are provided on inquiry.",540,10.4,17,"Sans",SAGE)
    r(c,36,53,540,58,DARK)
    t(c,56,74,"VIEW COLLECTION  /  REQUEST DETAILS",10.2,"SansB",WHITE)
    right(c,556,74,"HOUSEOFMABWE.COM",8.8,"Sans",WHITE)
    link(c,36,53,540,58)
    c.save()

def record_card(c, work, x, y):
    r(c,x,y,431,438,IVORY)
    img(c,work["studio"],x+12,y+157,210,269,"contain")
    kicker(c,x+235,y+408,work["id"].upper(),SAGE,8.0,0.7)
    name_lines=wrap(work["title"],185,"Serif",25)
    pos=y+359
    for line in name_lines:
        t(c,x+234,pos,line,25,"Serif")
        pos-=29
    stroke(c,x+234,y+293,x+410,y+293,RULE)
    t(c,x+234,y+266,"DIMENSIONS",7.4,"SansB",SAGE)
    para(c,x+234,y+246,work["dimensions"],175,11,17,"Sans",INK)
    t(c,x+234,y+195,"STONE",7.4,"SansB",SAGE)
    para(c,x+234,y+175,work["material"],173,10.8,17,"Sans",INK)
    t(c,x+13,y+129,"AVAILABILITY",7.3,"SansB",SAGE)
    t(c,x+13,y+109,"Confirm on inquiry",10,"Sans",INK)
    t(c,x+228,y+129,"QUOTE",7.3,"SansB",SAGE)
    t(c,x+228,y+109,"On request",10,"Sans",INK)
    stroke(c,x+13,y+91,x+417,y+91,RULE)
    para(c,x+13,y+69,"Working dimensions and stone identification; confirm before specification or purchase.",405,8.5,14,"Sans",SAGE)

def make_specification(path):
    c=canvas.Canvas(str(path),pagesize=(W,H),pageCompression=1)
    c.setTitle("House of Mabwe | Artwork Reference - Working Specifications")
    c.setAuthor("House of Mabwe")
    r(c,0,0,W,H,DARKER)
    r(c,515,0,485,H,IVORY)
    img(c,DETAILS[2]["studio"],525,75,457,515)
    kicker(c,58,618,"HOUSE OF MABWE",WHITE,9.2,2)
    stroke(c,58,602,458,602,"#718476")
    kicker(c,58,520,"ARTWORK REFERENCE", "#D2DBD0")
    t(c,58,443,"Working",44,"Serif",WHITE)
    t(c,58,393,"specifications",44,"Serif",WHITE)
    para(c,59,327,"Six selected sculptures. Dimensions and stone identifications are drawn from working catalogue records and require confirmation.",381,12.1,23,"Sans","#DCE4DB")
    stroke(c,58,173,459,173,"#718476")
    para(c,59,147,"Availability, price, packing, insurance and delivery are confirmed individually.",360,10.5,18,"Sans","#CED9CC")
    t(c,59,65,"HOUSEOFMABWE.COM",9.3,"SansB",WHITE)
    finish(c)
    for page_no,(l,rw),heading in [
        (2,DETAILS[:2],"ABSTRACT SCULPTURE"),
        (3,DETAILS[2:4],"ABSTRACT SCULPTURE"),
        (4,DETAILS[4:],"REFLECTION & PAIRED FORMS")]:
        page(c,page_no,heading)
        kicker(c,56,569,heading,SAGE)
        t(c,54,520,"Artwork reference",29,"Serif")
        record_card(c,l,55,74)
        record_card(c,rw,513,74)
        finish(c)
    c.save()

paths = {
    "collection": OUT / "House_of_Mabwe_Flagship_Collection.pdf",
    "referral": OUT / "House_of_Mabwe_Referral_Introduction.pdf",
    "reference": OUT / "House_of_Mabwe_Artwork_Reference.pdf",
}
make_flagship(paths["collection"])
make_referral(paths["referral"])
make_specification(paths["reference"])
for key,count in [("collection",9),("referral",1),("reference",4)]:
    doc=PdfReader(str(paths[key]))
    assert len(doc.pages)==count, (key,len(doc.pages))
    alltext="\n".join(p.extract_text() for p in doc.pages)
    assert not re.search("kissing lovers|unparalleled|timeless|elevated|transformative|breathtaking|masterpiece",alltext,re.I)
    print(key,len(doc.pages),paths[key].stat().st_size)
with zipfile.ZipFile(OUT/"House_of_Mabwe_Complete_Sales_Package.zip","w",zipfile.ZIP_DEFLATED) as z:
    for key,file in paths.items(): z.write(file,file.name)
    z.writestr("READ_ME_FIRST.txt",
       "HOUSE OF MABWE - SALES MATERIALS\n\n"
       "1. Flagship Collection: for collectors, advisors and interested designers.\n"
       "2. Referral Introduction: forward to personal introductions and first contacts.\n"
       "3. Artwork Reference: working catalogue data; confirm dimensions and stone with the house before specifying or quoting.\n\n"
       "All photographs are copied from the existing website source files without retouching.\n"
       "Interior placements are illustrative, not measured scale documents.\n"
       "Artwork availability, attribution, price and shipping are not yet verified.\n"
       "Kissing Lovers is deliberately excluded.\n")
print("Complete package:",(OUT/"House_of_Mabwe_Complete_Sales_Package.zip").stat().st_size)
