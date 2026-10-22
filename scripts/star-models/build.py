"""Source-constrained star meshes. Unseen depth and reverse surfaces are inferred.
Authoring only: numpy, scipy, Pillow. Run from any directory; source masters stay intact.
"""
from pathlib import Path
from io import BytesIO
import argparse, hashlib, json, struct, sys
import numpy as np
from PIL import Image, ImageDraw, ImageOps
from scipy.ndimage import distance_transform_edt, gaussian_filter, map_coordinates, binary_erosion
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'scripts/model-review'))
from rebuild import contour, mesh_field
REFS = json.loads(Path(__file__).with_name('references.json').read_text())
REVIEW = Path(__file__).with_name('review')

def polygon(points,smooth=True):
    image=Image.new('L',(768,1024))
    ImageDraw.Draw(image).polygon([tuple(p) for p in contour(points,smooth)],fill=255)
    return np.asarray(image)>0

def mask_for(ref):
    mask=np.zeros((1024,768),bool)
    for part in ref.get('parts') or [{'outline':ref['outline']}]: mask|=polygon(part['outline'],ref['smooth'])
    for hole in ref.get('holes',[]):mask&=~polygon(hole)
    if ref.get('foot'):mask|=polygon(ref['foot'],False)
    return mask

def distance(mask):return gaussian_filter(distance_transform_edt(mask)-distance_transform_edt(~mask),.45)
def sample(a,x,y):return map_coordinates(a,[y.ravel(),x.ravel()],order=1,mode='nearest').reshape(x.shape)
def line_distance(x,y,points):
    result=np.full(x.shape,1e6)
    for a,b in zip(points[:-1],points[1:]):
        a=np.asarray(a);v=np.asarray(b)-a;t=np.clip(((x-a[0])*v[0]+(y-a[1])*v[1])/np.dot(v,v),0,1)
        result=np.minimum(result,np.hypot(x-a[0]-t*v[0],y-a[1]-t*v[1]))
    return result

