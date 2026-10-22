"""Extract the 23 approved photographs from the original 31-page source PDF.
Usage: python scripts/import-source-photographs.py /path/to/ZSA-Sculptures.pdf
Requires PyMuPDF and Pillow. Rejects a changed or mismatched source photograph.
The source photograph is preserved; responsive derivatives are never upscaled.
"""
from pathlib import Path
from io import BytesIO
import hashlib, json, sys
import fitz
from PIL import Image
ROOT = Path(__file__).resolve().parents[1]
EXPECTED = {1: 'f4637e3be953e09c567cde770c1925e059198c10b6b2d3d3d2fd63d470c7ae7e', 2: '99fef362103fb9cf6ad866e3b66353f9a0cd6afa9ec7cd8972165463221f4cb4', 5: 'b8c4f8ca4b84d9aff0dd801334d7f118644a26e557fee1253db4cf86c5f39010', 6: '9033c7db2b3df2821dbb48a850982c6a405db53dd1a4e582ece1671fb446f5e6', 7: 'b350264a1de6e9275c8610fb348c990df4eeba30aad40cb8d393b4276f5a3250', 9: '7964097bdb86a19c9878d1b2fb962c3239a20e69cc62e691c831fcdee8e338f1', 10: '38fa12fb5605b86e5c064419bdd93e9d08f1d3fc391a4f2712a4e858c1641531', 12: '1435822e667a62554adeb7b7e98bc3fc6e8c6164c799fa249aa8242f8df1ccde', 13: '1fcdf9ba0b65ffc15a7a60d3b506b9ed45405979da08f3b9fa3203e2e24726fa', 14: 'e96c903035608cd55087841e53a8ac17f1cb40a19ae4706f2e8e7233eb364f2d', 16: '265e965c6756d46a865c4a3ff4f028f5ef3d5e39b60f001af2953e0d1cf8a63f', 17: '19bfcbae3e234447f1d87fc7e39bbeed0dd2bf337c7de7aa7696a479a94d7f13', 18: '86cd4147dc937c09cf787d75c119e84d6cd02a18b7a2d407daac5194b702e665', 20: '12231e6c9ac638933a00a1e173b6bf718d043eba972e711b38133cc250e3d8ff', 21: 'bc3fa303f3350bae016048a9f3175bf23dcf89dc6928d7b00c2a9c37ae101ebc', 23: 'be647df4f5abc46ca292d9fbdbf0ea94394b03d12fba71d0f9f41a2d9afdc386', 24: 'c1f197653c6152ffd45490ae21e8b60fccc28fa1c009e5cb5e71e286ef80e7d9', 25: '8fba3f27a4a8bdefea2fa363533982c356c638470dfbab0c817b912063930418', 26: 'ebbf3d4178077eef01b3d8370847bef118a075c32dfb2710ee524ad677d96957', 27: '7293029e343b0996d4219cddaef36d9011dec8500d39bf1c9f2f24fcecfa0676', 28: 'd5ddf9372087e76d228f80937ef20fdc17a128085087f4b8cca6d2a891da8d29', 29: '566fc40a90c997d19b868de03daefd0aec4328661bbd5f1ecb178930fd2fca50', 31: 'db85c6dd59c17a675bcb2f51c09d9467f982438204e81c0e7df47053d1c9893a'}
document = fitz.open(sys.argv[1])
if len(document) != 31: raise ValueError('Use the original 31-page ZSA Sculptures PDF.')
manifest_path = ROOT / 'public/media-manifest.json'
manifest = json.loads(manifest_path.read_text())
for page, expected in EXPECTED.items():
    images = document[page-1].get_images()
    if len(images) != 1: raise ValueError(f'Unexpected photograph count on page {page}')
    source = document.extract_image(images[0][0])['image']
    if hashlib.sha256(source).hexdigest() != expected: raise ValueError(f'Original page {page} does not match the approved source photograph.')
    target = ROOT / f'public/assets/zsa-page-{page:02}.jpg'
    target.write_bytes(source)
    image = Image.open(BytesIO(source))
    width, height = image.size
    variants = []
    for size in [480,800,1200]:
        if size >= width: continue
        path = target.with_name(target.stem+f'-{size}.webp')
        output = BytesIO()
        image.resize((size,round(height*size/width)),Image.Resampling.LANCZOS).save(output,format='WEBP',quality=88,method=4)
        path.write_bytes(output.getvalue())
        with Image.open(path) as verification: verification.verify()
        variants.append(f'/assets/{path.name} {size}w')
    variants.append(f'/assets/{target.name} {width}w')
    manifest['/assets/'+target.name] = {'width':width,'height':height,'srcset':', '.join(variants)}
manifest_path.write_text(json.dumps(manifest,indent=2)+'\n')
print(f'Imported {len(EXPECTED)} byte-verified source photographs and responsive variants.')
