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
 import vtk
 from vtk.util.numpy_support import vtk_to_numpy
 coil,lo,step,target,raw,priority,levels=data
 pts=vtk.vtkPoints();pts.SetDataTypeToDouble();pts.SetNumberOfPoints(len(mesh.vertices))
 for i,p in enumerate(mesh.vertices):pts.SetPoint(i,*map(float,p))
 tris=vtk.vtkCellArray()
 for f in mesh.faces:
  tri=vtk.vtkTriangle()
  for j in range(3):tri.GetPointIds().SetId(j,int(f[j]))
  tris.InsertNextCell(tri)
 poly=vtk.vtkPolyData();poly.SetPoints(pts);poly.SetPolys(tris)
 normals=vtk.vtkPolyDataNormals();normals.SetInputData(poly);normals.SetSplitting(True)
 normals.SetFeatureAngle(84 if kind in ('polished','gallery') else 50);normals.SetConsistency(True);normals.Update()
 mapper=vtk.vtkPolyDataMapper();mapper.SetInputConnection(normals.GetOutputPort());mapper.ScalarVisibilityOff()
 actor=vtk.vtkActor();actor.SetMapper(mapper)
 prop=actor.GetProperty();prop.SetInterpolationToPBR();prop.SetMetallic(0)
 if kind=='raw':prop.SetColor(.19,.184,.16);prop.SetRoughness(.92)
 elif kind=='rough':prop.SetColor(.085,.10,.088);prop.SetRoughness(.88)
 elif kind=='refined':prop.SetColor(.09,.10,.088);prop.SetRoughness(.62)
 else:
  f=float(smooth(finish));prop.SetColor(.09-.03*f,.10-.025*f,.088-.022*f);prop.SetRoughness(.62-.34*f)
 ren=vtk.vtkRenderer();ren.SetBackground(.075,.095,.080);ren.SetBackgroundAlpha(0);ren.AddActor(actor)
 size=float(coil.extents.max());center=coil.bounds.mean(axis=0)
 if kind=='gallery':
  slab=vtk.vtkCubeSource();slab.SetXLength(size*1.04);slab.SetYLength(size*.105)
  slab.SetZLength(size*.58);slab.SetCenter(center[0],coil.bounds[0,1]-.075*size,center[2])
  slabmap=vtk.vtkPolyDataMapper();slabmap.SetInputConnection(slab.GetOutputPort())
  base=vtk.vtkActor();base.SetMapper(slabmap);base.GetProperty().SetColor(.26,.24,.21)
  ren.AddActor(base)
 for position,intensity,color in [((-3,4,6),1.8,(1,.92,.79)),((3,2,1),1.1,(.83,.90,1)),((1,5,-3),.65,(1,1,.95))]:
  light=vtk.vtkLight();light.SetLightTypeToSceneLight()
  light.SetPosition(*(center+size*np.asarray(position)));light.SetFocalPoint(*center)
  light.SetIntensity(intensity);light.SetColor(*color);ren.AddLight(light)
 cam=ren.GetActiveCamera();cam.ParallelProjectionOn();cam.SetFocalPoint(*center)
 cam.SetPosition(*(center+np.asarray([size*.55,size*.30,size*3.45])));cam.SetViewUp(0,1,0)
 cam.SetParallelScale(size*(1.58 if phone else .82));cam.SetWindowCenter(0 if phone else -.31,-.06 if phone else 0)
 window=vtk.vtkRenderWindow();window.SetSize(w,h);window.SetAlphaBitPlanes(1)
 window.SetMultiSamples(4);window.SetOffScreenRendering(True);window.AddRenderer(ren)
 window.Render()
 capture=vtk.vtkWindowToImageFilter();capture.SetInput(window);capture.SetInputBufferTypeToRGBA()
 capture.ReadFrontBufferOff();capture.Update()
 pixels=vtk_to_numpy(capture.GetOutput().GetPointData().GetScalars()).reshape((h,w,4))[::-1].copy()
 rendered=Image.fromarray(pixels,'RGBA')
 if np.min(pixels[:,:,3])==255:
  rgb=pixels[:,:,:3].astype(np.int16);diff=np.max(np.abs(rgb-np.array([19,25,21])),axis=2)
  pixels[:,:,3]=np.clip(diff*13,0,255).astype('uint8');rendered=Image.fromarray(pixels,'RGBA')
 yy,xx=np.mgrid[0:h,0:w];cx=w*(.5 if phone else .66);cy=h*(.42 if phone else .45)
 glow=np.exp(-((xx-cx)/(w*.46))**2-((yy-cy)/(h*.47))**2)
 fall=np.clip(.18+glow*.7,0,1)
 backdrop=np.empty((h,w,3),np.uint8)
 for k,(dark,light) in enumerate(zip((16,22,19),(28,34,29))):backdrop[:,:,k]=(dark+fall*(light-dark)).astype('uint8')
 canvas=Image.fromarray(backdrop,'RGB').convert('RGBA')
 shadow=Image.new('RGBA',(w,h));draw=ImageDraw.Draw(shadow)
 sx=int(cx);sy=int(h*(.78 if phone else .84));rx=int(w*(.30 if phone else .18));ry=int(h*.029)
 draw.ellipse((sx-rx,sy-ry,sx+rx,sy+ry),fill=(0,0,0,70))
 canvas=Image.alpha_composite(canvas,shadow.filter(ImageFilter.GaussianBlur(w*.026)))
 canvas=Image.alpha_composite(canvas,rendered)
 if marking>0:
  # A physically located outline traced on the actual front face, via the
  # same 3D camera, following Coil's real projected geometry.
  front=np.where(raw<0,np.arange(raw.shape[2])[None,None,:],-1).max(axis=2)
  traces=measure.find_contours((target<0).any(axis=2).astype('float32'),.5)
  painter=ImageDraw.Draw(canvas,'RGBA');budget=int(sum(len(c) for c in traces)*marking)
  for curve in sorted(traces,key=len,reverse=True):
   if budget<=0:break
   take=min(budget,len(curve));budget-=take;points=[]
   for spot in curve[:take:2]:
    ix=int(np.clip(round(spot[0]),0,front.shape[0]-1))
    iy=int(np.clip(round(spot[1]),0,front.shape[1]-1));iz=int(front[ix,iy])
    if iz<0:continue
    world=(lo[0]+spot[0]*step,lo[1]+spot[1]*step,lo[2]+(iz+.25)*step)
    ren.SetWorldPoint(*world,1);ren.WorldToDisplay();pos=ren.GetDisplayPoint()
    points.append((int(pos[0]),int(h-1-pos[1])))
   if len(points)>2:painter.line(points,fill=(226,218,190,188),width=max(1,w//580),joint='curve')
 canvas.convert('RGB').save(path,format='WEBP',quality=87,method=5)
 window.Finalize()

def main():
 p=argparse.ArgumentParser()
 p.add_argument('--mesh',required=True);p.add_argument('--out',default='build/making-v6')
 p.add_argument('--res',type=int,default=144);p.add_argument('--frames',type=int,default=144)
 a=p.parse_args();os.makedirs(a.out,exist_ok=True)
 if a.res<96 or a.res>220 or a.frames<48:raise ValueError('Invalid build settings')
 data=prepare(a.mesh,a.res);original=data[0];rawfield=data[4]
 phases=[];previous=float('inf')
 for index,progress in enumerate(np.linspace(.305,1,a.frames)):
  p=float(progress)
  t=0. if p<.565 else 1. if p>=.765 else float(smooth((p-.565)/.20))
  scalar=field(t,data);volume=int((scalar<0).sum())
  if volume>previous:raise RuntimeError('Material regrowth at frame '+str(index))
  previous=volume
  mesh=original if t==1 else mesh_for(scalar,data)
  kind='raw' if p<.565 else 'rough' if p<.765 else 'refined' if p<.90 else 'polished' if p<.96 else 'gallery'
  marking=float(smooth((p-.445)/.09)) if .445<=p<.565 else 0.
  for profile,w,h in [('desktop',1280,720),('mobile',720,1560)]:
   folder=os.path.join(a.out,profile);os.makedirs(folder,exist_ok=True)
   render(mesh,data,os.path.join(folder,'frame_%03d.webp'%index),w,h,kind,profile=='mobile',marking,smooth((p-.90)/.06))
  phases.append({'index':index,'progress':round(p,5),'remaining_voxels':volume})
  if index%12==0:print('Rendered',index,'of',a.frames,'volume',volume,flush=True)
 if phases[-1]['remaining_voxels']>=phases[0]['remaining_voxels']:
  raise RuntimeError('No stone was removed')
 manifest={'version':6,'source_sha256':hashlib.sha256(open(a.mesh,'rb').read()).hexdigest(),
  'frames':a.frames,'first':.305,'last':1,'profiles':{'desktop':{'width':1280,'height':720},'mobile':{'width':720,'height':1560}},
  'entries':phases}
 with open(os.path.join(a.out,'manifest.json'),'w') as file:json.dump(manifest,file,indent=2)
 print('SUCCESS: all carving states contain Coil, volume decreases monotonically; final exact Coil mesh rendered.')
if __name__=='__main__':main()
