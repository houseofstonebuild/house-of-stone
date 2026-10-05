"""Reference-constrained, solid sculpture meshes; authoring only, not a server dependency.

Visible contours and recesses are traced from the master photographs. Rounded
cross sections and depth fields establish real volume. Unseen surfaces are
inferred; their mineral pattern reuses the same source stone, not an invented
procedural marble shader. The original photograph remains unchanged.

Requires Python 3, numpy, Pillow, scipy. Run via node scripts/build-models.mjs.
"""
from pathlib import Path
import argparse, json, struct
import numpy as np
from PIL import Image, ImageDraw
from scipy.interpolate import CubicSpline
from scipy.ndimage import distance_transform_edt, gaussian_filter, map_coordinates, binary_erosion

ROOT = Path(__file__).resolve().parents[2]
REFERENCES = json.loads(Path(__file__).with_name('references.json').read_text())

def contour(points, smooth):
    p = np.asarray(points, float)
    if not smooth: return p
    p = np.vstack((p,p[0]))
    lengths = np.r_[0,np.cumsum(np.linalg.norm(np.diff(p,axis=0),axis=1))]
    return CubicSpline(lengths,p,bc_type='periodic')(np.linspace(0,lengths[-1],max(400,len(p)*8),endpoint=False))

def mask_for(ref):
    size=Image.open(ROOT/'public/assets'/ref['image']).size
    mask=Image.new('L',size);draw=ImageDraw.Draw(mask)
    for poly in ref.get('parts') or [ref['outline']]:
        draw.polygon([tuple(p) for p in contour(poly,ref['smooth'])],fill=255)
    for poly in ref['holes']:
        draw.polygon([tuple(p) for p in contour(poly,True)],fill=0)
    return np.asarray(mask)>0

def make_field(id,ref,mask,step=5):
    my,mx=np.where(mask); bounds=(mx.min()-12,my.min()-12,mx.max()+13,my.max()+13)
    xs=np.arange(bounds[0],bounds[2]+step,step,dtype=np.float32)
    ys=np.arange(bounds[1],bounds[3]+step,step,dtype=np.float32)
    zs=np.arange(-240,246,step,dtype=np.float32)
    x,y=np.meshgrid(xs,ys,indexing='ij')
    d=distance_transform_edt(mask)-distance_transform_edt(~mask)
    d=gaussian_filter(d,.65)
    inside=map_coordinates(d,[y.ravel(),x.ravel()],order=1).reshape(x.shape)
    depth=np.full(x.shape,ref['depth'],dtype=float); center=np.zeros(x.shape)
    if id=='together':
        # Broad crossing ribbon projects forward; the opposing loop recedes.
        depth=70+48*np.clip((y-520)/420,0,1)
        depth-=18*np.exp(-((y-140)/100)**2)
        center=30*np.exp(-((x-(600+.59*(y-340)))/95)**2)*np.exp(-((y-590)/330)**2)
        center-=36*np.exp(-((x-864)/80)**2-((y-408)/145)**2)
        center-=22*np.exp(-((x-610)/105)**2-((y-745)/140)**2)
    elif id=='quiet-flight':
        depth=52+100*np.exp(-((y-697)/270)**2)
        center=32*np.exp(-((x-694)/124)**2-((y-677)/260)**2)
    elif id=='folded-light':
        # Rounded cross sections track the ribbon's local width. A gently
        # turning centreline retains the folds without a wafer-thin reverse.
        radius=np.maximum(inside,0).max(axis=0)[None,:]
        depth=np.broadcast_to(np.clip(radius*.90+8,32,160),x.shape)
        center=35*np.sin((y-90)/165)+(x-555)*(.28*np.sin((y-95)/142))
    elif id=='continuum':
        center=(x-1240)*.30*np.sin((y-140)/175)
        depth=68+40*np.exp(-((y-640)/200)**2)
    elif id=='equilibrium':
        # Each block has its own complete depth field. Switching depth by row
        # would create spurious horizontal ledges between the tilted blocks.
        fields=[]
        for i,poly in enumerate(ref['parts']):
            part=Image.new('L',(mask.shape[1],mask.shape[0]));ImageDraw.Draw(part).polygon([tuple(p) for p in poly],fill=255);pm=np.asarray(part)>0
            pd=gaussian_filter(distance_transform_edt(pm)-distance_transform_edt(~pm),.65)
            pi=map_coordinates(pd,[y.ravel(),x.ravel()],order=1).reshape(x.shape)
            pc=[-.20*(x-850),.27*(x-930),-.17*(x-850)][i]
            pf=np.maximum(-pi[...,None],np.abs(zs[None,None,:]-pc[...,None])-ref['depth'])
            if i==1:
                cavity=np.sqrt(((x[...,None]-899)/92)**2+((y[...,None]-507)/109)**2+((zs[None,None,:]-128)/93)**2)
                pf=np.maximum(pf,(1-cavity)*70)
            fields.append(pf)
        field=np.minimum.reduce(fields)
        return gaussian_filter(field,.45).astype(np.float32),(xs,ys,zs),bounds
    # Elliptic edge rounding expands into a full, variable-depth solid.
    edge=np.maximum(depth-inside,0)
    field=np.sqrt(edge[...,None]**2+(zs[None,None,:]-center[...,None])**2)-depth[...,None]
    return field.astype(np.float32),(xs,ys,zs),bounds

