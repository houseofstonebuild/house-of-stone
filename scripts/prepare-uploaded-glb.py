#!/usr/bin/env python3
"""Create a web copy of an uploaded GLB, preserving geometry and PBR settings.

Authoring tool only: requires Pillow. Textures are capped at 2048 px; the
original upload remains untouched. Prints an import record for provenance.
"""
import argparse
import hashlib
import io
import json
import struct
from pathlib import Path
from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('source', type=Path)
parser.add_argument('destination', type=Path)
args = parser.parse_args()
original = args.source.read_bytes()
magic, version, length = struct.unpack_from('<III', original)
assert (magic, version, length) == (0x46546c67, 2, len(original)), 'Invalid GLB header'
json_length, kind = struct.unpack_from('<II', original, 12)
assert kind == 0x4e4f534a
document = json.loads(original[20:20 + json_length])
binary_length, kind = struct.unpack_from('<II', original, 20 + json_length)
assert kind == 0x004e4942
binary = original[28 + json_length:28 + json_length + binary_length]
assert len(document['buffers']) == 1 and not document['buffers'][0].get('uri')
assert all('bufferView' in image and not image.get('uri') for image in document.get('images', [])), 'Expected self-contained textures'
image_views = {image['bufferView']: image for image in document.get('images', [])}
normal_textures = {material['normalTexture']['index'] for material in document.get('materials', []) if 'normalTexture' in material}
normal_views = {document['images'][document['textures'][index]['source']]['bufferView'] for index in normal_textures}
chunks, offset, preserved = [], 0, []
for index, view in enumerate(document['bufferViews']):
    start = view.get('byteOffset', 0)
    raw = binary[start:start + view['byteLength']]
    assert len(raw) == view['byteLength']
    if index in image_views:
        image = Image.open(io.BytesIO(raw))
        image.thumbnail((2048, 2048), Image.Resampling.LANCZOS)
        output = io.BytesIO()
        if image.mode in ('RGBA', 'LA') or 'transparency' in image.info:
            image.save(output, 'PNG', optimize=True)
            image_views[index]['mimeType'] = 'image/png'
        else:
            image.convert('RGB').save(output, 'JPEG', quality=95 if index in normal_views else 90, optimize=True)
            image_views[index]['mimeType'] = 'image/jpeg'
        raw = output.getvalue()
    else:
        preserved.append((index, raw))
    padding = (-offset) % 4
    chunks.append(b'\0' * padding)
    offset += padding
    view['byteOffset'], view['byteLength'] = offset, len(raw)
    chunks.append(raw)
    offset += len(raw)
packed = b''.join(chunks)
document['buffers'][0]['byteLength'] = len(packed)
for index, expected in preserved:
    view = document['bufferViews'][index]
    assert packed[view['byteOffset']:view['byteOffset'] + view['byteLength']] == expected, 'Geometry changed'
packed += b'\0' * ((-len(packed)) % 4)
encoded = json.dumps(document, separators=(',', ':')).encode()
encoded += b' ' * ((-len(encoded)) % 4)
total = 28 + len(encoded) + len(packed)
result = struct.pack('<III', magic, version, total) + struct.pack('<II', len(encoded), 0x4e4f534a) + encoded + struct.pack('<II', len(packed), 0x004e4942) + packed
args.destination.parent.mkdir(parents=True, exist_ok=True)
args.destination.write_bytes(result)
print(json.dumps({'originalName': args.source.name, 'sourceSha256': hashlib.sha256(original).hexdigest(), 'originalBytes': len(original), 'webSha256': hashlib.sha256(result).hexdigest(), 'webBytes': len(result), 'triangles': sum(document['accessors'][primitive['indices']]['count'] // 3 for mesh in document.get('meshes', []) for primitive in mesh['primitives']), 'maxTextureSize': 2048}))
