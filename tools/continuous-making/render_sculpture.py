"""Offline art-direction study: one stone, uninterrupted transformation, contact shadows.
No browser WebGL, CSS tool overlays, source model edits or catalogue writes.
"""
import bpy,sys,pathlib,json,math,argparse,shutil
import numpy as np
from mathutils import Vector,Matrix,Quaternion
p=argparse.ArgumentParser();p.add_argument('--root',required=True);p.add_argument('--profile',default='both',choices=['desktop','mobile','both']);p.add_argument('--full',action='store_true');a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);root=pathlib.Path(a.root);meta=json.loads((root/'scene.json').read_text());out=root/'review';out.mkdir(exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=16;scene.cycles.use_denoising=True;scene.cycles.seed=6;scene.cycles.max_bounces=4
scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False
scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.055,.067,.053,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.5
scene.view_settings.view_transform='Standard';scene.view_settings.look='Medium High Contrast' if 'Medium High Contrast' in [i.identifier for i in scene.view_settings.bl_rna.properties['look'].enum_items] else 'None';scene.view_settings.exposure=0

def material(name,color,roughness=.7,metal=0):
 m=bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=roughness;p.inputs['Metallic'].default_value=metal;return m
stone=material('Freshly worked springstone',(.15,.17,.145),.9);nodes=stone.node_tree.nodes;links=stone.node_tree.links;noise=nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=105;noise.inputs['Detail'].default_value=4;bump=nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.35;bump.inputs['Distance'].default_value=.035;links.new(noise.outputs['Fac'],bump.inputs['Height']);links.new(bump.outputs['Normal'],nodes.get('Principled BSDF').inputs['Normal']);ramp=nodes.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].color=(.13,.145,.13,1);ramp.color_ramp.elements[1].color=(.23,.24,.21,1);links.new(noise.outputs['Fac'],ramp.inputs[0]);links.new(ramp.outputs[0],nodes.get('Principled BSDF').inputs['Base Color'])
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
    if n.type=='BSDF_PRINCIPLED':
     original=n.inputs['Base Color'];mix=m.node_tree.nodes.new('ShaderNodeMixRGB');mix.blend_type='MIX';mix.inputs[2].default_value=(.19,.205,.18,1)
     if original.is_linked:m.node_tree.links.new(original.links[0].from_socket,mix.inputs[1])
     else:mix.inputs[1].default_value=original.default_value
     m.node_tree.links.new(mix.outputs[0],original)
     saved.append((n,n.inputs['Roughness'].default_value,n.inputs['Metallic'].default_value,mix,n.inputs['Coat Weight'].default_value))

obj=None;rendered_holds={}
for entry in meta['entries']:
 index=entry['index'];phase=entry['phase'];point=Vector(entry['contact']);working=phase=='carve';finished=phase in ['sand','heat','wax','work']
 if obj:
  old_mesh=obj.data;bpy.data.objects.remove(obj,do_unlink=True);bpy.data.meshes.remove(old_mesh)
 data=np.load(root/('mesh_%04d.npz'%index));mesh=bpy.data.meshes.new('Carved state');mesh.from_pydata(data['vertices'].tolist(),[],data['faces'].tolist());mesh.update();obj=bpy.data.objects.new('Source-derived stone',mesh);scene.collection.objects.link(obj);obj.data.materials.append(stone);obj.hide_render=finished
 for poly in obj.data.polygons:poly.use_smooth=True
 for o in approved:o.hide_render=not finished
 polish=max(0,min(1,(index-400)/63));sand=max(0,min(1,(index-248)/79))
 for node,rough,met,mix,coat in saved:
  node.inputs['Roughness'].default_value=rough if phase=='work' else .94-.10*sand if phase in ['sand','heat'] else .84*(1-polish)+rough*polish;node.inputs['Metallic'].default_value=met;node.inputs['Coat Weight'].default_value=coat*polish;mix.inputs[0].default_value=.88*(1-polish) if phase!='work' else 0
 for profile,w,h,position,target,fov,shift in [('desktop',1280,720,(1.38,-8.55,3.12),(.28,0,1.68),33,-.15),('mobile',720,1560,(.10,-12.5,3.12),(0,0,1.42),36,0)]:
  if a.profile not in ['both',profile]:continue
  if a.full:
   w,h=(1440,810) if profile=='desktop' else (960,2080)
   crop=(0,80,1440,730) if profile=='desktop' else (0,200,960,1700)
   scene.render.use_border=index!=0;scene.render.use_crop_to_border=True;scene.render.border_min_x=0;scene.render.border_max_x=1;scene.render.border_min_y=(h-crop[1]-crop[3])/h;scene.render.border_max_y=(h-crop[1])/h
  scene.render.resolution_x=w;scene.render.resolution_y=h;scene.render.resolution_percentage=100 if a.full else 75;cam.location=position;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();camdata.sensor_fit='VERTICAL';camdata.sensor_height=24;camdata.lens=12/math.tan(math.radians(fov)/2);camdata.shift_x=-192/720 if profile=='desktop' else 0;scene.render.filepath=str(out/('%s-%04d-%s.png'%(profile,index,phase)));key=(profile,phase)
  if phase in ['mark','heat','work'] and key in rendered_holds:shutil.copyfile(rendered_holds[key],scene.render.filepath)
  else:
   bpy.ops.render.render(write_still=True)
   if phase in ['mark','heat','work']:rendered_holds[key]=scene.render.filepath
 print('RENDERED',index,phase,flush=True)
