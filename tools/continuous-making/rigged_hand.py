# WebXR input assets store independent joint poses. Build a real bone hierarchy
# and joint-to-joint rest lengths before solving a physical grip. The source
# mesh stays unchanged; only its licensed skin skeleton is articulated.
def articulated_hand(side):
 before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(pathlib.Path(meta['assets'][side+'-hand']['file']).resolve()));bpy.context.view_layer.update();new=set(bpy.data.objects)-before;arm=next(o for o in new if o.type=='ARMATURE');bones=arm.data.bones;original_arm_world=arm.matrix_world.copy()
 def bone(keys):return next(b for b in bones if all(k in b.name.lower() for k in keys))
 wrist=arm.matrix_world@bone(['wrist']).head_local
 middle=arm.matrix_world@bone(['middle','tip']).head_local;index=arm.matrix_world@bone(['index','proximal']).head_local;little=arm.matrix_world@bone(['pinky','proximal']).head_local if any('pinky' in b.name for b in bones) else arm.matrix_world@bone(['little','proximal']).head_local
 z=(middle-wrist).normalized();x=(index-little).normalized();y=z.cross(x).normalized();x=y.cross(z).normalized();rot=Matrix((x,y,z)).to_4x4();norm=Matrix.Scale(.65/(middle-wrist).length,4)@rot@Matrix.Translation(-wrist)
 parent=bpy.data.objects.new(side+' hand grip',None);scene.collection.objects.link(parent)
 for obj in new:
  if obj.parent not in new:
   world=norm@obj.matrix_world.copy();obj.parent=parent;obj.matrix_parent_inverse=Matrix.Identity(4);obj.matrix_basis=world
 bpy.context.view_layer.objects.active=arm
 bpy.ops.object.mode_set(mode='EDIT')
 eb=arm.data.edit_bones
 for finger in ['thumb','index','middle','ring','pinky']:
  chain=sorted([b for b in eb if finger in b.name],key=lambda b:next(i for i,k in enumerate(['metacarpal','proximal','intermediate','distal','tip']) if k in b.name))
  chain[0].parent=eb['wrist']
  for current,nxt in zip(chain,chain[1:]):
   current.tail=nxt.head;nxt.parent=current;nxt.use_connect=True
  chain[-1].tail=chain[-1].head+(chain[-1].head-chain[-2].head).normalized()*.01
 bpy.ops.object.mode_set(mode='OBJECT')
 arm.animation_data_clear();arm.data.pose_position='POSE'
 for pb in arm.pose.bones:
  pb.rotation_mode='QUATERNION';pb.rotation_quaternion=Quaternion((1,0,0),0)
  for constraint in list(pb.constraints):pb.constraints.remove(constraint)
 for finger in ['index','middle','ring','pinky','thumb']:
  distal=next(pb for pb in arm.pose.bones if finger in pb.name.lower() and 'distal' in pb.name.lower())
  proximal=next(pb for pb in arm.pose.bones if finger in pb.name.lower() and 'proximal' in pb.name.lower())
  canonical=norm@original_arm_world@proximal.bone.head_local
  target=bpy.data.objects.new(side+' '+finger+' grip',None);scene.collection.objects.link(target);target.parent=parent;target.location=(canonical.x if finger!='thumb' else 0,.08 if side=='right' else -.08,.27 if finger!='thumb' else .29)
  pole=bpy.data.objects.new(side+' '+finger+' bend',None);scene.collection.objects.link(pole);pole.parent=parent;pole.location=(canonical.x,.65 if side=='right' else -.65,.25)
  ik=distal.constraints.new('IK');ik.target=target;ik.pole_target=pole;ik.chain_count=3;ik.use_tail=True;ik.iterations=64
 meshes=[o for o in new if o.type=='MESH' and any(m.type=='ARMATURE' for m in o.modifiers)]
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
