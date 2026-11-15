#!/usr/bin/env python3
"""Read-only mesh audit of approved Coil and pilot volumes. No original-model edits."""
import argparse, json, os, hashlib
import numpy as np
import trimesh

p=argparse.ArgumentParser();p.add_argument('--mesh',required=True);p.add_argument('--out',default='build/coil-pilot');a=p.parse_args()
os.makedirs(a.out,exist_ok=True)
mesh=trimesh.load(a.mesh,force='mesh',process=False)
components=mesh.split(only_watertight=False)
report={'input':a.mesh,'sha256':hashlib.sha256(open(a.mesh,'rb').read()).hexdigest(),
 'vertices':len(mesh.vertices),'faces':len(mesh.faces),
 'watertight':bool(mesh.is_watertight),'winding_consistent':bool(mesh.is_winding_consistent),
 'is_volume':bool(mesh.is_volume),'components':len(components),
 'component_faces':sorted([int(len(x.faces)) for x in components],reverse=True)[:20],
 'bounds':mesh.bounds.tolist(),'extents':mesh.extents.tolist(),
 'signed_volume':float(mesh.volume),'euler_number':int(mesh.euler_number)}
report['suitable_for_sdf']=bool(mesh.is_watertight and mesh.is_winding_consistent and mesh.is_volume)
with open(os.path.join(a.out,'audit.json'),'w') as f:json.dump(report,f,indent=2)
print(json.dumps(report,indent=2))
if not report['suitable_for_sdf']:
 print('PILOT BLOCKED: source topology unsuitable for guaranteed signed volume; repair a DERIVED working mesh and inspect openings.')