# A deterministic marching-tetrahedra triangulation. Only intersected cubes
# are processed, and common edge vertices are welded before normals are made.
TETS=[[0,5,1,6],[0,1,2,6],[0,2,3,6],[0,3,7,6],[0,7,4,6],[0,4,5,6]]
CORNERS=np.array([[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]])
EDGES=[(0,1),(0,2),(0,3),(1,2),(1,3),(2,3)]
TABLE={1:[[0,2,1]],2:[[0,3,4]],3:[[1,2,3],[2,4,3]],4:[[1,5,3]],5:[[0,2,3],[2,5,3]],6:[[0,1,4],[1,5,4]],7:[[2,4,5]]}
TABLE.update({15-k:[t[::-1] for t in v] for k,v in list(TABLE.items())})

def mesh_field(field,axes):
    cs=[field[c[0]:field.shape[0]-1+c[0],c[1]:field.shape[1]-1+c[1],c[2]:field.shape[2]-1+c[2]] for c in CORNERS]
    lo=np.minimum.reduce(cs);hi=np.maximum.reduce(cs)
    cells=np.argwhere((lo<0)&(hi>=0))
    all_tri=[]
    for tet in TETS:
        grid=cells[:,None,:]+CORNERS[tet][None,:,:]
        values=field[grid[:,:,0],grid[:,:,1],grid[:,:,2]]
        signs=np.sum((values<0)*(1<<np.arange(4)),axis=1)
        for pattern,triangles in TABLE.items():
            sel=signs==pattern
            if not sel.any():continue
            g=grid[sel];v=values[sel].astype(np.float64);verts=[]
            for a,b in EDGES:
                denom=v[:,a]-v[:,b];t=np.divide(v[:,a],denom,out=np.zeros(len(g)),where=denom!=0)
                verts.append(g[:,a]+t[:,None]*(g[:,b]-g[:,a]))
            verts=np.stack(verts,axis=1)
            for tri in triangles:all_tri.append(verts[:,tri])
    tri=np.concatenate(all_tri)
    unique,inv=np.unique(np.round(tri.reshape(-1,3),6),axis=0,return_inverse=True)
    indices=inv.reshape(-1,3)
    vertices=np.stack([axes[k][0]+unique[:,k]*(axes[k][1]-axes[k][0]) for k in range(3)],axis=1)
    gradients=np.stack([map_coordinates(g,unique.T,order=1) for g in np.gradient(field)],axis=1)
    face=np.cross(vertices[indices[:,1]]-vertices[indices[:,0]],vertices[indices[:,2]]-vertices[indices[:,0]])
    bad=np.einsum('ij,ij->i',face,gradients[indices].mean(axis=1))<0
    indices[bad]=indices[bad][:,[0,2,1]]
    normals=gradients/np.maximum(np.linalg.norm(gradients,axis=1)[:,None],1e-9)
    return vertices,normals,indices

def glb(id,ref,vertices,normals,indices,uv):
    chunks=[];views=[];accessors=[];offset=0
    def attr(a,kind,component,normalized=False,target=34962):
        nonlocal offset
        data=a.tobytes();views.append(dict(buffer=0,byteOffset=offset,byteLength=len(data),target=target));chunks.append(data+b'\0'*((-len(data))%4));offset+=len(chunks[-1])
        entry=dict(bufferView=len(views)-1,componentType=component,count=len(a),type=kind)
        if normalized:entry['normalized']=True
        if kind=='VEC3':entry.update(min=a.min(axis=0).tolist(),max=a.max(axis=0).tolist())
        accessors.append(entry);return len(accessors)-1
    low=vertices.min(axis=0);extent=vertices.max(axis=0)-low
    p=attr(np.round((vertices-low)/extent*65535).astype('<u2'),'VEC3',5123,True)
    adjusted=normals*extent;adjusted/=np.linalg.norm(adjusted,axis=1)[:,None]
    n=attr(np.round(adjusted*32767).astype('<i2'),'VEC3',5122,True)
    u=attr(np.round(np.clip(uv,0,1)*65535).astype('<u2'),'VEC2',5123,True)
    itype='<u2' if len(vertices)<65536 else '<u4';ix=attr(indices.astype(itype).ravel(),'SCALAR',5123 if itype=='<u2' else 5125,target=34963)
    doc=dict(asset=dict(version='2.0',generator='House of Stone reference-constrained reconstruction'),extensionsUsed=['KHR_materials_unlit','KHR_mesh_quantization'],extensionsRequired=['KHR_mesh_quantization'],scene=0,scenes=[dict(nodes=[0])],nodes=[dict(mesh=0,name=ref['title'],translation=low.tolist(),scale=extent.tolist())],meshes=[dict(primitives=[dict(attributes=dict(POSITION=p,NORMAL=n,TEXCOORD_0=u),indices=ix,material=0)])],materials=[dict(name='Source stone',extensions=dict(KHR_materials_unlit={}),pbrMetallicRoughness=dict(baseColorTexture=dict(index=0),roughnessFactor=.48,metallicFactor=0))],textures=[dict(source=0,sampler=0)],samplers=[dict(magFilter=9729,minFilter=9987,wrapS=33071,wrapT=33071)],images=[dict(uri='../assets/'+ref['image'])],buffers=[dict(byteLength=offset)],bufferViews=views,accessors=accessors)
    data=json.dumps(doc,separators=(',',':')).encode();data+=b' '*((-len(data))%4);binary=b''.join(chunks)
    return struct.pack('<III',0x46546c67,2,28+len(data)+len(binary))+struct.pack('<II',len(data),0x4e4f534a)+data+struct.pack('<II',len(binary),0x004e4942)+binary

