"""Build source-pinned carving geometry for the sculpture-only transformation.
Never edits the approved model. No production data is read or written.
"""
import argparse,hashlib,importlib.util,json,pathlib,urllib.request
import numpy as np
p=argparse.ArgumentParser();p.add_argument('--root',default='build/continuous-making');p.add_argument('--keys',action='store_true');p.add_argument('--start',type=int,default=0);p.add_argument('--end',type=int,default=480);a=p.parse_args()
root=pathlib.Path(a.root);root.mkdir(parents=True,exist_ok=True)
spec=importlib.util.spec_from_file_location('solid','tools/carving-pilot/build_making_v6.py');solid=importlib.util.module_from_spec(spec);spec.loader.exec_module(solid)
data=solid.prepare(root/'coil.obj',112);coil=data[0];bounds=coil.bounds;factor=3.05/max(coil.extents[1],coil.extents[0]*.95,coil.extents[2]*.95)
center=np.array([bounds.mean(axis=0)[0],bounds[0,1],bounds.mean(axis=0)[2]])
def transform(v):
 v=(np.asarray(v)-center)*factor;c=np.cos(.14);s=np.sin(.14);x=v[:,0]*c+v[:,2]*s;z=-v[:,0]*s+v[:,2]*c
 return np.column_stack((x,-z,v[:,1]))
frames=480;keys=[130,365] if a.keys else list(range(a.start,min(frames,a.end)));entries=[]
for i in keys:
 phase='mark' if i<40 else 'carve' if i<248 else 'sand' if i<328 else 'heat' if i<400 else 'wax' if i<464 else 'work'
 t=float(np.clip((i-40)/207,0,1));mesh=coil if t>=1 else solid.mesh_for(solid.field(t,data),data)
 vertices=transform(mesh.vertices).astype(np.float32);faces=np.asarray(mesh.faces,dtype=np.int32)
 # Contact points on the actual visible surface, away from the central opening.
 eligible=vertices[(vertices[:,1]<np.quantile(vertices[:,1],.30))&(vertices[:,0]>np.quantile(vertices[:,0],.60))]
 desired=np.array([.6,-.20,1.25+.65*np.sin(i*.022)]) if phase in ['mark','carve'] else np.array([.50,-.25,.68+.18*np.sin(i*.09)])
 contact=eligible[np.argmin(np.sum((eligible-desired)**2,axis=1))] if len(eligible) else vertices[np.argmin(vertices[:,1])]
 np.savez_compressed(root/('mesh_%04d.npz'%i),vertices=vertices,faces=faces)
 entries.append({'index':i,'phase':phase,'contact':contact.tolist(),'carving':t})
 if i%40==0:print('Solid geometry',i,flush=True)
assets={}
manifest={'version':1,'frames':frames,'entries':entries,'assets':assets,'source_model':'/models/coil-uploaded-v1.glb','source_sha256':hashlib.sha256(pathlib.Path('public/models/coil-uploaded-v1.glb').read_bytes()).hexdigest()}
(root/'scene.json').write_text(json.dumps(manifest));print('Prepared',len(entries),'authored states; approved model is unchanged',flush=True)
