#!/usr/bin/env python3
"""Proof-of-geometry ONLY: raw block, half-carved solid, exact Coil. No site deployment.
Inputs are read-only. A failed mesh audit aborts rather than producing deceptive geometry.
"""
import argparse, json, os, time
import numpy as np
import trimesh
from scipy import ndimage
from skimage import measure
try:
 import igl
except ImportError as ex:
 raise SystemExit('libigl required: pip install libigl') from ex

def sdf(mesh, pts, chunk=160000):
 v=np.ascontiguousarray(mesh.vertices,dtype=np.float64)
 f=np.ascontiguousarray(mesh.faces,dtype=np.int64)
 out=np.empty(len(pts),np.float32)
 for i in range(0,len(pts),chunk):
  q=np.ascontiguousarray(pts[i:i+chunk],dtype=np.float64)
  try:
   value=igl.signed_distance(q,v,f,sign_type=igl.SIGNED_DISTANCE_TYPE_WINDING_NUMBER)[0]
  except TypeError:
   value=igl.signed_distance(q,v,f)[0]
  out[i:i+chunk]=value
 return out

def mesh_from_field(field,offset,step):
 v,f,_,_=measure.marching_cubes(field,0,spacing=(step,step,step))
 mesh=trimesh.Trimesh(vertices=v+offset,faces=f,process=False)
 trimesh.repair.fix_normals(mesh)
 return mesh