def build(id,ref,output,review,step):
    mask=mask_for(ref);field,axes,bounds=make_field(id,ref,mask,step)
    vertices,normals,indices=mesh_field(field,axes)
    # At the silhouette, sample a few pixels inside the stone to prevent a
    # green/brown halo from the photographed environment.
    safe=binary_erosion(mask,iterations=3);nearest=distance_transform_edt(~safe,return_distances=False,return_indices=True)
    px=np.clip(np.round(vertices[:,0]).astype(int),0,mask.shape[1]-1);py=np.clip(np.round(vertices[:,1]).astype(int),0,mask.shape[0]-1)
    uv=np.column_stack((nearest[1,py,px]/(mask.shape[1]-1),nearest[0,py,px]/(mask.shape[0]-1)))
    modelheight=3.05;miny,maxy=vertices[:,1].min(),vertices[:,1].max();scale=modelheight/(maxy-miny)
    vertices[:,0]=(vertices[:,0]-(vertices[:,0].min()+vertices[:,0].max())/2)*scale
    vertices[:,1]=(maxy-vertices[:,1])*scale;vertices[:,2]*=scale
    normals[:,1]*=-1;indices=indices[:,[0,2,1]]
    payload=glb(id,ref,vertices,normals,indices,uv);(output/(id+'.glb')).write_bytes(payload)
    if review:
        np.savez_compressed(review/(id+'.npz'),vertices=vertices.astype('f4'),normals=normals.astype('f4'),indices=indices.astype('u4'),uv=uv.astype('f4'),bounds=bounds)
        Image.fromarray(mask.astype('uint8')*255).save(review/(id+'-mask.png'))
    # Every model is a closed, orientable surface, including the dished recess.
    edges=np.sort(np.concatenate((indices[:,[0,1]],indices[:,[1,2]],indices[:,[2,0]])),axis=1)
    counts=np.unique(edges,axis=0,return_counts=True)[1]
    assert np.isfinite(vertices).all() and np.isfinite(normals).all()
    assert np.all(counts==2),(id,'Non-manifold edges',np.unique(counts,return_counts=True))
    assert np.ptp(vertices[:,2])>.12,(id,'Insufficient depth')
    summary=dict(vertices=len(vertices),triangles=len(indices),bytes=len(payload),height=3.05,depth=round(float(np.ptp(vertices[:,2])),3),closed=True)
    print(id,json.dumps(summary),flush=True);return summary

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,default=ROOT/'public/models');parser.add_argument('--review',type=Path);parser.add_argument('--step',type=float,default=10);parser.add_argument('--id',choices=list(REFERENCES));args=parser.parse_args()
    args.output.mkdir(parents=True,exist_ok=True)
    if args.review:args.review.mkdir(parents=True,exist_ok=True)
    report={id:build(id,ref,args.output,args.review,max(args.step,12) if id=='equilibrium' else args.step) for id,ref in REFERENCES.items() if not args.id or args.id==id}
    if args.output.resolve()==(ROOT/'public/models').resolve():
        path=ROOT/'public/models.json';manifest=json.loads(path.read_text())
        for id in report:
            ref=REFERENCES[id];w,h=Image.open(ROOT/'public/assets'/ref['image']).size;s=ref['swatch']
            manifest[id].update(stoneGrain=False,referenceSurface=True,referenceYaw=.3,stoneSwatch=[s[0]/w,s[1]/h,s[2]/w,s[3]/h],stonePolish=ref.get('polish',1))
        path.write_text(json.dumps(manifest,indent=2)+'\n')
    if args.review:(args.review/'geometry-checks.json').write_text(json.dumps(report,indent=2)+'\n')