def field_for(ref,mask,step):
    yy,xx=np.where(mask)
    axes=(np.arange(xx.min()-12.137,xx.max()+13,step,dtype='f4'),np.arange(yy.min()-12.213,yy.max()+13,step,dtype='f4'),np.arange(-160.417,181,step,dtype='f4'))
    x,y=np.meshgrid(*axes[:2],indexing='ij');z=axes[2][None,None,:]
    d=sample(distance(mask),x,y);kind=ref['kind'];radius=ref['depth']
    if ref.get('parts'):
        fields=[]
        for part in ref['parts']:
            pd=sample(distance(polygon(part['outline'])),x,y);local=np.maximum(pd,0);r=max(float(local.max()),2)
            half=part['depth']*np.sqrt(np.maximum(0,1-((r-local)/r)**2))
            fields.append(gaussian_filter(np.maximum(-pd[...,None],np.abs(z-part['center'])-half[...,None]),.35))
        f=np.minimum.reduce(fields)
        if kind=='birds':
            for cx,cy,cz,r in [(339,347,47,10),(395,616,79,7)]:
                sphere=np.sqrt((x[...,None]-cx)**2+(y[...,None]-cy)**2+(z-cz)**2)-r
                f=np.maximum(f,-sphere)
                bead=np.sqrt((x[...,None]-cx)**2+(y[...,None]-cy)**2+(z-(cz-r*.65))**2)-r*.58
                f=np.minimum(f,bead)
    elif kind=='flame':
        mid=14*np.sin((y-220)/125)+(x-400)*.1
        radius=radius+12*np.exp(-((y-700)/130)**2)
        f=np.sqrt(np.maximum(radius-d,0)[...,None]**2+(z-mid[...,None])**2)-radius[...,None]
    else:
        front=np.full(x.shape,float(radius));back=-front.copy()
        if kind=='interwoven':
            front+=24*np.sin((y-290)/95)+.14*(x-350)*np.sin((y-250)/110)
            for cx,cy,rx,ry,amount,tilt in [(453,487,67,60,128,.35),(323,620,81,83,132,.65)]:
                dx=x-cx;dy=y-cy;front-=amount*np.exp(-(((dx+tilt*dy)/rx)**2+(dy/ry)**2)*1.3)
            front+=19*np.exp(-((x-(235+(y-425)*.9))/28)**2)*np.exp(-((y-540)/160)**2)
            back+=18*np.sin((y-310)/100)-.12*(x-350)
            back+=42*np.exp(-((x-448)/80)**2-((y-485)/85)**2)+48*np.exp(-((x-325)/95)**2-((y-630)/100)**2)
            back=np.minimum(back,front-28)
        else:
            seam=356+.00035*(y-550)**2;front=72-.14*np.abs(x-seam)+5*np.sin((y-100)/290);back=-55+.04*(x-350)
            eye=line_distance(x,y,[(287,392),(297,405),(302,447),(303,511),(301,558),(298,571),(285,580),(265,583),(235,582),(211,586)])
            nose=line_distance(x,y,[(307,445),(307,620),(305,714),(303,841)])
            front-=18*np.exp(-(eye/3.8)**2)+13*np.exp(-(nose/3.2)**2)
            front+=12*np.exp(-((x-321)/9)**2-((y-743)/8)**2)-9*np.exp(-((x-326)/20)**2-((y-770)/3)**2)
        half=np.maximum((front-back)/2,15);mid=(front+back)/2;bevel=3.5 if kind=='face' else 8
        slab=np.abs(z-mid[...,None])-half[...,None]+bevel;side=-d[...,None]+bevel
        f=np.sqrt(np.maximum(side,0)**2+np.maximum(slab,0)**2)+np.minimum(np.maximum(side,slab),0)-bevel
        if kind=='interwoven':
            for cy,cz,slope,ry,rz in [(483,-17,-.20,28,23),(632,-24,.32,36,24)]:
                tube=(np.sqrt(((y[...,None]-cy-slope*(x[...,None]-380))/ry)**2+((z-cz-.08*(x[...,None]-380))/rz)**2)-1)*min(ry,rz)
                tube=np.maximum.reduce([tube,np.broadcast_to(z-(front[...,None]-14),tube.shape),np.broadcast_to((back[...,None]+14)-z,tube.shape)])
                f=np.maximum(f,-tube)
    if ref.get('foot'):
        fd=sample(distance(polygon(ref['foot'],False)),x,y)
        foot=np.sqrt(np.maximum(35-fd,0)[...,None]**2+(z+8)**2)-35 if kind=='flame' else np.maximum(-fd[...,None],np.abs(z+8)-55)
        f=np.minimum(f,foot)
    return (gaussian_filter(f,.35)-.017).astype('f4'),axes

