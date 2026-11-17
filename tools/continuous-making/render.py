"""Offline art-direction study: one stone, real scanned tools, contact shadows.
No browser WebGL, CSS tool overlays, source model edits or catalogue writes.
"""
import bpy,sys,pathlib,json,math,argparse
import numpy as np
from mathutils import Vector,Matrix
p=argparse.ArgumentParser();p.add_argument('--root',required=True);a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);root=pathlib.Path(a.root);meta=json.loads((root/'scene.json').read_text());out=root/'review';out.mkdir(exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=16;scene.cycles.use_denoising=True;scene.cycles.max_bounces=4
scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False
scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.055,.067,.053,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.5
scene.view_settings.view_transform='Standard';scene.view_settings.look='Medium High Contrast' if 'Medium High Contrast' in [i.identifier for i in scene.view_settings.bl_rna.properties['look'].enum_items] else 'None';scene.view_settings.exposure=0

def material(name,color,roughness=.7,metal=0):
 m=bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=roughness;p.inputs['Metallic'].default_value=metal;return m
stone=material('Freshly worked springstone',(.15,.17,.145),.9);nodes=stone.node_tree.nodes;links=stone.node_tree.links;noise=nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=105;noise.inputs['Detail'].default_value=4;bump=nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.35;bump.inputs['Distance'].default_value=.035;links.new(noise.outputs['Fac'],bump.inputs['Height']);links.new(bump.outputs['Normal'],nodes.get('Principled BSDF').inputs['Normal'])
metal=material('Worn forged steel',(.19,.205,.21),.38,.87);n=metal.node_tree.nodes;noise2=n.new('ShaderNodeTexNoise');noise2.inputs['Scale'].default_value=150;b=n.new('ShaderNodeBump');b.inputs['Strength'].default_value=.24;b.inputs['Distance'].default_value=.003;metal.node_tree.links.new(noise2.outputs['Fac'],b.inputs['Height']);metal.node_tree.links.new(b.outputs['Normal'],n.get('Principled BSDF').inputs['Normal'])
fabric=material('Unbleached cotton',(.48,.42,.31),.96);abrasive=material('Wet abrasive paper',(.16,.12,.08),.94)
floor=material('Workshop ground',(.023,.033,.025),.9);bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.035));ground=bpy.context.object;ground.data.materials.append(floor)

def area(name,location,power,size,color,target=(0,0,1.5)):
 data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size;data.color=color;o=bpy.data.objects.new(name,data);scene.collection.objects.link(o);o.location=location;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
area('Large soft workshop window',(-4,-6,7),950,5,(1,.94,.85));area('Quiet fill',(4,-2,5),500,4,(.84,.9,1));area('Stone edge',(1,3,6),1000,3,(1,.96,.89))
camdata=bpy.data.cameras.new('Story camera');cam=bpy.data.objects.new('Story camera',camdata);scene.collection.objects.link(cam);scene.camera=cam;camdata.lens_unit='FOV';camdata.clip_end=300
# Import the exact approved source, with its existing vertex colours and materials.
bpy.ops.import_scene.gltf(filepath=str(root/'approved-decoded.glb'));approved=[o for o in bpy.context.selected_objects if o.type=='MESH']
vs=[o.matrix_world@Vector(v) for o in approved for v in o.bound_box];lo=Vector(tuple(min(v[i] for v in vs) for i in range(3)));hi=Vector(tuple(max(v[i] for v in vs) for i in range(3)));dims=hi-lo;scale=3.05/max(dims.z,dims.x*.95,dims.y*.95);center=Vector(((lo.x+hi.x)/2,(lo.y+hi.y)/2,lo.z));transform=Matrix.Rotation(.14,4,'Z')@Matrix.Scale(scale,4)@Matrix.Translation(-center)
for obj in approved:obj.matrix_world=transform@obj.matrix_world;obj.hide_render=True
saved=[]
for obj in approved:
 for m in obj.data.materials:
  if m and m.use_nodes:
   for n in m.node_tree.nodes:
    if n.type=='BSDF_PRINCIPLED':saved.append((n,n.inputs['Roughness'].default_value,n.inputs['Metallic'].default_value))

def scan(ident):
 path=pathlib.Path(meta['assets'][ident]['file']).resolve();before=set(bpy.data.objects)
 with bpy.data.libraries.load(str(path),link=False) as (source,dest):dest.objects=source.objects
 items=[o for o in dest.objects if o and o.type=='MESH']
 for o in items:scene.collection.objects.link(o)
 vertices=[o.matrix_world@Vector(v) for o in items for v in o.bound_box];lo=Vector(tuple(min(v[i] for v in vertices) for i in range(3)));hi=Vector(tuple(max(v[i] for v in vertices) for i in range(3)));ext=hi-lo;axis=max(range(3),key=lambda i:ext[i]);rot=Vector(tuple(1 if i==axis else 0 for i in range(3))).rotation_difference(Vector((0,0,1))).to_matrix().to_4x4();rvs=[rot@v for v in vertices];low=Vector(tuple(min(v[i] for v in rvs) for i in range(3)));high=Vector(tuple(max(v[i] for v in rvs) for i in range(3)));anchor=Vector(((low.x+high.x)/2,(low.y+high.y)/2,high.z-.08*(high.z-low.z)));norm=Matrix.Scale(1/(high.z-low.z),4)@Matrix.Translation(-anchor)@rot
 parent=bpy.data.objects.new(ident,None);scene.collection.objects.link(parent)
 for o in items:o.matrix_world=norm@o.matrix_world;o.parent=parent;o.hide_render=True
 print('SCANNED TOOL',ident,'bounds',tuple(ext),'axis',axis,flush=True);return parent,items
