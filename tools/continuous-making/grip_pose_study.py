"""Render only the union of the old/new right-arm image regions. Correct the
right palm's sign convention while leaving every other beauty-pass pixel alone.
"""
import pathlib,sys
import os
matte='--matte' in sys.argv
if matte:sys.argv.remove('--matte')
path=pathlib.Path('tools/continuous-making/render.py');source=path.read_text()
def patch(before,after):
 global source
 assert source.count(before)==1,before
 source=source.replace(before,after)
patch("out=root/'review'", "out=root/'grip-patches'/"+repr('matte' if matte else 'beauty'))
patch('out.mkdir(exist_ok=True)','out.mkdir(parents=True,exist_ok=True)')
if matte:patch("scene.render.film_transparent=False", "scene.render.film_transparent=True;scene.render.image_settings.color_mode='RGBA'")
helpers='''
import os
from bpy_extras.object_utils import world_to_camera_view
import struct
_base_hold=hold
_right_args=None
_patch_rects={}
def _remember_right_hold(*args):
 global _right_args
 _right_args=args
 _base_hold(*args)
def _set_right(correct):
 parent,meshes,forearm,shirt=right_hand
 for child in parent.children:
  if child.type=='EMPTY' and child.name.startswith('right ') and (' grip' in child.name or ' bend' in child.name):child.location.y=abs(child.location.y)*(1 if correct else -1)
 _base_hold(*_right_args)
 if correct:
  for child in right_hand[0].children:
   if child.type=='EMPTY' and child.name.startswith('right '):
    if ' bend' in child.name:child.location.z=float(os.environ.get('GRIP_POLE_Z','.2'))
    if ' grip' in child.name:child.location.z=float(os.environ.get('GRIP_TARGET_Z','.29'))

  delta=-(parent.rotation_euler.to_matrix()@Vector((0,.09,0)))
  parent.location+=delta;forearm.location+=delta;shirt.location+=delta
 bpy.context.view_layer.update()
def _bounds():
 graph=bpy.context.evaluated_depsgraph_get();points=[]
 for ob in right_hand[1]:
  evaluated=ob.evaluated_get(graph)
  for vertex in evaluated.bound_box:points.append(world_to_camera_view(scene,cam,evaluated.matrix_world@Vector(vertex)))
 return points
def _render_patch(profile,index,phase):
 if not _right_args or not _right_args[-2]:return
 _set_right(False);old=_bounds();_set_right(True);new=_bounds();points=old+new
 sw,sh=(1440,810) if profile=='desktop' else (960,2080)
 crop=(0,80,1440,730) if profile=='desktop' else (0,200,960,1700)
 left=max(crop[0],math.floor(min(p.x for p in points)*sw)-64);right=min(crop[0]+crop[2],math.ceil(max(p.x for p in points)*sw)+64)
 top=max(crop[1],math.floor((1-max(p.y for p in points))*sh)-64);bottom=min(crop[1]+crop[3],math.ceil((1-min(p.y for p in points))*sh)+64)
 if right<=left or bottom<=top:return
 scene.render.use_border=True;scene.render.use_crop_to_border=True;scene.render.border_min_x=(left+.25)/sw;scene.render.border_max_x=min(1,(right+.25)/sw);scene.render.border_min_y=(sh-bottom+.25)/sh;scene.render.border_max_y=(sh-top+.25)/sh
 actual_x=int(sw*scene.render.border_min_x);actual_y=sh-int(sh*scene.render.border_max_y)
 bpy.ops.render.render(write_still=True)
 output=pathlib.Path(scene.render.filepath);width,height=struct.unpack('>II',output.read_bytes()[16:24]);_patch_rects[output.name]={'x':actual_x,'y':actual_y,'width':width,'height':height,'source_width':sw,'source_height':sh}
'''
if matte:helpers+="\nscene.render.engine='BLENDER_WORKBENCH';ground.hide_render=True;scene.display.shading.light='FLAT';scene.display.shading.color_type='SINGLE';scene.display.shading.single_color=(1,1,1);scene.display.shading.show_shadows=False;scene.display.shading.show_cavity=False;scene.display.shading.show_specular_highlight=False;scene.display.render_aa='16'\n"
patch('bpy.ops.render.render(write_still=True)','_render_patch(profile,index,phase)')
patch('obj=None;rendered_holds={}',helpers+'\nobj=None;rendered_holds={}')
patch(' hold(right_hand,',' _remember_right_hold(right_hand,')
source+="\n(out/('rects-'+a.profile+'-'+str(meta['entries'][0]['index'])+'-'+str(meta['entries'][-1]['index'])+'.json')).write_text(json.dumps(_patch_rects))\n"
exec(compile(source,str(path),'exec'),{'__name__':'__main__'})
