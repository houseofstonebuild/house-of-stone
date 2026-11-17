"""Replace only the hand regions with anatomically connected grips. Original
Coil/stone geometry, tool positions and all other source pixels are unchanged.
"""
import pathlib,sys
matte='--matte' in sys.argv
if matte:sys.argv.remove('--matte')
path=pathlib.Path('tools/continuous-making/render.py');source=path.read_text()
def patch(before,after):
 global source
 assert source.count(before)==1,before
 source=source.replace(before,after)
patch("out=root/'review'", "out=root/'rig-patches'/"+repr('matte' if matte else 'beauty'))
patch('out.mkdir(exist_ok=True)','out.mkdir(parents=True,exist_ok=True)')
if matte:patch("scene.render.film_transparent=False", "scene.render.film_transparent=True;scene.render.image_settings.color_mode='RGBA'")
helpers='''
from bpy_extras.object_utils import world_to_camera_view
import struct
exec(pathlib.Path('tools/continuous-making/rigged_hand.py').read_text(),globals())
new_hands={'left':articulated_hand('left'),'right':articulated_hand('right')}
old_hands={'left':left_hand,'right':right_hand}
_base_hold=hold
_hand_args={}
_patch_rects={}
def _pose(hand,args,correct_right):
 _base_hold(hand,*args[1:])
 if correct_right and args[-2]:
  parent,meshes,forearm,shirt=hand
  delta=-(parent.rotation_euler.to_matrix()@Vector((0,.09,0)))
  parent.location+=delta;forearm.location+=delta;shirt.location+=delta
  for child in parent.children:
   if child.type=='EMPTY' and child.name.startswith('right ') and (' grip' in child.name or ' bend' in child.name):child.location.y=abs(child.location.y)
def _remember_hold(*args):
 side=args[-1];_hand_args[side]=args
 _pose(old_hands[side],args,side=='right')
 _pose(new_hands[side],args,side=='right')
 for ob in old_hands[side][1]+list(old_hands[side][2:]):ob.hide_render=True
 bpy.context.view_layer.update()
def _bounds(hand):
 graph=bpy.context.evaluated_depsgraph_get();points=[]
 for ob in hand[1]:
  if not any(m.type=='ARMATURE' for m in ob.modifiers):continue
  evaluated=ob.evaluated_get(graph)
  for vertex in evaluated.bound_box:points.append(world_to_camera_view(scene,cam,evaluated.matrix_world@Vector(vertex)))
 return points
def _render_patch(profile,index,phase):
 target=pathlib.Path(scene.render.filepath)
 sw,sh=(1440,810) if profile=='desktop' else (960,2080)
 crop=(0,80,1440,730) if profile=='desktop' else (0,200,960,1700)
 for side,args in _hand_args.items():
  if not args[-2]:continue
  points=_bounds(old_hands[side])+_bounds(new_hands[side]);assert points
  left=max(crop[0],math.floor(min(p.x for p in points)*sw)-64);right=min(crop[0]+crop[2],math.ceil(max(p.x for p in points)*sw)+64)
  top=max(crop[1],math.floor((1-max(p.y for p in points))*sh)-64);bottom=min(crop[1]+crop[3],math.ceil((1-min(p.y for p in points))*sh)+64)
  if right<=left or bottom<=top:continue
  scene.render.use_border=True;scene.render.use_crop_to_border=True;scene.render.border_min_x=(left+.25)/sw;scene.render.border_max_x=min(1,(right+.25)/sw);scene.render.border_min_y=(sh-bottom+.25)/sh;scene.render.border_max_y=(sh-top+.25)/sh
  actual_x=int(sw*scene.render.border_min_x);actual_y=sh-int(sh*scene.render.border_max_y)
  output=target.with_name(target.stem+'-'+side+'.png');scene.render.filepath=str(output)
  bpy.ops.render.render(write_still=True)
  width,height=struct.unpack('>II',output.read_bytes()[16:24]);_patch_rects[output.name]={'target':target.name,'x':actual_x,'y':actual_y,'width':width,'height':height,'source_width':sw,'source_height':sh}
 scene.render.filepath=str(target)
'''
if matte:helpers+="\nscene.render.engine='BLENDER_WORKBENCH';ground.hide_render=True;scene.display.shading.light='FLAT';scene.display.shading.color_type='SINGLE';scene.display.shading.single_color=(1,1,1);scene.display.shading.show_shadows=False;scene.display.shading.show_cavity=False;scene.display.shading.show_specular_highlight=False;scene.display.render_aa='16'\n"
patch('bpy.ops.render.render(write_still=True)','_render_patch(profile,index,phase)')
patch('obj=None;rendered_holds={}',helpers+'\nobj=None;rendered_holds={}')
patch(' hold(left_hand,',' _remember_hold(left_hand,');patch(' hold(right_hand,',' _remember_hold(right_hand,')
source+="\n(out/('rects-'+a.profile+'-'+str(meta['entries'][0]['index'])+'-'+str(meta['entries'][-1]['index'])+'.json')).write_text(json.dumps(_patch_rects))\n"
exec(compile(source,str(path),'exec'),{'__name__':'__main__'})
