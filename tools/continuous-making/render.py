"""Offline art-direction study: one stone, real scanned tools, contact shadows.
No browser WebGL, CSS tool overlays, source model edits or catalogue writes.
"""
import bpy,sys,pathlib,json,math,argparse,shutil
import numpy as np
from mathutils import Vector,Matrix,Quaternion
p=argparse.ArgumentParser();p.add_argument('--root',required=True);p.add_argument('--profile',default='both',choices=['desktop','mobile','both']);p.add_argument('--full',action='store_true');p.add_argument('--quiet',action='store_true',help='Render only the changing stone form, with no illustrative hands or tools');a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);root=pathlib.Path(a.root);meta=json.loads((root/'scene.json').read_text());out=root/'review';out.mkdir(exist_ok=True)
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

def scan(ident):
 path=pathlib.Path(meta['assets'][ident]['file']).resolve();before=set(bpy.data.objects)
 bpy.ops.import_scene.gltf(filepath=str(path));bpy.context.view_layer.update()
 items=[o for o in set(bpy.data.objects)-before if o.type=='MESH']
 vertices=[o.matrix_world@Vector(v) for o in items for v in o.bound_box];lo=Vector(tuple(min(v[i] for v in vertices) for i in range(3)));hi=Vector(tuple(max(v[i] for v in vertices) for i in range(3)));ext=hi-lo;axis=max(range(3),key=lambda i:ext[i]);rot=Vector(tuple(1 if i==axis else 0 for i in range(3))).rotation_difference(Vector((0,0,1))).to_matrix().to_4x4();rvs=[rot@v for v in vertices];low=Vector(tuple(min(v[i] for v in rvs) for i in range(3)));high=Vector(tuple(max(v[i] for v in rvs) for i in range(3)));anchor=Vector(((low.x+high.x)/2,(low.y+high.y)/2,high.z-.08*(high.z-low.z)));norm=Matrix.Scale(1/(high.z-low.z),4)@Matrix.Translation(-anchor)@rot
 parent=bpy.data.objects.new(ident,None);scene.collection.objects.link(parent)
 for o in items:
  world=norm@o.matrix_world.copy();o.parent=parent;o.matrix_parent_inverse=Matrix.Identity(4);o.matrix_basis=world;o.hide_render=True
 bpy.context.view_layer.update()
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
# Articulated hands keep tools and cloth visibly held. Wrists continue into
# forearms outside the shot; all of this is rendered in the same offline scene.
skin=material('Dust on the sculptor hands',(.105,.055,.030),.62)
bs=skin.node_tree.nodes.get('Principled BSDF');bs.inputs['Subsurface Weight'].default_value=.08;bs.inputs['Subsurface Radius'].default_value=(.6,.25,.12)
noise=skin.node_tree.nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=190;noise.inputs['Detail'].default_value=3
b=skin.node_tree.nodes.new('ShaderNodeBump');b.inputs['Strength'].default_value=.22;b.inputs['Distance'].default_value=.006;skin.node_tree.links.new(noise.outputs['Fac'],b.inputs['Height']);skin.node_tree.links.new(b.outputs['Normal'],bs.inputs['Normal'])
sleeve=material('Workshop blue cotton',(.025,.045,.075),.93)
def hand_asset(side):
 before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(pathlib.Path(meta['assets'][side+'-hand']['file']).resolve()));bpy.context.view_layer.update();new=set(bpy.data.objects)-before;arm=next(o for o in new if o.type=='ARMATURE');bones=arm.data.bones;original_arm_world=arm.matrix_world.copy()
 def bone(keys):return next(b for b in bones if all(k in b.name.lower() for k in keys))
 wrist=arm.matrix_world@bone(['wrist']).head_local
 middle=arm.matrix_world@bone(['middle','distal']).tail_local;index=arm.matrix_world@bone(['index','proximal']).head_local;little=arm.matrix_world@bone(['pinky','proximal']).head_local if any('pinky' in b.name for b in bones) else arm.matrix_world@bone(['little','proximal']).head_local
 z=(middle-wrist).normalized();x=(index-little).normalized();y=z.cross(x).normalized();x=y.cross(z).normalized();rot=Matrix((x,y,z)).to_4x4();norm=Matrix.Scale(.65/(middle-wrist).length,4)@rot@Matrix.Translation(-wrist)
 parent=bpy.data.objects.new(side+' hand grip',None);scene.collection.objects.link(parent)
 for obj in new:
  if obj.parent not in new:
   world=norm@obj.matrix_world.copy();obj.parent=parent;obj.matrix_parent_inverse=Matrix.Identity(4);obj.matrix_basis=world
 arm.animation_data_clear();arm.data.pose_position='POSE'
 for pb in arm.pose.bones:
  pb.rotation_mode='QUATERNION';pb.rotation_quaternion=Quaternion((1,0,0),0)
  for constraint in list(pb.constraints):pb.constraints.remove(constraint)
 for finger in ['index','middle','ring','pinky','thumb']:
  distal=next(pb for pb in arm.pose.bones if finger in pb.name.lower() and 'distal' in pb.name.lower())
  proximal=next(pb for pb in arm.pose.bones if finger in pb.name.lower() and 'proximal' in pb.name.lower())
  canonical=norm@original_arm_world@proximal.bone.head_local
  target=bpy.data.objects.new(side+' '+finger+' grip',None);scene.collection.objects.link(target);target.parent=parent;target.location=(canonical.x if finger!='thumb' else 0,-.08,.27 if finger!='thumb' else .29)
  pole=bpy.data.objects.new(side+' '+finger+' bend',None);scene.collection.objects.link(pole);pole.parent=parent;pole.location=(canonical.x,-.65,.60)
  ik=distal.constraints.new('IK');ik.target=target;ik.pole_target=pole;ik.chain_count=3;ik.use_tail=True;ik.iterations=64
 meshes=[o for o in new if o.type=='MESH']
 for obj in meshes:
  obj.data.materials.clear();obj.data.materials.append(skin)
  for poly in obj.data.polygons:poly.use_smooth=True
  sub=obj.modifiers.new('Hand surface','SUBSURF');sub.levels=1;sub.render_levels=1
 bpy.ops.mesh.primitive_cone_add(vertices=32,radius1=.13,radius2=.095,depth=1);forearm=bpy.context.object;forearm.data.materials.append(skin)
 for poly in forearm.data.polygons:poly.use_smooth=True
 verts=[];faces=[]
 for ring in range(49):
  t=ring/48
  for segment in range(40):
   theta=2*math.pi*segment/40;radius=(.11+.08*t)*(1+.065*math.sin(t*48+math.sin(theta*3))+.035*math.sin(t*90-theta*4));verts.append((radius*math.cos(theta),radius*math.sin(theta),t-.5))
 for ring in range(48):
  for segment in range(40):
   k=ring*40+segment;q=ring*40+(segment+1)%40;faces.append((k,q,q+40,k+40))
 mesh=bpy.data.meshes.new('Worn cotton sleeve');mesh.from_pydata(verts,[],faces);mesh.update();shirt=bpy.data.objects.new(side+' shirt sleeve',mesh);scene.collection.objects.link(shirt);shirt.data.materials.append(sleeve)
 for poly in shirt.data.polygons:poly.use_smooth=True
 print('HAND BONES',side,[b.name for b in bones],flush=True);return parent,meshes,forearm,shirt
