#!/usr/bin/env python3
"""Generate versioned, genuinely solid Coil carving frames. Never edits the original GLB.
Input is a decoded OBJ from the approved Coil GLB, not an invented sculpture.
"""
import argparse,json,os,hashlib
import numpy as np,trimesh
from scipy import ndimage
from skimage import measure
from PIL import Image,ImageDraw,ImageFilter

def smooth(x):
 x=np.clip(x,0,1)
 return x*x*(3-2*x)

def noise(shape,rng):
 out=np.zeros(shape,np.float32);norm=0
 for cells,amp in [(7,1),(14,.52),(35,.22)]:
  grid=rng.uniform(-1,1,(cells,cells,cells)).astype(np.float32)
  layer=ndimage.zoom(grid,[s/cells for s in shape],order=1,mode='nearest',grid_mode=True)
  out+=amp*layer[tuple(slice(0,s) for s in shape)]
  norm+=amp
 return out/norm

def prepare(source,res):
 import vtk
 from vtk.util.numpy_support import vtk_to_numpy
 coil=trimesh.load(source,force='mesh',process=False)
 coil.merge_vertices(digits_vertex=5)
 if not(coil.is_volume and coil.is_watertight and coil.is_winding_consistent):
  raise RuntimeError('Derived Coil does not form a closed volume')
 length=float(coil.extents.max());step=length/res
 lo=coil.bounds[0]-length*.23
 hi=coil.bounds[1]+length*.23
 shape=tuple(np.ceil((hi-lo)/step).astype(int)+1)
 axes=[lo[i]+np.arange(shape[i])*step for i in range(3)]
 X,Y,Z=np.meshgrid(*axes,indexing='ij')
 pts=vtk.vtkPoints();pts.SetDataTypeToDouble();pts.SetNumberOfPoints(len(coil.vertices))
 for i,p in enumerate(coil.vertices):pts.SetPoint(i,*map(float,p))
 triangles=vtk.vtkCellArray()
 for f in coil.faces:
  tri=vtk.vtkTriangle()
  for j in range(3):tri.GetPointIds().SetId(j,int(f[j]))
  triangles.InsertNextCell(tri)
 poly=vtk.vtkPolyData();poly.SetPoints(pts);poly.SetPolys(triangles)
 img=vtk.vtkImageData();img.SetOrigin(*map(float,lo));img.SetSpacing(step,step,step)
 img.SetDimensions(*map(int,shape));img.AllocateScalars(vtk.VTK_UNSIGNED_CHAR,1)
 vtk_to_numpy(img.GetPointData().GetScalars())[:]=1
 stencil=vtk.vtkPolyDataToImageStencil();stencil.SetInputData(poly)
 stencil.SetOutputOrigin(*map(float,lo));stencil.SetOutputSpacing(step,step,step)
 stencil.SetOutputWholeExtent(img.GetExtent());stencil.Update()
 cut=vtk.vtkImageStencil();cut.SetInputData(img);cut.SetStencilConnection(stencil.GetOutputPort())
 cut.SetBackgroundValue(0);cut.Update()
 mask=vtk_to_numpy(cut.GetOutput().GetPointData().GetScalars()).reshape(shape[::-1]).transpose(2,1,0).astype(bool)
 if mask.sum()<1000:raise RuntimeError('Insufficient voxels in Coil volume')
 target=(ndimage.distance_transform_edt(~mask)-ndimage.distance_transform_edt(mask))*step
 # Multiple actual planar fracture limits; no inflated convex hull, peeled wrapper,
 # discontinuous geometry, transparency or separately revealed sculpture.
 rng=np.random.default_rng(48);center=coil.bounds.mean(axis=0);v=coil.vertices
 planes=[]
 for axis in range(3):
  for sign in (-1,1):
   direction=np.eye(3)[axis]*sign
   planes.append((direction,np.max((v-center)@direction)+length*(.10 if axis<2 else .14)))
 for _ in range(23):
  direction=rng.normal(size=3);direction/=np.linalg.norm(direction)
  planes.append((direction,np.max((v-center)@direction)+length*rng.uniform(.095,.18)))
 raw=np.full(shape,-2*length,np.float32)
 for direction,d in planes:
  raw=np.maximum(raw,direction[0]*(X-center[0])+direction[1]*(Y-center[1])+direction[2]*(Z-center[2])-d)
 raw=np.maximum(raw,coil.bounds[0,1]-length*.024-Y)
 mineral=noise(shape,rng);raw+=length*.012*mineral
 if np.any(raw[mask]>step):raise RuntimeError('Source stone clips the approved sculpture')
 extra=(raw<0)&(~mask)
 x=(X-center[0])/length;y=(Y-center[1])/length
 central=np.exp(-((x-.12)/.28)**2-((y+.01)/.29)**2)
 priority=np.clip(1+.20*y-.24*central+.10*x+mineral*.14,.50,1.55)
 levels=np.sort((target/priority)[extra].astype(np.float32))
 if len(levels)<1000:raise RuntimeError('No meaningful extra stone to carve')
 return coil,lo,step,target,raw,priority,levels