def render_preview(mesh,path):
 try:
  import vtk
  points=vtk.vtkPoints();points.SetNumberOfPoints(len(mesh.vertices))
  for i,p in enumerate(mesh.vertices):points.SetPoint(i,float(p[0]),float(p[1]),float(p[2]))
  triangles=vtk.vtkCellArray()
  for f in mesh.faces:
   cell=vtk.vtkTriangle()
   for j in range(3):cell.GetPointIds().SetId(j,int(f[j]))
   triangles.InsertNextCell(cell)
  poly=vtk.vtkPolyData();poly.SetPoints(points);poly.SetPolys(triangles)
  normals=vtk.vtkPolyDataNormals();normals.SetInputData(poly);normals.SetSplitting(False);normals.SetFeatureAngle(55);normals.Update()
  mapper=vtk.vtkPolyDataMapper();mapper.SetInputConnection(normals.GetOutputPort())
  actor=vtk.vtkActor();actor.SetMapper(mapper);actor.GetProperty().SetColor(.30,.34,.30)
  actor.GetProperty().SetAmbient(.25);actor.GetProperty().SetDiffuse(.75)
  renderer=vtk.vtkRenderer();renderer.SetBackground(.09,.13,.11);renderer.AddActor(actor)
  bb=mesh.bounds;center=mesh.bounds.mean(axis=0);size=float(mesh.extents.max())
  camera=renderer.GetActiveCamera();camera.SetFocalPoint(*center)
  camera.SetPosition(*(center+np.array([size*1.15,size*.72,size*2.65])))
  camera.SetViewUp(0,1,0);camera.SetClippingRange(.01,size*20);camera.ParallelProjectionOn();camera.SetParallelScale(size*.75)
  light=vtk.vtkLight();light.SetPosition(*(center+np.array([-size*2,size*3,size*4])));light.SetIntensity(1.7);renderer.AddLight(light)
  win=vtk.vtkRenderWindow();win.SetOffScreenRendering(True);win.AddRenderer(renderer);win.SetSize(900,900)
  win.SetMultiSamples(4);win.Render()
  grab=vtk.vtkWindowToImageFilter();grab.SetInput(win);grab.Update()
  png=vtk.vtkPNGWriter();png.SetFileName(path);png.SetInputConnection(grab.GetOutputPort());png.Write()
  win.Finalize()
  if not os.path.isfile(path) or os.path.getsize(path)<1000:raise RuntimeError('Empty image')
  return True
 except Exception as exc:
  print('Preview render warning:',repr(exc))
  return False

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--mesh',required=True);ap.add_argument('--out',default='build/coil-pilot');ap.add_argument('--resolution',type=int,default=64);a=ap.parse_args()
 os.makedirs(a.out,exist_ok=True)
 coil=trimesh.load(a.mesh,force='mesh',process=False)
 if not(coil.is_watertight and coil.is_winding_consistent and coil.is_volume):
  raise SystemExit('STOP: approved mesh is not a consistent watertight volume; create and validate a DERIVED watertight working mesh before volumetric generation.')
 if a.resolution<40 or a.resolution>128:raise SystemExit('Pilot resolution must be 40..128')
 t0=time.time();bb=coil.bounds;center=bb.mean(0);span=coil.extents;length=float(span.max())
 pad=.22*length
 lo=bb[0]-pad;hi=bb[1]+pad
 step=float((hi-lo).max()/a.resolution)
 axes=[np.arange(lo[i],hi[i]+step*.51,step) for i in range(3)]
 shape=tuple(map(len,axes))
 P=np.stack(np.meshgrid(*axes,indexing='ij'),axis=-1).reshape(-1,3)
 print('SDF grid',shape,len(P),'step',step,flush=True)
 sC=sdf(coil,P).reshape(shape)
 if np.sum(sC<0)<20:raise SystemExit('FAIL: Coil signed distance has no interior; check normals and SDF sign.')
 # A fractured, broad-faced raw work block, NOT an inflated hull of Coil.
 # Rounded box SDF uses clearance beyond the entire approved mesh bounding box.
 size=span/2+.14*length
 q=np.abs(P-center)-size
 outer=np.linalg.norm(np.maximum(q,0),axis=1)+np.minimum(np.maximum.reduce(q,axis=1),0)
 raw=outer-.035*length
 # Low amplitude mineral irregularity; no sharp clipping planes crossing the target.
 perturb=.016*length*(np.sin(P[:,0]*8/length+1.1)*np.sin(P[:,1]*11/length)+.50*np.sin(P[:,2]*14/length+P[:,1]*4/length))
 sB=(raw+perturb).reshape(shape)
 if np.any(sB[sC<-step]>0):raise SystemExit('FAIL: raw stone clips approved Coil interior')
 # The work progresses through 3D volume: true cut surfaces and through-holes form.
 # A horizontal + side-biased order creates credible regional differences without a surface peel.
 X,Y,Z=np.meshgrid(*axes,indexing='ij')
 progress=np.clip(.46+.18*(Y-center[1])/length-.09*(X-center[0])/length,0.10,.80)
 dmax=float(np.max((sC-sB)[sB<0]))+step*3
 d=(1-progress)*dmax
 mid=np.maximum(sB,sC-d)
 masks=[sB<0,mid<0,sC<0]
 if np.any(masks[1]&~masks[0]) or np.any(masks[2]&~masks[1]):raise SystemExit('FAIL: voxel material regrowth')
 entries=[]
 for name,field in [('raw',sB),('half',mid)]:
  solid=mesh_from_field(field,lo,step)
  fp=os.path.join(a.out,name+'.ply');solid.export(fp)
  picture=os.path.join(a.out,name+'.png')
  preview=render_preview(solid,picture)
  entries.append({'stage':name,'mesh':name+'.ply','image':name+'.png' if preview else None,'vertices':len(solid.vertices),'faces':len(solid.faces),'watertight':bool(solid.is_watertight),'components':len(solid.split(only_watertight=False)),'voxels':int((field<0).sum())})
  print(name,entries[-1],flush=True)
 # Use approved source triangles for FINAL. No voxelized substitute.
 final=os.path.join(a.out,'coil-approved.obj')
 coil.export(final)
 preview=render_preview(coil,os.path.join(a.out,'final.png'))
 entries.append({'stage':'final','mesh':'coil-approved.obj','image':'final.png' if preview else None,'vertices':len(coil.vertices),'faces':len(coil.faces),'watertight':True,'components':len(coil.split(only_watertight=False)),'voxels':int((sC<0).sum())})
 results={'method':'volumetric signed-distance proof, not production carve choreography','source':a.mesh,'resolution':a.resolution,'step':step,'elapsed_seconds':round(time.time()-t0,2),'stages':entries,'strictly_decreasing':entries[0]['voxels']>entries[1]['voxels']>entries[2]['voxels']}
 with open(os.path.join(a.out,'pilot.json'),'w') as f:json.dump(results,f,indent=2)
 if not results['strictly_decreasing']:raise SystemExit('FAIL: no progressive removal')
 print(json.dumps(results,indent=2))
if __name__=='__main__':main()