left_hand=hand_asset('left');right_hand=hand_asset('right')
def hold(hand,grip,axis,forward,visible,side):
 parent,meshes,forearm,shirt=hand
 for obj in meshes+[forearm,shirt]:obj.hide_render=not visible
 if not visible:return
 x=Vector(axis).normalized();z=(Vector(forward)-x*Vector(forward).dot(x)).normalized();y=z.cross(x).normalized();rotation=Matrix((x,y,z)).transposed();parent.rotation_euler=rotation.to_euler();parent.location=Vector(grip)-rotation@Vector((0,-.045,.29));wrist=parent.location
 elbow=wrist+Vector(((-1 if side=='left' else 1)*.16,-.02,-.05));delta=elbow-wrist
 forearm.location=(elbow+wrist)*.5;forearm.rotation_euler=delta.to_track_quat('Z','Y').to_euler();forearm.scale=(1,1,delta.length)
 outer=elbow+Vector(((-1 if side=='left' else 1)*3.3,-.35,-.9));delta=outer-elbow;shirt.location=(elbow+outer)*.5;shirt.rotation_euler=delta.to_track_quat('Z','Y').to_euler();shirt.scale=(1,1,delta.length)

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
 # Chisel and scanned hammer share the stone's perspective, shadows and lighting.
 direction=Vector((-.36,-.65,.72)).normalized();chisel.hide_render=not working;chisel.location=point+direction*.325;chisel.rotation_euler=direction.to_track_quat('Z','Y').to_euler();butt=point+direction*.65
 strike=(.5-.5*math.cos((index-40)*math.pi/8))**1.6;hammer.location=butt+Vector((.08,-.07,.06))*(1-strike)+Vector((.32,-.12,.38))*strike;hammer.rotation_euler=Vector((-.80,.0,-.32)).to_track_quat('Z','Y').to_euler();hammer.rotation_euler.y+=strike*.55;hammer.scale=(1.35,1.35,1.35)
 for o in hparts:o.hide_render=not working
 for o in tparts:o.hide_render=phase!='heat'
 torch.location=point+Vector((.40,-.12,.20));torch.rotation_euler=(0,-math.pi/2,0);torch.scale=(1.4,1.4,1.4)
 flame.hide_render=phase!='heat';flame.location=point+Vector((.16,-.04,.10));flame.rotation_euler=Vector((-.4,.08,-.2)).to_track_quat('Z','Y').to_euler();heatlight.location=point+Vector((0,-.20,.1));heatlight.data.energy=8 if phase=='heat' else 0
 rag.hide_render=phase not in ['sand','wax'];rag.location=point+Vector((.04*math.sin(index*.23),-.065,.04*math.cos(index*.19)));rag.rotation_euler=(0,.1,math.sin(index*.15)*.16);
 def ease(value):
  value=max(0,min(1,value));return value*value*(3-2*value)
 if phase=='sand':rag.location.x-=3*(1-ease((index-248)/12)+ease((index-316)/11))
 if phase=='wax':rag.location.x-=3*(1-ease((index-400)/10)+ease((index-448)/15))
 if phase=='heat':
  shift=3*(1-ease((index-328)/12)+ease((index-388)/11));torch.location.x+=shift;flame.location.x+=shift
 rag.data.materials[0]=abrasive if phase=='sand' else fabric
 bpy.context.view_layer.update()
 hold(left_hand,point+direction*.37 if working else rag.location+Vector((0,-.05,0)),direction if working else (0,0,1),(1,.1,.25),working or phase in ['sand','wax'],'left')
 hold(right_hand,hammer.matrix_world@Vector((0,0,-.52)) if working else torch.matrix_world@Vector((0,0,-.45)),hammer.matrix_world.to_3x3()@Vector((0,0,1)) if working else (1,0,0),(-1,.1,.3),working or phase=='heat','right')
 # Editorial-only version: exact same source-derived changing solid and
 # approved last frame, but no visible illustrative props at any stage.
 # Suppression happens BEFORE both the beauty and geometry-matte passes.
 if a.quiet:
  for prop in [chisel,rag,flame,*hparts,*tparts,*left_hand[1],left_hand[2],left_hand[3],*right_hand[1],right_hand[2],right_hand[3]]:
   prop.hide_render=True
  heatlight.data.energy=0
 for profile,w,h,position,target,fov,shift in [('desktop',1280,720,(1.38,-8.55,3.12),(.28,0,1.68),33,-.15),('mobile',720,1560,(.10,-12.5,3.12),(0,0,1.42),36,0)]:
  if a.profile not in ['both',profile]:continue
  if a.full:
   w,h=(1440,810) if profile=='desktop' else (960,2080)
   crop=(0,80,1440,730) if profile=='desktop' else (0,200,960,1700)
   scene.render.use_border=index!=0;scene.render.use_crop_to_border=True;scene.render.border_min_x=0;scene.render.border_max_x=1;scene.render.border_min_y=(h-crop[1]-crop[3])/h;scene.render.border_max_y=(h-crop[1])/h
  scene.render.resolution_x=w;scene.render.resolution_y=h;scene.render.resolution_percentage=100 if a.full else 75;cam.location=position;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();camdata.sensor_fit='VERTICAL';camdata.sensor_height=24;camdata.lens=12/math.tan(math.radians(fov)/2);camdata.shift_x=-192/720 if profile=='desktop' else 0;scene.render.filepath=str(out/('%s-%04d-%s.png'%(profile,index,phase)));key=(profile,phase)
  if phase in ['mark','work'] and key in rendered_holds:shutil.copyfile(rendered_holds[key],scene.render.filepath)
  else:
   bpy.ops.render.render(write_still=True)
   if phase in ['mark','work']:rendered_holds[key]=scene.render.filepath
 print('RENDERED',index,phase,flush=True)