def field(t,data):
 _,_,_,target,raw,priority,levels=data
 if t<=0:return raw
 if t>=1:return target
 q=float(np.clip(1-smooth(t),0,1))
 d=levels[max(0,min(len(levels)-1,int((len(levels)-1)*q)))]
 return np.maximum(raw,target-d*priority)

def mesh_for(field,data):
 _,lo,step,*_=data
 verts,faces,_,_=measure.marching_cubes(field,0,spacing=(step,step,step))
 m=trimesh.Trimesh(vertices=verts+lo,faces=faces,process=False)
 m.fix_normals()
 return m

def render(mesh,data,path,w,h,kind,phone,marking,finish):
 """Render the SAME physical coordinate space, camera and stature as the approved
 Coil GLB viewer, instead of a VTK parallel projection of an unrelated pose.
 Surface is deliberately unpolished until the final approved render takes over.
 """
 import vtk
 from vtk.util.numpy_support import vtk_to_numpy,numpy_to_vtk,numpy_to_vtkIdTypeArray
 coil,lo,step,target,raw,priority,levels=data
 bounds=coil.bounds
 dimensions=bounds[1]-bounds[0]
 factor=3.05/max(dimensions[1],dimensions[0]*.95,dimensions[2]*.95)
 vertices=np.asarray(mesh.vertices,dtype=np.float64).copy()
 vertices-=[(bounds[0,0]+bounds[1,0])*.5,bounds[0,1],(bounds[0,2]+bounds[1,2])*.5]
 vertices*=factor
 # Match approved-coil-reveal.js root.rotation.y=.14 exactly.
 theta=.14;c=np.cos(theta);s=np.sin(theta)
 xp=vertices[:,0]*c+vertices[:,2]*s
 zp=-vertices[:,0]*s+vertices[:,2]*c
 vertices[:,0]=xp;vertices[:,2]=zp
 pts=vtk.vtkPoints();pts.SetData(numpy_to_vtk(np.ascontiguousarray(vertices),deep=True))
 tris=vtk.vtkCellArray()
 ids=np.column_stack((np.full(len(mesh.faces),3,dtype=np.int64),np.asarray(mesh.faces,dtype=np.int64))).ravel()
 tris.SetCells(len(mesh.faces),numpy_to_vtkIdTypeArray(ids,deep=True))
 poly=vtk.vtkPolyData();poly.SetPoints(pts);poly.SetPolys(tris)
 # Subtle 3D mineral colour variation. This remains anchored to the stone
 # rather than flickering in screen-space between carving frames.
 if kind=='raw':base=np.array([.295,.301,.264]);r=.93
 elif kind=='rough':base=np.array([.225,.254,.214]);r=.87
 elif kind=='refined':base=np.array([.172,.208,.174]);r=.72
 else:
  f=float(smooth(finish))
  base=np.array([.171-.094*f,.203-.100*f,.171-.086*f])
  r=.68-.36*f
 q=vertices
 grain=(.045*np.sin(q[:,0]*51.3+q[:,2]*16.8)*np.sin(q[:,1]*43.5)
       +.026*np.cos(q[:,2]*89.1-q[:,1]*22.4)
       +.015*np.sin(q[:,0]*136.1+q[:,1]*63.7+q[:,2]*71.1))
 grain*=1-.30*float(smooth(finish))
 pigment=np.clip(base[None,:]*(1+grain[:,None]),0,1)
 rgba=np.ascontiguousarray(np.round(pigment*255).astype(np.uint8))
 scalars=numpy_to_vtk(rgba,deep=True,array_type=vtk.VTK_UNSIGNED_CHAR)
 scalars.SetNumberOfComponents(3);scalars.SetName('mineral-colour')
 poly.GetPointData().SetScalars(scalars)
 normals=vtk.vtkPolyDataNormals();normals.SetInputData(poly)
 normals.SetSplitting(kind in ('raw','rough'))
 normals.SetFeatureAngle(46 if kind in ('raw','rough') else 84)
 normals.SetConsistency(True);normals.Update()
 mapper=vtk.vtkPolyDataMapper();mapper.SetInputConnection(normals.GetOutputPort())
 mapper.ScalarVisibilityOn();mapper.SetColorModeToDirectScalars()
 mapper.SetScalarModeToUsePointData()
 actor=vtk.vtkActor();actor.SetMapper(mapper)
 prop=actor.GetProperty();prop.SetInterpolationToPBR()
 prop.SetMetallic(0);prop.SetColor(1,1,1);prop.SetRoughness(r)
 prop.SetSpecular(.18 if kind in ('raw','rough') else .31)
 ren=vtk.vtkRenderer();ren.SetBackground(23/255,31/255,25/255)
 ren.SetBackgroundAlpha(0);ren.AddActor(actor)
 # Identical camera pose and perspective to the approved Three.js model.
 cam=ren.GetActiveCamera();cam.ParallelProjectionOff()
 if phone:
  cam.SetPosition(.10,3.12,12.5);cam.SetFocalPoint(0,1.42,0)
  cam.SetViewAngle(36);cam.SetWindowCenter(0,0)
 else:
  cam.SetPosition(1.38,3.12,8.55);cam.SetFocalPoint(.28,1.68,0)
  cam.SetViewAngle(33);cam.SetWindowCenter(-.30,0)
 cam.SetViewUp(0,1,0);cam.SetClippingRange(.1,100)
 # Diffuse museum-style illumination, matching the same key, fill and rim
 # locations as the approved Three.js presentation.
 hemi=vtk.vtkLight();hemi.SetLightTypeToSceneLight()
 hemi.SetPosition(0,8,3);hemi.SetFocalPoint(0,1.5,0)
 hemi.SetIntensity(.8);hemi.SetColor(.90,.94,.87);ren.AddLight(hemi)
 for position,intensity,color in [
  ((-4,7,6),2.6,(1.0,.93,.84)),
  ((4,5,2),1.25,(.86,.91,1.0)),
  ((1,6,-2),1.6,(1.0,.98,.94))
 ]:
  light=vtk.vtkLight();light.SetLightTypeToSceneLight()
  light.SetPosition(*position);light.SetFocalPoint(0,1.5,0)
  light.SetIntensity(intensity);light.SetColor(*color);ren.AddLight(light)
 window=vtk.vtkRenderWindow();window.SetSize(w,h)
 window.SetAlphaBitPlanes(1);window.SetMultiSamples(4)
 window.SetOffScreenRendering(True);window.AddRenderer(ren);window.Render()
 capture=vtk.vtkWindowToImageFilter();capture.SetInput(window)
 capture.SetInputBufferTypeToRGBA();capture.ReadFrontBufferOff();capture.Update()
 pixels=vtk_to_numpy(capture.GetOutput().GetPointData().GetScalars()).reshape((h,w,4))[::-1].copy()
 if np.min(pixels[:,:,3])==255:
  rgb=pixels[:,:,:3].astype(np.int16)
  diff=np.max(np.abs(rgb-np.array([23,31,25])),axis=2)
  pixels[:,:,3]=np.clip(diff*16,0,255).astype('uint8')
 subject=Image.fromarray(pixels,'RGBA')
 # Do not bake a different background into each frame: the chapter background
 # uses the same flat studio colour and never shows a vertical frame seam.
 canvas=Image.new('RGBA',(w,h),(23,31,25,255))
 yy,xx=np.mgrid[0:h,0:w]
 cx=w*(.50 if phone else .65);sy=int(h*(.83 if phone else .88))
 rx=int(w*(.18 if phone else .13));ry=max(4,int(h*.012))
 shadow=Image.new('RGBA',(w,h));draw=ImageDraw.Draw(shadow)
 draw.ellipse((int(cx)-rx,sy-ry,int(cx)+rx,sy+ry),fill=(0,0,0,53))
 canvas=Image.alpha_composite(canvas,shadow.filter(ImageFilter.GaussianBlur(max(3,w*.015))))
 canvas=Image.alpha_composite(canvas,subject)
 if marking>0:
  # Keep any marking restrained and grounded in the projected original shape.
  # The new atelier carving scene itself begins after these preparation marks.
  marking=0
 canvas.convert('RGB').save(path,format='WEBP',quality=88,method=5)
 window.Finalize()

