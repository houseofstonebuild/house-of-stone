"""Geometry-identical object mattes and an empty lighting plate.
The beauty renderer remains unchanged; only render engine/visibility are overridden.
"""
import sys,pathlib
mode='matte' if '--matte' in sys.argv else 'plate'
sys.argv.remove('--'+mode)
path=pathlib.Path('tools/continuous-making/render_sculpture.py');source=path.read_text()
def patch(before,after):
 global source
 assert source.count(before)==1,before
 source=source.replace(before,after)
if mode=='matte':
 patch("out=root/'review'", "out=root/'mattes'")
 patch("scene.render.film_transparent=False", "scene.render.film_transparent=True;scene.render.image_settings.color_mode='RGBA'")
 patch("obj=None;rendered_holds={}", "scene.render.engine='BLENDER_WORKBENCH';ground.hide_render=True;scene.display.shading.light='FLAT';scene.display.shading.color_type='SINGLE';scene.display.shading.single_color=(1,1,1);scene.display.shading.show_shadows=False;scene.display.shading.show_cavity=False;scene.display.shading.show_specular_highlight=False;scene.display.render_aa='16';obj=None;rendered_holds={}")
else:
 patch("out=root/'review'", "out=root/'plates'")
 patch("for entry in meta['entries']:", "for entry in meta['entries'][:1]:")
 patch(" for profile,w,h,position,target,fov,shift in", " for ob in scene.objects:\n  if ob.type=='MESH':ob.hide_render=ob!=ground\n for profile,w,h,position,target,fov,shift in")
exec(compile(source,str(path),'exec'),{'__name__':'__main__'})