hammer,hparts=scan('cross_pein_hammer');torch,tparts=scan('propane_torch')
# A tapered steel stone chisel, built at physical contact rather than laid over a frame.
bpy.ops.mesh.primitive_cone_add(vertices=8,radius1=.008,radius2=.039,depth=.65);chisel=bpy.context.object;chisel.data.materials.append(metal);chisel.modifiers.new('Worn edges','BEVEL').width=.004;chisel.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
# Folded, woven abrasive/cloth geometry; both ends curl away from the work.
def cloth():
 verts=[];faces=[]
 for j in range(17):
  for i in range(9):
   u=(i/8-.5)*.40;v=(j/16-.5)*.64;verts.append((u,-.035-.04*math.cos(v*8)+.022*math.sin(u*30+v*8),v))
 for j in range(16):
  for i in range(8):k=j*9+i;faces.append((k,k+1,k+10,k+9))
 mesh=bpy.data.meshes.new('Soft folded cloth');mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new('Abrasive and finishing cloth',mesh);scene.collection.objects.link(o);o.data.materials.append(fabric);sub=o.modifiers.new('Fabric folds','SUBSURF');sub.levels=2;sub.render_levels=2;solid=o.modifiers.new('Cloth thickness','SOLIDIFY');solid.thickness=.006;return o
rag=cloth()
flame_mat=material('Gas flame',(.035,.13,.45),.2);bs=flame_mat.node_tree.nodes.get('Principled BSDF');bs.inputs['Emission Color'].default_value=(.035,.17,1,1);bs.inputs['Emission Strength'].default_value=3
bpy.ops.mesh.primitive_cone_add(vertices=40,radius1=.045,radius2=.006,depth=.32);flame=bpy.context.object;flame.data.materials.append(flame_mat)
lightdata=bpy.data.lights.new('Flame reflection','POINT');lightdata.energy=0;lightdata.color=(1,.46,.15);heatlight=bpy.data.objects.new('Flame reflection',lightdata);scene.collection.objects.link(heatlight)
obj=None
for entry in meta['entries']:
 index=entry['index'];phase=entry['phase'];point=Vector(entry['contact']);working=phase in ['mark','carve'];finished=phase in ['sand','heat','wax','work']
 if obj:bpy.data.objects.remove(obj,do_unlink=True)
 data=np.load(root/('mesh_%04d.npz'%index));mesh=bpy.data.meshes.new('Carved state');mesh.from_pydata(data['vertices'].tolist(),[],data['faces'].tolist());mesh.update();obj=bpy.data.objects.new('Source-derived stone',mesh);scene.collection.objects.link(obj);obj.data.materials.append(stone);obj.hide_render=finished
 for poly in obj.data.polygons:poly.use_smooth=True
 for o in approved:o.hide_render=not finished
 polish=max(0,min(1,(index-400)/63));sand=max(0,min(1,(index-248)/79))
 for node,rough,met in saved:node.inputs['Roughness'].default_value=rough if phase=='work' else .90-.30*sand if phase in ['sand','heat'] else .60*(1-polish)+rough*polish;node.inputs['Metallic'].default_value=met
 # Chisel and scanned hammer share the stone's perspective, shadows and lighting.
 direction=Vector((-.36,-.65,.72)).normalized();chisel.hide_render=not working;chisel.location=point+direction*.325;chisel.rotation_euler=direction.to_track_quat('Z','Y').to_euler();butt=point+direction*.65
 strike=(.5-.5*math.cos(index*math.pi/8))**1.6;hammer.location=butt+Vector((.08,-.07,.06))*(1-strike)+Vector((.32,-.12,.38))*strike;hammer.rotation_euler=Vector((-.7,.1,-.7)).to_track_quat('Z','Y').to_euler();hammer.rotation_euler.y+=strike*.55
 for o in hparts:o.hide_render=not working
 for o in tparts:o.hide_render=phase!='heat'
 torch.location=point+Vector((.40,-.12,.20));torch.rotation_euler=(0,math.pi/2,-.6)
 flame.hide_render=phase!='heat';flame.location=point+Vector((.16,-.04,.10));flame.rotation_euler=Vector((-.4,.08,-.2)).to_track_quat('Z','Y').to_euler();heatlight.location=point+Vector((0,-.20,.1));heatlight.data.energy=8 if phase=='heat' else 0
 rag.hide_render=phase not in ['sand','wax'];rag.location=point+Vector((.08*math.sin(index*.23),-.045,.08*math.cos(index*.19)));rag.rotation_euler=(0,.1,math.sin(index*.15)*.16);rag.data.materials[0]=abrasive if phase=='sand' else fabric
 for profile,w,h,position,target,fov,shift in [('desktop',1280,720,(1.38,-8.55,3.12),(.28,0,1.68),33,-.15),('mobile',720,1560,(.10,-12.5,3.12),(0,0,1.42),36,0)]:
  scene.render.resolution_x=w;scene.render.resolution_y=h;scene.render.resolution_percentage=75;cam.location=position;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();camdata.angle=math.radians(fov);camdata.shift_x=shift;camdata.sensor_fit='VERTICAL' if profile=='mobile' else 'HORIZONTAL';scene.render.filepath=str(out/('%s-%04d-%s.png'%(profile,index,phase)));bpy.ops.render.render(write_still=True)
 print('RENDERED',index,phase,flush=True)