def main():
 p=argparse.ArgumentParser()
 p.add_argument('--mesh',required=True);p.add_argument('--out',default='build/making-v6')
 p.add_argument('--res',type=int,default=144);p.add_argument('--frames',type=int,default=144)
 a=p.parse_args();os.makedirs(a.out,exist_ok=True)
 if a.res<96 or a.res>220 or a.frames<48:raise ValueError('Invalid build settings')
 data=prepare(a.mesh,a.res);original=data[0];rawfield=data[4]
 phases=[];previous=float('inf');reuse={}
 for index,progress in enumerate(np.linspace(.305,1,a.frames)):
  p=float(progress)
  t=0. if p<.565 else 1. if p>=.765 else float(smooth((p-.565)/.20))
  scalar=field(t,data);volume=int((scalar<0).sum())
  if volume>previous:raise RuntimeError('Material regrowth at frame '+str(index))
  previous=volume
  mesh=original if t==1 else mesh_for(scalar,data)
  kind='raw' if p<.565 else 'rough' if p<.765 else 'refined' if p<.90 else 'polished' if p<.96 else 'gallery'
  marking=float(smooth((p-.445)/.09)) if .445<=p<.565 else 0.
  # Reuse byte-identical poses instead of invoking the offline renderer on
  # dozens of unchanged frames. Marking, carving and wax frames remain unique.
  still='raw' if kind=='raw' and marking==0 else 'refined' if kind=='refined' else 'gallery' if kind=='gallery' else None
  for profile,w,h in [('desktop',1280,720),('mobile',720,1560)]:
   folder=os.path.join(a.out,profile);os.makedirs(folder,exist_ok=True)
   output=os.path.join(folder,'frame_%03d.webp'%index)
   key=(profile,still)
   if still and key in reuse:
    import shutil
    shutil.copyfile(reuse[key],output)
   else:
    render(mesh,data,output,w,h,kind,profile=='mobile',marking,smooth((p-.90)/.06))
    if still:reuse[key]=output
  phases.append({'index':index,'progress':round(p,5),'remaining_voxels':volume})
  if index%12==0:print('Rendered',index,'of',a.frames,'volume',volume,flush=True)
 if phases[-1]['remaining_voxels']>=phases[0]['remaining_voxels']:
  raise RuntimeError('No stone was removed')
 manifest={'version':6,'source_sha256':hashlib.sha256(open(a.mesh,'rb').read()).hexdigest(),
  'frames':a.frames,'first':.305,'last':1,'registered_to':'approved-coil-v1','camera_revision':2,'profiles':{'desktop':{'width':1280,'height':720},'mobile':{'width':720,'height':1560}},
  'entries':phases}
 with open(os.path.join(a.out,'manifest.json'),'w') as file:json.dump(manifest,file,indent=2)
 print('SUCCESS: all carving states contain Coil, volume decreases monotonically; final exact Coil mesh rendered.')
if __name__=='__main__':main()
