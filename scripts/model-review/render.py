"""Offline OpenGL turntable/reference QA. Uses Mesa/EGL; not needed at runtime."""
import ctypes as C, json, math, argparse, re
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from rebuild import ROOT, REFERENCES

class Renderer:
    def __init__(self,w=640,h=880,reconstruction=False,background=(.043,.043,.04)):
        self.background=background;self.reconstruction=reconstruction
        self.w,self.h=w,h;E=C.CDLL('libEGL.so.1');self.E=E;E.eglGetProcAddress.restype=C.c_void_p
        get=C.CFUNCTYPE(C.c_void_p,C.c_uint,C.c_void_p,C.POINTER(C.c_int))(E.eglGetProcAddress(b'eglGetPlatformDisplayEXT'))
        self.display=get(0x31DD,None,None);E.eglInitialize.argtypes=[C.c_void_p,C.POINTER(C.c_int),C.POINTER(C.c_int)]
        a=C.c_int();b=C.c_int();assert E.eglInitialize(self.display,C.byref(a),C.byref(b));E.eglBindAPI(0x30A2)
        E.eglChooseConfig.argtypes=[C.c_void_p,C.POINTER(C.c_int),C.POINTER(C.c_void_p),C.c_int,C.POINTER(C.c_int)]
        cfg=C.c_void_p();n=C.c_int();assert E.eglChooseConfig(self.display,(C.c_int*9)(0x3033,1,0x3040,8,0x3025,24,0x3024,8,0x3038),C.byref(cfg),1,C.byref(n))
        E.eglCreateContext.restype=C.c_void_p;E.eglCreateContext.argtypes=[C.c_void_p,C.c_void_p,C.c_void_p,C.POINTER(C.c_int)]
        self.context=E.eglCreateContext(self.display,cfg,None,(C.c_int*1)(0x3038))
        E.eglCreatePbufferSurface.restype=C.c_void_p;E.eglCreatePbufferSurface.argtypes=[C.c_void_p,C.c_void_p,C.POINTER(C.c_int)]
        self.surface=E.eglCreatePbufferSurface(self.display,cfg,(C.c_int*5)(0x3057,w,0x3056,h,0x3038))
        E.eglMakeCurrent.argtypes=[C.c_void_p,C.c_void_p,C.c_void_p,C.c_void_p];assert E.eglMakeCurrent(self.display,self.surface,self.surface,self.context)
        self.G=C.CDLL('libGL.so.1');self.functions={}
        self.call('glEnable',None,[C.c_uint],0x0B71)
        self.call('glViewport',None,[C.c_int]*4,0,0,w,h)
        vs='''#version 120
attribute vec3 pos;attribute vec3 normal;attribute vec2 uv;uniform mat3 rotation;uniform float aspect;varying vec3 nn;varying vec3 sourceN;varying vec3 sourceP;varying vec3 viewP;varying vec2 tex;
void main(){vec3 p=rotation*(pos-vec3(0.,1.525,0.));gl_Position=vec4(p.x/(1.78*aspect),p.y/1.78,-p.z*.22,1.);nn=rotation*normal;sourceN=normal;sourceP=pos;viewP=p-vec3(0.,0.,6.8);tex=uv;}'''
        # Review the exact same surface shader as the deployed viewer.
        surface=re.search(r'String.raw`(.*?)`;', (ROOT/'public/stone-surface.js').read_text(),re.S).group(1)
        fs='''#version 120
uniform sampler2D map;uniform vec4 stoneSwatch;uniform float stonePolish;uniform vec3 sourceOffset;varying vec3 nn;varying vec3 sourceN;varying vec3 sourceP;varying vec3 viewP;varying vec2 tex;
'''+surface+'''
vec3 toSRGB(vec3 c){return mix(12.92*c,1.055*pow(max(c,vec3(0.)),vec3(1./2.4))-.055,step(vec3(.0031308),c));}
void main(){vec3 c=polishedStone(texture2D(map,tex).rgb,sourceP-sourceOffset,sourceN,nn,viewP,stonePolish);gl_FragColor=vec4(toSRGB(c),1.);}'''
        if reconstruction: fs=fs.replace('polishedStone(texture2D','reconstructionStone(texture2D')
        shaders=[]
        for kind,source in [(0x8B31,vs),(0x8B30,fs)]:
            s=self.call('glCreateShader',C.c_uint,[C.c_uint],kind);p=C.c_char_p(source.encode())
            self.call('glShaderSource',None,[C.c_uint,C.c_int,C.POINTER(C.c_char_p),C.c_void_p],s,1,C.byref(p),None);self.call('glCompileShader',None,[C.c_uint],s)
            status=C.c_int();self.call('glGetShaderiv',None,[C.c_uint,C.c_uint,C.POINTER(C.c_int)],s,0x8B81,C.byref(status));assert status.value,'Shader failed';shaders.append(s)
        self.program=self.call('glCreateProgram',C.c_uint,[])
        for s in shaders:self.call('glAttachShader',None,[C.c_uint,C.c_uint],self.program,s)
        self.call('glLinkProgram',None,[C.c_uint],self.program);self.call('glUseProgram',None,[C.c_uint],self.program)
        for name in ['pos','normal','uv']:
            loc=self.call('glGetAttribLocation',C.c_int,[C.c_uint,C.c_char_p],self.program,name.encode());self.functions[name]=loc;self.call('glEnableVertexAttribArray',None,[C.c_uint],loc)
        loc=self.call('glGetUniformLocation',C.c_int,[C.c_uint,C.c_char_p],self.program,b'aspect');self.call('glUniform1f',None,[C.c_int,C.c_float],loc,w/h)
        self.rotloc=self.call('glGetUniformLocation',C.c_int,[C.c_uint,C.c_char_p],self.program,b'rotation')
        self.texture=C.c_uint();self.call('glGenTextures',None,[C.c_int,C.POINTER(C.c_uint)],1,C.byref(self.texture));self.call('glBindTexture',None,[C.c_uint,C.c_uint],0x0DE1,self.texture.value)
        for param,val in [(0x2801,0x2601),(0x2800,0x2601),(0x2802,0x812F),(0x2803,0x812F)]:self.call('glTexParameteri',None,[C.c_uint,C.c_uint,C.c_int],0x0DE1,param,val)
    def call(self,name,ret,args,*values):
        f=getattr(self.G,name);f.restype=ret;f.argtypes=args;return f(*values)
    def load(self,data,image,swatch,polish=1):
        self.data=data
        for name,key,size in [('pos','vertices',3),('normal','normals',3),('uv','uv',2)]:
            a=np.ascontiguousarray(data[key],dtype='f4');data[key]=a
            self.call('glVertexAttribPointer',None,[C.c_uint,C.c_int,C.c_uint,C.c_ubyte,C.c_int,C.c_void_p],self.functions[name],size,0x1406,0,0,a.ctypes.data)
        im=np.ascontiguousarray(np.asarray(Image.open(image).convert('RGB')));self.call('glPixelStorei',None,[C.c_uint,C.c_int],0x0CF5,1)
        loc=self.call('glGetUniformLocation',C.c_int,[C.c_uint,C.c_char_p],self.program,b'stoneSwatch');self.call('glUniform4f',None,[C.c_int]+[C.c_float]*4,loc,swatch[0]/im.shape[1],swatch[1]/im.shape[0],swatch[2]/im.shape[1],swatch[3]/im.shape[0])
        loc=self.call('glGetUniformLocation',C.c_int,[C.c_uint,C.c_char_p],self.program,b'stonePolish');self.call('glUniform1f',None,[C.c_int,C.c_float],loc,polish)
        loc=self.call('glGetUniformLocation',C.c_int,[C.c_uint,C.c_char_p],self.program,b'sourceOffset');low=data['vertices'].min(axis=0);self.call('glUniform3f',None,[C.c_int]+[C.c_float]*3,loc,*low)
        self.call('glTexImage2D',None,[C.c_uint,C.c_int,C.c_int,C.c_int,C.c_int,C.c_int,C.c_uint,C.c_uint,C.c_void_p],0x0DE1,0,0x8C41,im.shape[1],im.shape[0],0,0x1907,0x1401,im.ctypes.data)
        data['indices']=np.ascontiguousarray(data['indices'],dtype='u4')
    def render(self,angle=0,pitch=0):
        a=math.radians(angle);b=math.radians(pitch)
        ry=np.array([[math.cos(a),0,math.sin(a)],[0,1,0],[-math.sin(a),0,math.cos(a)]],dtype='f4');rx=np.array([[1,0,0],[0,math.cos(b),-math.sin(b)],[0,math.sin(b),math.cos(b)]],dtype='f4');r=np.ascontiguousarray((rx@ry).T)
        self.call('glUniformMatrix3fv',None,[C.c_int,C.c_int,C.c_ubyte,C.c_void_p],self.rotloc,1,0,r.ctypes.data)
        self.call('glClearColor',None,[C.c_float]*4,*self.background,0 if self.reconstruction else 1);self.call('glClear',None,[C.c_uint],0x4000|0x100)
        self.call('glDrawElements',None,[C.c_uint,C.c_int,C.c_uint,C.c_void_p],4,self.data['indices'].size,0x1405,self.data['indices'].ctypes.data)
        self.call('glFinish',None,[]);out=np.empty((self.h,self.w,4),dtype='u1');self.call('glReadPixels',None,[C.c_int]*4+[C.c_uint,C.c_uint,C.c_void_p],0,0,self.w,self.h,0x1908,0x1401,out.ctypes.data)
        depth=np.empty((self.h,self.w),dtype='f4');self.call('glReadPixels',None,[C.c_int]*4+[C.c_uint,C.c_uint,C.c_void_p],0,0,self.w,self.h,0x1902,0x1406,depth.ctypes.data)
        self.last_mask=depth[::-1]<.9999
        return Image.fromarray(out[::-1,:,:3].copy())

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('folder',type=Path);p.add_argument('--animation',action='store_true');args=p.parse_args()
    r=Renderer();boards=[];font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',22)
    for id,ref in REFERENCES.items():
        data=dict(np.load(args.folder/(id+'.npz')));r.load(data,ROOT/'public/assets'/ref['image'],ref['swatch'],ref.get('polish',1))
        front=r.render();front.save(args.folder/(id+'-front.png'));oblique=r.render(40);oblique.save(args.folder/(id+'-angle.png'))
        corners=[r.render(a) for a in [0,45,90,135,180,225,270,315]]
        turns=Image.new('RGB',(640*4,880*2),(11,11,10))
        for i,im in enumerate(corners):turns.paste(im,((i%4)*640,(i//4)*880))
        turns.save(args.folder/(id+'-turntable.jpg'),quality=92)
        source=Image.open(ROOT/'public/assets'/ref['image']).convert('RGB');ys,xs=np.where(np.asarray(Image.open(args.folder/(id+'-mask.png')))>0)
        crop=source.crop((xs.min()-25,ys.min()-25,xs.max()+26,ys.max()+26));crop.thumbnail((640,880));refpanel=Image.new('RGB',(640,880),(11,11,10));refpanel.paste(crop,((640-crop.width)//2,(880-crop.height)//2))
        board=Image.new('RGB',(1920,958),(11,11,10));draw=ImageDraw.Draw(board)
        for i,(im,label) in enumerate([(refpanel,'REFERENCE'),(front,'MODEL / FRONT'),(oblique,'MODEL / 40°')]):board.paste(im,(640*i,58));draw.text((640*i+28,22),label,font=font,fill=(230,230,224))
        board.save(args.folder/(id+'-comparison.jpg'),quality=95);boards.append(board)
        if args.animation:
            frames=[r.render(a) for a in np.linspace(0,360,72,endpoint=False)]
            frames[0].save(args.folder/(id+'-rotation.gif'),save_all=True,append_images=frames[1:],duration=60,loop=0,optimize=False)
    overview=Image.new('RGB',(1920,958*len(boards)),(11,11,10))
    for i,board in enumerate(boards):overview.paste(board,(0,958*i))
    overview.save(args.folder/'all-sculptures-comparison.jpg',quality=93)