def atlas_for(ref):
    source=Image.open(ROOT/f"public/assets/zsa-page-{ref['page']:02}.jpg").convert('RGB');atlas=Image.new('RGB',(2048,2048));atlas.paste(source,(0,0))
    sx,sy,sw,sh=ref['swatch'];crop=np.asarray(source.crop((sx*2,sy*2,(sx+sw)*2,(sy+sh)*2)),dtype=float)
    if ref['kind']!='interwoven':
        lum=crop.mean(axis=2);crop=np.clip(crop/np.maximum(gaussian_filter(lum,8)[...,None],1)*np.median(lum),0,255)
    yy,xx=np.mgrid[:2048,:512];x=xx/128;y=yy/128
    if ref['kind']=='interwoven':
        u=x*.37+.17*np.sin(y*.7);v=y*.23+.14*np.sin(x*.8);u=1-np.abs(u%2-1);v=1-np.abs(v%2-1)
        stone=np.stack([map_coordinates(crop[:,:,c],[v*(crop.shape[0]-1),u*(crop.shape[1]-1)],order=1) for c in range(3)],axis=-1)
    else:
        def tile(x,y):
            cx=np.floor(x);cy=np.floor(y);fx=x%1;fy=y%1;rotation=(np.mod(np.sin(cx*127.1+cy*311.7)*43758.5453,1)*4).astype(int)
            u=np.select([rotation==0,rotation==1,rotation==2],[fx,fy,1-fx],default=1-fy)
            v=np.select([rotation==0,rotation==1,rotation==2],[fy,1-fx,1-fy],default=fx)
            return np.stack([map_coordinates(crop[:,:,c],[v*(crop.shape[0]-1),u*(crop.shape[1]-1)],order=1) for c in range(3)],axis=-1)
        edge=np.minimum.reduce([x%1,1-x%1,y%1,1-y%1]);w=np.clip(edge/.18,0,1)[...,None];w=w*w*(3-2*w)
        stone=tile(x,y)*w+tile(x+.5,y+.5)*(1-w)
    atlas.paste(Image.fromarray(stone.astype('u1')),(1536,0))
    if ref['kind']=='interwoven':atlas.paste(ImageOps.fit(source.crop((540,1740,640,1790)),(512,512)),(1536,1536))
    if ref.get('lightSwatch'):
        sx,sy,sw,sh=ref['lightSwatch'];atlas.paste(ImageOps.fit(source.crop((sx*2,sy*2,(sx+sw)*2,(sy+sh)*2)),(256,2048)),(1792,0))
    data=BytesIO();atlas.save(data,format='JPEG',quality=94,subsampling=0)
    return data.getvalue()

def export_glb(vertices,normals,uv,indices,ref):
    low=vertices.min(axis=0);extent=vertices.max(axis=0)-low;position=(vertices-low)/extent
    normals=normals*extent;normals/=np.linalg.norm(normals,axis=1)[:,None]
    views=[];accessors=[];buffer=bytearray()
    def attribute(a,component,kind,target,normalized=False,bounds=False):
        while len(buffer)%4:buffer.append(0)
        offset=len(buffer);buffer.extend(a.tobytes());view=len(views);views.append({'buffer':0,'byteOffset':offset,'byteLength':a.nbytes,'target':target})
        acc={'bufferView':view,'componentType':component,'count':len(a),'type':kind}
        if normalized:acc['normalized']=True
        if bounds:acc.update(min=a.min(axis=0).tolist(),max=a.max(axis=0).tolist())
        accessors.append(acc);return len(accessors)-1
    def spread(a):
        a=a.astype('u4');a=(a|(a<<16))&0x030000FF;a=(a|(a<<8))&0x0300F00F;a=(a|(a<<4))&0x030C30C3;return (a|(a<<2))&0x09249249
    triangles=indices.reshape(-1,3);centers=np.clip(position[triangles].mean(axis=1)*1023,0,1023).astype('u4')
    code=spread(centers[:,0])|(spread(centers[:,1])<<1)|(spread(centers[:,2])<<2);triangles=triangles[np.argsort(code,kind='stable')]
    primitives=[]
    for start in range(0,len(triangles),24000):
        flat=triangles[start:start+24000].ravel();used,first=np.unique(flat,return_index=True);used=used[np.argsort(first)]
        lookup=np.empty(len(vertices),dtype='u4');lookup[used]=np.arange(len(used));assert len(used)<65536
        p=np.round(position[used]*65535).astype('<u2');n=np.round(np.clip(normals[used],-1,1)*32767).astype('<i2');t=np.round(np.clip(uv[used],0,1)*65535).astype('<u2')
        primitives.append({'attributes':{'POSITION':attribute(p,5123,'VEC3',34962,True,True),'NORMAL':attribute(n,5122,'VEC3',34962,True),'TEXCOORD_0':attribute(t,5123,'VEC2',34962,True)},'indices':attribute(lookup[flat].astype('<u2'),5123,'SCALAR',34963),'material':0})
    gltf={'asset':{'version':'2.0','generator':'House of Stone source-constrained authoring','extras':{'sourcePage':ref['page'],'geometryStatus':'reference-constrained; unseen surfaces inferred','scaleStatus':'presentation scale; not measured'}},'extensionsUsed':['KHR_materials_unlit','KHR_mesh_quantization'],'extensionsRequired':['KHR_mesh_quantization'],'scene':0,'scenes':[{'nodes':[0]}],'nodes':[{'mesh':0,'name':f"Original ZSA page {ref['page']}",'translation':low.tolist(),'scale':extent.tolist()}],'meshes':[{'primitives':primitives}],'materials':[{'extensions':{'KHR_materials_unlit':{}},'pbrMetallicRoughness':{'baseColorTexture':{'index':0},'metallicFactor':0,'roughnessFactor':.26}}],'textures':[{'source':0,'sampler':0}],'samplers':[{'magFilter':9729,'minFilter':9987,'wrapS':33071,'wrapT':33071}],'images':[{'uri':f"textures/zsa-{ref['page']:03}-surface.jpg"}],'buffers':[{'byteLength':len(buffer)}],'bufferViews':views,'accessors':accessors}
    js=json.dumps(gltf,separators=(',',':')).encode();js+=b' '*((-len(js))%4);buffer+=b'\0'*((-len(buffer))%4)
    return struct.pack('<III',0x46546C67,2,28+len(js)+len(buffer))+struct.pack('<II',len(js),0x4E4F534A)+js+struct.pack('<II',len(buffer),0x004E4942)+buffer

def build(id,ref,step):
    mask=mask_for(ref);field,axes=field_for(ref,mask,step);vertices,normals,indices=mesh_field(field,axes)
    original_indices=indices.copy();original_count=len(vertices)
    edges=np.sort(np.concatenate([indices.reshape(-1,3)[:,[0,1]],indices.reshape(-1,3)[:,[1,2]],indices.reshape(-1,3)[:,[2,0]]]),axis=1)
    unique,counts=np.unique(edges,axis=0,return_counts=True);assert np.all(counts==2),(id,'mesh must be closed')
    adjacency=coo_matrix((np.ones(len(unique)),(unique[:,0],unique[:,1])),shape=(original_count,original_count)).tocsr();components=connected_components(adjacency,directed=False,return_labels=False);assert components==1,(id,components)
    gradient=np.gradient(gaussian_filter(field,.65),*axes);coords=[(vertices[:,i]-axes[i][0])/step for i in range(3)]
    normals=np.stack([map_coordinates(g,coords,order=1) for g in gradient],axis=1);normals/=np.maximum(np.linalg.norm(normals,axis=1)[:,None],1e-9)
    _,nearest=distance_transform_edt(~binary_erosion(mask,iterations=2),return_indices=True)
    px=np.clip(np.round(vertices[:,0]).astype(int),0,767);py=np.clip(np.round(vertices[:,1]).astype(int),0,1023)
    frontuv=np.stack([nearest[1,py,px]*2/2048,nearest[0,py,px]*2/2048],axis=1)
    backuv=np.stack([.75+np.mod(vertices[:,0]+vertices[:,2]*.5,256)/1024,np.mod(vertices[:,1],1024)/1024],axis=1)
    front_z=np.max(np.where(field<0,axes[2][None,None,:],-1000),axis=2)
    tri=indices.reshape(-1,3);centers=vertices[tri].mean(axis=1);tn=normals[tri].mean(axis=1)
    gridx=(centers[:,0]-axes[0][0])/step;gridy=(centers[:,1]-axes[1][0])/step
    surface=map_coordinates(front_z,[gridx,gridy],order=1,mode='nearest')
    photographed=(tn[:,2]>.05)&(centers[:,2]>=surface-step*2.2)
    if ref['kind']=='flame':
        color=np.asarray(Image.open(ROOT/f"public/assets/zsa-page-{ref['page']:02}.jpg").resize((768,1024)))
        tx=np.clip(centers[:,0].astype(int),0,767);ty=np.clip(centers[:,1].astype(int),0,1023)
        photographed|=(color[ty,tx].mean(axis=1)>135)&(sample(distance(mask),centers[:,0],centers[:,1])<17)&(np.abs(tn[:,2])<.5)
    if ref['kind']=='interwoven':
        base=(vertices[:,1]>=878)|~polygon(ref['outline'])[py,px];backuv[base,0]=.75+np.mod(vertices[base,0],256)/1024;backuv[base,1]=.76+np.mod(vertices[base,2]+90,90)/400
    if ref['kind']=='birds':
        light=polygon(ref['parts'][4]['outline'])|polygon(ref['parts'][5]['outline'])|polygon(ref['parts'][2]['outline']);light&=~polygon(ref['parts'][3]['outline']);use=light[py,px];backuv[use,0]=.875+np.mod(vertices[use,0]+vertices[use,2]*.5,128)/1024
    outv=[];outn=[];outuv=[];outix=[]
    for selected,uv in [(photographed,frontuv),(~photographed,backuv)]:
        flat=tri[selected].ravel();used,inv=np.unique(flat,return_inverse=True);outix.append(inv+sum(len(v) for v in outv));outv.append(vertices[used]);outn.append(normals[used]);outuv.append(uv[used])
    v=np.concatenate(outv);n=np.concatenate(outn);uv=np.concatenate(outuv);ix=np.concatenate(outix).astype('u4')
    bounds=[float(vertices[:,0].min()),float(vertices[:,1].min()),float(vertices[:,0].max()),float(vertices[:,1].max())];scale=3.05/(bounds[3]-bounds[1]);v[:,0]=(v[:,0]-(bounds[0]+bounds[2])/2)*scale;v[:,1]=(bounds[3]-v[:,1])*scale;v[:,2]*=scale;n[:,1]*=-1;ix=ix.reshape(-1,3)[:,::-1].ravel()
    data=export_glb(v,n,uv,ix,ref);(ROOT/f'public/models/{id}.glb').write_bytes(data);(ROOT/f'public/models/textures/{id}-surface.jpg').write_bytes(atlas_for(ref))
    output=BytesIO();np.savez_compressed(output,vertices=v.astype('f4'),normals=n.astype('f4'),uv=uv.astype('f4'),indices=ix);(REVIEW/f'{id}.npz').write_bytes(output.getvalue())
    output=BytesIO();Image.fromarray(mask.astype('u1')*255).save(output,format='PNG');(REVIEW/f'{id}-mask.png').write_bytes(output.getvalue())
    source=ROOT/f"public/assets/zsa-page-{ref['page']:02}.jpg";audit={'sourcePage':ref['page'],'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'vertices':len(v),'triangles':len(ix)//3,'bytes':len(data),'depth':float(np.ptp(v[:,2])),'closed':True,'components':int(components),'sourceBounds':bounds,'inferred':['reverse','hidden sides','depth']}
    print(id,json.dumps(audit),flush=True);return audit

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--step',type=float,default=7);args=parser.parse_args();REVIEW.mkdir(exist_ok=True,parents=True);(ROOT/'public/models/textures').mkdir(exist_ok=True,parents=True)
    audit={};manifest=json.loads((ROOT/'public/models.json').read_text())
    for id,ref in REFS.items():
        audit[id]=build(id,ref,args.step)
        manifest[id]={'workId':id,'title':f"Original ZSA page {ref['page']}",'source':f"/assets/zsa-page-{ref['page']:02}.jpg",'sourcePage':ref['page'],'sourceSha256':audit[id]['sourceSha256'],'file':f'/models/{id}.glb','referenceSurface':True,'reconstruction':True,'reviewOnly':True,'referenceYaw':.3,'stoneGrain':False,'stoneSwatch':[.75,0,.25,1],'stonePolish':ref['polish']}
    (ROOT/'public/models.json').write_text(json.dumps(manifest,indent=2)+'\n');(ROOT/'content/star-model-audit.json').write_text(json.dumps(audit,indent=2)+'\n')
